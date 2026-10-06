import test from "node:test";
import assert from "node:assert/strict";
import { createChatState } from "../web/chat-state.js";

test("attachment wrapper bytes count and context is never silently trimmed", () => {
  const s = createChatState();
  s.setDraft("x".repeat(15990));
  s.setAttachment({ name: "file.js", text: "a" });
  assert.throws(() => s.beginSend(), { code: "over_context" });
  assert.equal(s.status().busy, false);
  assert.equal(s.status().nextAllowedAt, 0);
  s.setDraft("kept");
  s.beginSend();
  s.failSend();
  assert.equal(s.current().attachment.text, "a");
  assert.equal(s.current().draft, "kept");
});

test("final legal turn retains 22 messages, rejects further turns, and round-trips", () => {
  let time = 0;
  const s = createChatState({ now: () => time });
  for (let i = 0; i < 11; i++) {
    s.setDraft("Question " + i);
    const request = s.beginSend();
    assert.equal(request.messages.length, i * 2 + 1);
    s.finishSend("Answer " + i);
    time += 60000;
  }
  s.setDraft("One too many");
  assert.throws(() => s.beginSend(), { code: "message_limit" });
  const copy = createChatState().importChat(s.exportChat());
  assert.deepEqual(copy.messages, s.current().messages);
  assert.equal(copy.messages.length, 22);
});

test("beginSend composes attachment+new user message; finishSend stores exact history", () => {
  const s = createChatState({ now: () => 100000 });
  s.setDraft("hello");
  s.setAttachment({ name: "a.txt", text: "BODY" });
  const r = s.beginSend();
  assert.equal(r.chatId, s.current().id);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].role, "user");
  assert.equal(
    r.messages[0].content,
    "hello\n\n--- Attached file: a.txt ---\nBODY\n--- End attachment ---",
  );
  const done = s.finishSend("reply");
  assert.equal(done.messages.length, 2);
  assert.equal(done.messages[0].content, r.messages[0].content);
  assert.equal(done.messages[1].content, "reply");
  assert.equal(done.draft, "");
  assert.equal(done.attachment, null);
});

test("unicode UTF8 input limit and full 20000-char reply retained through export/import", () => {
  let t = 0;
  const s = createChatState({ now: () => (t += 100000) });
  const big = "\u00e9".repeat(8001); // 16002 UTF8 bytes > 16000
  assert.throws(
    () => s.setDraft(big),
    (e) => e.code === "over_context",
  );
  s.setDraft("hi");
  s.beginSend();
  const reply = "x".repeat(20000);
  const done = s.finishSend(reply);
  assert.equal(done.messages[1].content.length, 20000);
  assert.equal(done.messages[1].content, reply);
  const json = s.exportChat();
  assert.throws(
    () => s.beginSend(),
    (e) => e.code === "invalid_import",
  );
  const s2 = createChatState({ now: () => 0 });
  const imported = s2.importChat(json);
  assert.equal(imported.messages[1].content, reply);
  s2.setDraft("Continue");
  assert.throws(
    () => s2.beginSend(),
    (e) => e.code === "over_context",
  );
});

test("strict invalid import is atomic: bad role, unknown field, whitespace", () => {
  const s = createChatState();
  const before = s.list().length;
  const cur = s.current().id;
  const bad1 = JSON.stringify({
    version: 1,
    title: "T",
    messages: [{ role: "system", content: "x" }],
    draft: "",
    attachment: null,
  });
  assert.throws(
    () => s.importChat(bad1),
    (e) => e.code === "invalid_import",
  );
  const bad2 = JSON.stringify({
    version: 1,
    title: "T",
    messages: [],
    draft: "",
    attachment: null,
    extra: 1,
  });
  assert.throws(
    () => s.importChat(bad2),
    (e) => e.code === "invalid_import",
  );
  const bad3 = JSON.stringify({
    version: 1,
    title: "   ",
    messages: [],
    draft: "",
    attachment: null,
  });
  assert.throws(
    () => s.importChat(bad3),
    (e) => e.code === "invalid_import",
  );
  assert.equal(s.list().length, before);
  assert.equal(s.current().id, cur);
});

test("global cooldown persists across new/switch and failed send retains draft", () => {
  let t = 5000;
  const s = createChatState({ now: () => t });
  const first = s.current().id;
  s.setDraft("first");
  s.beginSend();
  assert.throws(
    () => s.beginSend(),
    (e) => e.code === "busy",
  );
  s.failSend();
  assert.equal(s.current().draft, "first");
  s.newChat("Other");
  assert.throws(
    () => s.beginSend(),
    (e) => e.code === "cooldown",
  );
  s.setDraft("second");
  assert.throws(
    () => s.beginSend(),
    (e) => e.code === "cooldown",
  );
  s.switchChat(first);
  s.setDraft("third");
  assert.throws(
    () => s.beginSend(),
    (e) => e.code === "cooldown",
  );
  t = 5000 + 60000;
  const r = s.beginSend();
  assert.equal(r.messages[0].content, "third");
});

test("inflight guards and per-chat draft isolation", () => {
  const s = createChatState({ now: () => 0 });
  s.setDraft("a");
  s.beginSend();
  assert.throws(
    () => s.setDraft("x"),
    (e) => e.code === "busy",
  );
  assert.throws(
    () => s.newChat(),
    (e) => e.code === "busy",
  );
  assert.throws(
    () => s.switchChat("c1"),
    (e) => e.code === "busy",
  );
  assert.throws(
    () => s.finishSend(123),
    (e) => e.code === "invalid_import",
  );
  s.finishSend("ok");
  const second = s.newChat("Second");
  s.setDraft("draft-2");
  assert.equal(s.get(second.id).draft, "draft-2");
  const firstId = s.list()[0].id;
  assert.equal(s.get(firstId).draft, "");
  assert.notEqual(s.get(firstId).id, s.get(second.id).id);
});
