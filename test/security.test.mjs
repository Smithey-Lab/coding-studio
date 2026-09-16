import test from "node:test";
import assert from "node:assert/strict";
import {
  createStudio,
  POLICY,
  reservation,
  validateRequest,
} from "../backend/studio.mjs";
const env = {
  MEMBER_TABLE: "table",
  STUDIO_OWNER_SUB: "owner",
  STUDIO_SECRET_ARN: "secret",
};
const owner = { sub: "owner", role: "owner", status: "active", revision: 1 };
const input = {
  operation: "generate",
  prompt: "Explain this code",
  requestId: "11111111-1111-4111-8111-111111111111",
  maxTokens: 1024,
  temperature: 0.3,
};
function fixture({
  enabled = true,
  key = true,
  deny = false,
  provider,
  settingsMissing = false,
} = {}) {
  let calls = 0;
  const transactions = [],
    secretCalls = [];
  const db = {
    send: async (c) => {
      if (c.constructor.name === "GetCommand")
        return {
          Item:
            c.input.Key.pk === "SETTINGS" && !settingsMissing
              ? { enabled, revision: 1 }
              : undefined,
        };
      transactions.push(c.input);
      if (deny) throw { name: "TransactionCanceledException" };
      return {};
    },
  };
  const secrets = {
    send: async (c) => {
      secretCalls.push(c.constructor.name);
      if (c.constructor.name === "DescribeSecretCommand")
        return { VersionIdsToStages: key ? { version: ["AWSCURRENT"] } : {} };
      if (!key) throw new Error("missing");
      return {
        SecretString: JSON.stringify({
          apiKey: "test-placeholder-not-a-real-key",
        }),
      };
    },
  };
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.thinking.type, "disabled");
    return provider
      ? provider()
      : new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "<script>alert(1)</script> safe text" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 12 },
          }),
        );
  };
  return {
    run: createStudio({
      db,
      secrets,
      fetcher,
      env,
      now: () => Date.UTC(2026, 8, 15),
    }),
    calls: () => calls,
    transactions,
    secretCalls,
  };
}
test("only the pinned active owner is admitted", async () => {
  for (const user of [
    { ...owner, role: "member" },
    { ...owner, sub: "other" },
    { ...owner, status: "suspended" },
  ]) {
    const f = fixture();
    await assert.rejects(f.run(input, user), { status: 403 });
    assert.equal(f.calls(), 0);
    assert.equal(f.secretCalls.length, 0);
  }
});
test("disabled, unconfigured and missing settings fail closed without provider traffic", async () => {
  for (const config of [
    { enabled: false },
    { key: false },
    { settingsMissing: true },
  ]) {
    const f = fixture(config);
    await assert.rejects(f.run(input, owner), { status: 503 });
    assert.equal(f.calls(), 0);
    assert.equal(f.transactions.length, 0);
  }
});
test("invalid input cannot consume allowance or contact provider", async () => {
  for (const change of [
    { prompt: "" },
    { prompt: "x".repeat(16001) },
    { prompt: "界".repeat(5334) },
    { requestId: "bad" },
    { maxTokens: 8192 },
    { maxTokens: "1024" },
    { temperature: 2 },
  ]) {
    const f = fixture();
    await assert.rejects(f.run({ ...input, ...change }, owner), {
      status: 400,
    });
    assert.equal(f.calls(), 0);
    assert.equal(f.transactions.length, 0);
  }
});
test("model and target URL cannot be overridden by client", () => {
  const b = validateRequest({
    ...input,
    model: "expensive",
    url: "https://evil.example",
    stream: true,
  });
  assert.equal(b.model, POLICY.model);
  assert.equal(b.stream, false);
  assert.equal(b.messages.length, 2);
  assert.equal(b.max_tokens, 1024);
});
test("reservation rejection never calls provider", async () => {
  const f = fixture({ deny: true });
  await assert.rejects(f.run(input, owner), { status: 429 });
  assert.equal(f.calls(), 0);
});
test("successful completion reserves once and does not expose key", async () => {
  const f = fixture();
  const r = await f.run(input, owner);
  assert.equal(f.calls(), 1);
  assert.equal(f.transactions.length, 1);
  assert.equal(r.reservedCents, 5);
  assert.equal(r.content, "<script>alert(1)</script> safe text");
  assert.ok(!JSON.stringify(r).includes("placeholder"));
});
test("provider failures, malformed responses and timeouts are never retried or refunded", async () => {
  for (const provider of [
    () => new Response("private provider detail", { status: 401 }),
    () => new Response("not json"),
    () => {
      throw new Error("Timeout");
    },
    () => new Response(JSON.stringify({ choices: [] })),
  ]) {
    const f = fixture({ provider });
    await assert.rejects(
      f.run(input, owner),
      (e) => e.status === 502 && !e.message.includes("private provider"),
    );
    assert.equal(f.calls(), 1);
    assert.equal(f.transactions.length, 1);
  }
});
test("oversized response is rejected", async () => {
  const f = fixture({ provider: () => new Response("x".repeat(256001)) });
  await assert.rejects(f.run(input, owner), { status: 502 });
  assert.equal(f.calls(), 1);
});
test("status describes secret metadata without reading secret value", async () => {
  const f = fixture();
  const s = await f.run({ operation: "status" }, owner);
  assert.equal(s.configured, true);
  assert.deepEqual(f.secretCalls, ["DescribeSecretCommand"]);
  assert.equal(f.calls(), 0);
});
test("pause cannot enable the API and rejects stale owner revisions atomically", async () => {
  const f = fixture();
  await f.run({ operation: "pause", enabled: true }, owner);
  const tx = f.transactions[0].TransactItems;
  assert.equal(tx[1].Put.Item.enabled, false);
  assert.ok(tx[0].ConditionCheck);
  assert.equal(f.secretCalls.length, 0);
});
test("reservation atomically checks policy, owner, three limits, replay and global lease", () => {
  const tx = reservation(
    "table",
    owner,
    { revision: 3 },
    input.requestId,
    Date.UTC(2026, 11, 31, 23, 59, 59),
  ).TransactItems;
  assert.equal(tx.length, 7);
  assert.equal(tx[2].Update.Key.sk, "DAY#2026-12-31");
  assert.equal(tx[3].Update.Key.sk, "MONTH#2026-12");
  assert.equal(tx[4].Update.Key.sk, "LIFETIME");
  assert.equal(tx[2].Update.ExpressionAttributeValues[":remaining"], 95);
  assert.equal(tx[3].Update.ExpressionAttributeValues[":remaining"], 495);
  assert.equal(tx[4].Update.ExpressionAttributeValues[":remaining"], 1995);
  assert.equal(tx[5].Put.ConditionExpression, "attribute_not_exists(pk)");
  assert.equal(tx[5].Put.Item.expires, undefined);
  assert.equal(
    tx[6].Update.ExpressionAttributeValues[":until"] -
      tx[6].Update.ExpressionAttributeValues[":now"],
    60,
  );
  assert.equal(
    tx[0].ConditionCheck.ExpressionAttributeValues[":owner"],
    "owner",
  );
});
