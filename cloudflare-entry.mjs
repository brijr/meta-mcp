import worker from "./worker.js";
import middleware from "./src/middleware.ts";

export default {
  async fetch(request, env, ctx) {
    globalThis.__META_ADS_BINDINGS__ = env;

    const handlers = Array.isArray(middleware) ? middleware : [middleware];
    const context = {
      auth: undefined,
      setAuth(auth) {
        context.auth = auth;
      },
    };

    for (const handler of handlers) {
      if (typeof handler !== "function") {
        continue;
      }

      const response = await handler(request, context);
      if (response instanceof Response) {
        return response;
      }
    }

    return worker.fetch(request, env, ctx);
  },
};
