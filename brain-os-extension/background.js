chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "openBrainSidePanel",
        title: "Analyze with Brain Extension",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "openBrainSidePanel") {
        chrome.storage.local.set({ lastSelection: info.selectionText }, () => {
            chrome.sidePanel.open({ windowId: tab.windowId });
        });
    }
});