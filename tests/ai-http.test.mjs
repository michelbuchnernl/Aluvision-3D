import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../server/store.ts";
import { ClaudeProvider } from "../server/claude.ts";
import { createStudioServer } from "../server/http.ts";
import { ProjectConnection, StudioClient } from "../src/serverClient.ts";
import { demoProject } from "../src/model.ts";
test("Editor client → HTTP → Claude adapter → preview → applied revision works without paid API calls", async () => {
  const p = demoProject(),
    store = new ProjectStore(),
    clock = () => Date.parse("2026-10-18T15:00:00Z");
  const provider = new ClaudeProvider({
    apiKey: "mock-secret",
    enabled: true,
    clock,
    fetcher: async (url, init) => {
      if (url.includes("/models?"))
        return Response.json({ data: [{ id: "claude-sonnet-5-5" }] });
      if (url.endsWith("/count_tokens"))
        return Response.json({ input_tokens: 1000 });
      const request = JSON.parse(init.body);
      assert.equal(request.max_tokens, 4096);
      return Response.json({
        stop_reason: "tool_use",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "tool_use",
            name: "propose_scene",
            input: {
              summary: "Tafel 25 cm verplaatst.",
              questions: [],
              operations: [
                {
                  type: "transform",
                  id: p.objects.at(-2).id,
                  position: { x: -155, y: 0, z: 0 },
                  rotation: 0,
                },
              ],
            },
          },
        ],
      });
    },
  });
  const app = createStudioServer({ store, provider });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "",
    loaded;
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    if (r.headers.has("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  });
  const connection = new ProjectConnection(p, (q) => (loaded = q), client);
  try {
    await connection.createCurrent();
    await connection.setBudget(1_000_000);
    const quote = await connection.quote(
      "Verplaats de tafel 25 cm naar rechts.",
      "claude-sonnet-5-5",
    );
    const proposed = await connection.run(quote.id);
    assert.equal(proposed.status, "proposed");
    assert.equal(
      connection.state.jobs[0].candidate.project.objects.at(-2).position.x,
      -155,
    );
    assert.equal(connection.current.objects.at(-2).position.x, -180);
    assert.equal(store.get(p.id).revision, 1);
    const applied = await connection.apply(quote.id, false);
    assert.equal(applied.revision, 2);
    assert.equal(loaded.objects.at(-2).position.x, -155);
    assert.equal(connection.state.jobs[0].status, "applied");
    assert.equal(connection.state.budget.spentMicros, 3000);
    assert.equal(
      JSON.stringify(connection.state).includes("mock-secret"),
      false,
    );
  } finally {
    await connection.disconnect();
    await new Promise((r) => app.server.close(r));
    store.close();
  }
});
