import { describe, expect, it } from "vitest";
import { decryptString, encryptString } from "../src/lib/storage/crypto";
import { setBindingsForTests } from "../src/lib/runtime/env";
import { createTestBindings } from "./helpers/fakes";

describe("storage crypto", () => {
  it("round-trips encrypted token strings", async () => {
    setBindingsForTests(createTestBindings());

    const encrypted = await encryptString("meta-access-token");
    expect(encrypted).not.toEqual("meta-access-token");

    const decrypted = await decryptString(encrypted);
    expect(decrypted).toEqual("meta-access-token");
  });
});
