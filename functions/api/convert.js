// Cloudflare Pages Function — server-side conversion via CloudConvert.
// Route: POST /api/convert   (multipart: file, format)
// Env: CLOUDCONVERT_API_KEY
const CC = "https://api.cloudconvert.com/v2";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}
function ccErr(j) {
  try { return j.message || (j.errors && j.errors[0] && j.errors[0].detail) || "CloudConvert error"; }
  catch (e) { return "CloudConvert error"; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.CLOUDCONVERT_API_KEY) {
    return json({ error: "Server conversion isn't configured yet (missing CLOUDCONVERT_API_KEY)." }, 500);
  }
  try {
    const inForm = await request.formData();
    const file = inForm.get("file");
    const target = (inForm.get("format") || "").toString().toLowerCase();
    if (!file || !target) return json({ error: "Missing file or target format." }, 400);

    const auth = { Authorization: "Bearer " + env.CLOUDCONVERT_API_KEY };

    // 1) create a job: upload -> convert -> export url
    let res = await fetch(CC + "/jobs", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, auth),
      body: JSON.stringify({
        tasks: {
          "import-1": { operation: "import/upload" },
          "convert-1": { operation: "convert", input: "import-1", output_format: target },
          "export-1": { operation: "export/url", input: "convert-1" }
        }
      })
    });
    let job = await res.json();
    if (!res.ok) return json({ error: ccErr(job) }, 500);

    // 2) upload the file to the import task's form
    const importTask = job.data.tasks.find((t) => t.name === "import-1");
    const form = importTask.result.form;
    const up = new FormData();
    for (const k in form.parameters) up.append(k, form.parameters[k]);
    up.append("file", file, (file.name || "upload"));
    const upRes = await fetch(form.url, { method: "POST", body: up });
    if (!upRes.ok) return json({ error: "Upload to converter failed." }, 500);

    // 3) poll the job until finished (bounded so the Worker doesn't run too long)
    const jobId = job.data.id;
    const deadline = Date.now() + 24000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(CC + "/jobs/" + jobId + "?include=tasks", { headers: auth });
      job = await res.json();
      const status = job.data && job.data.status;
      if (status === "finished") {
        const exp = job.data.tasks.find((t) => t.name === "export-1");
        const f = exp.result.files[0];
        return json({ url: f.url, filename: f.filename });
      }
      if (status === "error") {
        return json({ error: "Conversion failed — that format/file may not be supported." }, 500);
      }
    }
    return json({ error: "Conversion is taking too long. Try a smaller file." }, 504);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
