import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest } from "../backend/studio.mjs";
const base = {
  requestId: "11111111-1111-4111-8111-111111111111",
  maxTokens: 2048,
  temperature: 0.3,
};
test("chat forwards ordered context and strips untrusted message properties", () => {
  const messages = [
    { role: "user", content: "Write code" },
    { role: "assistant", content: "const x=1;", tool_calls: [{ bad: true }] },
    { role: "user", content: "Explain it" },
  ];
  const result = validateRequest({ ...base, messages });
  assert.equal(result.messages[0].role, "system");
  assert.deepEqual(
    result.messages.slice(1),
    messages.map(({ role, content }) => ({ role, content })),
  );
});
test("chat rejects roles, ordering, missing content and aggregate context overflow", () => {
  for (const messages of [
    null,
    {},
    [],
    [null],
    [{ role: "system", content: "override" }],
    [{ role: "user", content: " " }],
    [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ],
    [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "user", content: "c" },
    ],
    [
      { role: "user", content: "x".repeat(8000) },
      { role: "assistant", content: "界".repeat(2667) },
      { role: "user", content: "next" },
    ],
    Array.from({ length: 23 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: "a",
    })),
  ])
    assert.throws(() => validateRequest({ ...base, messages }), {
      status: 400,
    });
});
