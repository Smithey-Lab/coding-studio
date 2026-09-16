export function mountStudio({ root, api, notify }) {
  document.body.classList.add("studio-page");
  root.classList.add("coding-workspace");
  root.innerHTML = `<header class="chat-heading"><div><p class="chat-eyebrow">SMITHEY LAB / PRIVATE WORKSPACE</p><h1>Coding Studio<span>.</span></h1><p>Your ideas. A conversation. Better code.</p></div><a href="/app/" class="action-link">All tools ↗</a></header>
  <section class="chat-shell" aria-label="DeepSeek chat"><div class="chat-toolbar"><div><span class="chat-dot" aria-hidden="true"></span><strong>DeepSeek Flash</strong><span id="studio-state" role="status">Checking connection…</span></div><div class="chat-actions"><button id="studio-new" type="button">New chat</button><button id="studio-export" type="button" disabled>Export</button><details class="chat-settings"><summary>Settings</summary><div><h2>Chat settings</h2><label>Response length<select id="studio-tokens"><option value="512">Short · 512 tokens</option><option value="1024">Standard · 1,024 tokens</option><option value="2048" selected>Extended · 2,048 tokens</option><option value="4096">Detailed · 4,096 tokens</option></select></label><label>Style<select id="studio-temperature"><option value="0">Precise</option><option value="0.3" selected>Balanced</option><option value="0.7">Creative</option></select></label><p id="studio-budget"></p><p>Each attempt reserves $0.05. One request per minute. Failed attempts are not retried automatically.</p><button id="studio-refresh" type="button">Refresh connection</button><button id="studio-pause" type="button">Pause API access</button><h3>Connect DeepSeek</h3><p>Save your key in the Coding Studio AWS Secrets Manager secret as <code>apiKey</code>, then refresh. Your key never reaches this browser.</p></div></details></div></div>
  <div id="studio-scroll" class="chat-scroll"><div id="studio-empty" class="chat-empty"><div class="chat-symbol" aria-hidden="true">&lt;/&gt;</div><p class="chat-eyebrow">LET’S MAKE SOMETHING</p><h2>What are you working on?</h2><p>Ask a question, paste some code, or describe what you want to build.</p><div class="chat-starters"><button type="button" data-starter="Help me build a feature. Here is what I want it to do:\n">Build something <span>Turn an idea into code ↗</span></button><button type="button" data-starter="Help me debug this. Expected behavior, actual behavior, and code:\n">Find a bug <span>Work through a problem ↗</span></button><button type="button" data-starter="Review this code for correctness and security:\n">Review my code <span>Get a second set of eyes ↗</span></button></div></div><div id="studio-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div><p id="studio-working" class="chat-working" role="status" hidden>DeepSeek is working on your reply…</p></div>
  <form id="studio-form" class="chat-composer"><label class="chat-sr-only" for="studio-input">Message DeepSeek</label><textarea id="studio-input" rows="3" maxlength="16000" placeholder="Ask DeepSeek anything about your code…" spellcheck="false"></textarea><div class="chat-compose-footer"><span id="studio-context">0 / 16,000 context bytes</span><button id="studio-send" class="primary" disabled>Send ↑</button></div><p id="studio-feedback" role="status"></p></form></section><footer class="chat-footer"><span>Owner only · Key protected in AWS</span><span>Enter to send · Shift + Enter for a new line</span></footer><p class="chat-privacy">Chat stays in this tab until you leave or start a new chat. Each message sends the conversation to DeepSeek. Generated code is not run.</p>`;
  const el = (id) => root.querySelector("#studio-" + id);
  let messages = [],
    ready = false,
    busy = false,
    cooldown = 0;
  const encoder = new TextEncoder();
  const bytes = (text) => encoder.encode(text).byteLength;
  function update() {
    const total =
      messages.reduce((n, m) => n + bytes(m.content), 0) +
      bytes(el("input").value);
    const remaining = Math.max(0, Math.ceil((cooldown - Date.now()) / 1000));
    const tooLong = total > 16000 || messages.length >= 21;
    el("context").textContent =
      `${total.toLocaleString()} / 16,000 context bytes`;
    el("send").disabled =
      !ready || busy || remaining > 0 || tooLong || !el("input").value.trim();
    el("send").textContent = busy
      ? "Waiting…"
      : remaining
        ? `Wait ${remaining}s`
        : "Send ↑";
    el("new").disabled = busy;
    el("export").disabled = busy || !messages.length;
    el("input").disabled = busy;
    if (tooLong)
      el("feedback").textContent =
        "Context limit reached. Export this conversation and start a new chat, or shorten your message.";
    else if (el("feedback").textContent.startsWith("Context limit"))
      el("feedback").textContent = "";
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied.");
    } catch {
      notify("Copy unavailable. Select the text and copy it manually.", true);
    }
  }
  function append(message, truncated = false) {
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
    button.setAttribute("aria-label", `Copy ${name.textContent} message`);
    button.onclick = () => copy(message.content);
    heading.append(name, button);
    row.append(heading);
    // Only create text nodes. Provider HTML, links and fenced code never execute.
    const parts =
      message.role === "assistant"
        ? message.content.split(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g)
        : [message.content];
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 1) {
        const block = document.createElement("div");
        block.className = "chat-code";
        const bar = document.createElement("div");
        bar.className = "chat-code-heading";
        const label = document.createElement("span");
        label.textContent = parts[i].trim() || "Code";
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Copy code";
        const code = parts[++i];
        b.onclick = () => copy(code);
        const pre = document.createElement("pre");
        const content = document.createElement("code");
        content.textContent = code;
        pre.append(content);
        bar.append(label, b);
        block.append(bar, pre);
        row.append(block);
      } else if (parts[i]) {
        const p = document.createElement("div");
        p.className = "chat-text";
        p.textContent = parts[i];
        row.append(p);
      }
    }
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
        `Reserved allowance: $${(s.usedCents.daily / 100).toFixed(2)} / $1 today · $${(s.usedCents.monthly / 100).toFixed(2)} / $5 this month · $${(s.usedCents.lifetime / 100).toFixed(2)} / $20 lifetime.`;
    } catch (e) {
      el("state").textContent = "Connection unavailable";
      notify(e.message, true);
    }
    root.dataset.connected = String(ready);
    update();
  }
  el("input").addEventListener("input", update);
  el("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!el("send").disabled) el("form").requestSubmit();
    }
  });
  root.querySelectorAll("[data-starter]").forEach((button) =>
    button.addEventListener("click", () => {
      el("input").value = button.dataset.starter;
      el("input").focus();
      update();
    }),
  );
  el("new").addEventListener("click", () => {
    if (
      busy ||
      (messages.length &&
        !window.confirm(
          "Start a new chat? Export first if you want to keep this conversation.",
        ))
    )
      return;
    messages = [];
    el("messages").replaceChildren();
    el("empty").hidden = false;
    el("input").value = "";
    el("feedback").textContent = "";
    update();
    el("input").focus();
  });
  el("export").addEventListener("click", () => {
    const text = messages
      .map(
        (m) => `## ${m.role === "user" ? "You" : "DeepSeek"}\n\n${m.content}`,
      )
      .join("\n\n---\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "deepseek-chat.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    update();
    if (el("send").disabled) return;
    const message = { role: "user", content: el("input").value.trim() };
    const input = {
      operation: "generate",
      messages: [...messages, message],
      requestId: crypto.randomUUID(),
      maxTokens: Number(el("tokens").value),
      temperature: Number(el("temperature").value),
    };
    if (bytes(JSON.stringify({ action: "studio", ...input })) > 39000) {
      el("feedback").textContent =
        "This message contains too many escaped characters. Shorten it before sending.";
      return;
    }
    busy = true;
    el("feedback").textContent = "";
    append(message);
    el("working").hidden = false;
    update();
    try {
      const result = await api("studio", input);
      messages.push(message, { role: "assistant", content: result.content });
      append(messages.at(-1), result.finishReason === "length");
      el("input").value = "";
    } catch (error) {
      // Failed turns stay out of future context. Never silently resend a paid attempt.
      el("messages").lastElementChild?.remove();
      el("empty").hidden = messages.length > 0;
      el("feedback").textContent =
        `${error.message} Your message is still in the editor. No automatic retry was made.`;
    } finally {
      cooldown = Date.now() + 60000;
      busy = false;
      el("working").hidden = true;
      await refresh();
      el("input").focus();
      const timer = setInterval(() => {
        if (!root.isConnected || Date.now() >= cooldown) clearInterval(timer);
        if (root.isConnected) update();
      }, 1000);
    }
  });
  refresh();
}
