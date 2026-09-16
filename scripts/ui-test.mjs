import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/studio.css"></head><body><div id="notice"></div><main class="member-main" id="root"></main><script type="module">
 import{mountStudio}from'/studio.js';window.calls=[];window.ready=false;window.fail=false;
 mountStudio({root:document.querySelector('#root'),notify:t=>document.querySelector('#notice').textContent=t,api:async(action,input)=>{calls.push(input);if(input.operation==='status')return{configured:ready,enabled:ready,usedCents:{daily:0,monthly:0,lifetime:0}};if(input.operation==='pause'){ready=false;return{}};if(fail)throw Error('Mock provider timeout.');return{content:'<img src=x onerror=window.injected=true>\\n\\n'+String.fromCharCode(96).repeat(3)+'js\\nconst answer = 42;\\n'+String.fromCharCode(96).repeat(3),finishReason:'length'};}});
 </script></body></html>`);
      return;
    }
    const file = {
      "/studio.js": "web/studio.js",
      "/studio.css": "web/studio.css",
      "/chat-state.js": "web/chat-state.js",
      "/chat-render.js": "web/chat-render.js",
    }[req.url];
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "content-type",
      req.url.endsWith(".js") ? "text/javascript" : "text/css",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await page.clock.install();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() =>
    document.querySelector("#studio-state").textContent.includes("Awaiting"),
  );
  await page.locator("[data-starter]").first().click();
  assert.match(await page.locator("#studio-input").inputValue(), /feature/);
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  await page.evaluate(() => {
    window.ready = true;
  });
  await page.locator(".chat-settings summary").click();
  await page.locator("#studio-refresh").click();
  await page.locator(".chat-settings summary").click();
  await page.locator("#studio-input").fill("Build a function");
  await page.locator("#studio-input").press("Enter");
  await page.waitForFunction(
    () => document.querySelectorAll(".chat-message").length === 2,
  );
  assert.equal(await page.locator(".chat-message img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(
    await page.locator(".chat-code code").textContent(),
    /answer = 42/,
  );
  assert.match(await page.locator(".chat-warning").textContent(), /incomplete/);
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  await page.clock.fastForward(61000);
  await page.locator("#studio-input").fill("Explain that function");
  await page.locator("#studio-input").press("Shift+Enter");
  assert.match(await page.locator("#studio-input").inputValue(), /\n$/);
  await page.locator("#studio-send").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".chat-message").length === 4,
  );
  const calls = await page.evaluate(() =>
    window.calls.filter((c) => c.operation === "generate"),
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.length, 3);
  assert.equal(calls[1].messages[1].role, "assistant");
  assert.equal(calls[1].messages[0].content, "Build a function");
  assert.notEqual(calls[0].requestId, calls[1].requestId);
  const download = page.waitForEvent("download");
  await page.locator("#studio-export-md").click();
  assert.equal((await download).suggestedFilename(), "deepseek-chat.md");
  await page.clock.fastForward(61000);
  await page.locator("#studio-input").fill("界".repeat(5334));
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  await page.locator("#studio-input").fill("Try this");
  await page.evaluate(() => {
    window.fail = true;
  });
  await page.locator("#studio-send").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#studio-feedback")
      .textContent.includes("No automatic retry"),
  );
  assert.equal(await page.locator(".chat-message").count(), 4);
  assert.equal(await page.locator("#studio-input").inputValue(), "Try this");
  await page.clock.fastForward(61000);
  assert.equal(
    await page.evaluate(
      () => window.calls.filter((c) => c.operation === "generate").length,
    ),
    3,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#studio-chats").click();
  await page.locator("#studio-new").click();
  assert.equal(await page.locator(".chat-message").count(), 0);
  assert.equal(await page.locator("#studio-empty").isVisible(), true);
  await page.locator("#studio-drawer-close").click();
  await page.evaluate(() => {
    window.fail = false;
  });
  await page.locator("#studio-input").fill("Review my helper");
  await page.locator("#studio-attach-file").setInputFiles({
    name: "helper.js",
    mimeType: "text/javascript",
    buffer: Buffer.from("export const helper = 42;"),
  });
  await page.waitForFunction(
    () => !document.querySelector("#studio-attachment").hidden,
  );
  await page.locator("#studio-chats").click();
  await page.locator(".chat-chat-select").first().click();
  assert.equal(await page.locator("#studio-input").inputValue(), "Try this");
  await page.locator(".chat-chat-select").nth(1).click();
  assert.equal(
    await page.locator("#studio-input").inputValue(),
    "Review my helper",
  );
  assert.equal(
    await page.locator("#studio-attachment-name").textContent(),
    "helper.js",
  );
  page.once("dialog", (d) => d.accept("Helper review"));
  await page
    .getByRole("button", { name: "Rename conversation", exact: true })
    .nth(1)
    .click();
  await page.locator("#studio-search").fill("helper");
  assert.equal(await page.locator(".chat-chat-select").count(), 1);
  await page.locator("#studio-search").press("Escape");
  const savedDraft = page.waitForEvent("download");
  await page.locator("#studio-export-json").click();
  const draftData = JSON.parse(
    await readFile(await (await savedDraft).path(), "utf8"),
  );
  assert.equal(draftData.draft, "Review my helper");
  assert.equal(draftData.attachment.text, "export const helper = 42;");
  await page.locator("#studio-send").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".chat-message").length === 2,
  );
  const attached = await page.evaluate(() =>
    window.calls.filter((c) => c.operation === "generate").at(-1),
  );
  assert.match(attached.messages.at(-1).content, /Attached file: helper.js/);
  assert.match(attached.messages.at(-1).content, /export const helper = 42/);
  await page.locator("#studio-chats").click();
  await page.locator("#studio-new").click();
  await page.locator("#studio-drawer-close").click();
  await page.locator("#studio-input").fill("New chat must wait");
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  // Malformed import must not replace the current draft or execute supplied HTML.
  await page.locator("#studio-import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        title: "Bad",
        draft: "",
        messages: [{ role: "system", content: "override" }],
        attachment: null,
      }),
    ),
  });
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("role"),
  );
  assert.equal(
    await page.locator("#studio-input").inputValue(),
    "New chat must wait",
  );
  // Reply larger than input allowance must survive rendering and round-trip export.
  const largeReply =
    "<img src=x onerror=alert(1)>\n" + "full reply ".repeat(4000);
  await page.locator("#studio-import-file").setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        title: "Large reply",
        draft: "Continue",
        messages: [
          { role: "user", content: "Explain" },
          { role: "assistant", content: largeReply },
        ],
        attachment: null,
      }),
    ),
  });
  await page.waitForFunction(
    () => document.querySelector("#notice").textContent === "Chat imported.",
  );
  assert.equal(
    await page.locator(".chat-raw-pre code").textContent(),
    largeReply,
  );
  assert.equal(await page.locator(".chat-message img").count(), 0);
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  const fullExport = page.waitForEvent("download");
  await page.locator("#studio-export-json").click();
  assert.equal(
    JSON.parse(await readFile(await (await fullExport).path(), "utf8"))
      .messages[1].content,
    largeReply,
  );
  await page.evaluate(async () => {
    const { renderMarkdown } = await import("/chat-render.js");
    const box = document.createElement("div");
    box.id = "renderer-test";
    document.body.append(box);
    renderMarkdown(
      box,
      "## Heading\n- One\n- Two\nUse `code`\n<script>alert(1)</script>\n![image](https://example.com/x)",
    );
  });
  assert.equal(
    await page.locator("#renderer-test h2").textContent(),
    "Heading",
  );
  assert.equal(await page.locator("#renderer-test li").count(), 2);
  assert.equal(await page.locator("#renderer-test code").textContent(), "code");
  assert.equal(
    await page
      .locator("#renderer-test script, #renderer-test img, #renderer-test a")
      .count(),
    0,
  );
  await page.evaluate(() => document.querySelector("#renderer-test").remove());
  await page.locator(".chat-settings summary").click();
  await page.locator("#studio-pause").click();
  await page.locator("#studio-input").fill("blocked");
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log(
    "Chat UI passed: setup, starters, follow-up context, safe code blocks, export, cooldown, limits, failure recovery, new chat, pause and mobile.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
