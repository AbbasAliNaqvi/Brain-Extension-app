const API_BASE = "http://localhost:5050";
const $ = (id) => document.getElementById(id);

let token = null;
let currentText = "";
let rawText = "";
let streaming = false;
let abortCtrl = null;
let snapPoller = null;
let linksOpen = true;
let activeScreen = "home";
let wsVal = "General";
let langVal = "English";
let agentRunning = false;

const CODE_PATS = [
  /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
  /[{};]\s*$/m,
  /\([^)]*\)\s*(=>|\{)/,
  /(def |print\(|self\.|async def)/,
  /(SELECT|FROM|WHERE|INSERT|UPDATE)\s+/i,
];
const ERR_PATS = [
  /Error:|Exception:|TypeError:|SyntaxError:|ReferenceError:|at\s+\w+\s+\(/,
  /Traceback|File ".+", line \d+/,
  /NullPointerException|ClassNotFoundException/,
];
const isCode = (t) =>
  t?.length > 20 && CODE_PATS.filter((p) => p.test(t)).length >= 2;
const isError = (t) => ERR_PATS.some((p) => p.test(t));

const spProgress = $("sp-progress");

if (window.mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "dark",
    themeVariables: {
      background: "#040404",
      primaryColor: "#10b981",
      primaryTextColor: "#f5f5f5",
      primaryBorderColor: "#2a2a2a",
      lineColor: "#525252",
      secondaryColor: "#171717",
      tertiaryColor: "#0a0a0a",
      edgeLabelBackground: "#111111",
      nodeTextColor: "#f5f5f5",
      clusterBkg: "#0a0a0a",
      clusterBorder: "#2a2a2a",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
    },
  });
}

function _sanitizeMermaid(code) {
  return code.replace(/\[([^\]]+)\]/g, (match, content) => {
    if (content.startsWith('"') && content.endsWith('"')) return match;
    return `["${content.replace(/"/g, "'")}"]`;
  });
}

function navigateTo(screenId, title) {
  const prev = document.getElementById(`scr-${activeScreen}`);
  const next = document.getElementById(`scr-${screenId}`);
  if (!next || activeScreen === screenId) return;
  if (prev) {
    prev.classList.remove("active");
    prev.classList.add("prev");
    setTimeout(() => prev?.classList.remove("prev"), 350);
  }
  next.classList.add("active");
  activeScreen = screenId;
  const backBtn = $("back-btn");
  const navTitle = $("nav-title");

  if (screenId === "home") {
    backBtn?.classList.add("hidden");
  } else {
    backBtn?.classList.remove("hidden");
    if (navTitle) navTitle.textContent = title || "Workspace";
  }
}

function navigateBack() {
  const navTitle = $("nav-title");
  if (navTitle) {
    navTitle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--em)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:2px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.7-4.23A3 3 0 0 1 3.5 12a3 3 0 0 1 2.1-2.87A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.7-4.23A3 3 0 0 0 20.5 12a3 3 0 0 0-2.1-2.87A2.5 2.5 0 0 0 14.5 2Z"/></svg><span class="nav-title-text">BRAIN EXTENSION</span>`;
  }
  navigateTo("home", "");
}

$("back-btn")?.addEventListener("click", navigateBack);

const MODES = {
  desi_analogy: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
    label: "DESI ANALOGY",
    loader: "Mixing chai and algorithms…",
  },
  neural_link: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    label: "NEURAL LINK",
    loader: "Scanning your Second Brain…",
  },
  eli5: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L20 10H13.5L15 2Z"/></svg>`,
    label: "ELI5",
    loader: "Simplifying to first principles…",
  },
  roast_code: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-5 5.5-5 10a5 5 0 0 0 10 0c0-2.5-1.5-4.5-3-6 0 2-1 3-2 3C11 9 12 5 12 2Z"/></svg>`,
    label: "ROAST CODE",
    loader: "Auditing code for issues…",
  },
  arch_diagram: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="3" width="6" height="4" rx="1"/><rect x="9" y="17" width="6" height="4" rx="1"/><path d="M6 7v4M18 7v4M6 11h12M12 11v6"/></svg>`,
    label: "ARCH DIAGRAM",
    loader: "Generating Mermaid diagram…",
  },
  snap_learn: {
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    label: "SNAP & LEARN",
    loader: "Gemini Vision reading screen…",
  },
};

const WORKSPACE_MODES = [
  "desi_analogy",
  "neural_link",
  "eli5",
  "roast_code",
  "arch_diagram",
];

function _modeTitle(mode) {
  const map = {
    desi_analogy: "Desi Mode",
    neural_link: "Neural Link",
    eli5: "ELI5",
    roast_code: "Roast Code",
    arch_diagram: "Arch Diagram",
    save: "Save to Brain",
    magic_translate: "Translate",
  };
  return map[mode] || "Workspace";
}

async function init() {
  const data = await chrome.storage.local.get([
    "token",
    "workspaceId",
    "targetLanguage",
    "lastSelection",
    "pendingMode",
    "snapLearnImage",
    "youtubeContext",
  ]);

  if (!data.token) {
    _showGate();
    return;
  }
  token = data.token;
  _showApp();

  wsVal = data.workspaceId || "General";
  langVal = data.targetLanguage || "English";
  _syncSelectors();

  if (data.lastSelection) _updateCtx(data.lastSelection);

  if (data.youtubeContext) {
    const ytBadge = $("yt-badge");
    const ytTxt = $("yt-badge-text");
    if (ytBadge) ytBadge.classList.remove("hidden");
    if (ytTxt)
      ytTxt.textContent = `${data.youtubeContext.title} @ ${data.youtubeContext.timestampFormatted}`;
  }

  if (data.snapLearnImage && data.pendingMode === "snap_learn") {
    await chrome.storage.local.remove(["snapLearnImage", "pendingMode"]);
    navigateTo("snap", "Snap & Learn");
    handleSnap(data.snapLearnImage);
    return;
  }

  if (data.pendingMode && data.lastSelection) {
    const mode = data.pendingMode;
    await chrome.storage.local.remove("pendingMode");
    if (WORKSPACE_MODES.includes(mode)) {
      navigateTo("workspace", _modeTitle(mode));
      await _sleep(200);
      triggerMode(mode);
    }
    return;
  }

  let pollTicks = 0;
  snapPoller = setInterval(async () => {
    pollTicks++;
    if (pollTicks > 16) {
      clearInterval(snapPoller);
      snapPoller = null;
      return;
    }
    try {
      const { snapLearnImage } =
        await chrome.storage.local.get("snapLearnImage");
      if (snapLearnImage) {
        clearInterval(snapPoller);
        snapPoller = null;
        await chrome.storage.local.remove(["snapLearnImage", "pendingMode"]);
        navigateTo("snap", "Snap & Learn");
        handleSnap(snapLearnImage);
      }
    } catch {
      clearInterval(snapPoller);
      snapPoller = null;
    }
  }, 500);
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.lastSelection?.newValue)
    _updateCtx(changes.lastSelection.newValue);
  if (changes.token) {
    token = changes.token.newValue;
    token ? _showApp() : _showGate();
  }
  if (changes.youtubeContext?.newValue) {
    const yt = changes.youtubeContext.newValue;
    const ytBadge = $("yt-badge");
    const ytTxt = $("yt-badge-text");
    if (ytBadge) ytBadge.classList.remove("hidden");
    if (ytTxt) ytTxt.textContent = `${yt.title} @ ${yt.timestampFormatted}`;
  }
  if (changes.pendingMode?.newValue) {
    const mode = changes.pendingMode.newValue;
    await chrome.storage.local.remove("pendingMode");
    if (mode === "snap_learn") {
      if (snapPoller) {
        clearInterval(snapPoller);
        snapPoller = null;
      }
      const { snapLearnImage } =
        await chrome.storage.local.get("snapLearnImage");
      if (snapLearnImage) {
        await chrome.storage.local.remove("snapLearnImage");
        navigateTo("snap", "Snap & Learn");
        handleSnap(snapLearnImage);
      }
      return;
    }
    if (currentText && WORKSPACE_MODES.includes(mode)) {
      navigateTo("workspace", _modeTitle(mode));
      await _sleep(100);
      triggerMode(mode);
    }
  }
});

function _showGate() {
  $("sp-gate")?.classList.remove("hidden");
  $("sp-app")?.classList.add("hidden");
}

function _showApp() {
  $("sp-gate")?.classList.add("hidden");
  const app = $("sp-app");
  if (app) {
    app.classList.remove("hidden");
    app.style.display = "flex";
  }
}

$("gate-login-btn")?.addEventListener("click", () =>
  chrome.runtime.openOptionsPage?.(),
);

function _syncSelectors() {
  [
    ["lang-select", langVal],
    ["ws-input", wsVal],
    ["ws-lang-select", langVal],
    ["ws-ws-input", wsVal],
  ].forEach(([id, val]) => {
    const el = $(id);
    if (el) el.value = val;
  });
}

function _updateCtx(text) {
  currentText = text;
  const code = isCode(text);
  const err = isError(text);

  [$("ctx-code-tag"), $("ws-code-tag")].forEach(
    (el) => el && (el.style.display = code ? "inline-flex" : "none"),
  );
  const ctxErrTag = $("ctx-err-tag");
  if (ctxErrTag) ctxErrTag.style.display = err ? "inline-flex" : "none";

  const preview = $("ctx-pill-txt");
  if (preview)
    preview.textContent = text.length > 60 ? text.substring(0, 60) + "…" : text;

  const selPrev = $("sel-preview");
  if (selPrev)
    selPrev.innerHTML = `<em>"${_esc(text.length > 200 ? text.substring(0, 200) + "…" : text)}"</em>`;

  const wsCtxChars = $("ws-ctx-chars");
  if (wsCtxChars) wsCtxChars.textContent = `${text.length}c`;

  _wsResetUI();

  if (err) {
    const dbgInput = $("dbg-input");
    if (dbgInput && !dbgInput.value) dbgInput.value = text;
    const badge = $("dbg-auto-badge");
    if (badge) badge.classList.remove("hidden");
  }
}

let progressTimer = null;
function _progressStart() {
  clearTimeout(progressTimer);
  if (spProgress) {
    spProgress.classList.remove("done");
    spProgress.classList.add("active");
  }
}
function _progressDone() {
  if (spProgress) {
    spProgress.classList.remove("active");
    spProgress.classList.add("done");
    progressTimer = setTimeout(() => spProgress?.classList.remove("done"), 900);
  }
}

async function triggerMode(mode) {
  if (!token) {
    _showGate();
    return;
  }
  if (mode === "save") {
    await handleSave();
    return;
  }
  if (mode === "magic_translate") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            type: "TRANSLATE_SELECTION",
            text: currentText,
          })
          .catch((err) => console.error("Sidepanel translation error:", err));
      }
    });
    return;
  }
  const src = currentText;
  if (!src) {
    _wsShowErr("Highlight text on the page first.");
    return;
  }
  if (streaming) {
    abortCtrl?.abort();
    streaming = false;
  }

  const meta = MODES[mode] || {
    icon: "",
    label: "BRAIN EXTENSION",
    loader: "Thinking…",
  };
  _wsResetUI();
  _wsShowLoader(meta.loader);
  rawText = "";

  try {
    abortCtrl = new AbortController();
    streaming = true;
    const res = await fetch(`${API_BASE}/brain/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: src,
        mode,
        workspaceId: wsVal,
        targetLanguage: langVal,
      }),
      signal: abortCtrl.signal,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `Server ${res.status}`);
    }
    _wsHideLoader();
    _wsShowRespHdr(meta.icon, meta.label);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.chunk) {
            rawText += ev.chunk;
            _wsRenderStream(rawText, mode);
          }
          if (ev.memories) _renderNeuralLinks(ev.memories);
          if (ev.error) throw new Error(ev.error);
          if (ev.done) break;
        } catch (pe) {
          if (pe.message !== "Unexpected end of JSON input") throw pe;
        }
      }
    }
    const respBody = $("resp-body");
    if (respBody) {
      const cur = respBody.querySelector(".cursor");
      if (cur) cur.remove();
    }
    if (mode === "arch_diagram" && rawText) await _renderMermaid();
  } catch (err) {
    _wsHideLoader();
    if (err.name !== "AbortError") _wsShowErr(err.message || "Request failed.");
  } finally {
    streaming = false;
    abortCtrl = null;
  }
}

async function handleSnap(dataUrl) {
  if (!token) {
    _showGate();
    return;
  }
  const snapImg = $("snap-img");
  const snapLoader = $("snap-loader");
  if (snapImg) {
    snapImg.src = dataUrl;
    snapImg.classList.remove("hidden");
  }
  if (snapLoader) snapLoader.classList.remove("hidden");
  _progressStart();
  try {
    const res = await fetch(`${API_BASE}/brain/vision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: dataUrl, workspaceId: wsVal }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Vision API error");
    _progressDone();
    if (snapLoader) snapLoader.classList.add("hidden");
    const snapRespCard = $("snap-resp-card");
    const snapRespBody = $("snap-resp-body");
    if (snapRespCard) snapRespCard.classList.remove("hidden");
    rawText = data.explanation;
    if (snapRespBody) snapRespBody.innerHTML = _formatText(rawText);
  } catch (err) {
    _progressDone();
    if (snapLoader) snapLoader.classList.add("hidden");
    const snapErr = $("snap-err-card");
    const snapErrMsg = $("snap-err-msg");
    if (snapErr) snapErr.classList.remove("hidden");
    if (snapErrMsg) snapErrMsg.textContent = err.message;
  }
}

async function _renderMermaid() {
  const respBody = $("resp-body");
  if (!window.mermaid || !respBody) return;
  const blockRe =
    /```(?:mermaid)?\s*\n?((?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart)[\s\S]*?)```/gi;
  const matches = [...rawText.matchAll(blockRe)];
  if (!matches.length) return;
  for (const match of matches) {
    const mermaidCode = match[1].trim();
    if (!mermaidCode) continue;
    const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let svg = "";
    try {
      const result = await mermaid.render(id, _sanitizeMermaid(mermaidCode));
      svg = result.svg;
    } catch (mErr) {
      const errDiv = document.createElement("div");
      errDiv.className = "mermaid-err";
      errDiv.textContent = `Diagram error: ${mErr.message}`;
      const preBlocks = [...respBody.querySelectorAll("pre")];
      const target = preBlocks.find((p) =>
        p.textContent.trim().startsWith(mermaidCode.substring(0, 40).trim()),
      );
      if (target) target.replaceWith(errDiv);
      continue;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-wrapper";
    wrapper.innerHTML = `<div class="mermaid-label"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="3" width="6" height="4" rx="1"/><rect x="9" y="17" width="6" height="4" rx="1"/><path d="M6 7v4M18 7v4M6 11h12M12 11v6"/></svg> Architecture Diagram</div>${svg}`;
    const preBlocks = [...respBody.querySelectorAll("pre")];
    const target = preBlocks.find(
      (p) =>
        p.textContent.trim().startsWith(mermaidCode.split("\n")[0].trim()) ||
        p.textContent.includes(mermaidCode.substring(0, 50).trim()),
    );
    if (target) target.replaceWith(wrapper);
    else respBody.appendChild(wrapper);
  }
}

async function handleSave(textOverride) {
  if (!token) {
    _showGate();
    return;
  }
  const text = textOverride || currentText;
  if (!text) {
    _wsShowErr("No text selected.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, type: "answer", workspaceId: wsVal }),
    });
    const data = await res.json();
    if (!res.ok || data.status === "ERROR")
      throw new Error(data.message || "Save failed");
    chrome.storage.local.set({ workspaceId: wsVal });
    chrome.runtime.sendMessage({ type: "MEMORY_SAVED" });
    [$("save-ok-home"), $("save-ok")].forEach((el) => {
      if (el) {
        el.classList.remove("hidden");
        setTimeout(() => el.classList.add("hidden"), 3000);
      }
    });
  } catch (err) {
    _wsShowErr(err.message);
  }
}

function _wsRenderStream(text, mode) {
  const respCard = $("resp-card");
  const respBody = $("resp-body");
  if (!respCard || !respBody) return;
  respCard.classList.remove("hidden");
  let html = _formatText(text);
  if (mode === "roast_code") {
    html = html.replace(
      /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g,
      (_, code) => {
        const uid = `cp-${Math.random().toString(36).slice(2, 8)}`;
        return `<pre id="${uid}"><button class="cp-btn" onclick="window.__cpCode('${uid}')">Copy</button><code>${code}</code></pre>`;
      },
    );
  }
  respBody.innerHTML = html + '<span class="cursor"></span>';
  respBody.scrollTop = respBody.scrollHeight;
}

function _wsShowRespHdr(icon, label) {
  const respCard = $("resp-card");
  if (respCard) respCard.classList.remove("hidden");
  const respIcon = $("resp-icon");
  if (respIcon) respIcon.innerHTML = icon;
  const respLabel = $("resp-label");
  if (respLabel) respLabel.textContent = label;
  const respBody = $("resp-body");
  if (respBody) respBody.innerHTML = '<span class="cursor"></span>';
}

function _renderNeuralLinks(mems) {
  const nlSec = $("nl-sec");
  const nlCards = $("nl-cards");
  const nlCount = $("nl-count");
  if (!mems?.length || !nlSec || !nlCards || !nlCount) return;
  nlSec.classList.remove("hidden");
  nlCount.textContent = mems.length;
  nlCards.innerHTML = "";
  mems.forEach((m, i) => {
    const score = m.score ? Math.round(m.score * 100) : null;
    const date = m.createdAt
      ? new Date(m.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        })
      : "";
    const div = document.createElement("div");
    div.className = "mem-card";
    div.style.animationDelay = `${i * 0.05}s`;
    div.innerHTML = `<div class="mem-top"><div class="mem-txt">${_esc((m.content || "").substring(0, 130))}…</div>${score ? `<span class="mem-sc">${score}%</span>` : ""}</div><div class="mem-meta">${_esc(m.workspaceId || "General")} · ${date}</div>`;
    nlCards.appendChild(div);
  });
}

function _formatText(text) {
  return text
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code class="lang-${lang || "text"}">${_esc(code.trim())}</code></pre>`,
    )
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,3} (.+)$/gm, "<h3>$1</h3>")
    .replace(/^[-•*] (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function _wsShowLoader(msg) {
  const l = $("ws-loader");
  const lm = $("ws-loader-msg");
  if (l) l.classList.remove("hidden");
  if (lm) lm.textContent = msg;
}
function _wsHideLoader() {
  $("ws-loader")?.classList.add("hidden");
}
function _wsShowErr(msg) {
  _wsHideLoader();
  const ec = $("ws-err-card");
  const em = $("ws-err-msg");
  if (ec) ec.classList.remove("hidden");
  if (em) em.textContent = msg;
}
function _wsResetUI() {
  ["ws-loader", "resp-card", "save-ok", "ws-err-card", "nl-sec"].forEach((id) =>
    $(id)?.classList.add("hidden"),
  );
  rawText = "";
}

window.__cpCode = async (preId) => {
  const pre = document.getElementById(preId);
  const code = pre?.querySelector("code")?.textContent;
  if (!code) return;
  await navigator.clipboard.writeText(code);
  const btn = pre?.querySelector(".cp-btn");
  if (btn) {
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 2000);
  }
};

$("copy-btn")?.addEventListener("click", async () => {
  if (!rawText) return;
  await navigator.clipboard.writeText(rawText);
  const btn = $("copy-btn");
  if (btn) {
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = "Copy"), 2000);
  }
});
$("save-resp-btn")?.addEventListener("click", () => {
  if (rawText) handleSave(rawText);
});
$("nl-toggle")?.addEventListener("click", () => {
  linksOpen = !linksOpen;
  const nlCards = $("nl-cards");
  const nlChev = $("nl-chev");
  if (nlCards) nlCards.style.display = linksOpen ? "" : "none";
  if (nlChev) nlChev.classList.toggle("open", linksOpen);
});

document.querySelectorAll(".tool-card[data-to]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    navigateTo("workspace", _modeTitle(mode));
    triggerMode(mode);
  });
});

$("save-btn-home")?.addEventListener("click", () => handleSave());
$("translate-btn-home")?.addEventListener("click", () => {
  if (currentText) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            type: "TRANSLATE_SELECTION",
            text: currentText,
          })
          .catch((err) => console.error("Sidepanel translation error:", err));
      }
    });
  }
});
$("go-autoagent")?.addEventListener("click", () =>
  navigateTo("agent", "Auto-Agent"),
);
$("go-debugger")?.addEventListener("click", () => {
  navigateTo("debugger", "Auto-Debugger");
  if (currentText && isError(currentText)) {
    const dbgInput = $("dbg-input");
    if (dbgInput && !dbgInput.value) dbgInput.value = currentText;
    $("dbg-auto-badge")?.classList.remove("hidden");
  }
});
$("go-snap-home")?.addEventListener("click", () =>
  navigateTo("snap", "Snap & Learn"),
);
$("snap-trigger")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SNAP_LEARN_REQUEST" });
  _progressStart();
  $("snap-loader")?.classList.remove("hidden");
});
$("snap-copy-btn")?.addEventListener("click", async () => {
  if (rawText) await navigator.clipboard.writeText(rawText);
});
$("snap-save-btn")?.addEventListener("click", () => {
  if (rawText) handleSave(rawText);
});

$("lang-select")?.addEventListener("input", (e) => {
  langVal = e.target.value;
  chrome.storage.local.set({ targetLanguage: langVal });
});
$("ws-input")?.addEventListener("input", (e) => {
  wsVal = e.target.value || "General";
  chrome.storage.local.set({ workspaceId: wsVal });
});
$("ws-lang-select")?.addEventListener("input", (e) => {
  langVal = e.target.value;
  chrome.storage.local.set({ targetLanguage: langVal });
});
$("ws-ws-input")?.addEventListener("input", (e) => {
  wsVal = e.target.value || "General";
  chrome.storage.local.set({ workspaceId: wsVal });
});

$("dbg-analyze-btn")?.addEventListener("click", async () => {
  const errText = $("dbg-input")?.value.trim();
  const codeCtx = $("dbg-code-input")?.value.trim();
  if (!errText || !token) return;
  const btn = $("dbg-analyze-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Analyzing…";
  }
  $("dbg-loader")?.classList.remove("hidden");
  $("dbg-results")?.classList.add("hidden");
  $("dbg-err-card")?.classList.add("hidden");
  const lm = $("dbg-loader-msg");
  if (lm) lm.textContent = "Querying StackOverflow API…";
  try {
    const res = await fetch(`${API_BASE}/agent/debug`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ error: errText, code: codeCtx }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Debug agent failed");
    $("dbg-loader")?.classList.add("hidden");
    $("dbg-results")?.classList.remove("hidden");
    const errTypeTxt = $("dbg-err-type-txt");
    if (errTypeTxt) errTypeTxt.textContent = data.errorType || "Error";
    const sourcesPanel = $("dbg-sources-panel");
    if (sourcesPanel && data.sources?.length) {
      sourcesPanel.innerHTML = data.sources
        .map(
          (s, i) =>
            `<div class="so-card" style="animation-delay:${i * 0.06}s"><div class="so-card-hdr"><span class="so-votes">${s.score || 0} pts</span><a class="so-title" href="${_esc(s.link || "#")}" target="_blank">${_esc(s.title || "Answer")}</a></div><div class="so-answer">${_esc((s.body || "").substring(0, 200))}…</div>${s.tags?.length ? `<div class="so-tags">${s.tags.map((t) => `<span class="so-tag">${_esc(t)}</span>`).join("")}</div>` : ""}</div>`,
        )
        .join("");
    }
    const fixBody = $("dbg-fix-body");
    if (fixBody)
      fixBody.innerHTML = _formatText(data.fix || "No fix generated");
    document.querySelectorAll(".dbg-tab").forEach((t) => {
      t.addEventListener("click", () => {
        document
          .querySelectorAll(".dbg-tab")
          .forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        $("dbg-sources-panel")?.classList.toggle(
          "hidden",
          t.dataset.tab !== "sources",
        );
        $("dbg-fix-panel")?.classList.toggle("hidden", t.dataset.tab !== "fix");
      });
    });
  } catch (err) {
    $("dbg-loader")?.classList.add("hidden");
    $("dbg-err-card")?.classList.remove("hidden");
    const em = $("dbg-err-msg");
    if (em) em.textContent = err.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Analyze & Find Fix →";
    }
  }
});

$("dbg-copy-fix")?.addEventListener("click", async () => {
  const fixBody = $("dbg-fix-body");
  if (fixBody) {
    await navigator.clipboard.writeText(fixBody.textContent);
    const btn = $("dbg-copy-fix");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy Fix"), 2000);
    }
  }
});

function _esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

init();
