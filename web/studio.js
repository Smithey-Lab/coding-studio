import { createChatState } from "./chat-state.js";
import { renderMarkdown } from "./chat-render.js";

const MAX_DRAFT_BYTES = 16000;
const MAX_FILENAME_BYTES = 200;
const MAX_IMPORT_JSON = 1024 * 1024;

export function mountStudio({ root, api, notify }) {
  document.body.classList.add("studio-page");
  root.classList.add("coding-workspace");
  root.innerHTML = `<header class="chat-heading"><div><p class="chat-eyebrow">SMITHEY LAB / PRIVATE WORKSPACE</p><h1>Coding Studio<span>.</span></h1><p>Your ideas. A conversation. Better code.</p></div><a href="/app/" class="action-link">All tools ↗</a></header>
  <section class="chat-shell" aria-label="DeepSeek chat"><div class="chat-toolbar"><div><span class="chat-dot" aria-hidden="true"></span><strong>DeepSeek Flash</strong><span id="studio-state" role="status">Checking connection…</span></div><div class="chat-actions"><button id="studio-chats" type="button" aria-expanded="false">Conversations</button><button id="studio-export-json" type="button" disabled>Export JSON</button><button id="studio-export-md" type="button" disabled>Export Markdown</button><input id="studio-import-file" type="file" accept="application/json" hidden aria-hidden="true" tabindex="-1"><button id="studio-import" type="button">Import JSON</button><details class="chat-settings"><summary>Settings</summary><div><h2>Chat settings</h2><label>Response length<select id="studio-tokens"><option value="512">Short · 512 tokens</option><option value="1024">Standard · 1,024 tokens</option><option value="2048" selected>Extended · 2,048 tokens</option><option value="4096">Detailed · 4,096 tokens</option></select></label><label>Style<select id="studio-temperature"><option value="0">Precise</option><option value="0.3" selected>Balanced</option><option value="0.7">Creative</option></select></label><p id="studio-budget"></p><p>Each attempt reserves $0.05. One request per minute. Failed attempts are not retried automatically.</p><button id="studio-refresh" type="button">Refresh connection</button><button id="studio-pause" type="button">Pause API access</button><h3>Connect DeepSeek</h3><p>Save your key in the Coding Studio AWS Secrets Manager secret as <code>apiKey</code>, then refresh. Your key never reaches this browser.</p></div></details></div></div>
  <div id="studio-drawer" class="chat-drawer" hidden><div class="chat-drawer-head"><h2>Conversations</h2><button id="studio-drawer-close" type="button" aria-label="Close conversations">Close</button></div><div class="chat-drawer-actions"><button id="studio-new" type="button">New chat</button><label class="chat-sr-only" for="studio-search">Search conversations</label><input id="studio-search" type="search" placeholder="Search conversations…" autocomplete="off"></div><ul id="studio-chat-list" class="chat-chat-list" aria-label="Conversation list"></ul><p id="studio-search-results" class="chat-search-results" role="status" aria-live="polite"></p></div>
  <div id="studio-scroll" class="chat-scroll"><div id="studio-empty" class="chat-empty"><div class="chat-symbol" aria-hidden="true">&lt;/&gt;</div><p class="chat-eyebrow">LET’S MAKE SOMETHING</p><h2>What are you working on?</h2><p>Ask a question, paste some code, or describe what you want to build.</p><div class="chat-starters"><button type="button" data-starter="Help me build a feature. Here is what I want it to do:\n">Build something <span>Turn an idea into code ↗</span></button><button type="button" data-starter="Help me debug this. Expected behavior, actual behavior, and code:\n">Find a bug <span>Work through a problem ↗</span></button><button type="button" data-starter="Review this code for correctness and security:\n">Review my code <span>Get a second set of eyes ↗</span></button></div></div><div id="studio-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div><p id="studio-working" class="chat-working" role="status" hidden>DeepSeek is working on your reply…</p></div>
  <form id="studio-form" class="chat-composer"><label class="chat-sr-only" for="studio-input">Message DeepSeek</label><textarea id="studio-input" rows="3" placeholder="Ask DeepSeek anything about your code…" spellcheck="false"></textarea><div id="studio-attachment" class="chat-attachment" hidden><div class="chat-attachment-info"><strong id="studio-attachment-name"></strong><span id="studio-attachment-size"></span></div><button id="studio-attachment-remove" type="button" aria-label="Remove attachment">Remove</button></div><div class="chat-compose-footer"><div class="chat-attach-actions"><button id="studio-attach" type="button">Attach text file</button><input id="studio-attach-file" type="file" hidden></div><span id="studio-context">0 / 16,000 context bytes</span><button id="studio-send" class="primary" disabled>Send ↑</button></div><p id="studio-feedback" role="status"></p></form></section><footer class="chat-footer"><span>Owner only · Key protected in AWS</span><span>Enter to send · Shift + Enter for a new line</span></footer><p class="chat-privacy">Chat stays in this tab until you leave or reload. Each message sends the conversation to DeepSeek. Generated code is not run.</p>`;

  const el = (id) => root.querySelector("#studio-" + id);
  const state = createChatState();
  const encoder = new TextEncoder();
  const bytes = (text) =>
    encoder.encode(typeof text === "string" ? text : "").byteLength;

  let ready = false;
  let busy = false;
  let drawerOpen = false;
  let timer = null;
  let requestError = "";

  function currentChat() {
    return state.current();
  }

  function attachmentText(a) {
    if (!a) return "";
    return (
      "\n\n--- Attached file: " +
      a.name +
      " ---\n" +
      a.text +
      "\n--- End attachment ---"
    );
  }

  function contextBytes(chat, extraDraft) {
    if (!chat) return 0;
    let n = 0;
    for (const m of chat.messages) n += bytes(m.content);
    const draft = typeof extraDraft === "string" ? extraDraft : chat.draft;
    n += bytes(draft);
    if (chat.attachment) n += bytes(attachmentText(chat.attachment));
    return n;
  }

  function remainingSeconds() {
    const s = state.status();
    return Math.max(0, Math.ceil((s.nextAllowedAt - Date.now()) / 1000));
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!root.isConnected) {
        stopTimer();
        return;
      }
      const rem = remainingSeconds();
      if (rem <= 0) {
        stopTimer();
        update();
        return;
      }
      update();
    }, 1000);
  }

  function setFeedback(msg) {
    el("feedback").textContent = msg || "";
  }

  function update() {
    const chat = currentChat();
    const draft = el("input").value;
    const att = chat ? chat.attachment : null;
    const total = contextBytes(chat, draft);
    const rem = remainingSeconds();
    const messageCount = chat ? chat.messages.length : 0;
    const draftBytes = bytes(draft);
    const tooLong = total > MAX_DRAFT_BYTES;
    const tooMany = messageCount >= 22;
    const noDraft =
      !draft.trim() && !(att && att.text && att.text.trim().length);

    el("context").textContent =
      total.toLocaleString() + " / 16,000 context bytes";

    el("send").disabled =
      !ready || busy || rem > 0 || tooLong || tooMany || noDraft;
    el("send").textContent = busy
      ? "Waiting…"
      : rem > 0
        ? "Wait " + rem + "s"
        : "Send ↑";

    el("chats").disabled = busy;
    el("new").disabled = busy;
    el("export-json").disabled = busy || (!messageCount && !draft && !att);
    el("export-md").disabled = busy || messageCount === 0;
    el("import").disabled = busy;
    el("input").disabled = busy;
    el("attach-file").disabled = busy;
    el("attach").disabled = busy;
    el("attachment-remove").disabled = busy;
    el("search").disabled = busy;

    if (att) {
      el("attachment").hidden = false;
      el("attachment-name").textContent = att.name || "attachment";
      el("attachment-size").textContent =
        bytes(att.text || "").toLocaleString() + " bytes";
    } else {
      el("attachment").hidden = true;
    }

    if (draftBytes > MAX_DRAFT_BYTES) {
      setFeedback(
        "Draft exceeds 16,000 UTF-8 bytes. Shorten your message before sending.",
      );
    } else if (tooLong) {
      setFeedback(
        "Context exceeded: stored replies plus your draft total " +
          total.toLocaleString() +
          " / 16,000 UTF-8 bytes. This conversation can no longer be sent. Start a new chat and export this one. Your content was not dropped.",
      );
    } else if (tooMany) {
      setFeedback(
        "Message retention limit reached. Start a new chat to continue.",
      );
    } else if (requestError) {
      setFeedback(requestError);
    } else {
      setFeedback("");
    }

    if (!drawerOpen || busy) renderChatList();
  }

  function renderMessages() {
    const chat = currentChat();
    const box = el("messages");
    box.replaceChildren();
    if (!chat || !chat.messages.length) {
      el("empty").hidden = false;
      return;
    }
    el("empty").hidden = true;
    for (const m of chat.messages) append(m, false);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => notify("Copied."),
        () =>
          notify(
            "Copy unavailable. Select the text and copy it manually.",
            true,
          ),
      );
    } else {
      notify("Copy unavailable. Select the text and copy it manually.", true);
    }
  }

  function append(message, truncated) {
    el("empty").hidden = true;
    const row = document.createElement("article");
    row.className = "chat-message " + message.role;
    const heading = document.createElement("div");
    heading.className = "chat-message-heading";
    const name = document.createElement("strong");
    name.textContent = message.role === "user" ? "You" : "DeepSeek";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy " + name.textContent + " message");
    button.addEventListener("click", () => copy(message.content));
    heading.append(name, button);
    row.append(heading);
    const body = document.createElement("div");
    body.className = "chat-text";
    row.append(body);
    renderMarkdown(body, message.content);
    if (truncated) {
      const p = document.createElement("p");
      p.className = "chat-warning";
      p.textContent =
        "Response reached the output limit and may be incomplete. Ask DeepSeek to continue.";
      row.append(p);
    }
    el("messages").append(row);
    el("scroll").scrollTop = el("scroll").scrollHeight;
  }

  function renderAll() {
    renderMessages();
    update();
  }

  function renderChatList() {
    const list = el("chat-list");
    if (!list) return;
    const items = state.list();
    const query = el("search").value.trim().toLowerCase();
    const cur = currentChat();
    const curId = cur ? cur.id : null;
    let filtered = items;
    if (query) {
      const hits = state.search(query);
      const ids = new Set(hits.map((h) => h.id));
      filtered = items.filter(
        (c) => ids.has(c.id) || c.title.toLowerCase().includes(query),
      );
    }
    const results = el("search-results");
    results.textContent = query
      ? filtered.length +
        (filtered.length === 1
          ? " conversation matches"
          : " conversations match")
      : "";
    list.replaceChildren();
    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "chat-chat-empty";
      li.textContent = query
        ? "No matching conversations."
        : "No conversations yet.";
      list.append(li);
      return;
    }
    for (const item of filtered) {
      const li = document.createElement("li");
      li.className = "chat-chat-item" + (item.id === curId ? " active" : "");
      const main = document.createElement("button");
      main.type = "button";
      main.className = "chat-chat-select";
      main.setAttribute("aria-current", item.id === curId ? "true" : "false");
      main.disabled = busy;
      const title = document.createElement("span");
      title.className = "chat-chat-title";
      title.textContent = item.title || "Untitled";
      const meta = document.createElement("span");
      meta.className = "chat-chat-meta";
      meta.textContent = item.id === curId ? "Current" : "Open";
      main.append(title, meta);
      main.addEventListener("click", () => switchTo(item.id));
      const actions = document.createElement("div");
      actions.className = "chat-chat-actions";
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.textContent = "Rename";
      renameBtn.setAttribute("aria-label", "Rename conversation");
      renameBtn.disabled = busy;
      renameBtn.addEventListener("click", () => rename(item));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.setAttribute("aria-label", "Delete conversation");
      delBtn.disabled = busy;
      delBtn.addEventListener("click", () => remove(item));
      actions.append(renameBtn, delBtn);
      li.append(main, actions);
      list.append(li);
    }
  }

  function switchTo(id) {
    if (busy || !saveDraft()) return;
    try {
      state.switchChat(id);
      syncInputFromState();
      requestError = "";
      renderAll();
      el("input").focus();
    } catch (err) {
      notify(err.message, true);
    }
  }

  function syncInputFromState() {
    const chat = currentChat();
    el("input").value = chat ? chat.draft : "";
  }

  function rename(item) {
    if (busy) return;
    const next = window.prompt("Rename conversation", item.title || "");
    if (next == null) return;
    try {
      state.renameChat(item.id, next);
      renderAll();
    } catch (err) {
      notify(err.message, true);
    }
  }

  function remove(item) {
    if (busy) return;
    if (!window.confirm("Delete this conversation? This cannot be undone."))
      return;
    try {
      state.deleteChat(item.id);
      syncInputFromState();
      requestError = "";
      renderAll();
    } catch (err) {
      notify(err.message, true);
    }
  }

  function newChat() {
    if (busy || !saveDraft()) return;
    try {
      state.newChat();
      syncInputFromState();
      requestError = "";
      renderAll();
      el("input").focus();
    } catch (err) {
      if (err && err.code === "chat_limit")
        notify(
          "Maximum of 20 conversations reached. Delete one to create another.",
          true,
        );
      else notify(err.message, true);
    }
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    if (!saveDraft()) return;
    try {
      const raw = state.exportChat();
      const obj = JSON.parse(raw);
      download("deepseek-chat.json", JSON.stringify(obj), "application/json");
    } catch (err) {
      notify(err.message, true);
    }
  }

  function exportMarkdown() {
    const chat = currentChat();
    if (!chat || !chat.messages.length) return;
    const text = chat.messages
      .map(
        (m) =>
          "## " + (m.role === "user" ? "You" : "DeepSeek") + "\n\n" + m.content,
      )
      .join("\n\n---\n\n");
    download("deepseek-chat.md", text, "text/markdown");
  }

  function openDrawer() {
    drawerOpen = true;
    el("drawer").hidden = false;
    el("chats").setAttribute("aria-expanded", "true");
    renderChatList();
    el("search").focus();
  }

  function closeDrawer() {
    drawerOpen = false;
    el("drawer").hidden = true;
    el("chats").setAttribute("aria-expanded", "false");
    el("chats").focus();
  }

  function setBusy(on) {
    busy = on;
    update();
  }

  function saveDraft() {
    try {
      state.setDraft(el("input").value);
      return true;
    } catch {
      notify(
        "Shorten the draft to 16,000 UTF-8 bytes before changing conversations or exporting. Your text is still in the editor.",
        true,
      );
      return false;
    }
  }

  async function refresh() {
    ready = false;
    update();
    try {
      const s = await api("studio", { operation: "status" });
      ready =
        s.enabled &&
        s.configured &&
        s.usedCents.daily < 100 &&
        s.usedCents.monthly < 500 &&
        s.usedCents.lifetime < 2000;
      el("state").textContent = !s.configured
        ? "Awaiting API key"
        : !s.enabled
          ? "Paused"
          : ready
            ? "Ready to chat"
            : "Allowance reached";
      el("budget").textContent =
        "Reserved allowance: $" +
        (s.usedCents.daily / 100).toFixed(2) +
        " / $1 today · $" +
        (s.usedCents.monthly / 100).toFixed(2) +
        " / $5 this month · $" +
        (s.usedCents.lifetime / 100).toFixed(2) +
        " / $20 lifetime.";
    } catch (e) {
      el("state").textContent = "Connection unavailable";
      notify(e.message, true);
    }
    root.dataset.connected = String(ready);
    update();
  }

  el("input").addEventListener("input", () => {
    const chat = currentChat();
    if (chat) {
      try {
        state.setDraft(el("input").value);
      } catch (_) {
        /* over_context; update() reflects limit */
      }
    }
    update();
  });

  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!el("send").disabled) el("form").requestSubmit();
    }
  });

  root.querySelectorAll("[data-starter]").forEach((button) =>
    button.addEventListener("click", () => {
      el("input").value = button.dataset.starter;
      const chat = currentChat();
      if (chat) {
        try {
          state.setDraft(el("input").value);
        } catch (_) {
          notify(
            "Remove the attachment or shorten the draft before using a starter.",
            true,
          );
        }
      }
      el("input").focus();
      update();
    }),
  );

  el("chats").addEventListener("click", () => {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  });
  el("drawer-close").addEventListener("click", closeDrawer);
  el("search").addEventListener("input", renderChatList);
  el("new").addEventListener("click", newChat);

  el("attach").addEventListener("click", () => el("attach-file").click());
  el("drawer").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
  el("attach-file").addEventListener("change", attachFile);
  el("attachment-remove").addEventListener("click", () => {
    if (busy) return;
    try {
      state.setAttachment(null);
      renderAll();
    } catch (err) {
      notify(err.message, true);
    }
  });

  function hasControlChars(s) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 32 || c === 127) return true;
    }
    return false;
  }

  async function attachFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || busy) return;
    if (!saveDraft()) return;
    if (file.size > MAX_DRAFT_BYTES) {
      notify("Choose a text or code file no larger than 16,000 bytes.", true);
      return;
    }
    if (
      !file.name ||
      !String(file.name).trim() ||
      hasControlChars(String(file.name))
    ) {
      notify("Invalid file name.", true);
      return;
    }
    if (bytes(String(file.name)) > MAX_FILENAME_BYTES) {
      notify("File name exceeds " + MAX_FILENAME_BYTES + " UTF-8 bytes.", true);
      return;
    }
    const chat = currentChat();
    if (!chat) return;
    const originId = chat.id;
    let text;
    try {
      text = await file.text();
    } catch (_) {
      notify("Unable to read file.", true);
      return;
    }
    if (busy) return;
    const now = currentChat();
    if (!now || now.id !== originId) {
      notify(
        "Conversation changed while reading file. Attachment not applied.",
        true,
      );
      return;
    }
    if (
      [...text].some((c) => {
        const n = c.charCodeAt(0);
        return n === 0 || n === 65533 || (n < 32 && ![9, 10, 13].includes(n));
      })
    ) {
      notify(
        "Choose a UTF-8 plain-text or code file, not a binary file.",
        true,
      );
      return;
    }
    if (bytes(text) > MAX_DRAFT_BYTES - bytes(chat.draft)) {
      notify("Attachment too large for the 16,000 byte context.", true);
      return;
    }
    try {
      state.setAttachment({ name: String(file.name), text });
      requestError = "";
      renderAll();
    } catch (err) {
      notify(err.message, true);
    }
  }

  el("export-json").addEventListener("click", exportJson);
  el("export-md").addEventListener("click", exportMarkdown);

  el("import").addEventListener("click", () => {
    if (busy) return;
    el("import-file").click();
  });

  el("import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || busy) return;
    if (file.size > MAX_IMPORT_JSON) {
      notify("Import exceeds 1 MB.", true);
      return;
    }
    let raw;
    try {
      raw = await file.text();
    } catch (_) {
      notify("Unable to read import file.", true);
      return;
    }
    if (busy) return;
    try {
      if (!saveDraft()) return;
      state.importChat(raw);
      syncInputFromState();
      requestError = "";
      renderAll();
      notify("Chat imported.");
    } catch (err) {
      notify(err.message, true);
    }
  });

  el("refresh").addEventListener("click", refresh);

  el("pause").addEventListener("click", async () => {
    try {
      await api("studio", { operation: "pause" });
      notify(
        "API access paused. An already admitted request may still finish.",
      );
      await refresh();
    } catch (e) {
      notify(e.message, true);
    }
  });

  el("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || el("send").disabled) return;
    if (!saveDraft()) return;
    let began;
    try {
      began = state.beginSend();
    } catch (err) {
      if (err && err.code === "cooldown") {
        startTimer();
        update();
      } else {
        requestError = err.message;
      }
      update();
      return;
    }
    const request = {
      operation: "generate",
      messages: began.messages,
      requestId: crypto.randomUUID(),
      maxTokens: Number(el("tokens").value),
      temperature: Number(el("temperature").value),
    };
    if (bytes(JSON.stringify({ action: "studio", ...request })) > 39000) {
      state.failSend();
      requestError =
        "This message contains too many escaped characters. Shorten it before sending.";
      update();
      return;
    }
    requestError = "";
    setBusy(true);
    renderMessages();
    append(began.messages.at(-1), false);
    el("working").hidden = false;
    startTimer();
    try {
      const result = await api("studio", request);
      let finished;
      try {
        finished = state.finishSend(
          result && typeof result.content === "string" ? result.content : "",
        );
      } catch (err) {
        state.failSend();
        requestError = err.message;
        throw err;
      }
      setBusy(false);
      el("working").hidden = true;
      const now = currentChat();
      if (now && now.id === finished.id) {
        renderMessages();
        el("input").value = now.draft || "";
        if (result && result.finishReason === "length") {
          const rows = el("messages").querySelectorAll(
            ".chat-message.assistant",
          );
          const last = rows[rows.length - 1];
          if (last) {
            const p = document.createElement("p");
            p.className = "chat-warning";
            p.textContent =
              "Response reached the output limit and may be incomplete. Ask DeepSeek to continue.";
            last.append(p);
          }
        }
      } else {
        renderAll();
      }
    } catch (error) {
      try {
        state.failSend();
      } catch (_) {
        /* An invalid reply may already have restored the pending draft. */
      }
      setBusy(false);
      el("working").hidden = true;
      renderAll();
      requestError =
        error.message +
        " Your message is still in the editor and attachment is retained. No automatic retry was made.";
      update();
    } finally {
      el("working").hidden = true;
      setBusy(false);
      await refresh();
      update();
      el("input").focus();
      startTimer();
    }
  });

  renderAll();
  refresh();
}
