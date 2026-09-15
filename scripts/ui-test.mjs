import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/studio.css"><style>body{font-family:Arial;background:#06142e;color:white;margin:20px}.member-card{background:#10243b;border:1px solid #28425b;border-radius:16px;padding:24px}button{padding:12px}a{color:#6edde0}</style></head><body><div id="notice" role="status"></div><main id="root"></main><script type="module">import{mountStudio}from"/studio.js";window.calls=[];window.ready=false;await mountStudio({root:document.querySelector("#root"),notify:t=>document.querySelector("#notice").textContent=t,api:async(action,input)=>{calls.push(input);if(input.operation==="status")return {configured:ready,enabled:ready,usedCents:{daily:0,monthly:0,lifetime:0}};if(input.operation==="pause"){ready=false;return {};}return {content:"<img src=x onerror=window.injected=true>\\nconst answer = 42;",model:"deepseek-flash",usage:{inputTokens:20,outputTokens:30},finishReason:"length"};}});</script></body></html>',
      );
      return;
    }
    const file = {
      "/studio.js": "web/studio.js",
      "/studio.css": "web/studio.css",
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
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() =>
    document.querySelector("#studio-state")?.textContent.includes("Awaiting"),
  );
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  await page.locator("#studio-context").fill("const x = 1;");
  await page.locator("#studio-compose").click();
  assert.match(
    await page.locator("#studio-preview").inputValue(),
    /const x = 1/,
  );
  await page.evaluate(() => {
    window.ready = true;
  });
  await page.locator("#studio-refresh").click();
  await page.waitForFunction(
    () => !document.querySelector("#studio-send").disabled,
  );
  await page.locator("#studio-send").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#studio-answer")
      .textContent.includes("answer = 42"),
  );
  assert.equal(await page.locator("#studio-answer img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.match(
    await page.locator("#studio-result-meta").textContent(),
    /incomplete/,
  );
  assert.equal(
    await page.evaluate(
      () => window.calls.filter((x) => x.operation === "generate").length,
    ),
    1,
  );
  await page.locator("#studio-preview").fill("界".repeat(5334));
  assert.equal(await page.locator("#studio-send").isDisabled(), true);
  await page.locator("#studio-template").selectOption("debug");
  assert.match(
    await page.locator("#studio-preview").inputValue(),
    /root cause/,
  );
  await page.locator("#studio-pause").click();
  await page.waitForFunction(
    () => document.querySelector("#studio-send").disabled,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#studio-clear").click();
  assert.equal(await page.locator("#studio-preview").inputValue(), "");
  assert.equal(await page.locator("#studio-copy").isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log(
    "UI passed: disabled setup, compose, submit once, text-safe response, truncation, byte limit, template, pause, mobile/reduced-motion, clear.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
