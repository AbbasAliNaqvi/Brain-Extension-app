(function () {
  "use strict";
  if (window.__brainOS_v5) return;
  window.__brainOS_v5 = true;

  const API_BASE = "https://brain-extension-exng.onrender.com";
  const isYouTube = location.hostname.includes("youtube.com");
  const isGitHub = location.hostname.includes("github.com");
  const CODE_PATS = [
    /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
    /[{};]\s*$/m,
    /\([^)]*\)\s*(=>|{)/,
    /(def |print\(|self\.|async def|import |from )/,
    /(SELECT|FROM|WHERE|INSERT|UPDATE)\s+/i,
  ];
  const isCode = (t) =>
    t.length > 20 && CODE_PATS.filter((p) => p.test(t)).length >= 2;

  let currentText = "";
  let toolbar = null;
  let toast = null;
  let palette = null;
  let hideTimer = null;

  function buildToolbar() {
    if (document.getElementById("brain-toolbar"))
      return document.getElementById("brain-toolbar");
    const el = document.createElement("div");
    el.id = "brain-toolbar";

    const code = isCode(currentText);
    el.innerHTML = `
      ${code ? '<span class="brain-code-pill">code</span>' : ""}
      <button class="brain-tb-btn primary" data-action="desi_analogy">
        <span class="brain-tb-icon">🔮</span> Desi
      </button>
      <button class="brain-tb-btn" data-action="eli5">
        <span class="brain-tb-icon">⚡</span> ELI5
      </button>
      <button class="brain-tb-btn" data-action="neural_link">
        <span class="brain-tb-icon">🧬</span> Link
      </button>
      ${code ? '<button class="brain-tb-btn" data-action="roast_code"><span class="brain-tb-icon">🐛</span> Roast</button>' : ""}
      <div class="brain-tb-sep"></div>
      <button class="brain-tb-btn" data-action="magic_translate">
        <span class="brain-tb-icon">🌐</span> Translate
      </button>
      <button class="brain-tb-btn" data-action="save">
        <span class="brain-tb-icon">💾</span>
      </button>
    `;

    document.body.appendChild(el);

    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("mouseup", (e) => e.stopPropagation());

    el.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleToolbarAction(btn.dataset.action);
      });
    });

    return el;
  }

  function showToolbar(rect) {
    if (!toolbar) toolbar = buildToolbar();

    const code = isCode(currentText);
    const hasCodePill = !!toolbar.querySelector(".brain-code-pill");
    const hasRoastBtn = !!toolbar.querySelector('[data-action="roast_code"]');
    if (code !== hasCodePill || code !== hasRoastBtn) {
      toolbar.remove();
      toolbar = null;
      toolbar = buildToolbar();
    }

    clearTimeout(hideTimer);

    toolbar.style.visibility = "hidden";
    toolbar.classList.add("visible");

    requestAnimationFrame(() => {
      const tbW = toolbar.offsetWidth || 300;
      const tbH = toolbar.offsetHeight || 36;
      const GAP = 8;
      const sx = window.scrollX,
        sy = window.scrollY;

      let top = rect.top + sy - tbH - GAP;
      let left = rect.left + sx + rect.width / 2 - tbW / 2;

      if (top < sy + 8) top = rect.bottom + sy + GAP;
      left = Math.max(sx + 6, Math.min(left, sx + window.innerWidth - tbW - 6));

      toolbar.style.top = `${top}px`;
      toolbar.style.left = `${left}px`;
      toolbar.style.visibility = "";
    });
  }

  function hideToolbar(delay = 150) {
    hideTimer = setTimeout(() => toolbar?.classList.remove("visible"), delay);
  }

  document.addEventListener("mouseup", (e) => {
    if (toolbar?.contains(e.target)) return;

    requestAnimationFrame(() => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();

      if (!text || text.length < 4) {
        hideToolbar(0);
        return;
      }

      currentText = text;
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ lastSelection: text }).catch(() => {});
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      showToolbar(rect);
    });
  });

  document.addEventListener("mousedown", (e) => {
    if (!toolbar?.contains(e.target)) hideToolbar(0);
  });

  document.addEventListener("selectionchange", () => {
    const text = window.getSelection()?.toString()?.trim();
    if (!text || text.length < 4) hideToolbar(300);
  });

  function handleToolbarAction(action) {
    hideToolbar(0);

    if (action === "magic_translate") {
      runMagicTranslate(currentText);
      return;
    }

    if (!chrome.runtime?.id) {
      showToast("Extension reloaded — refresh the page", "error");
      return;
    }

    chrome.runtime.sendMessage(
      { type: "TOOLBAR_ACTION", mode: action, text: currentText },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.warn("[Brain OS]", chrome.runtime.lastError.message);
        }
      },
    );
  }

  async function runMagicTranslate(text) {
    const { token, targetLanguage = "Hindi" } = await chrome.storage.local.get([
      "token",
      "targetLanguage",
    ]);
    if (!token) {
      showToast("Login to use Magic Translate", "error");
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    const wrapper = document.createElement("span");
    wrapper.className = "brain-translating";
    try {
      range.surroundContents(wrapper);
    } catch {
      return;
    }

    showToast(`Translating to ${targetLanguage}…`, "info");

    try {
      const res = await fetch(`${API_BASE}/brain/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const translated = data.translation;

      setTimeout(() => {
        wrapper.className = "brain-translated";
        wrapper.textContent = translated;
        wrapper.title = `Original: ${text}`;
        sel.removeAllRanges();
        showToast(`Translated to ${targetLanguage}`, "success");
      }, 320);
    } catch (err) {
      wrapper.className = "";
      wrapper.outerHTML = wrapper.innerHTML;
      showToast(`Translate failed: ${err.message}`, "error");
    }
  }
  window.addEventListener("brain:magic_translate", (e) =>
    runMagicTranslate(e.detail.text),
  );

  function showToast(msg, type = "success") {
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "brain-toast";
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<div class="toast-dot ${type}"></div>${escHtml(msg)}`;
    toast.className = `show ${type}`;

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  window.addEventListener("brain:show_toast", (e) =>
    showToast(e.detail.msg, e.detail.type || "success"),
  );

  function buildPalette() {
    if (document.getElementById("brain-palette-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "brain-palette-overlay";
    overlay.innerHTML = `
      <div id="brain-palette">
        <div class="palette-header">
          <span class="palette-icon">⬡</span>
          <input id="brain-palette-input" type="text" placeholder="Search your Second Brain…" autocomplete="off" spellcheck="false">
          <span class="palette-kbd">ESC</span>
        </div>
        <div class="palette-results" id="brain-palette-results">
          <div class="palette-section-label">Quick Actions</div>
          <div class="palette-item" data-action="open-sidepanel">
            <span class="palette-item-icon">🧠</span>
            <div class="palette-item-content">
              <div class="palette-item-title">Open Brain OS Panel</div>
              <div class="palette-item-sub">Ctrl+Shift+B</div>
            </div>
          </div>
          <div class="palette-item" data-action="snap-learn">
            <span class="palette-item-icon">📸</span>
            <div class="palette-item-content">
              <div class="palette-item-title">Snap & Learn</div>
              <div class="palette-item-sub">Capture screen area and explain with AI</div>
            </div>
          </div>
          ${
            isYouTube
              ? `<div class="palette-item" data-action="yt-sync">
            <span class="palette-item-icon">▶️</span>
            <div class="palette-item-content">
              <div class="palette-item-title">Sync YouTube Transcript</div>
              <div class="palette-item-sub">Save current video knowledge to Brain</div>
            </div>
          </div>`
              : ""
          }
          ${
            isGitHub
              ? `<div class="palette-item" data-action="github-agent">
            <span class="palette-item-icon">🐙</span>
            <div class="palette-item-content">
              <div class="palette-item-title">Load GitHub Context</div>
              <div class="palette-item-sub">Fetch README and inject into Brain</div>
            </div>
          </div>`
              : ""
          }
        </div>
        <div class="palette-footer">
          <div class="palette-footer-item">↑↓ <span>Navigate</span></div>
          <div class="palette-footer-item">↵ <span>Open</span></div>
          <div class="palette-footer-item">ESC <span>Close</span></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    palette = overlay;

    const input = document.getElementById("brain-palette-input");
    const results = document.getElementById("brain-palette-results");
    let searchTimer = null;
    let activeIdx = -1;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePalette();
    });

    overlay.addEventListener("click", (e) => {
      const item = e.target.closest("[data-action]");
      if (!item) return;
      executePaletteAction(item.dataset.action);
    });

    input.addEventListener("keydown", (e) => {
      const items = [...results.querySelectorAll(".palette-item")];
      if (e.key === "Escape") {
        closePalette();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        items.forEach((el, i) =>
          el.classList.toggle("active", i === activeIdx),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        items.forEach((el, i) =>
          el.classList.toggle("active", i === activeIdx),
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const active = items[activeIdx];
        if (active) executePaletteAction(active.dataset.action);
        return;
      }
    });

    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (!q) {
        rebuildDefaultResults(results);
        activeIdx = -1;
        return;
      }
      results.innerHTML =
        '<div class="palette-spinner">Searching memory vectors…</div>';
      searchTimer = setTimeout(() => searchMemories(q, results), 350);
    });
  }

  function openPalette() {
    if (!palette) buildPalette();
    palette.classList.add("open");
    document.getElementById("brain-palette-input")?.focus();
  }

  function closePalette() {
    palette?.classList.remove("open");
    const input = document.getElementById("brain-palette-input");
    if (input) {
      input.value = "";
      rebuildDefaultResults(document.getElementById("brain-palette-results"));
    }
  }

  function rebuildDefaultResults(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="palette-section-label">Quick Actions</div>
      <div class="palette-item" data-action="open-sidepanel">
        <span class="palette-item-icon">🧠</span>
        <div class="palette-item-content"><div class="palette-item-title">Open Brain OS Panel</div><div class="palette-item-sub">Ctrl+Shift+B</div></div>
      </div>
      <div class="palette-item" data-action="snap-learn">
        <span class="palette-item-icon">📸</span>
        <div class="palette-item-content"><div class="palette-item-title">Snap & Learn</div><div class="palette-item-sub">Capture & explain screen area</div></div>
      </div>
    `;
  }

  async function searchMemories(query, container) {
    const { token } = await chrome.storage.local.get("token");
    if (!token) {
      container.innerHTML =
        '<div class="palette-empty">Login to search memories</div>';
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/memory/search?query=${encodeURIComponent(query)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      const mems = data.memories || [];

      if (!mems.length) {
        container.innerHTML =
          '<div class="palette-empty">No memories found</div>';
        return;
      }

      container.innerHTML =
        `<div class="palette-section-label">Memory Results (${mems.length})</div>` +
        mems
          .map(
            (m, i) => `
          <div class="palette-item" data-action="load-memory" data-text="${encodeURIComponent(m.content || "")}">
            <span class="palette-item-icon">💡</span>
            <div class="palette-item-content">
              <div class="palette-item-title">${escHtml((m.content || "").substring(0, 70))}${(m.content?.length || 0) > 70 ? "…" : ""}</div>
              <div class="palette-item-sub">${m.workspaceId || "General"}</div>
            </div>
            ${m.score ? `<span class="palette-score">${Math.round(m.score * 100)}%</span>` : ""}
          </div>
        `,
          )
          .join("");
    } catch {
      container.innerHTML =
        '<div class="palette-empty">Search failed — check connection</div>';
    }
  }

  async function executePaletteAction(action) {
    closePalette();
    if (!action) return;

    if (action === "open-sidepanel") {
      chrome.runtime.sendMessage({
        type: "TOOLBAR_ACTION",
        mode: "open_panel",
        text: "",
      });
      return;
    }
    if (action === "snap-learn") {
      chrome.runtime.sendMessage({ type: "SNAP_LEARN_REQUEST" });
      return;
    }
    if (action === "yt-sync") {
      runYouTubeSync();
      return;
    }
    if (action === "github-agent") {
      runGitHubAgent();
      return;
    }
    if (action === "load-memory") {
      return;
    }
  }

  window.addEventListener("brain:open_palette", openPalette);

  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          document.activeElement?.isContentEditable
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        openPalette();
      }
      if (e.key === "Escape") closePalette();
    },
    true,
  );

  async function runYouTubeSync() {
    if (!isYouTube) return;

    showToast("Extracting YouTube transcript…", "info");

    try {
      const video = document.querySelector("video");
      const timestamp = video ? Math.floor(video.currentTime) : 0;
      const videoUrl = location.href;
      const title =
        document
          .querySelector(
            "h1.ytd-video-primary-info-renderer, yt-formatted-string.ytd-video-primary-info-renderer",
          )
          ?.textContent?.trim() || document.title;
      let transcriptText = "";

      const segments = document.querySelectorAll(
        "ytd-transcript-segment-renderer",
      );
      if (segments.length > 0) {
        transcriptText = [...segments]
          .map((s) => s.querySelector(".segment-text")?.textContent?.trim())
          .filter(Boolean)
          .join(" ");
      }
      if (!transcriptText) {
        try {
          const scripts = [...document.querySelectorAll("script")];
          const dataScript = scripts.find((s) =>
            s.textContent.includes("captionTracks"),
          );
          if (dataScript) {
            const match = dataScript.textContent.match(
              /"captionTracks":\[(.*?)\]/,
            );
            if (match) {
              const tracks = JSON.parse(`[${match[1]}]`);
              const enTrack =
                tracks.find(
                  (t) => t.languageCode === "en" || t.languageCode === "en-US",
                ) || tracks[0];
              if (enTrack?.baseUrl) {
                const xmlRes = await fetch(enTrack.baseUrl);
                const xml = await xmlRes.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(xml, "text/xml");
                transcriptText = [...doc.querySelectorAll("text")]
                  .map((t) => t.textContent)
                  .join(" ");
              }
            }
          }
        } catch {
          /* non-critical */
        }
      }

      if (!transcriptText) {
        showToast(
          "Could not extract transcript. Enable captions first.",
          "error",
        );
        return;
      }

      const contextText = transcriptText.substring(0, 2000);

      const payload = {
        title,
        videoUrl,
        timestamp,
        transcript: contextText,
        timestampFormatted: `${Math.floor(timestamp / 60)}:${String(timestamp % 60).padStart(2, "0")}`,
      };

      chrome.runtime.sendMessage({ type: "YOUTUBE_TRANSCRIPT", data: payload });
      chrome.storage.local.set({
        lastSelection: `[YouTube: "${title}" at ${payload.timestampFormatted}]\n${contextText}`,
        pendingMode: "neural_link",
      });

      // Open sidepanel
      chrome.runtime.sendMessage({
        type: "TOOLBAR_ACTION",
        mode: "neural_link",
        text: `[YouTube: ${title}] ${contextText}`,
      });
      showToast(`YouTube synced at ${payload.timestampFormatted}`, "success");
    } catch (err) {
      showToast(`YouTube sync failed: ${err.message}`, "error");
    }
  }

  if (isYouTube) {
    setInterval(() => {
      if (document.getElementById("brain-yt-btn")) return;
      const controls = document.querySelector(".ytp-right-controls");
      if (!controls) return;
      const btn = document.createElement("button");
      btn.id = "brain-yt-btn";
      btn.title = "Sync to Brain OS";
      btn.textContent = "🧠";
      btn.style.cssText =
        "background:none;border:none;cursor:pointer;font-size:18px;padding:0 6px;opacity:0.8;line-height:1;";
      btn.onclick = runYouTubeSync;
      controls.prepend(btn);
    }, 2000);
  }

  async function runGitHubAgent() {
    if (!isGitHub) return;

    const match = location.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      showToast("Open a GitHub repo page first", "error");
      return;
    }

    const [, owner, repo] = match;
    showToast(`Fetching ${owner}/${repo} README…`, "info");

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        {
          headers: { Accept: "application/vnd.github.v3.raw" },
        },
      );

      if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
      const readme = await res.text();

      const context = `[GitHub Repo: ${owner}/${repo}]\n\nREADME:\n${readme.substring(0, 3000)}`;

      await chrome.storage.local.set({
        lastSelection: context,
        pendingMode: "neural_link",
      });
      chrome.runtime.sendMessage({
        type: "TOOLBAR_ACTION",
        mode: "neural_link",
        text: context,
      });
      showToast(`${owner}/${repo} README loaded into Brain`, "success");
    } catch (err) {
      showToast(`GitHub agent failed: ${err.message}`, "error");
    }
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
