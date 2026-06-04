// Worker entry: static assets are served first (env.ASSETS); this handles /api/* routes.
import { onRequestPost as createCheckout } from "./functions/api/create-checkout-session.js";
import { onRequestPost as lemonWebhook } from "./functions/api/lemon-webhook.js";
import { onRequestPost as convert } from "./functions/api/convert.js";
import { onRequestPost as verifySub } from "./functions/api/verify-subscription.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") {
      return createCheckout({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/lemon-webhook") {
      return lemonWebhook({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/verify-subscription") {
      return verifySub({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/convert") {
      return convert({ request, env });
    }
    // Anything else → static site
    return env.ASSETS.fetch(request);
  }
};
