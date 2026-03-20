import { afterEach, vi } from "vitest";
import { setBindingsForTests } from "../../src/lib/runtime/env";

afterEach(() => {
  setBindingsForTests(undefined);
  globalThis.__META_ADS_BINDINGS__ = undefined;
  vi.restoreAllMocks();
});
