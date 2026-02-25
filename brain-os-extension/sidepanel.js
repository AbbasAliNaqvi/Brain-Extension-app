const responseBox = document.getElementById('ai-response');
const loader = document.getElementById('loader');
const preview = document.getElementById('selected-text-preview');
let currentSelection = "";

chrome.storage.local.get(['lastSelection'], (data) => {
    if (data.lastSelection) {
        updateSelectionUI(data.lastSelection);
    }
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastSelection) {
        updateSelectionUI(changes.lastSelection.newValue);
    }
});

function updateSelectionUI(text) {
    currentSelection = text;
    preview.innerText = `"${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`;
    responseBox.style.display = "none";
}

async function runAI(mode) {
    if (!currentSelection) return alert("Please highlight text on the page first!");
    
    loader.style.display = "block";
    responseBox.style.display = "none";

    const { token } = await chrome.storage.local.get(['token']);
    if (!token) return alert("Please Login in the extension popup first.");

    const url = mode === 'study' 
        ? "https://brain-extension-exng.onrender.com/memory" 
        : "https://brain-extension-exng.onrender.com/brain/coAsk";

    const body = mode === 'study' 
        ? { text: currentSelection, type: "answer", workspaceId: "General" }
        : { text: currentSelection, mode: mode };

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        loader.style.display = "none";
        responseBox.style.display = "block";
        
        const aiText = data.response || data.answer || data.message || "Processed successfully.";
        
        responseBox.innerHTML = `
            <div style="font-weight:800; color:#059669; margin-bottom:12px; font-size:12px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; letter-spacing:0.5px;">
                BRAIN OS INTELLIGENCE
            </div>
            <div style="color:#1E293B; font-size:14px; line-height:1.6;">
                ${aiText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b style="color:#059669">$1</b>')}
            </div>
        `;
    } catch (e) {
        loader.style.display = "none";
        alert("API Error: Backend connection failed.");
    }
}

document.getElementById('btn-analogy').onclick = () => runAI('desi_analogy');
document.getElementById('btn-rag').onclick = () => runAI('neural_link');
document.getElementById('btn-save').onclick = () => runAI('study');