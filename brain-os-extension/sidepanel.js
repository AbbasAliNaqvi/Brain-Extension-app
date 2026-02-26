const API_BASE = "https://brain-extension-exng.onrender.com";
const $ = (id) => document.getElementById(id);

const spGate = $("sp-gate");
const spApp = $("sp-app");
const selPreview = $("sel-preview");
const ctxCard = $("ctx-card");
const ctxChars = $("ctx-chars");
const codeTag = $("code-tag");
const wsInput = $("ws-input");
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
const neuralSec = $("neural-section");
const neuralCount = $("neural-count");
const neuralToggle = $("neural-toggle");
const neuralChevron = $("neural-chevron");
const memCards = $("mem-cards");
const streakVal = $("streak-val");
const healthVal = $("health-val");
const ytBadge = $("yt-badge");
const ytBadgeText = $("yt-badge-text");

let token = null;
let currentText = "";
let currentMode = "";
let rawText = "";
let linksOpen = true;
let streaming = false;
let abortCtrl = null;

const CODE_PATS = [
  /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
  /[{};]\s*$/m,
  /\([^)]*\)\s*(=>|{)/,
];
const isCode = (t) =>
  t?.length > 20 && CODE_PATS.filter((p) => p.test(t)).length >= 2;

const MODES = {
  desi_analogy: {
    icon: "🔮",
    label: "DESI ANALOGY",
    loader: "Mixing chai and algorithms…",
  },
  neural_link: {
    icon: "🧬",
    label: "NEURAL LINK",
    loader: "Scanning your Second Brain…",
  },
  eli5: {
    icon: "⚡",
    label: "ELI5",
    loader: "Simplifying to first principles…",
  },
  roast_code: {
    icon: "🐛",
    label: "ROAST CODE",
    loader: "Auditing code for issues…",
  },
  arch_diagram: {
    icon: "🏗️",
    label: "ARCH DIAGRAM",
    loader: "Generating Mermaid diagram…",
  },
  snap_learn: {
    icon: "📸",
    label: "SNAP & LEARN",
    loader: "Gemini Vision reading screen…",
  },
};

if (window.mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    themeVariables: {
      background: "#070707",
      primaryColor: "#10b981",
      primaryTextColor: "#e5e5e5",
      edgeLabelBackground: "#111",
      nodeTextColor: "#e5e5e5",
    },
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
    "streak",
    "youtubeContext",
  ]);

  streakVal.textContent = data.streak || 0;

  if (!data.token) {
    showGate();
    return;
  }

  token = data.token;
  showApp();

  if (data.workspaceId) wsInput.value = data.workspaceId;
  if (data.targetLanguage) langSelect.value = data.targetLanguage;

  if (data.lastSelection) updateContext(data.lastSelection);

  if (data.youtubeContext) {
    ytBadge.classList.remove("hidden");
    ytBadgeText.textContent = `▶ ${data.youtubeContext.title} @ ${data.youtubeContext.timestampFormatted}`;
  }

  loadHealth();

  if (data.snapLearnImage && data.pendingMode === "snap_learn") {
    await chrome.storage.local.remove(["snapLearnImage", "pendingMode"]);
    handleSnap(data.snapLearnImage);
    return;
  }

  if (data.pendingMode && data.lastSelection) {
    const mode = data.pendingMode;
    await chrome.storage.local.remove("pendingMode");
    await sleep(250);
    triggerMode(mode);
  }
}

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.lastSelection?.newValue) {
    updateContext(changes.lastSelection.newValue);
  }
  if (changes.token) {
    token = changes.token.newValue;
    token ? showApp() : showGate();
  }
  if (changes.pendingMode?.newValue) {
    const mode = changes.pendingMode.newValue;
    await chrome.storage.local.remove("pendingMode");

    if (mode === "snap_learn") {
      const { snapLearnImage } =
        await chrome.storage.local.get("snapLearnImage");
      await chrome.storage.local.remove("snapLearnImage");
      if (snapLearnImage) {
        handleSnap(snapLearnImage);
        return;
      }
    }

    if (currentText || mode === "snap_learn") {
      await sleep(100);
      triggerMode(mode);
    }
  }
  if (changes.streak?.newValue !== undefined) {
    streakVal.textContent = changes.streak.newValue;
  }
  if (changes.youtubeContext?.newValue) {
    const yt = changes.youtubeContext.newValue;
    ytBadge.classList.remove("hidden");
    ytBadgeText.textContent = `▶ ${yt.title} @ ${yt.timestampFormatted}`;
  }
});

function showGate() {
  spGate.classList.remove("hidden");
  spApp.classList.add("hidden");
}
function showApp() {
  spGate.classList.add("hidden");
  spApp.classList.remove("hidden");
  spApp.style.display = "flex";
}

$("sp-gate")
  ?.querySelector(".gate-btn")
  ?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() || chrome.action.openPopup?.();
  });

function updateContext(text) {
  currentText = text;
  const code = isCode(text);
  codeTag.style.display = code ? "inline-flex" : "none";
  ctxCard.classList.toggle("active", !!text);
  const t = text.length > 220 ? text.substring(0, 220) + "…" : text;
  selPreview.innerHTML = `<em>"${esc(t)}"</em>`;
  ctxChars.textContent = `${text.length}c`;
  resetUI();
}

async function triggerMode(mode) {
  if (!token) {
    showGate();
    return;
  }

  if (mode === "save") {
    await handleSave();
    return;
  }

  const src = currentText;
  if (!src && mode !== "snap_learn") {
    showErr("Highlight text on the page first.");
    return;
  }

  if (streaming) {
    abortCtrl?.abort();
    streaming = false;
  }

  currentMode = mode;
  const meta = MODES[mode] || {
    icon: "⬡",
    label: "BRAIN OS",
    loader: "Thinking…",
  };

  markButtonActive(mode);
  resetUI();
  showLoader(meta.loader);

  const ws = wsInput.value.trim() || "General";
  const lang = langSelect.value || "English";

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

    hideLoader();
    showRespHeader(meta.icon, meta.label);

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
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.chunk) {
            rawText += ev.chunk;
            renderStream(rawText, mode);
          }
          if (ev.memories) renderNeuralLinks(ev.memories);
          if (ev.error) throw new Error(ev.error);
          if (ev.done) break;
        } catch (parseErr) {
          if (parseErr.message !== "Unexpected end of JSON input")
            throw parseErr;
        }
      }
    }

    respBody.querySelector(".cursor")?.remove();

    if (mode === "arch_diagram") {
      await renderMermaid();
    }
  } catch (err) {
    hideLoader();
    if (err.name !== "AbortError")
      showErr(
        err.message ||
          "AI request failed. Backend may be sleeping (30s cold start).",
      );
  } finally {
    streaming = false;
    abortCtrl = null;
    markButtonActive(null);
  }
}

async function handleSnap(dataUrl) {
  if (!token) {
    showGate();
    return;
  }

  // Show preview
  snapImg.src = dataUrl;
  snapPreview.classList.remove("hidden");

  currentMode = "snap_learn";
  markButtonActive("snap_learn");
  resetUI();
  showLoader(MODES.snap_learn.loader);

  try {
    const res = await fetch(`${API_BASE}/brain/vision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: dataUrl,
        workspaceId: wsInput.value || "General",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Vision API error");

    hideLoader();
    showRespHeader("📸", "SNAP & LEARN");
    rawText = data.explanation;
    renderStream(rawText, "snap_learn");
    respBody.querySelector(".cursor")?.remove();
  } catch (err) {
    hideLoader();
    showErr(err.message);
  } finally {
    markButtonActive(null);
  }
}

async function handleSave(textOverride) {
  if (!token) {
    showGate();
    return;
  }
  const text = textOverride || currentText;
  if (!text) {
    showErr("No text selected to save.");
    return;
  }

  const saveBtn = document.querySelector('[data-mode="save"]');
  if (saveBtn) {
    saveBtn.classList.add("running");
  }

  const ws = wsInput.value.trim() || "General";

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

    saveOk.classList.remove("hidden");
    setTimeout(() => saveOk.classList.add("hidden"), 3000);
  } catch (err) {
    showErr(err.message);
  } finally {
    saveBtn?.classList.remove("running");
  }
}

async function renderMermaid() {
  if (!window.mermaid) return;

  const mermaidMatch = rawText.match(
    /```(?:mermaid)?\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|pie|erDiagram|gitGraph|journey|quadrantChart)[\s\S]*?```/gi,
  );

  if (!mermaidMatch) return;

  for (const block of mermaidMatch) {
    const code = block
      .replace(/^```(?:mermaid)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      const id = `mermaid-${Date.now()}`;
      const div = document.createElement("div");
      div.className = "mermaid-wrapper";

      const { svg } = await mermaid.render(id, code);
      div.innerHTML = svg;

      // Inject after the pre block containing the mermaid code
      const preBlocks = respBody.querySelectorAll("pre");
      const target = [...preBlocks].find((p) =>
        p.textContent.includes(code.substring(0, 30)),
      );
      if (target) target.after(div);
      else respBody.appendChild(div);
    } catch (mermaidErr) {
      console.warn("[Brain OS] Mermaid render failed:", mermaidErr.message);
    }
  }
}
async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/brain/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.healthScore !== undefined)
      healthVal.textContent = `${data.healthScore}%`;
    if (data.streak !== undefined) {
      streakVal.textContent = data.streak;
      chrome.storage.local.set({ streak: data.streak });
    }
  } catch {
    /* non-critical */
  }
}

function renderStream(text, mode) {
  respCard.classList.remove("hidden");
  let html = formatText(text);

  if (mode === "roast_code") {
    html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
      const id = `code-${Math.random().toString(36).slice(2)}`;
      return `<pre id="${id}"><button class="copy-code-btn" onclick="copyCodeBlock('${id}')">Copy</button><code>${code}</code></pre>`;
    });
  }

  respBody.innerHTML = html + '<span class="cursor"></span>';
  respBody.scrollTop = respBody.scrollHeight;
}

function showRespHeader(icon, label) {
  respCard.classList.remove("hidden");
  respIcon.textContent = icon;
  respLabel.textContent = label;
  respBody.innerHTML = '<span class="cursor"></span>';
}

function renderNeuralLinks(mems) {
  if (!mems?.length) return;
  neuralSec.classList.remove("hidden");
  neuralCount.textContent = mems.length;
  memCards.innerHTML = "";
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
    div.innerHTML = `
      <div class="mem-top">
        <div class="mem-text">${esc((m.content || "").substring(0, 130))}${(m.content?.length || 0) > 130 ? "…" : ""}</div>
        ${score ? `<span class="mem-score">${score}%</span>` : ""}
      </div>
      <div class="mem-meta">${esc(m.workspaceId || "General")} ${date ? "· " + date : ""}</div>
    `;
    memCards.appendChild(div);
  });
}

function formatText(text) {
  return text
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code class="lang-${lang || "text"}">${esc(code.trim())}</code></pre>`,
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>")
    .replace(
      /^[-•] (.+)$/gm,
      '<span style="display:block;padding-left:14px;margin:2px 0">• $1</span>',
    )
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function showLoader(msg) {
  spLoader.classList.remove("hidden");
  loaderMsg.textContent = msg;
}
function hideLoader() {
  spLoader.classList.add("hidden");
}

function showErr(msg) {
  hideLoader();
  errCard.classList.remove("hidden");
  errMsg.textContent = msg;
}

function resetUI() {
  spLoader.classList.add("hidden");
  respCard.classList.add("hidden");
  saveOk.classList.add("hidden");
  errCard.classList.add("hidden");
  neuralSec.classList.add("hidden");
  rawText = "";
}

function markButtonActive(mode) {
  document
    .querySelectorAll(".ab")
    .forEach((b) => b.classList.toggle("running", b.dataset.mode === mode));
}

copyBtn.addEventListener("click", async () => {
  if (!rawText) return;
  await navigator.clipboard.writeText(rawText).catch(() => {});
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
});

saveRespBtn.addEventListener("click", () => {
  if (rawText) handleSave(rawText);
});

window.copyCodeBlock = async (preId) => {
  const pre = document.getElementById(preId);
  const code = pre?.querySelector("code")?.textContent;
  if (!code) return;
  await navigator.clipboard.writeText(code).catch(() => {});
  const btn = pre?.querySelector(".copy-code-btn");
  if (btn) {
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 2000);
  }
};

neuralToggle.addEventListener("click", () => {
  linksOpen = !linksOpen;
  memCards.style.display = linksOpen ? "" : "none";
  neuralChevron.classList.toggle("open", linksOpen);
});

document.querySelectorAll(".ab[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => triggerMode(btn.dataset.mode));
});

snapBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SNAP_LEARN_REQUEST" });
  showLoader("Capturing screen…");
});

wsInput.addEventListener("change", () =>
  chrome.storage.local.set({ workspaceId: wsInput.value }),
);

langSelect.addEventListener("change", () =>
  chrome.storage.local.set({ targetLanguage: langSelect.value }),
);

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

init();