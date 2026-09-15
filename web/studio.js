export const templates = {
  build: {
    title: "Build a feature",
    goal: "Implement the feature described below.",
    constraints:
      "Keep the change focused. Validate inputs, handle errors, and preserve existing behavior.",
    output:
      "Give a short plan, code grouped by file, and steps to verify the change.",
  },
  debug: {
    title: "Find a bug",
    goal: "Find the root cause of this failure and propose a minimal fix.",
    constraints:
      "Separate evidence from assumptions. Do not invent logs or claim to run tests.",
    output: "Explain the root cause, show the fix, and give a regression test.",
  },
  review: {
    title: "Review code",
    goal: "Review this code for correctness, security, and maintainability.",
    constraints:
      "Prioritize concrete defects. Explain the trigger and impact of each finding.",
    output:
      "List findings by severity with relevant code references and suggested fixes.",
  },
  refactor: {
    title: "Refactor safely",
    goal: "Simplify this implementation while preserving its behavior.",
    constraints:
      "Preserve interfaces and error handling. Explain any behavior changes explicitly.",
    output: "Show the revised code, tradeoffs, and relevant regression checks.",
  },
  tests: {
    title: "Write useful tests",
    goal: "Design tests for the supplied implementation.",
    constraints:
      "Focus on boundaries, failure modes, and user-visible behavior. Use the existing test framework.",
    output:
      "Provide runnable tests, setup instructions, and remaining coverage gaps.",
  },
};
export function composePrompt(data) {
  return [
    ["Goal", data.goal],
    ["Language / stack", data.stack],
    ["Context / source code", data.context],
    ["Constraints", data.constraints],
    ["Expected response", data.output],
  ]
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `## ${k}\n${v.trim()}`)
    .join("\n\n");
}
export function mountStudio({ root, api, notify }) {
  root.classList.add("coding-workspace");
  document.body.classList.add("studio-page");
  root.innerHTML = `<header class="studio-heading"><div><div class="studio-kicker">PRIVATE WORKSPACE <span> / </span> DEVELOPMENT</div><h1>Coding Studio<span class="studio-dot">.</span></h1><p>A focused space to turn an idea into a precise request.</p></div><div class="studio-heading-actions"><span class="studio-owner">Owner access</span><a class="action-link" href="/app/">← All tools</a></div></header>
  <div class="studio-status"><div class="studio-connection"><span class="studio-indicator"></span><strong id="studio-state">Checking connection…</strong></div><p id="studio-budget"></p><button id="studio-refresh" type="button">Refresh</button><details class="studio-settings"><summary>Settings</summary><div><h3>Request protection</h3><p>One request per minute. Up to 20 daily and 100 monthly. Every attempt reserves $0.05, including failures.</p><button id="studio-pause" type="button">Pause API access</button><h3>Connect your key</h3><p>Add your dedicated key as the <code>apiKey</code> field in the AWS Secrets Manager secret for Coding Studio. Refresh status after saving. The key never reaches this browser.</p></div></details></div>
  <div class="studio-shell"><nav class="studio-tabs" role="tablist" aria-label="Coding Studio views"><button id="studio-tab-brief" role="tab" aria-selected="true" aria-controls="studio-panel-brief" type="button"><span>01</span> Brief</button><button id="studio-tab-prompt" role="tab" aria-selected="false" aria-controls="studio-panel-prompt" type="button"><span>02</span> Prompt preview</button><button id="studio-tab-response" role="tab" aria-selected="false" aria-controls="studio-panel-response" type="button"><span>03</span> Response</button><span class="studio-local">Session only · nothing saved automatically</span></nav>
  <form id="studio-form" novalidate><section id="studio-panel-brief" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-brief"><div class="studio-section-heading"><div><h2>What are we building?</h2><p>Start with a task, add the relevant context, and define a useful answer.</p></div><div class="studio-actions"><button id="studio-save" type="button">Export brief</button><label class="studio-import" for="studio-load">Import brief<input id="studio-load" type="file" accept="application/json,.json"></label><button id="studio-clear" type="button">Clear</button></div></div>
  <div class="studio-brief-grid"><div class="studio-brief-fields"><label>Task<select id="studio-template"><option value="build">Build a feature</option><option value="debug">Find a bug</option><option value="review">Review code</option><option value="refactor">Refactor safely</option><option value="tests">Write useful tests</option></select></label><label>Your goal<textarea id="studio-goal" rows="5" maxlength="8000" placeholder="Describe what should happen and what a good result looks like."></textarea></label><label>Language &amp; stack<input id="studio-stack" maxlength="300" placeholder="e.g. TypeScript, React, AWS Lambda"></label><details class="studio-instructions"><summary>Instructions &amp; output format <span>Customize the template</span></summary><label>Constraints<textarea id="studio-constraints" rows="3" maxlength="4000"></textarea></label><label>Expected response<textarea id="studio-output" rows="3" maxlength="2000"></textarea></label></details></div><div class="studio-context-field"><div class="studio-editor-heading"><label for="studio-context">Context &amp; source code</label><span>Plain text</span></div><textarea id="studio-context" class="studio-code" rows="15" maxlength="15000" spellcheck="false" placeholder="// Paste the relevant code, error output, or requirements here.

A little context goes a long way. Include the current behavior, expected behavior, and anything the solution needs to preserve."></textarea><p class="studio-field-help">Include only what the task needs. Remove credentials and private data before sending.</p></div></div><div class="studio-panel-footer"><p id="studio-draft-state">Your brief stays in this tab.</p><button id="studio-compose" class="primary" type="button">Review prompt <span aria-hidden="true">→</span></button></div></section>
  <section id="studio-panel-prompt" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-prompt" hidden><div class="studio-section-heading"><div><h2>Review the exact request.</h2><p>Edit freely. This is the prompt DeepSeek will receive.</p></div><button id="studio-rebuild" type="button">Rebuild from brief</button></div><label class="studio-sr-only" for="studio-preview">Final prompt</label><div class="studio-editor-heading"><span>prompt.md</span><span id="studio-bytes" aria-live="polite"></span></div><textarea id="studio-preview" class="studio-code studio-preview" rows="19" maxlength="16000" spellcheck="false"></textarea><div class="studio-sendbar"><div class="studio-controls"><label>Output length<select id="studio-tokens"><option value="512">Short · 512 tokens</option><option value="1024" selected>Standard · 1,024 tokens</option><option value="2048">Extended · 2,048 tokens</option><option value="4096">Detailed · 4,096 tokens</option></select></label><label>Creativity<select id="studio-temperature"><option value="0">Precise</option><option value="0.3" selected>Balanced</option><option value="0.7">Exploratory</option></select></label></div><div class="studio-send-action"><span>DeepSeek Flash · $0.05 reserved per attempt</span><button id="studio-send" class="primary" disabled>Send to DeepSeek</button></div></div><p class="studio-field-help">Each submission is independent. No automatic retries. Review generated code before running it.</p></section></form>
  <section id="studio-panel-response" class="studio-panel" role="tabpanel" aria-labelledby="studio-tab-response" hidden><div class="studio-section-heading"><div><h2>Your response.</h2><p id="studio-result-meta" aria-live="polite">Ready when you are. Review a prompt to get started.</p></div><div class="studio-actions"><button id="studio-copy" type="button" disabled>Copy answer</button><button id="studio-download" type="button" disabled>Download .md</button></div></div><div class="studio-editor-heading"><span>response.md</span><span>DEEPSEEK FLASH</span></div><div id="studio-empty" class="studio-empty"><span class="studio-empty-symbol" aria-hidden="true">&lt;/&gt;</span><h3>Room for your next idea.</h3><p>Build a brief, review the prompt, and your answer will appear here.</p><button id="studio-back" type="button">Back to brief</button></div><pre id="studio-answer" class="studio-answer" tabindex="0" hidden></pre></section></div>
  <footer class="studio-bottom"><span><span class="studio-lock" aria-hidden="true">●</span> Owner only · MFA protected</span><span>Prompts are sent only when you choose Send. The API key stays in AWS.</span></footer>`;
  const el = (id) => root.querySelector("#studio-" + id);
  let dirty = false;
  const views = ["brief", "prompt", "response"];
  function show(view) {
    for (const name of views) {
      el("panel-" + name).hidden = name !== view;
      el("tab-" + name).setAttribute("aria-selected", String(name === view));
      el("tab-" + name).tabIndex = name === view ? 0 : -1;
    }
  }
  for (const [index, view] of views.entries()) {
    el("tab-" + view).addEventListener("click", () => show(view));
    el("tab-" + view).addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 2
            : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3;
      show(views[next]);
      el("tab-" + views[next]).focus();
    });
  }
  el("back").addEventListener("click", () => show("brief"));
  let ready = false,
    busy = false,
    answer = "";
  const fields = ["goal", "stack", "context", "constraints", "output"];
  const read = () => Object.fromEntries(fields.map((k) => [k, el(k).value]));
  const bytes = () => new TextEncoder().encode(el("preview").value).byteLength;
  const update = () => {
    root.dataset.connected = String(ready);
    el("bytes").textContent = dirty
      ? "Brief changed · rebuild to include your edits."
      : `${bytes().toLocaleString()} / 16,000 UTF-8 bytes`;
    el("send").disabled =
      busy || dirty || !ready || !el("preview").value.trim() || bytes() > 16000;
  };
  const compose = () => {
    el("preview").value = composePrompt(read());
    dirty = false;
    el("draft-state").textContent = "Prompt updated from your brief.";
    update();
  };
  const apply = () => {
    const t = templates[el("template").value];
    for (const k of ["goal", "constraints", "output"]) el(k).value = t[k];
    compose();
  };
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function refresh() {
    ready = false;
    update();
    try {
      const s = await api("studio", { operation: "status" });
      ready = s.enabled && s.configured;
      el("state").textContent = ready
        ? "Connected · owner only"
        : s.configured
          ? "Paused · key configured"
          : "Awaiting API key · requests disabled";
      const used = s.usedCents;
      el("budget").textContent =
        `Reserved allowance: $${(used.daily / 100).toFixed(2)} / $1 today · $${(used.monthly / 100).toFixed(2)} / $5 this month · $${(used.lifetime / 100).toFixed(2)} / $20 lifetime`;
      if (used.daily >= 100 || used.monthly >= 500 || used.lifetime >= 2000) {
        ready = false;
        el("state").textContent = "Allowance reached · requests blocked";
      }
    } catch (e) {
      el("state").textContent = "Connection unavailable · requests disabled";
      notify(e.message, true);
    }
    update();
  }
  el("template").addEventListener("change", apply);
  el("compose").addEventListener("click", () => {
    compose();
    show("prompt");
  });
  el("rebuild").addEventListener("click", compose);
  el("preview").addEventListener("input", update);
  for (const k of fields)
    el(k).addEventListener("input", () => {
      dirty = true;
      el("draft-state").textContent =
        "Brief changed · review to update your prompt.";
      el("bytes").textContent = "Brief changed · rebuild to include changes.";
      update();
    });
  el("refresh").addEventListener("click", refresh);
  el("pause").addEventListener("click", async () => {
    try {
      await api("studio", { operation: "pause" });
      notify(
        "Coding Studio paused. An already admitted request may still complete.",
      );
      await refresh();
    } catch (e) {
      notify(e.message, true);
    }
  });
  el("save").addEventListener("click", () =>
    download(
      "coding-studio-template.json",
      JSON.stringify({ version: 1, ...read() }, null, 2),
      "application/json",
    ),
  );
  el("load").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 24000) throw new Error("Template file is too large.");
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        fields.some(
          (k) =>
            typeof data[k] !== "string" || data[k].length > el(k).maxLength,
        )
      )
        throw new Error("Invalid template format.");
      for (const k of fields) el(k).value = data[k];
      compose();
      notify("Template loaded locally.");
    } catch (e) {
      notify(e.message, true);
    } finally {
      el("load").value = "";
    }
  });
  el("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (
      busy ||
      dirty ||
      !ready ||
      !el("preview").value.trim() ||
      bytes() > 16000
    )
      return;
    busy = true;
    show("response");
    el("empty").hidden = true;
    el("answer").hidden = false;
    el("answer").textContent = "Working on your request…";
    answer = "";
    el("copy").disabled = true;
    el("download").disabled = true;
    update();
    el("send").textContent = "Waiting for DeepSeek…";
    el("result-meta").textContent =
      "Request in progress. Please keep this page open.";
    try {
      const r = await api("studio", {
        operation: "generate",
        requestId: crypto.randomUUID(),
        prompt: el("preview").value,
        maxTokens: Number(el("tokens").value),
        temperature: Number(el("temperature").value),
      });
      answer = r.content;
      el("answer").textContent = answer;
      el("result-meta").textContent =
        `${r.model} · ${r.usage.inputTokens ?? "Unknown"} input / ${r.usage.outputTokens ?? "unknown"} output tokens · $0.05 reserved${r.finishReason === "length" ? " · Output limit reached; response is incomplete." : ""}`;
      el("copy").disabled = false;
      el("download").disabled = false;
    } catch (e) {
      el("answer").textContent =
        "No complete answer was received. Review the message above before trying again.";
      el("result-meta").textContent = e.message;
      notify(e.message, true);
    } finally {
      busy = false;
      el("send").textContent = "Send to DeepSeek";
      await refresh();
    }
  });
  el("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(answer);
      notify("Answer copied.");
    } catch {
      notify("Clipboard unavailable. Select the response to copy it.", true);
    }
  });
  el("download").addEventListener("click", () =>
    download("coding-studio-answer.md", answer, "text/markdown"),
  );
  el("clear").addEventListener("click", () => {
    if (busy) {
      notify("Wait for the current request to finish before clearing.", true);
      return;
    }
    for (const k of fields) el(k).value = "";
    el("preview").value = "";
    answer = "";
    dirty = false;
    el("empty").hidden = false;
    el("answer").hidden = true;
    show("brief");
    el("draft-state").textContent = "Workspace cleared.";
    el("answer").textContent = "Workspace cleared.";
    el("result-meta").textContent = "No saved response.";
    el("copy").disabled = true;
    el("download").disabled = true;
    update();
  });
  apply();
  return refresh();
}
