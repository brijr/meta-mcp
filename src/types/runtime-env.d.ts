import type { AppBindings } from "../lib/runtime/env";

declare global {
  var __META_ADS_BINDINGS__: AppBindings | undefined;
}

export {};
