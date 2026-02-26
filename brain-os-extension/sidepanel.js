const API_BASE = "https://brain-extension-exng.onrender.com";
const $ = (id) => document.getElementById(id);

const spGate = $("sp-gate");
const spApp = $("sp-app");
const spProgress = $("sp-progress");
const selPreview = $("sel-preview");
const ctxCard = $("ctx-card");
const ctxChars = $("ctx-chars");
const codeTag = $("code-tag");
const wsInput = $("ws-input");
const hdrWsVal = $("hdr-ws-val");
const langSelect = $("lang-select");
const snapBtn = $("snap-btn");
const snapPreview = $("snap-preview");
const snapImg = $("snap-img");
const spLoader = $("sp-loader");
const loaderMsg = $("loader-msg");
const respCard = $("resp-card");
const respBody = $("resp-body");
const respIcon = $("resp-icon");
const respLabel = $("resp-label");
const copyBtn = $("copy-btn");
const saveRespBtn = $("save-resp-btn");
const saveOk = $("save-ok");
const errCard = $("err-card");
const errMsg = $("err-msg");
const nlSec = $("nl-sec");
const nlCount = $("nl-count");
const nlToggle = $("nl-toggle");
const nlChev = $("nl-chev");
const nlCards = $("nl-cards");
const ytBadge = $("yt-badge");
const ytBadgeText = $("yt-badge-text");

let token = null;
let currentText = "";
let rawText = "";
let linksOpen = true;
let streaming = false;
let abortCtrl = null;
let snapPoller = null;

const CODE_PATS = [
  /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
  /[{};]\s*$/m,
  /\([^)]*\)\s*(=>|\{)/,
];
const isCode = (t) =>
  t?.length > 20 && CODE_PATS.filter((p) => p.test(t)).length >= 2;

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
      titleColor: "#a3a3a3",
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

  if (data.workspaceId && wsInput) {
    wsInput.value = data.workspaceId;
    if (hdrWsVal) hdrWsVal.textContent = data.workspaceId; // Sync header
  }
  if (data.targetLanguage && langSelect) langSelect.value = data.targetLanguage;
  if (data.lastSelection) _updateCtx(data.lastSelection);

  if (data.youtubeContext && ytBadge && ytBadgeText) {
    ytBadge.classList.remove("hidden");
    ytBadgeText.textContent = `${data.youtubeContext.title} @ ${data.youtubeContext.timestampFormatted}`;
  }

  if (data.snapLearnImage && data.pendingMode === "snap_learn") {
    await chrome.storage.local.remove(["snapLearnImage", "pendingMode"]);
    handleSnap(data.snapLearnImage);
    return;
  }
  if (data.pendingMode && data.lastSelection) {
    const mode = data.pendingMode;
    await chrome.storage.local.remove("pendingMode");
    await _sleep(200);
    triggerMode(mode);
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
  if (changes.youtubeContext?.newValue && ytBadge && ytBadgeText) {
    const yt = changes.youtubeContext.newValue;
    ytBadge.classList.remove("hidden");
    ytBadgeText.textContent = `${yt.title} @ ${yt.timestampFormatted}`;
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
        handleSnap(snapLearnImage);
      }
      return;
    }
    if (currentText) {
      await _sleep(100);
      triggerMode(mode);
    }
  }
});

function _showGate() {
  if (spGate) spGate.classList.remove("hidden");
  if (spApp) spApp.classList.add("hidden");
}

function _showApp() {
  if (spGate) spGate.classList.add("hidden");
  if (spApp) {
    spApp.classList.remove("hidden");
    spApp.style.display = "flex";
  }
}

$("gate-login-btn")?.addEventListener("click", () =>
  chrome.runtime.openOptionsPage?.(),
);

function _updateCtx(text) {
  currentText = text;
  const code = isCode(text);
  if (codeTag) codeTag.style.display = code ? "inline-flex" : "none";
  if (ctxCard) ctxCard.classList.toggle("has-text", !!text);
  const t = text.length > 220 ? text.substring(0, 220) + "…" : text;
  if (selPreview) selPreview.innerHTML = `<em>"${_esc(t)}"</em>`;
  if (ctxChars) ctxChars.textContent = `${text.length}c`;
  _resetUI();
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
    progressTimer = setTimeout(() => {
      if (spProgress) spProgress.classList.remove("done");
    }, 900);
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
  const src = currentText;
  if (!src && mode !== "snap_learn") {
    _showErr("Highlight text on the page first.");
    return;
  }
  if (streaming) {
    abortCtrl?.abort();
    streaming = false;
  }

  const meta = MODES[mode] || {
    icon: "",
    label: "BRAIN OS",
    loader: "Thinking…",
  };
  _markActive(mode);
  _resetUI();
  _showLoader(meta.loader);

  const ws = wsInput?.value.trim() || "General";
  const lang = langSelect?.value || "English";
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
        workspaceId: ws,
        targetLanguage: lang,
      }),
      signal: abortCtrl.signal,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `Server ${res.status}`);
    }
    _hideLoader();
    _showRespHdr(meta.icon, meta.label);

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
            _renderStream(rawText, mode);
          }
          if (ev.memories) _renderNeuralLinks(ev.memories);
          if (ev.error) throw new Error(ev.error);
          if (ev.done) break;
        } catch (pe) {
          if (pe.message !== "Unexpected end of JSON input") throw pe;
        }
      }
    }
    if (respBody) {
      const cur = respBody.querySelector(".cursor");
      if (cur) cur.remove();
    }
    if (mode === "arch_diagram" && rawText) await _renderMermaid();
  } catch (err) {
    _hideLoader();
    if (err.name !== "AbortError") _showErr(err.message || "Request failed.");
  } finally {
    streaming = false;
    abortCtrl = null;
    _markActive(null);
  }
}

async function handleSnap(dataUrl) {
  if (!token) {
    _showGate();
    return;
  }
  if (snapImg) snapImg.src = dataUrl;
  if (snapPreview) snapPreview.classList.remove("hidden");
  _markActive("snap_learn");
  _resetUI();
  _progressStart();
  try {
    const ws = wsInput?.value || "General";
    const res = await fetch(`${API_BASE}/brain/vision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: dataUrl, workspaceId: ws }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Vision API error");
    _progressDone();
    const meta = MODES.snap_learn;
    _showRespHdr(meta.icon, meta.label);
    rawText = data.explanation;
    _renderStream(rawText, "snap_learn");
    if (respBody) {
      const cur = respBody.querySelector(".cursor");
      if (cur) cur.remove();
    }
  } catch (err) {
    _progressDone();
    _showErr(err.message);
  } finally {
    _markActive(null);
  }
}

async function _renderMermaid() {
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
      const sanitizedCode = _sanitizeMermaid(mermaidCode);
      const result = await mermaid.render(id, sanitizedCode);
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
    const firstLine = mermaidCode.split("\n")[0].trim();
    const target = preBlocks.find((p) => {
      const txt = p.textContent.trim();
      return (
        txt.startsWith(firstLine) ||
        txt.includes(mermaidCode.substring(0, 50).trim())
      );
    });
    if (target) {
      target.replaceWith(wrapper);
    } else {
      respBody.appendChild(wrapper);
    }
  }
}

async function handleSave(textOverride) {
  if (!token) {
    _showGate();
    return;
  }
  const text = textOverride || currentText;
  if (!text) {
    _showErr("No text selected.");
    return;
  }
  if ($("save-btn")) $("save-btn").classList.add("running");
  const ws = wsInput?.value.trim() || "General";
  try {
    const res = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, type: "answer", workspaceId: ws }),
    });
    const data = await res.json();
    if (!res.ok || data.status === "ERROR")
      throw new Error(data.message || "Save failed");
    chrome.storage.local.set({ workspaceId: ws });
    chrome.runtime.sendMessage({ type: "MEMORY_SAVED" });
    if (saveOk) {
      saveOk.classList.remove("hidden");
      setTimeout(() => saveOk.classList.add("hidden"), 3000);
    }
  } catch (err) {
    _showErr(err.message);
  } finally {
    if ($("save-btn")) $("save-btn").classList.remove("running");
  }
}

function _renderStream(text, mode) {
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

function _showRespHdr(icon, label) {
  if (respCard) respCard.classList.remove("hidden");
  if (respIcon) respIcon.innerHTML = icon;
  if (respLabel) respLabel.textContent = label;
  if (respBody) respBody.innerHTML = '<span class="cursor"></span>';
}

function _renderNeuralLinks(mems) {
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

function _showLoader(msg) {
  if (spLoader) spLoader.classList.remove("hidden");
  if (loaderMsg) loaderMsg.textContent = msg;
}
function _hideLoader() {
  if (spLoader) spLoader.classList.add("hidden");
}
function _showErr(msg) {
  _hideLoader();
  if (errCard) errCard.classList.remove("hidden");
  if (errMsg) errMsg.textContent = msg;
}
function _resetUI() {
  if (spLoader) spLoader.classList.add("hidden");
  if (respCard) respCard.classList.add("hidden");
  if (saveOk) saveOk.classList.add("hidden");
  if (errCard) errCard.classList.add("hidden");
  if (nlSec) nlSec.classList.add("hidden");
  rawText = "";
}
function _markActive(mode) {
  document
    .querySelectorAll(".ab")
    .forEach((b) => b.classList.toggle("running", b.dataset?.mode === mode));
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

copyBtn?.addEventListener("click", async () => {
  if (!rawText) return;
  await navigator.clipboard.writeText(rawText);
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
});

saveRespBtn?.addEventListener("click", () => {
  if (rawText) handleSave(rawText);
});
nlToggle?.addEventListener("click", () => {
  linksOpen = !linksOpen;
  if (nlCards) nlCards.style.display = linksOpen ? "" : "none";
  if (nlChev) nlChev.classList.toggle("open", linksOpen);
});
document.querySelectorAll(".ab[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => triggerMode(btn.dataset.mode));
});
snapBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SNAP_LEARN_REQUEST" });
  _progressStart();
});
wsInput?.addEventListener("change", () => {
  chrome.storage.local.set({ workspaceId: wsInput.value });
  if (hdrWsVal) hdrWsVal.textContent = wsInput.value || "General";
});
langSelect?.addEventListener("change", () =>
  chrome.storage.local.set({ targetLanguage: langSelect.value }),
);

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
