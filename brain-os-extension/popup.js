const API_BASE = 'https://brain-extension-exng.onrender.com';
const $ = id => document.getElementById(id);

let token       = null;
let flashcards  = [];

;(async function init() {

  $('auth-screen').style.display = 'none';
  $('app-wrap').style.display    = 'none';

  const data = await chrome.storage.local.get([
    'token', 'workspaceId', 'targetLanguage', 'todaySaves', 'streak'
  ]);

  if (!data.token) {
    showAuth();
    return;
  }

  token = data.token;
  showApp(data);
  loadStats();
})();

function showAuth() {
  $('auth-screen').style.display = 'flex';
  $('app-wrap').style.display    = 'none';
}

function showApp(data = {}) {
  $('auth-screen').style.display = 'none';
  $('app-wrap').style.display    = 'flex';

  $('st-today').textContent  = data.todaySaves || 0;
  $('st-streak').textContent = data.streak     || 0;

  if (data.workspaceId && $('ws-input-popup')) $('ws-input-popup').value = data.workspaceId;
  if (data.targetLanguage) {
    const ls = $('lang-popup');
    const lt = $('lang-setting');
    if (ls) ls.value = data.targetLanguage;
    if (lt) lt.value = data.targetLanguage;
  }
  loadMe();
}
$('login-btn').addEventListener('click', async () => {
  const email    = $('email').value.trim();
  const password = $('password').value;
  const btn      = $('login-btn');
  const errEl    = $('auth-err');

  if (!email || !password) { errEl.textContent = 'Email and password required.'; return; }

  btn.disabled   = true;
  btn.innerHTML  = '<span class="spin"></span>Authenticating…';
  errEl.textContent = '';

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid credentials');

    token = data.accessToken || data.token;
    await chrome.storage.local.set({ token });

    showApp({});
    loadStats();

  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Connect to Brain OS';
  }
});

$('logout-btn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token']);
  token = null;
  flashcards = [];
  showAuth();
});

async function loadMe() {
  try {
    const res  = await fetch(`${API_BASE}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const name = data.user?.name || data.user?.email || '';
    $('user-email').textContent = name;
  } catch { /* non-critical */ }
}

async function loadStats() {
  try {
    const res  = await fetch(`${API_BASE}/brain/stats`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    if (data.healthScore !== undefined) $('st-health').textContent = `${data.healthScore}%`;
    if (data.streak      !== undefined) { $('st-streak').textContent = data.streak; chrome.storage.local.set({ streak: data.streak }); }
    if (data.todaySaves  !== undefined) $('st-today').textContent = data.todaySaves;
  } catch { /* non-critical */ }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${tab}`)?.classList.add('active');
    if (tab === 'train') loadFlashcards();
  });
});

$('ingest-btn').addEventListener('click', async () => {
  const text = $('ingest-text').value.trim();
  if (!text) return;

  const btn = $('ingest-btn');
  const ok  = $('ingest-ok');
  const ws  = $('ws-input-popup').value.trim() || 'General';
  const lang= $('lang-popup').value;

  btn.disabled   = true;
  btn.innerHTML  = '<span class="spin"></span>Processing…';
  ok.classList.add('hidden');

  try {
    const res  = await fetch(`${API_BASE}/memory`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ text, type: 'answer', workspaceId: ws })
    });
    const data = await res.json();
    if (!res.ok || data.status === 'ERROR') throw new Error(data.message || 'Save failed');

    addWorkspaceOption(ws);
    chrome.storage.local.set({ workspaceId: ws, targetLanguage: lang });
    chrome.runtime.sendMessage({ type: 'MEMORY_SAVED' });

    $('ingest-text').value = '';
    ok.classList.remove('hidden');
    setTimeout(() => ok.classList.add('hidden'), 3000);

    const { todaySaves = 0 } = await chrome.storage.local.get('todaySaves');
    $('st-today').textContent = todaySaves;

  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save to Vector DB';
  }
});

function addWorkspaceOption(ws) {
  const dl = $('ws-list-popup');
  if (!dl) return;
  const exists = [...dl.options].some(o => o.value === ws);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = ws;
    dl.appendChild(opt);
  }
}

async function runSearch() {
  const query = $('search-input').value.trim();
  if (!query) return;

  const results = $('search-results');
  results.innerHTML = '<div class="empty-state"><span class="spin"></span> Searching memory vectors…</div>';

  try {
    const res  = await fetch(`${API_BASE}/memory/search?query=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.status === 'ERROR') throw new Error(data.message);

    if (!data.memories?.length) {
      results.innerHTML = '<div class="empty-state">No memories found for this query.</div>';
      return;
    }

    results.innerHTML = '';
    data.memories.forEach((m, i) => {
      const score = m.score ? Math.round(m.score * 100) : null;
      const div   = document.createElement('div');
      div.className = 'res-card';
      div.style.animationDelay = `${i * 0.04}s`;
      div.innerHTML = `${score ? `<span class="res-score">${score}%</span>` : ''}${esc((m.content || '').substring(0, 200))}${(m.content?.length || 0) > 200 ? '…' : ''}`;
      results.appendChild(div);
    });

  } catch (err) {
    results.innerHTML = `<div class="empty-state" style="color:#fca5a5">Error: ${err.message}</div>`;
  }
}

$('search-btn').addEventListener('click', runSearch);
$('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

async function loadFlashcards() {
  const statusEl = $('train-status');
  const section  = $('fc-section');
  const ws       = $('ws-input-popup').value || 'General';

  section.classList.add('hidden');
  statusEl.textContent = 'Fetching review queue…';

  try {
    const res  = await fetch(`${API_BASE}/memory/review?workspaceId=${encodeURIComponent(ws)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.status === 'ERROR') throw new Error(data.message);

    flashcards = data.flashcards || [];
    renderCard();

  } catch (err) {
    statusEl.innerHTML = `<span style="color:#fca5a5">Error: ${err.message}</span>`;
  }
}

function renderCard() {
  const statusEl = $('train-status');
  const section  = $('fc-section');
  const cardEl   = $('fc-text');

  if (!flashcards.length) {
    section.classList.add('hidden');
    statusEl.innerHTML = '<div class="no-reviews">🎉 All caught up!<br><span style="font-size:11px;color:var(--f);display:block;margin-top:6px">No pending reviews. Come back tomorrow.</span></div>';
    return;
  }

  statusEl.textContent = `${flashcards.length} card${flashcards.length > 1 ? 's' : ''} remaining`;
  cardEl.textContent   = flashcards[0].content;
  section.classList.remove('hidden');
}

document.querySelectorAll('.score-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!flashcards.length) return;
    const score = parseInt(btn.dataset.score, 10);
    const card  = flashcards.shift();
    renderCard();

    fetch(`${API_BASE}/memory/review`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ memoryId: card._id, score })
    }).catch(() => {});
  });
});

$('lang-setting').addEventListener('change', () => {
  chrome.storage.local.set({ targetLanguage: $('lang-setting').value });
  const lp = $('lang-popup');
  if (lp) lp.value = $('lang-setting').value;
});

$('gh-toggle').addEventListener('change', e => chrome.storage.local.set({ githubAgent: e.target.checked }));
$('yt-toggle').addEventListener('change', e => chrome.storage.local.set({ youtubeSync: e.target.checked }));

chrome.storage.local.get(['githubAgent', 'youtubeSync'], data => {
  if ($('gh-toggle')) $('gh-toggle').checked = data.githubAgent !== false;
  if ($('yt-toggle')) $('yt-toggle').checked = data.youtubeSync !== false;
});

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}