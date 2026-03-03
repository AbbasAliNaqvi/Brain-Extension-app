const API_BASE = "http://localhost:5050";
const $ = (id) => document.getElementById(id);
let token = null,
  flashcards = [];

function sendMsg(payload, cb) {
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
      }
      cb?.(resp);
    });
  } catch {}
}

(async function init() {
  try {
    const data = await chrome.storage.local.get([
      "token",
      "workspaceId",
      "targetLanguage",
      "todaySaves",
      "streak",
      "githubAgent",
      "youtubeSync",
    ]);
    if (!data.token) {
      showAuth();
      return;
    }
    token = data.token;
    showApp(data);
    loadStats();
  } catch {
    showAuth();
  }
})();

function showAuth() {
  const auth = $("auth-screen");
  const app = $("app-wrap");
  if (auth) auth.style.display = "flex";
  if (app) app.style.display = "none";
}

function showApp(data = {}) {
  const auth = $("auth-screen");
  const app = $("app-wrap");
  if (auth) auth.style.display = "none";
  if (app) app.style.display = "flex";

  const stToday = $("st-today");
  const stStreak = $("st-streak");
  if (stToday) stToday.textContent = data.todaySaves || 0;
  if (stStreak) stStreak.textContent = data.streak || 0;

  const ws = $("ws-input-popup");
  const lang = $("lang-popup");
  if (ws && data.workspaceId) ws.value = data.workspaceId;
  if (lang && data.targetLanguage) lang.value = data.targetLanguage;

  if ($("gh-toggle")) $("gh-toggle").checked = data.githubAgent !== false;
  if ($("yt-toggle")) $("yt-toggle").checked = data.youtubeSync !== false;

  loadMe();
}

let isLoginMode = true;
$("auth-switch-btn")?.addEventListener("click", () => {
  isLoginMode = !isLoginMode;
  const nameWrap = $("name-field-wrap");
  const loginBtn = $("login-btn");
  const switchTxt = $("auth-switch-text");
  const switchBtn = $("auth-switch-btn");
  const errEl = $("auth-err");

  if (errEl) errEl.textContent = "";

  if (isLoginMode) {
    nameWrap.classList.add("hidden");
    loginBtn.textContent = "Connect to Brain OS";
    switchTxt.textContent = "Don't have an account?";
    switchBtn.textContent = "Sign up";
  } else {
    nameWrap.classList.remove("hidden");
    loginBtn.textContent = "Create Account";
    switchTxt.textContent = "Already have an account?";
    switchBtn.textContent = "Log in";
  }
});

$("login-btn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;
  const name = $("name")?.value.trim();
  const btn = $("login-btn");
  const errEl = $("auth-err");

  if (!email || !password || (!isLoginMode && !name)) {
    if (errEl) errEl.textContent = "All fields are required.";
    return;
  }
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span>${isLoginMode ? 'Authenticating…' : 'Creating Account…'}`;
  }
  if (errEl) errEl.textContent = "";

  const endpoint = isLoginMode ? '/auth/login' : '/auth/signup';
  const bodyData = isLoginMode ? { email, password } : { name, email, password };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || (isLoginMode ? "Invalid credentials" : "Registration failed"));
    
    token = data.accessToken || data.token;
    await chrome.storage.local.set({ token });
    showApp({});
    loadStats();
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = isLoginMode ? "Connect to Brain OS" : "Create Account";
    }
  }
});

$("logout-btn")?.addEventListener("click", async () => {
  await chrome.storage.local.remove(["token"]);
  token = null;
  flashcards = [];
  showAuth();
});

async function loadMe() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const el = $("user-email");
    if (el) el.textContent = data.user?.name || data.user?.email || "";
  } catch {}
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/brain/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const hEl = $("st-health");
    const sEl = $("st-streak");
    const tEl = $("st-today");
    if (hEl && data.healthScore !== undefined)
      hEl.textContent = `${data.healthScore}%`;
    if (sEl && data.streak !== undefined) {
      sEl.textContent = data.streak;
      chrome.storage.local.set({ streak: data.streak });
    }
    if (tEl && data.todaySaves !== undefined) tEl.textContent = data.todaySaves;
  } catch {}
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-pane")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const targetTab = $(`tab-${tab}`);
    if (targetTab) targetTab.classList.add("active");
    if (tab === "train") loadFlashcards();
  });
});

$("ingest-btn")?.addEventListener("click", async () => {
  const textEl = $("ingest-text");
  const text = textEl?.value.trim();
  if (!text) return;
  const btn = $("ingest-btn");
  const ok = $("ingest-ok");
  const ws = $("ws-input-popup")?.value.trim() || "General";
  const lang = $("lang-popup")?.value || "English";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Processing…';
  }
  if (ok) ok.classList.add("hidden");
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
    _addWsOption(ws);
    chrome.storage.local.set({ workspaceId: ws, targetLanguage: lang });
    sendMsg({ type: "MEMORY_SAVED" });
    if (textEl) textEl.value = "";
    if (ok) {
      ok.classList.remove("hidden");
      setTimeout(() => ok.classList.add("hidden"), 3000);
    }
    const { todaySaves = 0 } = await chrome.storage.local.get("todaySaves");
    const stToday = $("st-today");
    if (stToday) stToday.textContent = todaySaves;
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save to Vector DB";
    }
  }
});

function _addWsOption(ws) {
  const dl = $("ws-list-popup");
  if (!dl) return;
  if (![...dl.options].some((o) => o.value === ws)) {
    const opt = document.createElement("option");
    opt.value = ws;
    dl.appendChild(opt);
  }
}

async function runSearch() {
  const inputEl = $("search-input");
  const query = inputEl?.value.trim();
  if (!query) return;
  const container = $("search-results");
  if (!container) return;
  container.innerHTML =
    '<div class="empty-state"><span class="spin"></span>Searching vectors…</div>';
  try {
    const res = await fetch(
      `${API_BASE}/memory/search?query=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    if (!res.ok || data.status === "ERROR") throw new Error(data.message);
    if (!data.memories?.length) {
      container.innerHTML = '<div class="empty-state">No memories found.</div>';
      return;
    }
    container.innerHTML = data.memories
      .map((m, i) => {
        const score = m.score ? Math.round(m.score * 100) : null;
        return `<div class="res-card" style="animation-delay:${i * 0.04}s">
        ${score ? `<span class="res-score">${score}%</span>` : ""}
        ${_esc((m.content || "").substring(0, 200))}${(m.content?.length || 0) > 200 ? "…" : ""}
      </div>`;
      })
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:#fca5a5">Error: ${_esc(err.message)}</div>`;
  }
}

$("search-btn")?.addEventListener("click", runSearch);
$("search-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

async function loadFlashcards() {
  const statusEl = $("train-status");
  const section = $("fc-section");
  const ws = $("ws-input-popup")?.value || "General";
  if (section) section.classList.add("hidden");
  if (statusEl) statusEl.textContent = "Fetching review queue…";
  try {
    const res = await fetch(
      `${API_BASE}/memory/review?workspaceId=${encodeURIComponent(ws)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    if (!res.ok || data.status === "ERROR") throw new Error(data.message);
    flashcards = data.flashcards || [];
    _renderCard();
  } catch (err) {
    if (statusEl)
      statusEl.innerHTML = `<span style="color:#fca5a5">Error: ${_esc(err.message)}</span>`;
  }
}

function _renderCard() {
  const statusEl = $("train-status");
  const section = $("fc-section");
  const cardEl = $("fc-text");
  if (!flashcards.length) {
    if (section) section.classList.add("hidden");
    if (statusEl)
      statusEl.innerHTML = `<div class="no-reviews">All caught up!<span>No pending reviews. Come back tomorrow.</span></div>`;
    return;
  }
  if (statusEl)
    statusEl.textContent = `${flashcards.length} card${flashcards.length > 1 ? "s" : ""} remaining`;
  if (cardEl) cardEl.textContent = flashcards[0].content;
  if (section) section.classList.remove("hidden");
}

document.querySelectorAll(".score-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!flashcards.length) return;
    const score = parseInt(btn.dataset.score, 10);
    const card = flashcards.shift();
    _renderCard();
    fetch(`${API_BASE}/memory/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ memoryId: card._id, score }),
    }).catch(() => {});
  });
});

$("lang-setting")?.addEventListener("change", () => {
  const v = $("lang-setting")?.value;
  if (v) {
    chrome.storage.local.set({ targetLanguage: v });
    const lp = $("lang-popup");
    if (lp) lp.value = v;
  }
});

$("gh-toggle")?.addEventListener("change", (e) =>
  chrome.storage.local.set({ githubAgent: e.target.checked }),
);
$("yt-toggle")?.addEventListener("change", (e) =>
  chrome.storage.local.set({ youtubeSync: e.target.checked }),
);

function _esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}