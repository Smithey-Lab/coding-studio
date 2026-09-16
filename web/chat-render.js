// web/chat-render.js
// Safe, dependency-free Markdown-ish renderer for chat messages.
// - DOM createElement/textContent only (no innerHTML, no raw HTML)
// - No autolinks, no images, no external requests
// - Preserves ALL content up to backend 256KiB; no char cap / slice
// - Large input (>32000 chars): full text in <pre> + note, markdown disabled
// - Small input: linear bounded parser for headings, lists, inline code, fences
// - Fenced code blocks get a copy button (navigator.clipboard.writeText)
var LARGE_TEXT_THRESHOLD = 32000;
var COPY_FAIL_NOTICE = "Copy failed";
var COPY_OK_NOTICE = "Copied";
var PERF_NOTE =
  "Markdown formatting disabled for performance. Full text shown below.";

// Global regexes: lastIndex MUST be reset before each use.
var FENCE_OPEN_RE = /^\s*```([^`\n]*)$/;
var FENCE_CLOSE_RE = /^\s*```\s*$/;
var HEADING_RE = /^(#{1,4})\s+(.*)$/;
var BULLET_RE = /^\s*[-*+]\s+(.*)$/;
var NUMBER_RE = /^\s*(\d+)[.)]\s+(.*)$/;
var INLINE_CODE_RE = /`([^`\n]+)`/g;
var SAFE_LANG_RE = /^[A-Za-z0-9_+#.-]{0,32}$/;

function resetRegex(re) {
  re.lastIndex = 0;
  return re;
}

function toText(text) {
  if (text === null || text === undefined) return "";
  if (typeof text === "string") return text;
  return String(text);
}

// Split text into lines without dropping content.
// Preserves a trailing newline as an empty final line.
function splitLines(text) {
  return text.split("\n");
}

// Append inline text with `code` spans for backtick-delimited segments.
// No HTML parsing: backtick content is rendered via textContent.
function appendInline(parentEl, text) {
  var value = toText(text);
  var re = resetRegex(INLINE_CODE_RE);
  var last = 0;
  var match;
  while ((match = re.exec(value)) !== null) {
    if (match.index > last) {
      var before = value.slice(last, match.index);
      if (before) parentEl.appendChild(document.createTextNode(before));
    }
    var code = document.createElement("code");
    code.className = "chat-inline-code";
    code.textContent = match[1];
    parentEl.appendChild(code);
    last = match.index + match[0].length;
  }
  if (last < value.length) {
    var rest = value.slice(last);
    if (rest) parentEl.appendChild(document.createTextNode(rest));
  }
}

function copyTextButtonClass() {
  return "chat-code-copy";
}

function makeCopyButton(fullText) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = copyTextButtonClass();
  button.setAttribute("data-copy", "code");
  button.textContent = "Copy";
  button.addEventListener("click", function () {
    var clip =
      typeof navigator !== "undefined" && navigator.clipboard
        ? navigator.clipboard
        : null;
    if (!clip || typeof clip.writeText !== "function") {
      button.textContent = COPY_FAIL_NOTICE;
      return;
    }
    var promise = clip.writeText(fullText);
    if (promise && typeof promise.then === "function") {
      promise.then(
        function () {
          button.textContent = COPY_OK_NOTICE;
        },
        function () {
          button.textContent = COPY_FAIL_NOTICE;
        },
      );
    } else {
      button.textContent = COPY_OK_NOTICE;
    }
  });
  return button;
}

// Sanitize fence info string: never emit an unsanitized language class.
function safeLanguage(info) {
  var lang = toText(info).trim();
  if (!lang) return "";
  if (!SAFE_LANG_RE.test(lang)) return "";
  return lang;
}

function makeCodeBlock(code, info) {
  var wrap = document.createElement("div");
  wrap.className = "chat-code";

  var heading = document.createElement("div");
  heading.className = "chat-code-heading";

  var lang = safeLanguage(info);
  if (lang) {
    var langEl = document.createElement("span");
    langEl.className = "chat-code-lang";
    langEl.textContent = lang;
    heading.appendChild(langEl);
  }

  var pre = document.createElement("pre");
  pre.className = "chat-code-pre";
  var codeEl = document.createElement("code");
  if (lang) {
    codeEl.className = "language-" + lang;
  }
  codeEl.textContent = code;
  pre.appendChild(codeEl);

  heading.appendChild(makeCopyButton(code));
  wrap.appendChild(heading);
  wrap.appendChild(pre);
  return wrap;
}

function renderLargeText(container, text) {
  var note = document.createElement("div");
  note.className = "chat-perf-note";
  note.textContent = PERF_NOTE;
  container.appendChild(note);

  var wrap = document.createElement("div");
  wrap.className = "chat-code chat-raw-text";

  var heading = document.createElement("div");
  heading.className = "chat-code-heading";
  heading.appendChild(makeCopyButton(text));

  var pre = document.createElement("pre");
  pre.className = "chat-code-pre chat-raw-pre";
  var codeEl = document.createElement("code");
  codeEl.textContent = text; // full text, no truncation
  pre.appendChild(codeEl);

  wrap.appendChild(heading);
  wrap.appendChild(pre);
  container.appendChild(wrap);
}

function renderMarkdownLines(container, text) {
  var lines = splitLines(text);
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];

    // Fenced code block.
    var open = FENCE_OPEN_RE.test(line) ? line.match(FENCE_OPEN_RE) : null;
    resetRegex(FENCE_OPEN_RE);
    if (open) {
      var info = open[1];
      var buffer = [];
      i += 1;
      var closed = false;
      while (i < lines.length) {
        if (FENCE_CLOSE_RE.test(lines[i])) {
          resetRegex(FENCE_CLOSE_RE);
          closed = true;
          i += 1;
          break;
        }
        resetRegex(FENCE_CLOSE_RE);
        buffer.push(lines[i]);
        i += 1;
      }
      // Unclosed fence: preserve all remaining content as the code body.
      container.appendChild(makeCodeBlock(buffer.join("\n"), info));
      if (!closed) break;
      continue;
    }

    // Headings h1-h4.
    var headingMatch = line.match(HEADING_RE);
    resetRegex(HEADING_RE);
    if (headingMatch) {
      var level = Math.min(Math.max(headingMatch[1].length, 1), 4);
      var h = document.createElement("h" + level);
      h.className = "chat-markdown-heading chat-markdown-heading-" + level;
      appendInline(h, headingMatch[2]);
      container.appendChild(h);
      i += 1;
      continue;
    }

    // Bullet list.
    if (BULLET_RE.test(line)) {
      resetRegex(BULLET_RE);
      var ul = document.createElement("ul");
      ul.className = "chat-list chat-list-bullet";
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        var bm = lines[i].match(BULLET_RE);
        resetRegex(BULLET_RE);
        var li = document.createElement("li");
        appendInline(li, bm[1]);
        ul.appendChild(li);
        i += 1;
      }
      container.appendChild(ul);
      continue;
    }

    // Number list.
    if (NUMBER_RE.test(line)) {
      resetRegex(NUMBER_RE);
      var ol = document.createElement("ol");
      ol.className = "chat-list chat-list-number";
      while (i < lines.length && NUMBER_RE.test(lines[i])) {
        var nm = lines[i].match(NUMBER_RE);
        resetRegex(NUMBER_RE);
        var oli = document.createElement("li");
        appendInline(oli, nm[2]);
        ol.appendChild(oli);
        i += 1;
      }
      container.appendChild(ol);
      continue;
    }

    // Blank line: paragraph separator.
    if (line === "") {
      i += 1;
      continue;
    }

    // Paragraph: consume until blank or block-start line.
    var para = document.createElement("p");
    para.className = "chat-paragraph";
    var parts = [];
    while (i < lines.length) {
      var cur = lines[i];
      if (cur === "") break;
      if (FENCE_OPEN_RE.test(cur)) {
        resetRegex(FENCE_OPEN_RE);
        break;
      }
      resetRegex(FENCE_OPEN_RE);
      if (HEADING_RE.test(cur) || BULLET_RE.test(cur) || NUMBER_RE.test(cur)) {
        resetRegex(HEADING_RE);
        resetRegex(BULLET_RE);
        resetRegex(NUMBER_RE);
        break;
      }
      resetRegex(HEADING_RE);
      resetRegex(BULLET_RE);
      resetRegex(NUMBER_RE);
      parts.push(cur);
      i += 1;
    }
    appendInline(para, parts.join("\n"));
    container.appendChild(para);
  }
}

export function renderMarkdown(container, text) {
  if (!container || typeof container.appendChild !== "function") {
    return null;
  }
  var value = toText(text);

  // Clear container children safely.
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.setAttribute("data-chat-render", "1");
  container.setAttribute("data-char-count", String(value.length));

  if (value.length > LARGE_TEXT_THRESHOLD) {
    container.setAttribute("data-mode", "raw");
    renderLargeText(container, value);
    return container;
  }

  container.setAttribute("data-mode", "markdown");
  renderMarkdownLines(container, value);
  return container;
}
