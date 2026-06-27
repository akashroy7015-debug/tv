// Worker entry: static assets are served first (env.ASSETS); this handles /api/* routes.
import { onRequestPost as createCheckout } from "./functions/api/create-checkout-session.js";
import { onRequestPost as lemonWebhook } from "./functions/api/lemon-webhook.js";
import { onRequestPost as verifySub } from "./functions/api/verify-subscription.js";
import { onRequestPost as manageSub } from "./functions/api/manage-subscription.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // ads.txt → Ezoic's managed AdsTxtManager (301, always up to date)
    if (url.pathname === "/ads.txt") {
      return Response.redirect("https://srv.adstxtmanager.com/19390/filemorph.shop", 301);
    }
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") {
      return createCheckout({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/lemon-webhook") {
      return lemonWebhook({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/verify-subscription") {
      return verifySub({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/manage-subscription") {
      return manageSub({ request, env });
    }
    // Anything else → static site
    return env.ASSETS.fetch(request);
  }
};
