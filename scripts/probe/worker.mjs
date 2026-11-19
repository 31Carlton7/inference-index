import models from "../../data/models.json" with { type: "json" };
import endpoints from "./endpoints.json" with { type: "json" };
import { handleConfirm } from "./region2.mjs";

// Cloudflare Worker entry for the second region. `request.cf.colo` is the
// airport code of the data centre that ran this invocation.
export default {
  fetch(request, env) {
    const region = request.cf?.colo ? `cf-${request.cf.colo.toLowerCase()}` : env.PROBE_REGION;
    return handleConfirm(request, env, { endpoints, probeModels: models.probe_models, region });
  },
};
