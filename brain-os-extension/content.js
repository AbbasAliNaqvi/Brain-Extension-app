(function () {
  "use strict";
  if (window.__brainOS_v62) return;
  window.__brainOS_v62 = true;
  console.log("🚀 [Brain OS] Content script ALIVE (v62 - Professional UI)");

  const API_BASE = "http://localhost:5050";
  const isYouTube = location.hostname.includes("youtube.com");
  const isGitHub = location.hostname.includes("github.com");

  const _esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function getFaviconUrl(url) {
    try {
      const host = new URL(url).hostname;
      return `https://s2.googleusercontent.com/s2/favicons?domain=${host}&sz=32`;
    } catch (e) {
      return "";
    }
  }

  const CODE_PATS = [
    /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
    /[{};]\s*$/m,
    /\([^)]*\)\s*(=>|\{)/,
    /(def |print\(|self\.|async def)/,
    /(SELECT|FROM|WHERE|INSERT|UPDATE)\s+/i,
  ];
  const isCode = (t) =>
    t.length > 20 && CODE_PATS.filter((p) => p.test(t)).length >= 2;

  const ICONS = {
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,
    bolt: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L20 10H13.5L15 2Z"/></svg>`,
    neural: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    flame: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-5 5.5-5 10a5 5 0 0 0 10 0c0-2.5-1.5-4.5-3-6 0 2-1 3-2 3C11 9 12 5 12 2ZM8.5 15.5A3.5 3.5 0 0 0 12 19a3.5 3.5 0 0 0 3.5-3.5c0-1.5-1-2.5-1.5-3-.3 1-.8 2-2 2s-2-1-2-2c-.5.8-.5 1.4-.5 2Z"/></svg>`,
    globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    bookmark: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    code: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    info: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    camera: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    layers: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    tabIcon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    folder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    github: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>`,
    youtube: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  };

  function sendMsg(payload, cb) {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(payload, (resp) => {
        cb?.(resp);
      });
    } catch {}
  }

  let shadowHost = null,
    shadowRoot = null,
    tbEl = null,
    currentText = "",
    hideTimer = null;

  const TOOLBAR_CSS = `
    :host { all: initial; position: absolute; z-index: 2147483647; pointer-events: none; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    #tb { position: absolute; top: 0; left: 0; display: flex; align-items: center; gap: 1px; padding: 4px 6px; border-radius: 999px; background: rgba(14,14,16,.82); backdrop-filter: blur(20px) saturate(1.8); -webkit-backdrop-filter: blur(20px) saturate(1.8); border: 1px solid rgba(255,255,255,.13); box-shadow: 0 8px 32px rgba(0,0,0,.48), 0 2px 8px rgba(0,0,0,.32); opacity: 0; transform: translateY(5px) scale(.96); transition: opacity .18s ease, transform .18s ease; pointer-events: none; font-family: -apple-system, sans-serif; white-space: nowrap; }
    #tb.visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
    .sep { width: 1px; height: 14px; background: rgba(255,255,255,.1); margin: 0 3px; border-radius: 1px; }
    .btn { display:flex;align-items:center;gap:5px;padding:5px 10px;background:transparent;border:none;border-radius:999px;color:rgba(255,255,255,.72);font-size:11.5px;font-weight:500;cursor:pointer;transition:all .15s ease; }
    .btn:hover { color:#fff;background:rgba(255,255,255,.09); }
    .ic { display:flex;align-items:center;justify-content:center;opacity:.85; }
    .btn:hover .ic { opacity:1; }
  `;

  function _buildToolbar() {
    if (shadowHost) return;
    shadowHost = document.createElement("div");
    Object.assign(shadowHost.style, {
      position: "absolute",
      top: "0",
      left: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = TOOLBAR_CSS;
    shadowRoot.appendChild(style);

    tbEl = document.createElement("div");
    tbEl.id = "tb";
    tbEl.innerHTML = `
      <button class="btn" data-action="desi_analogy"><span class="ic">${ICONS.sparkles}</span>Desi</button>
      <button class="btn" data-action="eli5"><span class="ic">${ICONS.bolt}</span>ELI5</button>
      <button class="btn" data-action="neural_link"><span class="ic">${ICONS.neural}</span>Link</button>
      <div class="sep"></div>
      <button class="btn" data-action="magic_translate"><span class="ic">${ICONS.globe}</span>Translate</button>
      <button class="btn" data-action="save"><span class="ic">${ICONS.bookmark}</span>Save</button>
    `;
    shadowRoot.appendChild(tbEl);

    tbEl.addEventListener("mousedown", (e) => e.stopPropagation());
    tbEl.querySelectorAll(".btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        _handleAction(btn.dataset.action);
      });
    });
  }

  function _showToolbar(rect) {
    if (!tbEl) _buildToolbar();
    clearTimeout(hideTimer);
    shadowHost.style.top = `${window.scrollY}px`;
    shadowHost.style.left = `${window.scrollX}px`;
    tbEl.classList.add("visible");
    requestAnimationFrame(() => {
      const tbW = tbEl.offsetWidth || 300,
        tbH = tbEl.offsetHeight || 38,
        GAP = 9;
      let top = rect.top + window.scrollY - tbH - GAP;
      let left = rect.left + window.scrollX + rect.width / 2 - tbW / 2;
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + GAP;
      tbEl.style.top = `${top - window.scrollY}px`;
      tbEl.style.left = `${left - window.scrollX}px`;
    });
  }

  function _hideToolbar() {
    hideTimer = setTimeout(() => tbEl?.classList.remove("visible"), 120);
  }

  document.addEventListener("mouseup", (e) => {
    if (shadowHost && e.composedPath().some((n) => n === shadowHost)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (!text || text.length < 4) {
        _hideToolbar();
        return;
      }
      currentText = text;
      try {
        if (chrome.runtime?.id)
          chrome.storage.local.set({ lastSelection: text }).catch(() => {});
      } catch {}
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width && rect.height) _showToolbar(rect);
    }, 10);
  });
  document.addEventListener("mousedown", (e) => {
    if (shadowHost && !e.composedPath().some((n) => n === shadowHost))
      _hideToolbar();
  });

  function _handleAction(action) {
    _hideToolbar();
    if (action === "magic_translate") {
      _runMagicTranslate(currentText);
      return;
    }
    sendMsg({ type: "TOOLBAR_ACTION", mode: action, text: currentText });
  }

  async function _runMagicTranslate(text) {
    let token, lang;
    try {
      ({ token, targetLanguage: lang = "Hindi" } =
        await chrome.storage.local.get(["token", "targetLanguage"]));
    } catch {
      return;
    }
    if (!token) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0),
      wrapper = document.createElement("span");
    try {
      range.surroundContents(wrapper);
    } catch {
      return;
    }
    wrapper.style.opacity = "0.5";
    try {
      const res = await fetch(`${API_BASE}/brain/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, targetLanguage: lang }),
      });
      const data = await res.json();
      wrapper.textContent = data.translation;
      wrapper.title = `Original: ${text}`;
      wrapper.style.opacity = "1";
      wrapper.style.background = "rgba(16,185,129,0.1)";
      sel.removeAllRanges();
    } catch {}
  }

  let paletteEl = null;
  let allTabsMap = {};
  let currentViewMode = "main";
  let mainMenuHTML = "";
  let activeClusterData = null;

  function _buildPalette() {
    if (paletteEl) return;
    paletteEl = document.createElement("div");
    paletteEl.id = "__brain_palette_overlay";

    paletteEl.innerHTML = `
      <div id="__brain_palette">
        <div class="ph">
          <span class="ph-icon">${ICONS.search}</span>
          <input id="__brain_pi" type="text" placeholder="Search your Second Brain..." autocomplete="off" spellcheck="false">
          <span class="ph-kbd">ESC</span>
        </div>
        <div class="pr" id="__brain_pr"></div>
        <div class="pf">
          <span>↑↓ Navigate</span>
          <span>↵ Select / Open</span>
          <span>ESC Close</span>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #__brain_palette_overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: flex-start; justify-content: center; padding-top: 15vh; opacity: 0; transition: opacity 0.15s ease; pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      #__brain_palette_overlay.open { opacity: 1; pointer-events: auto; }
      
      #__brain_palette { width: 750px; max-width: 90vw; background: #0c0c0c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); overflow: hidden; transform: translateY(-10px) scale(0.98); transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; }
      #__brain_palette_overlay.open #__brain_palette { transform: translateY(0) scale(1); }
      
      .ph { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1px solid #1a1a1a; }
      .ph-icon { color: #666; display: flex; align-items: center; }
      #__brain_pi { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-size: 16px; font-family: inherit; }
      #__brain_pi::placeholder { color: #555; }
      .ph-kbd { font-size: 10px; color: #666; border: 1px solid #333; padding: 3px 6px; border-radius: 4px; font-weight: 600; background: #111; letter-spacing: 0.5px; }
      
      .pr { max-height: 520px; overflow-y: auto; padding-bottom: 8px; }
      .pr::-webkit-scrollbar { width: 4px; }
      .pr::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      
      .psl { padding: 16px 20px 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #666; }
      
      .pi { display: flex; align-items: center; gap: 14px; padding: 12px 20px; cursor: pointer; transition: background 0.1s; border-left: 2px solid transparent; }
      .pi:hover, .pi.act { background: #161616; border-left-color: #10b981; }
      .pi.ctx-cluster:hover, .pi.ctx-cluster.act { border-left-color: #666; }
      
      .action-group-btn { margin-left: 12px; font-size: 10px; background: #1a1a1a; border: 1px solid #333; padding: 5px 12px; border-radius: 6px; color: #ccc; cursor: pointer; transition: all 0.15s; font-weight: 600; }
      .action-group-btn:hover { background: #10b981; color: #000; border-color: #10b981; }

      .pi-ic { color: #888; display: flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; }
      .favicon { width: 16px; height: 16px; border-radius: 3px; object-fit: contain; }
      
      .pi-body { flex: 1; min-width: 0; }
      .pi-t { font-size: 14px; font-weight: 500; color: #eee; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pi-s { font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pi-sc { font-size: 10px; font-weight: 700; color: #10b981; background: rgba(16,185,129,0.1); border-radius: 4px; padding: 2px 8px; flex-shrink: 0; }
      
      .pf { padding: 12px 20px; border-top: 1px solid #1a1a1a; display: flex; gap: 16px; font-size: 11px; color: #555; background: #080808; }
      .p-spin { padding: 30px; text-align: center; color: #666; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 10px; }
      .p-spin::before { content: ''; width: 16px; height: 16px; border: 2px solid #333; border-top-color: #888; border-radius: 50%; animation: pspin .8s linear infinite; }
      .pe { padding: 20px; text-align: center; color: #888; font-size: 13px; }
      @keyframes pspin { to { transform: rotate(360deg); } }
    `;
    paletteEl.appendChild(style);
    document.body.appendChild(paletteEl);

    const input = paletteEl.querySelector("#__brain_pi");
    const results = paletteEl.querySelector("#__brain_pr");
    let activeIdx = -1;

    paletteEl.addEventListener("click", (e) => {
      if (e.target === paletteEl) _closePalette();
    });

    paletteEl.addEventListener("click", (e) => {
      const groupBtn = e.target.closest(".action-group-btn");
      if (groupBtn) {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: "GROUP_TABS",
          tabIds: activeClusterData.tabIds,
          title: activeClusterData.clusterName,
          color: activeClusterData.color,
        });
        _closePalette();
        return;
      }

      const targetPi = e.target.closest(".pi");
      if (!targetPi) return;

      if (currentViewMode === "main") {
        if (targetPi.classList.contains("ctx-cluster")) {
          _enterClusterView(targetPi);
        } else {
          _runPaletteAction(targetPi);
        }
      } else if (currentViewMode === "cluster") {
        if (targetPi.dataset.pa === "back") {
          _exitClusterView();
        } else {
          _runPaletteAction(targetPi);
        }
      }
    });

    input.addEventListener("keydown", (e) => {
      const items = [...results.querySelectorAll(".pi")].filter(
        (el) => el.style.display !== "none",
      );

      if (e.key === "Escape") {
        if (currentViewMode === "cluster") {
          e.preventDefault();
          _exitClusterView();
        } else {
          _closePalette();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        _markActive(items, activeIdx);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        _markActive(items, activeIdx);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const a = items[activeIdx];
        if (a) {
          if (
            currentViewMode === "main" &&
            a.classList.contains("ctx-cluster")
          ) {
            _enterClusterView(a);
          } else if (currentViewMode === "cluster" && a.dataset.pa === "back") {
            _exitClusterView();
          } else {
            _runPaletteAction(a);
          }
        }
        return;
      }
    });

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      activeIdx = -1;
      const items = results.querySelectorAll(".pi");
      let visibleCount = 0;
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        if (text.includes(q)) {
          item.style.display = "flex";
          visibleCount++;
        } else {
          item.style.display = "none";
        }
      });
      results
        .querySelectorAll(".psl")
        .forEach(
          (l) => (l.style.display = q && visibleCount === 0 ? "none" : "flex"),
        );
    });
  }

  function _enterClusterView(clusterElement) {
    activeClusterData = JSON.parse(
      clusterElement.dataset.cluster.replace(/&#39;/g, "'"),
    );
    currentViewMode = "cluster";
    const results = paletteEl.querySelector("#__brain_pr");
    const input = paletteEl.querySelector("#__brain_pi");

    const childrenHtml = activeClusterData.tabIds
      .map((id) => {
        const t = allTabsMap[id];
        if (!t) return "";
        return `
              <div class="pi" data-pa="tab" data-tabid="${t.id}">
                  <span class="pi-ic"><img src="${getFaviconUrl(t.url)}" class="favicon" onerror="this.outerHTML='<span class=\\'pi-ic\\'>${ICONS.tabIcon}</span>'" /></span>
                  <div class="pi-body">
                      <div class="pi-t">${_esc(t.title)}</div>
                      <div class="pi-s">${_esc(new URL(t.url).hostname.replace(/^www\./, ""))}</div>
                  </div>
              </div>
          `;
      })
      .join("");

    results.innerHTML = `
          <div class="psl" style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <span style="font-size:12px; color:#eee;">${_esc(activeClusterData.clusterName)}</span>
              <button class="action-group-btn">Group in Chrome</button>
          </div>
          <div class="pi" data-pa="back" style="background: rgba(255,255,255,0.02); margin-bottom:8px;">
              <span class="pi-ic" style="font-size:16px;">←</span>
              <div class="pi-body">
                  <div class="pi-t">Back to main menu</div>
              </div>
          </div>
          ${childrenHtml}
      `;

    input.value = "";
    input.placeholder = `Search inside ${activeClusterData.clusterName}...`;
    input.focus();
  }

  function _exitClusterView() {
    currentViewMode = "main";
    activeClusterData = null;
    const results = paletteEl.querySelector("#__brain_pr");
    const input = paletteEl.querySelector("#__brain_pi");

    results.innerHTML = mainMenuHTML;
    input.value = "";
    input.placeholder = "Search your Second Brain...";
    input.focus();
  }

  function _markActive(items, idx) {
    items.forEach((el, i) => {
      el.classList.toggle("act", i === idx);
      if (i === idx)
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function _openPalette() {
    if (!paletteEl) _buildPalette();
    paletteEl.classList.add("open");
    const input = paletteEl.querySelector("#__brain_pi");
    input.value = "";
    input.placeholder = "Search your Second Brain...";
    input.focus();

    currentViewMode = "main";
    const results = paletteEl.querySelector("#__brain_pr");

    results.innerHTML = `
      <div class="psl">Quick Actions</div>
      <div class="pi" data-pa="panel">
        <span class="pi-ic">${ICONS.layers}</span>
        <div class="pi-body">
          <div class="pi-t">Open Brain OS Panel</div>
          <div class="pi-s">Access all extension features</div>
        </div>
      </div>
      <div class="pi" data-pa="snap">
        <span class="pi-ic">${ICONS.camera}</span>
        <div class="pi-body">
          <div class="pi-t">Snap &amp; Learn</div>
          <div class="pi-s">Capture &amp; explain current screen</div>
        </div>
      </div>
      <div class="psl" style="margin-top:8px">AI ContextOS</div>
      <div class="p-spin" id="__ctx_loading">Groq is analyzing your cognitive load...</div>
    `;

    try {
      chrome.runtime.sendMessage({ type: "GET_ALL_TABS" }, (result) => {
        const allTabs = result?.tabs || [];
        allTabsMap = {};
        allTabs.forEach((t) => (allTabsMap[t.id] = t));

        chrome.runtime.sendMessage({ type: "CLUSTER_TABS" }, (resp) => {
          const loadingEl = results.querySelector("#__ctx_loading");
          if (!loadingEl) return;

          if (chrome.runtime.lastError || !resp || resp.status === "ERROR") {
            loadingEl.outerHTML = `<div class="pe" style="color:#ef4444">ContextOS offline. Error: ${resp?.message || "Network issue"}</div>`;
          } else if (resp.clusters && resp.clusters.length > 0) {
            loadingEl.outerHTML = resp.clusters
              .map((c) => {
                return `
                    <div class="pi ctx-cluster" data-cluster='${JSON.stringify(c).replace(/'/g, "&#39;")}'>
                        <span class="pi-ic">${ICONS.folder}</span>
                        <div class="pi-body">
                            <div class="pi-t">${_esc(c.clusterName)}</div>
                            <div class="pi-s">Click to open • ${c.tabIds.length} Tabs</div>
                        </div>
                        <span style="color:#666; font-size:16px;">→</span>
                    </div>
                `;
              })
              .join("");
          } else {
            loadingEl.outerHTML = `<div class="pe">No clear tab contexts found.</div>`;
          }

          if (allTabs.length > 0) {
            const tabsHTML = `
                    <div class="psl" style="margin-top:12px" id="__tabs_lbl">All Open Tabs (${allTabs.length})</div>
                    ${allTabs
                      .map((t) => {
                        let host = "";
                        try {
                          host = new URL(t.url).hostname.replace(/^www\./, "");
                        } catch {}
                        return `
                            <div class="pi" data-pa="tab" data-tabid="${t.id}">
                                <span class="pi-ic"><img src="${getFaviconUrl(t.url)}" class="favicon" onerror="this.outerHTML='<span class=\\'pi-ic\\'>${ICONS.tabIcon}</span>'" /></span>
                                <div class="pi-body">
                                    <div class="pi-t">${_esc(t.title || "Untitled")}</div>
                                    <div class="pi-s">${_esc(host)}</div>
                                </div>
                            </div>
                        `;
                      })
                      .join("")}
                `;
            results.insertAdjacentHTML("beforeend", tabsHTML);
          }

          mainMenuHTML = results.innerHTML;
        });
      });
    } catch (e) {}
  }

  function _closePalette() {
    paletteEl?.classList.remove("open");
  }

  function _runPaletteAction(el) {
    const action = el.dataset.pa;
    _closePalette();
    if (action === "panel")
      sendMsg({ type: "TOOLBAR_ACTION", mode: "open_panel", text: "" });
    if (action === "snap") sendMsg({ type: "SNAP_LEARN_REQUEST" });
    if (action === "tab") {
      const tabId = parseInt(el.dataset.tabid);
      if (!isNaN(tabId)) sendMsg({ type: "FOCUS_TAB", tabId });
    }
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        !e.shiftKey
      ) {
        const tag = document.activeElement?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          document.activeElement?.isContentEditable
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        _openPalette();
      }
    },
    true,
  );

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "OPEN_PALETTE") {
      _openPalette();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "QUICK_SAVE") {
      const text = window.getSelection()?.toString()?.trim();
      if (text) sendMsg({ type: "TOOLBAR_ACTION", mode: "save", text });
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "AGENT_ACTION") {
      _executeAction(msg.action)
        .then((r) => sendResponse(r))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  });

  function _findElement(selectorOrText) {
    if (!selectorOrText) return null;
    try {
      const direct = document.querySelector(selectorOrText);
      if (direct) return direct;
    } catch {}

    if (
      selectorOrText.startsWith("//") ||
      selectorOrText.startsWith("/html") ||
      selectorOrText.startsWith("(")
    ) {
      try {
        const xResult = document.evaluate(
          selectorOrText,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        if (xResult.singleNodeValue) return xResult.singleNodeValue;
      } catch {}
    }

    const text = selectorOrText.toLowerCase().trim();
    const interactables = [
      ...document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [role="link"], [role="menuitem"], label',
      ),
    ];

    const exactMatch = interactables.find((el) => {
      const elText = (
        el.textContent ||
        el.value ||
        el.placeholder ||
        el.getAttribute("aria-label") ||
        ""
      )
        .toLowerCase()
        .trim();
      return (
        elText === text ||
        el.getAttribute("data-testid") === selectorOrText ||
        el.id === selectorOrText
      );
    });
    if (exactMatch) return exactMatch;

    const partialMatch = interactables.find((el) => {
      const elText = (
        el.textContent ||
        el.value ||
        el.placeholder ||
        el.getAttribute("aria-label") ||
        ""
      ).toLowerCase();
      return elText.includes(text);
    });
    if (partialMatch) return partialMatch;

    return null;
  }

  function _simulateInput(el, value) {
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set ||
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  function _simulateClick(el) {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.click?.();
  }

  async function _retryFindElement(
    selectorOrText,
    maxRetries = 10,
    interval = 300,
  ) {
    for (let i = 0; i < maxRetries; i++) {
      const el = _findElement(selectorOrText);
      if (el) return el;
      await new Promise((r) => setTimeout(r, interval));
    }
    return null;
  }

  async function _executeAction(action) {
    if (action.type === "wait") {
      await new Promise((r) => setTimeout(r, Math.min(action.ms || 500, 5000)));
      return { ok: true };
    }
    if (action.type === "scroll") {
      window.scrollBy({ top: action.y || 400, behavior: "smooth" });
      return { ok: true };
    }
    if (action.type === "click") {
      const el = await _retryFindElement(action.selector);
      if (!el)
        return { ok: false, error: `Element not found: ${action.selector}` };
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise((r) => setTimeout(r, 150));
      _simulateClick(el);
      return { ok: true };
    }
    if (action.type === "type") {
      const el = await _retryFindElement(action.selector);
      if (!el)
        return { ok: false, error: `Input not found: ${action.selector}` };
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      await new Promise((r) => setTimeout(r, 100));
      _simulateInput(el, action.value || "");
      if (action.pressEnter) {
        await new Promise((r) => setTimeout(r, 100));
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        );
      }
      return { ok: true };
    }
    return { ok: false, error: `Unknown action type: ${action.type}` };
  }
})();
