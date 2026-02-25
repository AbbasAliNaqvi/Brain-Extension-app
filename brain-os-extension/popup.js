const API_BASE = "https://brain-extension-exng.onrender.com";
let currentFlashcards = [];

(function initApp() {
    const authView = document.getElementById('auth-view');
    const appWrapper = document.getElementById('app-wrapper');
    const errorMsg = document.getElementById('error-msg');
    
    chrome.storage.local.get(['token', 'workspaceId', 'targetLanguage'], (data) => {
        if (data.token) {
            if (authView) authView.classList.remove('active');
            if (appWrapper) appWrapper.style.display = 'flex';
            if (document.getElementById('workspaceId') && data.workspaceId) document.getElementById('workspaceId').value = data.workspaceId;
            if (document.getElementById('targetLanguage') && data.targetLanguage) document.getElementById('targetLanguage').value = data.targetLanguage;
        }
    });

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = async (e) => {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            loginBtn.disabled = true; loginBtn.textContent = "Authenticating...";

            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || "Invalid credentials");

                chrome.storage.local.set({ token: data.accessToken }, () => {
                    authView.classList.remove('active');
                    appWrapper.style.display = 'flex';
                });
            } catch (err) {
                if (errorMsg) errorMsg.textContent = err.message;
            } finally {
                loginBtn.disabled = false; loginBtn.textContent = "Connect Account";
            }
        };
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            chrome.storage.local.remove('token', () => {
                appWrapper.style.display = 'none';
                authView.classList.add('active');
            });
        };
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.container .view').forEach(v => { v.classList.remove('active'); v.style.animation = 'none'; });
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if (targetView) { targetView.classList.add('active'); void targetView.offsetWidth; targetView.style.animation = 'fadeIn 0.3s ease'; }
            if (targetId === 'view-review') fetchFlashcards();
        };
    });

    const sendNoteBtn = document.getElementById('sendNoteBtn');
    if (sendNoteBtn) {
        sendNoteBtn.onclick = async (e) => {
            const noteInput = document.getElementById('quickNote');
            let text = noteInput.value.trim();
            if (!text) return;
            sendNoteBtn.disabled = true; sendNoteBtn.textContent = "Processing...";

            chrome.storage.local.get(['token'], async (data) => {
                try {
                    const workspace = document.getElementById('workspaceId') ? document.getElementById('workspaceId').value : "General";
                    const res = await fetch(`${API_BASE}/memory`, {
                        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${data.token}` },
                        body: JSON.stringify({ text: text, type: "answer", workspaceId: workspace })
                    });
                    const responseData = await res.json();
                    if (!res.ok || responseData.status === "ERROR") throw new Error(responseData.message || "Server Error");

                    noteInput.value = '';
                    chrome.storage.local.set({ workspaceId: workspace });
                    sendNoteBtn.textContent = "Saved ✓";
                    setTimeout(() => sendNoteBtn.textContent = "Save to Vector DB", 2000);
                } catch (err) {
                    alert(`API Error: ${err.message}`);
                    sendNoteBtn.textContent = "Save to Vector DB";
                } finally { sendNoteBtn.disabled = false; }
            });
        };
    }

    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    async function executeSearch() {
        if (!searchInput) return;
        const query = searchInput.value.trim();
        if (!query) return;

        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#64748B;">Searching Memory Graph...</div>`;

        chrome.storage.local.get(['token'], async (data) => {
            try {
                const res = await fetch(`${API_BASE}/memory/search?query=${encodeURIComponent(query)}`, { headers: { "Authorization": `Bearer ${data.token}` } });
                const responseData = await res.json();
                if (!res.ok || responseData.status === "ERROR") throw new Error(responseData.message || "Query failed");
                if (!responseData.memories || responseData.memories.length === 0) {
                    resultsContainer.innerHTML = "<div style='padding:16px; background:#FFFFFF; border-radius:8px; border:1px solid #E2E8F0; text-align:center; color:#64748B; font-size:13px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);'>No relevant memories found.</div>";
                    return;
                }
                // Updated HTML injection for Light Theme
                resultsContainer.innerHTML = responseData.memories.map(m => `<div style='padding:16px; background:#FFFFFF; border-radius:12px; border:1px solid #E2E8F0; margin-bottom:12px; font-size:13.5px; line-height:1.6; color:#1E293B; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);'>${m.content}</div>`).join('');
            } catch (err) { resultsContainer.innerHTML = `<div style='padding:15px; background:#FEF2F2; border-radius:8px; border:1px solid #F87171; color:#EF4444; font-size:13px;'>Error: ${err.message}</div>`; }
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.onclick = executeSearch;
        searchInput.onkeypress = (e) => { if (e.key === 'Enter') executeSearch(); };
    }

    async function fetchFlashcards() {
        const statusDiv = document.getElementById('review-status');
        const container = document.getElementById('flashcard-container');
        if (!statusDiv || !container) return;
        container.style.display = 'none'; statusDiv.innerHTML = `Fetching spaced-repetition queue...`;

        chrome.storage.local.get(['token', 'workspaceId'], async (data) => {
            try {
                const workspace = data.workspaceId || 'General';
                const res = await fetch(`${API_BASE}/memory/review?workspaceId=${workspace}`, { headers: { "Authorization": `Bearer ${data.token}` } });
                const resData = await res.json();
                if (!res.ok || resData.status === "ERROR") throw new Error(resData.message);
                currentFlashcards = resData.flashcards || [];
                renderNextFlashcard();
            } catch (err) { statusDiv.innerHTML = `<span style="color:#EF4444">Error: ${err.message}</span>`; }
        });
    }

    function renderNextFlashcard() {
        const statusDiv = document.getElementById('review-status');
        const container = document.getElementById('flashcard-container');
        const contentDiv = document.getElementById('flashcard-content');
        if (!statusDiv || !container || !contentDiv) return;

        if (currentFlashcards.length === 0) {
            container.style.display = 'none';
            statusDiv.innerHTML = "You are fully optimized for today! 🎉<br><span style='font-size:11px; color:#94A3B8; font-weight:normal; display:block; margin-top:4px;'>No pending reviews in this workspace.</span>";
            return;
        }
        statusDiv.textContent = `${currentFlashcards.length} cognitive tasks remaining.`;
        container.style.display = 'block'; contentDiv.textContent = currentFlashcards[0].content;
    }

    const scoreButtons = document.querySelectorAll('.score-btn');
    if (scoreButtons.length > 0) {
        scoreButtons.forEach(btn => {
            btn.onclick = async (e) => {
                if (currentFlashcards.length === 0) return;
                const score = parseInt(e.target.getAttribute('data-score'));
                const currentCard = currentFlashcards[0];
                currentFlashcards.shift(); renderNextFlashcard();
                chrome.storage.local.get(['token'], async (data) => {
                    try { await fetch(`${API_BASE}/memory/review`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${data.token}` }, body: JSON.stringify({ memoryId: currentCard._id, score: score }) }); } catch (err) {}
                });
            };
        });
    }
})();