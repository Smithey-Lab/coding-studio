const MAX_CHATS = 20;
const MAX_TITLE = 200;
const MAX_DRAFT_TA = 16000;
const MAX_STORED = 22;
const MAX_SEND_TA = 16000;
const MAX_ASSISTANT = 256 * 1024;
const MAX_IMPORT_JSON = 1024 * 1024;
const COOLDOWN_MS = 60000;
const MAX_FILENAME_BYTES = 200;

const enc = new TextEncoder();
const byteLen = (s) => enc.encode(s).length;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}

function hasControlChars(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

const VALID_KEYS = new Set([
  "version",
  "title",
  "messages",
  "draft",
  "attachment",
]);

function validateAttachment(a, chatBound) {
  if (a === undefined || a === null) {
    if (a === undefined) throw err("invalid_import", "attachment undefined");
    return null;
  }
  if (typeof a !== "object" || Array.isArray(a))
    throw err("invalid_import", "attachment must be object or null");
  const keys = Object.keys(a);
  if (keys.length !== 2 || !keys.includes("name") || !keys.includes("text")) {
    throw err("invalid_import", "attachment keys");
  }
  if (typeof a.name !== "string" || typeof a.text !== "string") {
    throw err("invalid_import", "attachment fields");
  }
  if (a.name.length === 0) throw err("invalid_import", "attachment name empty");
  if (byteLen(a.name) > MAX_FILENAME_BYTES)
    throw err("invalid_import", "attachment name too large");
  if (hasControlChars(a.name))
    throw err("invalid_import", "attachment name control chars");
  if (
    byteLen(a.text) > MAX_DRAFT_TA ||
    (chatBound && byteLen(a.text) > MAX_DRAFT_TA)
  ) {
    throw err("invalid_import", "attachment too large");
  }
  return { name: a.name, text: a.text };
}

function validateImport(raw) {
  if (typeof raw !== "string")
    throw err("invalid_import", "import must be string");
  if (byteLen(raw) > MAX_IMPORT_JSON)
    throw err("invalid_import", "json too large");
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw err("invalid_import", "json parse");
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj))
    throw err("invalid_import", "root");
  for (const k of Object.keys(obj)) {
    if (!VALID_KEYS.has(k)) throw err("invalid_import", "unknown key " + k);
  }
  if (obj.version !== 1) throw err("invalid_import", "version");
  if (typeof obj.title !== "string" || obj.title.trim().length === 0)
    throw err("invalid_import", "title required");
  if (obj.title.length > MAX_TITLE) throw err("invalid_import", "title");
  if (typeof obj.draft !== "string") throw err("invalid_import", "draft");
  if (!Array.isArray(obj.messages)) throw err("invalid_import", "messages");
  if (obj.messages.length > MAX_STORED)
    throw err("invalid_import", "messages count");
  const messages = [];
  for (let i = 0; i < obj.messages.length; i++) {
    const m = obj.messages[i];
    if (m === null || typeof m !== "object" || Array.isArray(m))
      throw err("invalid_import", "message");
    const mk = Object.keys(m);
    if (mk.length !== 2 || !mk.includes("role") || !mk.includes("content"))
      throw err("invalid_import", "message keys");
    const role = m.role;
    const content = m.content;
    if (role !== "user" && role !== "assistant")
      throw err("invalid_import", "role");
    if (typeof content !== "string" || content.trim().length === 0)
      throw err("invalid_import", "content");
    if (i % 2 === 0 && role !== "user")
      throw err("invalid_import", "alternation");
    if (i % 2 === 1 && role !== "assistant")
      throw err("invalid_import", "alternation");
    if (role === "assistant" && byteLen(content) > MAX_ASSISTANT)
      throw err("invalid_import", "assistant too large");
    if (role === "user" && byteLen(content) > MAX_SEND_TA)
      throw err("invalid_import", "user too large");
    messages.push({ role, content });
  }
  if (messages.length % 2 !== 0)
    throw err("invalid_import", "unpaired message");
  const attachment = validateAttachment(
    obj.attachment === undefined ? null : obj.attachment,
    true,
  );
  const draft = obj.draft;
  const draftBytes =
    byteLen(draft) +
    (attachment && attachment.text ? byteLen(attachment.text) : 0);
  if (draftBytes > MAX_DRAFT_TA)
    throw err("invalid_import", "draft + attachment too large");
  return { version: 1, title: obj.title, messages, draft, attachment };
}

function makeChat(id, title) {
  return { id, title, messages: [], draft: "", attachment: null };
}

function buildUserMessage(draft, attachment) {
  if (!attachment) return draft;
  return (
    draft +
    "\n\n--- Attached file: " +
    attachment.name +
    " ---\n" +
    attachment.text +
    "\n--- End attachment ---"
  );
}

export function createChatState({ now = Date.now } = {}) {
  let chats = [];
  let currentId = null;
  let nextId = 1;
  let pending = null;
  let busy = false;
  let nextAllowedAt = 0;

  function find(id) {
    return chats.find((c) => c.id === id) || null;
  }

  function requireId(id) {
    if (typeof id !== "string" && typeof id !== "number")
      throw err("busy", "invalid id");
    const c = find(id);
    if (!c) throw err("busy", "chat not found");
    return c;
  }

  function ensureMutable() {
    if (busy) throw err("busy", "operation in progress");
  }

  function createInitial() {
    const c = makeChat("c" + nextId++, "New Chat");
    chats.push(c);
    currentId = c.id;
  }
  createInitial();

  function list() {
    return chats.map((c) => deepClone({ id: c.id, title: c.title }));
  }

  function current() {
    return get(currentId);
  }

  function get(id) {
    const c = find(id);
    if (!c) throw err("busy", "chat not found");
    return deepClone({
      id: c.id,
      title: c.title,
      messages: c.messages,
      draft: c.draft,
      attachment: c.attachment,
    });
  }

  function newChat(title) {
    ensureMutable();
    if (chats.length >= MAX_CHATS) throw err("chat_limit", "max chats");
    if (title === undefined || title === null) title = "New Chat";
    if (typeof title !== "string")
      throw err("invalid_import", "title must be string");
    if (title.trim().length === 0)
      throw err("invalid_import", "title required");
    if (title.length > MAX_TITLE) throw err("invalid_import", "title too long");
    const c = makeChat("c" + nextId++, title);
    chats.push(c);
    currentId = c.id;
    return get(c.id);
  }

  function switchChat(id) {
    ensureMutable();
    const c = requireId(id);
    currentId = c.id;
    return get(c.id);
  }

  function renameChat(id, title) {
    ensureMutable();
    const c = requireId(id);
    if (typeof title !== "string")
      throw err("invalid_import", "title must be string");
    if (title.trim().length === 0)
      throw err("invalid_import", "title required");
    if (title.length > MAX_TITLE) throw err("invalid_import", "title too long");
    c.title = title;
    return get(c.id);
  }

  function deleteChat(id) {
    ensureMutable();
    const c = requireId(id);
    const idx = chats.indexOf(c);
    chats.splice(idx, 1);
    if (currentId === c.id) {
      currentId = chats.length ? chats[Math.max(0, idx - 1)].id : null;
    }
    if (!chats.length) createInitial();
    return get(currentId);
  }

  function setDraft(text) {
    ensureMutable();
    if (typeof text !== "string")
      throw err("invalid_import", "draft must be string");
    const c = find(currentId);
    if (!c) throw err("busy", "no current chat");
    const attBytes = c.attachment ? byteLen(c.attachment.text) : 0;
    if (byteLen(text) + attBytes > MAX_DRAFT_TA)
      throw err("over_context", "draft too large");
    c.draft = text;
    return get(c.id);
  }

  function setAttachment(att) {
    ensureMutable();
    const c = find(currentId);
    if (!c) throw err("busy", "no current chat");
    if (att === null || att === undefined) {
      c.attachment = null;
      return get(c.id);
    }
    const v = validateAttachment(att, true);
    const draftBytes = byteLen(c.draft);
    if (draftBytes + byteLen(v.text) > MAX_DRAFT_TA)
      throw err("over_context", "attachment too large");
    c.attachment = v;
    return get(c.id);
  }

  function search(query) {
    if (typeof query !== "string")
      throw err("invalid_import", "query must be string");
    const q = query.toLowerCase();
    const results = [];
    for (const c of chats) {
      const inTitle = c.title.toLowerCase().includes(q);
      const inDraft = c.draft.toLowerCase().includes(q);
      let inMessages = false;
      const matched = [];
      for (const m of c.messages) {
        if (m.content.toLowerCase().includes(q)) {
          inMessages = true;
          matched.push({ role: m.role, content: m.content });
        }
      }
      if (inTitle || inDraft || inMessages) {
        results.push(
          deepClone({
            id: c.id,
            title: c.title,
            draft: c.draft,
            messages: matched,
          }),
        );
      }
    }
    return results;
  }

  function exportChat() {
    const c = find(currentId);
    if (!c) throw err("busy", "no current chat");
    const json = JSON.stringify({
      version: 1,
      title: c.title,
      messages: deepClone(c.messages),
      draft: c.draft,
      attachment: deepClone(c.attachment),
    });
    if (byteLen(json) > MAX_IMPORT_JSON)
      throw err("over_context", "export too large");
    return json;
  }

  function importChat(json) {
    ensureMutable();
    if (chats.length >= MAX_CHATS) throw err("chat_limit", "max chats");
    const v = validateImport(json);
    const c = makeChat("c" + nextId++, v.title);
    c.messages = deepClone(v.messages);
    c.draft = v.draft;
    c.attachment = deepClone(v.attachment);
    chats.push(c);
    currentId = c.id;
    return get(c.id);
  }

  function beginSend() {
    if (busy) throw err("busy", "send already in progress");
    const t = now();
    if (typeof t !== "number") throw err("busy", "now must return number");
    if (t < nextAllowedAt) throw err("cooldown", "cooldown active");
    const c = find(currentId);
    if (!c) throw err("busy", "no current chat");
    const attachment = c.attachment;
    const draft = c.draft;
    if (
      draft.trim().length === 0 &&
      !(attachment && attachment.text.trim().length > 0)
    ) {
      throw err("invalid_import", "empty message");
    }
    const userMessage = buildUserMessage(draft, attachment);
    const historyBytes = c.messages.reduce((s, m) => s + byteLen(m.content), 0);
    if (historyBytes + byteLen(userMessage) > MAX_SEND_TA)
      throw err("over_context", "context too large");
    if (c.messages.length + 2 > MAX_STORED)
      throw err("message_limit", "message limit");
    busy = true;
    nextAllowedAt = t + COOLDOWN_MS;
    pending = {
      chatId: c.id,
      userMessage,
      draft,
      attachment: deepClone(attachment),
    };
    const messages = c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    messages.push({ role: "user", content: userMessage });
    return { chatId: c.id, messages };
  }

  function finishSend(content) {
    if (!busy || !pending) throw err("busy", "no pending send");
    if (typeof content !== "string")
      throw err("invalid_import", "content must be string");
    if (byteLen(content) > MAX_ASSISTANT)
      throw err("invalid_import", "assistant reply too large");
    const c = find(pending.chatId);
    if (!c) throw err("busy", "chat missing");
    c.messages.push({ role: "user", content: pending.userMessage });
    c.messages.push({ role: "assistant", content });
    c.draft = "";
    c.attachment = null;
    pending = null;
    busy = false;
    return get(c.id);
  }

  function failSend() {
    if (!busy || !pending) throw err("busy", "no pending send");
    const c = find(pending.chatId);
    if (!c) throw err("busy", "chat missing");
    c.draft = pending.draft;
    c.attachment = deepClone(pending.attachment);
    pending = null;
    busy = false;
    return get(c.id);
  }

  function status() {
    return { busy, nextAllowedAt };
  }

  return {
    list,
    current,
    get,
    newChat,
    switchChat,
    renameChat,
    deleteChat,
    setDraft,
    setAttachment,
    search,
    exportChat,
    importChat,
    beginSend,
    finishSend,
    failSend,
    status,
  };
}
