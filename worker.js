// Worker entry: static assets are served first (env.ASSETS); this handles /api/* routes.
import { onRequestPost as createCheckout } from "./functions/api/create-checkout-session.js";
import { onRequestPost as lemonWebhook } from "./functions/api/lemon-webhook.js";
import { onRequestPost as verifySub } from "./functions/api/verify-subscription.js";
import { onRequestPost as paypalVerify } from "./functions/api/paypal-verify.js";
import { onRequestGet as paypalSetup } from "./functions/api/paypal-setup.js";
import { onRequestPost as paypalWebhook } from "./functions/api/paypal-webhook.js";
import { onRequestPost as paypalCreateOrder } from "./functions/api/paypal-create-order.js";
import { onRequestPost as paypalCaptureOrder } from "./functions/api/paypal-capture-order.js";
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
    if (request.method === "POST" && url.pathname === "/api/paypal-verify") {
      return paypalVerify({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/paypal-webhook") {
      return paypalWebhook({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/paypal-create-order") {
      return paypalCreateOrder({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/paypal-capture-order") {
      return paypalCaptureOrder({ request, env });
    }
    if (request.method === "POST" && url.pathname === "/api/manage-subscription") {
      return manageSub({ request, env });
    }
    if (request.method === "GET" && url.pathname === "/api/paypal-setup") {
      return paypalSetup({ request, env });
    }
    // Anything else → static site
    return env.ASSETS.fetch(request);
  }
};
