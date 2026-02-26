// ================================================================
//  Brain OS v5.4 — Content Script
//
//  Architecture changes from v5.1:
//  1. Floating toolbar injected into SHADOW DOM — immune to host
//     page CSS (Reddit, GitHub, Medium, etc. cannot break it)
//  2. All chrome.runtime.sendMessage calls wrapped in try-catch
//     to handle "Extension context invalidated" gracefully
//  3. YouTube: caption track availability check before showing btn
//  4. GitHub: resilient multi-selector README approach
//  5. SVG icons — zero emoji dependency
// ================================================================
(function () {
  'use strict';
  if (window.__brainOS_v54) return;
  window.__brainOS_v54 = true;

  const API_BASE  = 'https://brain-extension-exng.onrender.com';
  const isYouTube = location.hostname.includes('youtube.com');
  const isGitHub  = location.hostname.includes('github.com');

  // ── Code detection ───────────────────────────────────────────
  const CODE_PATS = [
    /^\s*(const|let|var|function|class|import|export|return|if|for|while|=>|async)\b/m,
    /[{};]\s*$/m,
    /\([^)]*\)\s*(=>|\{)/,
    /(def |print\(|self\.|async def)/,
    /(SELECT|FROM|WHERE|INSERT|UPDATE)\s+/i
  ];
  const isCode = t => t.length > 20 && CODE_PATS.filter(p => p.test(t)).length >= 2;

  // ─────────────────────────────────────────────────────────────
  //  SVG ICON LIBRARY  (pure inline SVG, no emoji, no CDN)
  // ─────────────────────────────────────────────────────────────
  const ICONS = {
    // Sparkles — Desi Mode
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`,

    // Bolt — ELI5
    bolt: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11L10 22L20 10H13.5L15 2Z"/></svg>`,

    // Share nodes — Neural Link
    neural: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,

    // Flame — Roast Code
    flame: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-5 5.5-5 10a5 5 0 0 0 10 0c0-2.5-1.5-4.5-3-6 0 2-1 3-2 3C11 9 12 5 12 2ZM8.5 15.5A3.5 3.5 0 0 0 12 19a3.5 3.5 0 0 0 3.5-3.5c0-1.5-1-2.5-1.5-3-.3 1-.8 2-2 2s-2-1-2-2c-.5.8-.5 1.4-.5 2Z"/></svg>`,

    // Sitemap — Arch Diagram
    sitemap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="3" width="6" height="4" rx="1"/><rect x="9" y="17" width="6" height="4" rx="1"/><path d="M6 7v4M18 7v4M6 11h12M12 11v6"/></svg>`,

    // Globe — Translate
    globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,

    // Bookmark — Save
    bookmark: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,

    // Code — code pill
    code: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

    // Brain — palette/toast logo
    brain: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.7-4.23A3 3 0 0 1 3.5 12a3 3 0 0 1 2.1-2.87A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.7-4.23A3 3 0 0 0 20.5 12a3 3 0 0 0-2.1-2.87A2.5 2.5 0 0 0 14.5 2Z"/></svg>`,

    // Check — success
    check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,

    // X — error
    x: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,

    // Info
    info: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,

    // Search — palette
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,

    // Camera — snap
    camera: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,

    // GitHub octocat (simplified)
    github: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>`,

    // YouTube
    youtube: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,

    // Bulb — memory result
    bulb: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,

    // Layers — open panel
    layers: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
  };

  // ── Safe sendMessage wrapper ──────────────────────────────────
  function sendMsg(payload, cb) {
    try {
      if (!chrome.runtime?.id) {
        console.warn('[Brain OS] Extension context invalidated — reload the page');
        showToast('Brain OS reloaded. Please refresh this page.', 'error');
        return;
      }
      chrome.runtime.sendMessage(payload, resp => {
        if (chrome.runtime.lastError) {
          // Suppress: "Could not establish connection", "Extension context invalidated"
          console.warn('[Brain OS]', chrome.runtime.lastError.message);
        }
        cb?.(resp);
      });
    } catch (err) {
      console.warn('[Brain OS] sendMessage error:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  SHADOW DOM FLOATING TOOLBAR
  //  Injected into a Shadow Root — completely isolated from the
  //  host page's CSS cascade (Reddit dark mode, GitHub resets,
  //  Medium's aggressive typography — none of it can reach in)
  // ─────────────────────────────────────────────────────────────

  // Shadow host: a zero-size positioned anchor in the main DOM
  let shadowHost   = null;
  let shadowRoot   = null;
  let tbEl         = null;       // the toolbar div inside shadow
  let currentText  = '';
  let hideTimer    = null;

  // ── Shadow root CSS (isolated from page) ─────────────────────
  const TOOLBAR_CSS = `
    :host {
      all: initial;
      position: absolute;
      z-index: 2147483647;
      pointer-events: none;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── The pill toolbar ────────────────────────────────── */
    #tb {
      position: absolute;
      top: 0; left: 0;
      display: flex;
      align-items: center;
      gap: 1px;
      padding: 4px 6px;

      /* Pill shape */
      border-radius: 999px;

      /* Liquid Glass background */
      background: rgba(14, 14, 16, 0.82);
      backdrop-filter: blur(20px) saturate(1.8);
      -webkit-backdrop-filter: blur(20px) saturate(1.8);

      /* Concentric border */
      border: 1px solid rgba(255, 255, 255, 0.13);

      /* Layered shadow for depth */
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.48),
        0 2px 8px  rgba(0, 0, 0, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);

      /* Animation */
      opacity: 0;
      transform: translateY(5px) scale(0.96);
      transition:
        opacity  0.18s cubic-bezier(0.16, 1, 0.3, 1),
        transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);

      pointer-events: none;
      will-change: transform, opacity;

      font-family: -apple-system, 'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif;
      white-space: nowrap;
    }

    #tb.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* ── Separator ───────────────────────────────────────── */
    .sep {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0 3px;
      flex-shrink: 0;
      border-radius: 1px;
    }

    /* ── Code badge ──────────────────────────────────────── */
    .code-badge {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: rgba(163, 230, 53, 0.9);
      background: rgba(163, 230, 53, 0.1);
      border: 1px solid rgba(163, 230, 53, 0.2);
      border-radius: 999px;
      padding: 2px 7px 2px 5px;
      margin-right: 4px;
    }

    /* ── Buttons ─────────────────────────────────────────── */
    .btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      background: transparent;
      border: none;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 11.5px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      line-height: 1;
      outline: none;
      position: relative;
      overflow: hidden;
      transition:
        color     0.15s ease,
        background 0.15s ease;
    }

    /* Subtle background on hover — fluid glow lift */
    .btn::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.09);
    }

    .btn:hover::before { opacity: 1; }
    .btn:active        { transform: scale(0.96); }

    /* Primary button — first action, slightly elevated */
    .btn.primary {
      color: rgba(255,255,255,0.92);
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255,255,255,0.14);
    }
    .btn.primary:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }

    /* Accent glow on emerald-type actions (save) */
    .btn.accent:hover {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }
    .btn.accent:hover::before {
      background: radial-gradient(ellipse, rgba(16,185,129,0.15) 0%, transparent 70%);
    }

    /* Icon */
    .ic {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: 0.85;
    }
    .btn:hover .ic { opacity: 1; }

    /* icon-only button (save) */
    .btn.icon-only { padding: 5px 8px; }
  `;

  function _buildShadowHost() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'brain-os-shadow-host';
    // Host is zero-dimension — toolbar inside positions absolutely from it
    Object.assign(shadowHost.style, {
      position:   'absolute',
      top:        '0',
      left:       '0',
      width:      '0',
      height:     '0',
      overflow:   'visible',
      zIndex:     '2147483647',
      pointerEvents: 'none'
    });
    document.body.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = TOOLBAR_CSS;
    shadowRoot.appendChild(style);
  }

  function _buildToolbar() {
    if (!shadowRoot) _buildShadowHost();

    // Remove existing toolbar
    shadowRoot.querySelector('#tb')?.remove();

    const code = isCode(currentText);

    tbEl = document.createElement('div');
    tbEl.id = 'tb';

    const btns = [
      { action: 'desi_analogy',  icon: ICONS.sparkles, label: 'Desi',      cls: 'primary' },
      { action: 'eli5',          icon: ICONS.bolt,      label: 'ELI5',      cls: '' },
      { action: 'neural_link',   icon: ICONS.neural,    label: 'Link',      cls: '' },
      ...(code ? [{ action: 'roast_code', icon: ICONS.flame, label: 'Roast', cls: '' }] : []),
      null, // separator
      { action: 'magic_translate', icon: ICONS.globe,   label: 'Translate', cls: '' },
      { action: 'save',           icon: ICONS.bookmark, label: '',          cls: 'accent icon-only' }
    ];

    let html = '';

    if (code) {
      html += `<div class="code-badge">${ICONS.code}<span>Code</span></div>`;
    }

    for (const b of btns) {
      if (!b) { html += `<div class="sep"></div>`; continue; }
      html += `
        <button class="btn ${b.cls}" data-action="${b.action}" title="${_actionTitle(b.action)}">
          <span class="ic">${b.icon}</span>
          ${b.label ? `<span>${b.label}</span>` : ''}
        </button>`;
    }

    tbEl.innerHTML = html;
    shadowRoot.appendChild(tbEl);

    // ── Stop events from leaking into page ──────────────────
    tbEl.addEventListener('mousedown', e => e.stopPropagation());
    tbEl.addEventListener('mouseup',   e => e.stopPropagation());
    tbEl.addEventListener('click',     e => e.stopPropagation());

    tbEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        _handleAction(btn.dataset.action);
      });
    });
  }

  function _actionTitle(a) {
    const MAP = {
      desi_analogy:  'Desi Analogy',
      eli5:          'Explain Like I\'m 5',
      neural_link:   'Neural Link (RAG)',
      roast_code:    'Roast Code',
      magic_translate:'Magic Translate',
      save:          'Save to Brain'
    };
    return MAP[a] || a;
  }

  function _showToolbar(rect) {
    if (!tbEl) _buildToolbar();

    // Rebuild if code state changed
    const code = isCode(currentText);
    const hasRoast = !!tbEl.querySelector('[data-action="roast_code"]');
    if (code !== hasRoast) _buildToolbar();

    clearTimeout(hideTimer);

    // Position shadow host at scroll origin so toolbar's absolute
    // coords are relative to document
    shadowHost.style.top  = `${window.scrollY}px`;
    shadowHost.style.left = `${window.scrollX}px`;

    // Temporarily unhide to measure
    tbEl.style.visibility = 'hidden';
    tbEl.classList.add('visible');

    requestAnimationFrame(() => {
      const tbW = tbEl.offsetWidth  || 320;
      const tbH = tbEl.offsetHeight || 38;
      const GAP = 9;
      const sx  = window.scrollX, sy = window.scrollY;

      let top  = rect.top  + sy - tbH - GAP;
      let left = rect.left + sx + rect.width / 2 - tbW / 2;

      if (top < sy + 8)  top = rect.bottom + sy + GAP;
      left = Math.max(sx + 8, Math.min(left, sx + window.innerWidth - tbW - 8));

      tbEl.style.top  = `${top - window.scrollY}px`; // relative to host which is at scrollY
      tbEl.style.left = `${left - window.scrollX}px`;
      tbEl.style.visibility = '';
    });
  }

  function _hideToolbar(delay = 120) {
    hideTimer = setTimeout(() => tbEl?.classList.remove('visible'), delay);
  }

  // ── Selection events ─────────────────────────────────────────
  document.addEventListener('mouseup', e => {
    // Check if click is inside shadow root (stops false hides)
    if (e.composedPath().some(n => n === shadowHost)) return;

    requestAnimationFrame(() => {
      const sel  = window.getSelection();
      const text = sel?.toString()?.trim();
      if (!text || text.length < 4) { _hideToolbar(0); return; }

      currentText = text;

      // Safe storage write
      try {
        if (chrome.runtime?.id) {
          chrome.storage.local.set({ lastSelection: text }).catch(() => {});
        }
      } catch { /* context invalidated */ }

      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      _showToolbar(rect);
    });
  });

  document.addEventListener('mousedown', e => {
    if (!e.composedPath().some(n => n === shadowHost)) _hideToolbar(0);
  });

  document.addEventListener('selectionchange', () => {
    const t = window.getSelection()?.toString()?.trim();
    if (!t || t.length < 4) _hideToolbar(300);
  });

  // ── Toolbar action handler ────────────────────────────────────
  function _handleAction(action) {
    _hideToolbar(0);

    if (action === 'magic_translate') {
      _runMagicTranslate(currentText);
      return;
    }

    sendMsg({ type: 'TOOLBAR_ACTION', mode: action, text: currentText });
  }

  // ─────────────────────────────────────────────────────────────
  //  MAGIC DOM TRANSLATION
  // ─────────────────────────────────────────────────────────────
  async function _runMagicTranslate(text) {
    let token, targetLanguage;
    try {
      ({ token, targetLanguage = 'Hindi' } = await chrome.storage.local.get(['token', 'targetLanguage']));
    } catch { showToast('Extension error — reload page', 'error'); return; }

    if (!token) { showToast('Login to use Magic Translate', 'error'); return; }

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);

    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'transition: opacity 0.3s, filter 0.3s; filter: blur(0); opacity: 1;';
    try { range.surroundContents(wrapper); } catch { return; }

    showToast(`Translating to ${targetLanguage}…`, 'info');

    // Dissolve out
    requestAnimationFrame(() => { wrapper.style.opacity = '0'; wrapper.style.filter = 'blur(4px)'; });

    try {
      const res  = await fetch(`${API_BASE}/brain/translate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ text, targetLanguage })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setTimeout(() => {
        wrapper.textContent = data.translation;
        wrapper.title       = `Original: ${text}`;
        wrapper.style.opacity = '1';
        wrapper.style.filter  = 'blur(0)';
        wrapper.style.background = 'rgba(16,185,129,0.08)';
        wrapper.style.borderRadius = '2px';
        wrapper.style.outline = '1px solid rgba(16,185,129,0.3)';
        wrapper.style.outlineOffset = '1px';
        sel.removeAllRanges();
        showToast(`Translated to ${targetLanguage}`, 'success');
      }, 320);

    } catch (err) {
      wrapper.style.opacity = '1'; wrapper.style.filter = 'blur(0)';
      showToast(`Translate failed: ${err.message}`, 'error');
    }
  }

  window.addEventListener('brain:magic_translate', e => _runMagicTranslate(e.detail.text));

  // ─────────────────────────────────────────────────────────────
  //  TOAST  (main DOM — needs to render above everything)
  // ─────────────────────────────────────────────────────────────
  let toastEl = null;

  function showToast(msg, type = 'success') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = '__brain_toast';
      Object.assign(toastEl.style, {
        position:   'fixed',
        bottom:     '20px',
        right:      '20px',
        zIndex:     '2147483647',
        display:    'flex',
        alignItems: 'center',
        gap:        '9px',
        padding:    '10px 16px',
        background: 'rgba(10,10,12,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border:     '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        boxShadow:  '0 8px 32px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system,"SF Pro Text","Inter",system-ui,sans-serif',
        fontSize:   '12.5px',
        fontWeight: '500',
        color:      '#e5e5e5',
        maxWidth:   '320px',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        opacity:    '0',
        transform:  'translateY(8px)',
        pointerEvents: 'none'
      });
      document.body.appendChild(toastEl);
    }

    const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1' };
    const icons  = { success: ICONS.check, error: ICONS.x, info: ICONS.info };
    const color  = colors[type] || '#10b981';

    toastEl.innerHTML = `
      <span style="color:${color};display:flex;align-items:center;flex-shrink:0">${icons[type] || ICONS.info}</span>
      <span>${_esc(msg)}</span>
    `;
    toastEl.style.borderColor = `rgba(${_hexToRgb(color)}, 0.25)`;
    toastEl.style.opacity   = '1';
    toastEl.style.transform = 'translateY(0)';

    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => {
      toastEl.style.opacity   = '0';
      toastEl.style.transform = 'translateY(8px)';
    }, 3200);
  }

  window.addEventListener('brain:show_toast', e => showToast(e.detail.msg, e.detail.type || 'success'));

  // ─────────────────────────────────────────────────────────────
  //  COMMAND PALETTE  (Cmd+K — main DOM, full overlay)
  // ─────────────────────────────────────────────────────────────
  let paletteEl = null;

  function _buildPalette() {
    if (paletteEl) return;

    paletteEl = document.createElement('div');
    paletteEl.id = '__brain_palette_overlay';
    paletteEl.innerHTML = `
      <div id="__brain_palette">
        <div class="ph">
          <span class="ph-icon" style="color:#555;display:flex">${ICONS.search}</span>
          <input id="__brain_pi" type="text" placeholder="Search your Second Brain…" autocomplete="off" spellcheck="false">
          <span class="ph-kbd">ESC</span>
        </div>
        <div class="pr" id="__brain_pr"></div>
        <div class="pf">
          <span>↑↓ Navigate</span><span>↵ Select</span><span>ESC Close</span>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #__brain_palette_overlay {
        position:fixed;inset:0;z-index:2147483646;
        background:rgba(0,0,0,0.65);
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
        display:flex;align-items:flex-start;justify-content:center;
        padding-top:18vh;
        opacity:0;transition:opacity 0.15s ease;pointer-events:none;
        font-family:-apple-system,'SF Pro Text','Inter',system-ui,sans-serif;
      }
      #__brain_palette_overlay.open{opacity:1;pointer-events:auto;}
      #__brain_palette {
        width:560px;max-width:calc(100vw - 32px);
        background:rgba(10,10,12,0.96);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:14px;
        overflow:hidden;
        box-shadow:0 24px 80px rgba(0,0,0,0.8);
        transform:translateY(-8px) scale(0.98);
        transition:transform 0.15s cubic-bezier(0.16,1,0.3,1);
      }
      #__brain_palette_overlay.open #__brain_palette{transform:none;}
      .ph{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,0.06);}
      #__brain_pi{flex:1;background:transparent;border:none;outline:none;color:#e5e5e5;font-size:14px;font-family:inherit;}
      #__brain_pi::placeholder{color:#3a3a3a;}
      .ph-kbd{font-size:10px;color:#3a3a3a;background:#111;border:1px solid #222;border-radius:4px;padding:2px 7px;font-family:monospace;flex-shrink:0;}
      .pr{max-height:380px;overflow-y:auto;}
      .pr::-webkit-scrollbar{width:3px;}
      .pr::-webkit-scrollbar-thumb{background:#222;border-radius:3px;}
      .psl{padding:9px 16px 3px;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#3a3a3a;}
      .pi{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-left:2px solid transparent;transition:background 0.1s,border-color 0.1s;}
      .pi:hover,.pi.act{background:rgba(255,255,255,0.04);border-left-color:#10b981;}
      .pi-ic{width:20px;display:flex;align-items:center;justify-content:center;color:#555;flex-shrink:0;}
      .pi-t{font-size:13px;font-weight:500;color:#e5e5e5;}
      .pi-s{font-size:11px;color:#555;margin-top:1px;}
      .pi-sc{font-size:10px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.1);border-radius:3px;padding:1px 6px;flex-shrink:0;}
      .pe{text-align:center;padding:28px;color:#3a3a3a;font-size:13px;}
      .p-spin{display:flex;align-items:center;justify-content:center;padding:20px;gap:8px;color:#3a3a3a;font-size:12px;}
      .p-spin::before{content:'';width:14px;height:14px;border:1.5px solid #222;border-top-color:#10b981;border-radius:50%;animation:pspin 0.7s linear infinite;flex-shrink:0;}
      @keyframes pspin{to{transform:rotate(360deg);}}
      .pf{padding:8px 16px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:16px;font-size:10.5px;color:#3a3a3a;}
    `;
    paletteEl.appendChild(style);
    document.body.appendChild(paletteEl);

    const input   = paletteEl.querySelector('#__brain_pi');
    const results = paletteEl.querySelector('#__brain_pr');
    let searchTimer = null, activeIdx = -1;

    paletteEl.addEventListener('click', e => { if (e.target === paletteEl) _closePalette(); });
    paletteEl.addEventListener('click', e => {
      const item = e.target.closest('[data-pa]');
      if (item) _runPaletteAction(item.dataset.pa);
    });

    input.addEventListener('keydown', e => {
      const items = [...results.querySelectorAll('.pi')];
      if (e.key === 'Escape') { _closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx+1,items.length-1); _markActive(items,activeIdx); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); activeIdx = Math.max(activeIdx-1,0); _markActive(items,activeIdx); return; }
      if (e.key === 'Enter')     { e.preventDefault(); const a=items[activeIdx]; if(a)_runPaletteAction(a.dataset.pa); return; }
    });

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (!q) { _buildDefaultResults(results); activeIdx=-1; return; }
      results.innerHTML = '<div class="p-spin">Searching memory vectors…</div>';
      searchTimer = setTimeout(() => _searchMems(q, results), 380);
    });

    _buildDefaultResults(results);
  }

  function _markActive(items, idx) { items.forEach((el,i)=>el.classList.toggle('act',i===idx)); }

  function _buildDefaultResults(container) {
    let html = `<div class="psl">Quick Actions</div>
      <div class="pi" data-pa="panel"><span class="pi-ic">${ICONS.layers}</span><div><div class="pi-t">Open Brain OS Panel</div><div class="pi-s">Ctrl+Shift+B</div></div></div>
      <div class="pi" data-pa="snap"><span class="pi-ic">${ICONS.camera}</span><div><div class="pi-t">Snap &amp; Learn</div><div class="pi-s">Capture &amp; explain current screen</div></div></div>`;
    if (isYouTube) html += `<div class="pi" data-pa="yt"><span class="pi-ic">${ICONS.youtube}</span><div><div class="pi-t">Sync YouTube Transcript</div><div class="pi-s">Extract &amp; save video knowledge</div></div></div>`;
    if (isGitHub)  html += `<div class="pi" data-pa="gh"><span class="pi-ic">${ICONS.github}</span><div><div class="pi-t">Load GitHub README</div><div class="pi-s">Fetch repo context into Brain</div></div></div>`;
    container.innerHTML = html;
  }

  async function _searchMems(query, container) {
    let token;
    try { ({ token } = await chrome.storage.local.get('token')); } catch { container.innerHTML='<div class="pe">Extension error</div>'; return; }
    if (!token) { container.innerHTML='<div class="pe">Login to search memories</div>'; return; }
    try {
      const res  = await fetch(`${API_BASE}/memory/search?query=${encodeURIComponent(query)}`, { headers:{'Authorization':`Bearer ${token}`} });
      const data = await res.json();
      const mems = data.memories || [];
      if (!mems.length) { container.innerHTML='<div class="pe">No memories found</div>'; return; }
      container.innerHTML = `<div class="psl">Memory Results (${mems.length})</div>` +
        mems.map(m => `<div class="pi" data-pa="load" data-text="${encodeURIComponent(m.content||'')}">
          <span class="pi-ic">${ICONS.bulb}</span>
          <div style="flex:1;min-width:0"><div class="pi-t" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc((m.content||'').substring(0,70))}…</div><div class="pi-s">${m.workspaceId||'General'}</div></div>
          ${m.score?`<span class="pi-sc">${Math.round(m.score*100)}%</span>`:''}
        </div>`).join('');
    } catch {
      container.innerHTML='<div class="pe">Search failed</div>';
    }
  }

  function _openPalette() {
    if (!paletteEl) _buildPalette();
    paletteEl.classList.add('open');
    paletteEl.querySelector('#__brain_pi')?.focus();
  }

  function _closePalette() {
    paletteEl?.classList.remove('open');
    const inp = paletteEl?.querySelector('#__brain_pi');
    if (inp) { inp.value=''; _buildDefaultResults(paletteEl.querySelector('#__brain_pr')); }
  }

  function _runPaletteAction(action) {
    _closePalette();
    if (action==='panel') sendMsg({ type:'TOOLBAR_ACTION', mode:'open_panel', text:'' });
    if (action==='snap')  sendMsg({ type:'SNAP_LEARN_REQUEST' });
    if (action==='yt')    _runYTSync();
    if (action==='gh')    _runGitHubAgent();
  }

  window.addEventListener('brain:open_palette', _openPalette);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key==='k' && !e.shiftKey) {
      const tag = document.activeElement?.tagName;
      if (tag==='INPUT'||tag==='TEXTAREA'||document.activeElement?.isContentEditable) return;
      e.preventDefault(); e.stopPropagation(); _openPalette();
    }
    if (e.key==='Escape') _closePalette();
  }, true);

  // ─────────────────────────────────────────────────────────────
  //  YOUTUBE SYNC — only shows if caption tracks are detected
  // ─────────────────────────────────────────────────────────────
  async function _runYTSync() {
    if (!isYouTube) return;
    showToast('Extracting transcript…', 'info');
    try {
      const video    = document.querySelector('video');
      const ts       = video ? Math.floor(video.currentTime) : 0;
      const title    = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer')?.textContent?.trim() || document.title;
      const tsStr    = `${Math.floor(ts/60)}:${String(ts%60).padStart(2,'0')}`;
      let   transcript = '';

      // Method 1: open transcript panel segments
      const segs = document.querySelectorAll('ytd-transcript-segment-renderer .segment-text');
      if (segs.length) { transcript = [...segs].map(s=>s.textContent.trim()).join(' '); }

      // Method 2: parse captionTracks from page scripts
      if (!transcript) {
        const scripts = [...document.querySelectorAll('script:not([src])')];
        for (const s of scripts) {
          const m = s.textContent.match(/"captionTracks"\s*:\s*(\[.*?\])/);
          if (!m) continue;
          try {
            const tracks = JSON.parse(m[1]);
            if (!tracks.length) break; // ← ROBUSTNESS: skip if no captions
            const en = tracks.find(t=>t.languageCode==='en'||t.languageCode==='en-US') || tracks[0];
            if (!en?.baseUrl) break;
            const xml = await fetch(en.baseUrl).then(r=>r.text());
            const doc = new DOMParser().parseFromString(xml,'text/xml');
            transcript = [...doc.querySelectorAll('text')].map(t=>t.textContent).join(' ');
          } catch { break; }
          break;
        }
      }

      if (!transcript) { showToast('No captions found — enable CC first', 'error'); return; }

      const clip    = transcript.substring(0, 2000);
      const payload = { title, videoUrl: location.href, timestamp: ts, timestampFormatted: tsStr, transcript: clip };
      sendMsg({ type:'YOUTUBE_TRANSCRIPT', data: payload });

      const ctx = `[YouTube: "${title}" at ${tsStr}]\n${clip}`;
      chrome.storage.local.set({ lastSelection: ctx }).catch(()=>{});
      sendMsg({ type:'TOOLBAR_ACTION', mode:'neural_link', text: ctx });
      showToast(`YouTube synced @ ${tsStr}`, 'success');
    } catch (err) { showToast(`YouTube sync failed: ${err.message}`, 'error'); }
  }

  // Auto-inject brain button into YouTube controls — only after caption detection
  if (isYouTube) {
    const ytInterval = setInterval(async () => {
      if (document.getElementById('__brain_yt_btn')) return;
      const controls = document.querySelector('.ytp-right-controls');
      if (!controls) return;

      // Check captions exist before showing button
      const hasCaptions = !!document.querySelector('script:not([src])')?.textContent?.includes('captionTracks');
      if (!hasCaptions) return;

      const btn = document.createElement('button');
      btn.id        = '__brain_yt_btn';
      btn.title     = 'Brain OS — Sync Transcript';
      btn.innerHTML = ICONS.brain;
      Object.assign(btn.style, {
        background:'none', border:'none', cursor:'pointer',
        padding:'0 6px', opacity:'0.75', lineHeight:'1',
        display:'flex', alignItems:'center', color:'white'
      });
      btn.onmouseenter = () => { btn.style.opacity='1'; };
      btn.onmouseleave = () => { btn.style.opacity='0.75'; };
      btn.onclick = _runYTSync;
      controls.prepend(btn);
    }, 2500);

    // Clean up after 30s
    setTimeout(() => clearInterval(ytInterval), 30000);
  }

  // ─────────────────────────────────────────────────────────────
  //  GITHUB AGENT — resilient multi-selector README fetch
  // ─────────────────────────────────────────────────────────────
  async function _runGitHubAgent() {
    if (!isGitHub) return;
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)/);
    if (!m) { showToast('Open a GitHub repository page', 'error'); return; }

    const [, owner, repo] = m;
    showToast(`Fetching ${owner}/${repo}…`, 'info');

    try {
      // Method 1: GitHub API (auth-free, 60 req/hr)
      const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: { 'Accept': 'application/vnd.github.v3.raw' }
      });

      let readme = '';
      if (apiRes.ok) {
        readme = await apiRes.text();
      } else {
        // Method 2: Try reading from already-rendered DOM
        // GitHub renders README in multiple possible selectors
        const readmeSel = [
          'article.markdown-body',
          '[data-testid="readme-container"] .markdown-body',
          '#readme .markdown-body',
          '.repository-content .markdown-body',
          'div[itemprop="text"]'
        ];
        for (const sel of readmeSel) {
          const el = document.querySelector(sel);
          if (el?.textContent?.length > 100) { readme = el.textContent.trim().substring(0, 4000); break; }
        }
        if (!readme) throw new Error('README not found');
      }

      const ctx = `[GitHub: ${owner}/${repo}]\n\nREADME:\n${readme.substring(0, 3000)}`;
      chrome.storage.local.set({ lastSelection: ctx }).catch(()=>{});
      sendMsg({ type:'TOOLBAR_ACTION', mode:'neural_link', text: ctx });
      showToast(`${owner}/${repo} loaded into Brain`, 'success');

    } catch (err) { showToast(`GitHub: ${err.message}`, 'error'); }
  }

  // ─────────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

})();