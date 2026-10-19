import { test } from "node:test";
import assert from "node:assert/strict";
import { StudioClient } from "../src/serverClient.ts";

test("the default fetch is not called as a method of the client (browsers throw 'Illegal invocation')", async () => {
  const original = globalThis.fetch;
  let seenThis = "unset";
  globalThis.fetch = function (input) {
    seenThis = this;
    // Mimic window.fetch: only callable with the global object (or undefined) as `this`.
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Illegal invocation");
    return Promise.resolve(
      Response.json({ csrf: "x", ai: {}, vaultWarning: "" }),
    );
  };
  try {
    const client = new StudioClient();
    const s = await client.session();
    assert.equal(s.csrf, "x");
    assert.ok(seenThis === undefined || seenThis === globalThis);
  } finally {
    globalThis.fetch = original;
  }
});

test("a custom fetcher is used exactly as given", async () => {
  let called = 0;
  const client = new StudioClient(async () => {
    called++;
    return Response.json({ csrf: "y", ai: {}, vaultWarning: "" });
  });
  assert.equal((await client.session()).csrf, "y");
  assert.equal(called, 1);
});
