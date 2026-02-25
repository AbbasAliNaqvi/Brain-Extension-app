document.addEventListener('mouseup', () => {
    const text = window.getSelection().toString().trim();
    if (text.length > 5) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            chrome.storage.local.set({ lastSelection: text }).catch((err) => {
                console.warn("Brain OS: Storage sync failed (context likely lost).");
            });
        } else {
            console.warn("Brain OS: Extension reloaded. Please refresh this page (Cmd+R/Ctrl+R) to use the Copilot.");
        }
    }
});