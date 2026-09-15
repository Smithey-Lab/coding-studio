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
  root.innerHTML = `<div class="studio-heading"><div><span class="eyebrow">SMITHEY LAB / OWNER WORKSPACE</span><h1>Coding Studio<span class="studio-dot">.</span></h1><p>Shape the request. Inspect the answer. Build something better.</p></div><a class="action-link" href="/app/">All tools</a></div>
  <div class="studio-status member-card"><div><span class="studio-indicator"></span><strong id="studio-state">Checking connection…</strong><p id="studio-budget" class="small"></p></div><div class="studio-actions"><button id="studio-refresh" type="button">Refresh status</button><button id="studio-pause" type="button">Pause API</button></div></div>
  <div class="studio-layout"><section class="member-card studio-compose"><span class="eyebrow">01 / COMPOSE</span><h2>A clear brief starts here.</h2><form id="studio-form"><label>Starting point<select id="studio-template"><option value="build">Build a feature</option><option value="debug">Find a bug</option><option value="review">Review code</option><option value="refactor">Refactor safely</option><option value="tests">Write useful tests</option></select></label><label>What do you want to accomplish?<textarea id="studio-goal" rows="3" maxlength="8000" required></textarea></label><label>Language / stack<input id="studio-stack" maxlength="300" placeholder="TypeScript, React, Node.js…"></label><label>Context / source code<textarea id="studio-context" class="studio-code" rows="8" maxlength="15000" placeholder="Paste the relevant code, error, or requirements."></textarea></label><details open><summary>Prompt controls</summary><label>Constraints<textarea id="studio-constraints" rows="3" maxlength="4000"></textarea></label><label>Expected response<textarea id="studio-output" rows="3" maxlength="2000"></textarea></label></details><div class="studio-actions"><button id="studio-compose" type="button">Build prompt preview</button><button id="studio-save" type="button">Save template to file</button><label class="studio-import">Load template<input id="studio-load" type="file" accept="application/json,.json"></label></div><label>Final prompt · editable<textarea id="studio-preview" class="studio-code" rows="10" maxlength="16000" required></textarea></label><p id="studio-bytes" class="small" aria-live="polite"></p><div class="studio-controls"><label>Output limit<select id="studio-tokens"><option value="512">512 tokens · short</option><option value="1024" selected>1,024 tokens</option><option value="2048">2,048 tokens</option><option value="4096">4,096 tokens · detailed</option></select></label><label>Creativity<select id="studio-temperature"><option value="0">Precise · 0</option><option value="0.3" selected>Balanced · 0.3</option><option value="0.7">Exploratory · 0.7</option></select></label></div><p class="small">Only the final prompt is sent to DeepSeek. Remove passwords, API keys, and private data you do not want to share. Each click sends one independent request.</p><button id="studio-send" class="primary" disabled>Send to DeepSeek</button><p class="small">No automatic retries. A started attempt reserves $0.05, including failures. Limits reset at midnight UTC.</p></form></section>
  <aside class="studio-results"><section class="member-card"><span class="eyebrow">02 / RESPONSE</span><div class="studio-result-heading"><h2>From brief to code.</h2><span class="badge">DEEPSEEK FLASH</span></div><p id="studio-result-meta" class="small" aria-live="polite">Your answer will appear here. Nothing is sent until you choose Send.</p><pre id="studio-answer" class="studio-answer" tabindex="0">Start with a template on the left, add your context, then review the final prompt.</pre><div class="studio-actions"><button id="studio-copy" disabled>Copy answer</button><button id="studio-download" disabled>Download answer</button><button id="studio-clear">Clear workspace</button></div></section><section class="member-card studio-guardrails"><span class="eyebrow">PRIVATE BY DESIGN</span><h3>Your access. Bounded usage.</h3><ul><li>Your owner identity and authenticator login are required.</li><li>The API key stays in AWS Secrets Manager.</li><li>One request per minute; 20 per day, 100 per month, 400 lifetime.</li><li>Prompts and answers remain in this page until you clear, reload, or leave. They are not saved on our server.</li><li>Generated code is displayed as text. Review it before running it.</li></ul><details><summary>Connect your key · final setup</summary><p>After deployment, add a JSON field named <code>apiKey</code> to the Coding Studio secret in AWS Secrets Manager. For the initial deployment, refresh status after saving the key. If you previously paused the API, use the repository’s activation script to resume. The browser never receives or stores the key.</p><p>Keep a small provider balance and review current pricing before activation. The allowance is a conservative reservation, not a provider invoice or a cap on AWS hosting costs.</p></details></section></aside></div>`;
  const el = (id) => root.querySelector("#studio-" + id);
  let ready = false,
    busy = false,
    answer = "";
  const fields = ["goal", "stack", "context", "constraints", "output"];
  const read = () => Object.fromEntries(fields.map((k) => [k, el(k).value]));
  const bytes = () => new TextEncoder().encode(el("preview").value).byteLength;
  const update = () => {
    el("bytes").textContent =
      `${bytes().toLocaleString()} / 16,000 UTF-8 bytes`;
    el("send").disabled =
      busy || !ready || !el("preview").value.trim() || bytes() > 16000;
  };
  const compose = () => {
    el("preview").value = composePrompt(read());
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
  el("compose").addEventListener("click", compose);
  el("preview").addEventListener("input", update);
  for (const k of fields)
    el(k).addEventListener("input", () => {
      el("bytes").textContent =
        "Brief changed. Choose Build prompt preview to include these changes.";
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
    if (busy || !ready || bytes() > 16000) return;
    busy = true;
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
    el("answer").textContent = "Workspace cleared.";
    el("result-meta").textContent = "No saved response.";
    el("copy").disabled = true;
    el("download").disabled = true;
    update();
  });
  apply();
  return refresh();
}
