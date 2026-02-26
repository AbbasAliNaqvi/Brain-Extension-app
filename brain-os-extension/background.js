const API_BASE = "https://brain-extension-exng.onrender.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const C = (id, title, parentId, type) => {
      chrome.contextMenus.create({ id, title, parentId, type, contexts: ["selection"] });
    };
    C("brain-root", "Brain OS", null);
    C("brain-desi", "Desi Analogy", "brain-root");
    C("brain-eli5", "ELI5", "brain-root");
    C("brain-neural", "Neural Link", "brain-root");
    C("brain-roast", "Roast Code", "brain-root");
    C("brain-arch", "Arch Diagram", "brain-root");
    C("brain-translate", "Magic Translate", "brain-root");
    C("brain-snap", "Snap & Learn", "brain-root");
    C("brain-save", "Save to Brain", "brain-root");
  });
  _initBadge();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const skip = ["brain-save", "brain-translate", "brain-snap"];
  // SAFETY: Check if tab and windowId exist
  if (!skip.includes(info.menuItemId) && tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  (async () => {
    if (info.menuItemId === "brain-snap") {
      await _handleSnapLearn(tab);
      return;
    }
    const modeMap = {
      "brain-desi": "desi_analogy",
      "brain-eli5": "eli5",
      "brain-neural": "neural_link",
      "brain-roast": "roast_code",
      "brain-arch": "arch_diagram",
      "brain-translate": "magic_translate",
      "brain-save": "save",
    };
    const mode = modeMap[info.menuItemId];
    
    if (mode === "magic_translate" && tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t) => window.dispatchEvent(new CustomEvent("brain:magic_translate", { detail: { text: t } })),
        args: [info.selectionText],
      }).catch(() => {});
    } else if (mode === "save" && tab && tab.id) {
      _quickSave(info.selectionText, tab.id);
    } else if (mode) {
      await chrome.storage.local.set({ lastSelection: info.selectionText, pendingMode: mode });
    }
  })();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-sidepanel" && tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (command === "open-command-palette" && tab && tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.dispatchEvent(new CustomEvent("brain:open_palette"))
    }).catch(() => {});
    return;
  }
  if (command === "quick-save" && tab && tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() || ""
    }).then(([r]) => {
      const text = r?.result;
      if (text?.length > 3) {
        chrome.storage.local.set({ lastSelection: text });
        _quickSave(text, tab.id);
      }
    }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const winId = sender.tab?.windowId;
  switch (msg.type) {
    case "TOOLBAR_ACTION":
      // SAFETY: Only open sidepanel if winId is available
      if (!["save", "magic_translate", "snap"].includes(msg.mode) && winId) {
        chrome.sidePanel.open({ windowId: winId });
      }
      (async () => {
        if (msg.mode === "snap") {
          if (winId) chrome.sidePanel.open({ windowId: winId });
          await _handleSnapLearn(sender.tab);
        } else if (msg.mode === "save") {
          await _quickSave(msg.text, sender.tab?.id);
        } else if (msg.mode !== "magic_translate") {
          await chrome.storage.local.set({ lastSelection: msg.text, pendingMode: msg.mode });
        }
        sendResponse({ ok: true });
      })();
      return true;
      
    case "SNAP_LEARN_REQUEST":
      if (winId) {
        chrome.sidePanel.open({ windowId: winId });
        _handleSnapLearn(sender.tab).then(() => sendResponse({ ok: true }));
      } else {
        sendResponse({ ok: false, error: "No window ID found" });
      }
      return true;
      
    case "MEMORY_SAVED":
      chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
        const n = todaySaves + 1;
        chrome.storage.local.set({ todaySaves: n });
        _updateBadge(n);
        _updateStreak();
      });
      sendResponse({ ok: true });
      break;
      
    case "YOUTUBE_TRANSCRIPT":
      chrome.storage.local.set({ youtubeContext: msg.data });
      sendResponse({ ok: true });
      break;
      
    case "GET_BADGE_STATS":
      chrome.storage.local.get(["todaySaves", "streak"], (data) => {
        sendResponse({ todaySaves: data.todaySaves || 0, streak: data.streak || 0 });
      });
      return true;
  }
});

async function _handleSnapLearn(tab) {
  if (!tab || !tab.windowId) return;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 90 });
    await chrome.storage.local.set({ snapLearnImage: dataUrl, pendingMode: "snap_learn" });
  } catch (err) {
    console.warn("[Brain OS] Snap capture failed:", err.message);
  }
}

async function _quickSave(text, tabId) {
  const { token, workspaceId = "General" } = await chrome.storage.local.get(["token", "workspaceId"]);
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, type: "answer", workspaceId }),
    });
    if (!res.ok) return;
    chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
      const n = todaySaves + 1;
      chrome.storage.local.set({ todaySaves: n });
      _updateBadge(n);
      _updateStreak();
    });
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: (t) => window.dispatchEvent(new CustomEvent("brain:show_toast", { detail: { msg: "Saved to Brain", type: "success" } })),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Brain OS] Quick save error:", err.message);
  }
}

async function _initBadge() {
  const { todaySaves = 0 } = await chrome.storage.local.get("todaySaves");
  _updateBadge(todaySaves);
}

function _updateBadge(n) {
  chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
}

async function _updateStreak() {
  const today = new Date().toDateString();
  const { streak = 0, lastActiveDate } = await chrome.storage.local.get(["streak", "lastActiveDate"]);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const newStreak = lastActiveDate === yesterday.toDateString() ? streak + 1 : lastActiveDate === today ? streak : 1;
  chrome.storage.local.set({ streak: newStreak, lastActiveDate: today });
}

chrome.alarms.create("daily-reset", { when: _nextMidnight(), periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "daily-reset") {
    chrome.storage.local.set({ todaySaves: 0 });
    _updateBadge(0);
  }
});

function _nextMidnight() {
  const m = new Date(); m.setHours(24, 0, 0, 0); return m.getTime();
}