const API_BASE = "http://localhost:5050";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const C = (id, title, parentId) => chrome.contextMenus.create({ id, title, parentId, contexts: ["selection"] });
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
  if (!skip.includes(info.menuItemId) && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  (async () => {
    if (info.menuItemId === "brain-snap") { await _handleSnapLearn(tab); return; }
    const modeMap = { "brain-desi": "desi_analogy", "brain-eli5": "eli5", "brain-neural": "neural_link", "brain-roast": "roast_code", "brain-arch": "arch_diagram", "brain-translate": "magic_translate", "brain-save": "save" };
    const mode = modeMap[info.menuItemId];
    if (mode === "magic_translate" && tab?.id) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (t) => window.dispatchEvent(new CustomEvent("brain:magic_translate", { detail: { text: t } })), args: [info.selectionText] }).catch(() => {});
    } else if (mode === "save" && tab?.id) {
      _quickSave(info.selectionText, tab.id);
    } else if (mode) {
      await chrome.storage.local.set({ lastSelection: info.selectionText, pendingMode: mode });
    }
  })();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-sidepanel" && tab?.windowId) { chrome.sidePanel.open({ windowId: tab.windowId }); return; }
  if (command === "open-command-palette" && tab?.id) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.dispatchEvent(new CustomEvent("brain:open_palette")) }).catch(() => {});
    return;
  }
  if (command === "quick-save" && tab?.id) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString()?.trim() || "" })
      .then(([r]) => { const text = r?.result; if (text?.length > 3) { chrome.storage.local.set({ lastSelection: text }); _quickSave(text, tab.id); } }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const winId = sender.tab?.windowId;

  if (msg.type === "TOOLBAR_ACTION") {
    if (!["save", "magic_translate", "snap"].includes(msg.mode) && winId) chrome.sidePanel.open({ windowId: winId });
    (async () => {
      if (msg.mode === "snap") { if (winId) chrome.sidePanel.open({ windowId: winId }); await _handleSnapLearn(sender.tab); }
      else if (msg.mode === "save") { await _quickSave(msg.text, sender.tab?.id); }
      else if (msg.mode !== "magic_translate") { await chrome.storage.local.set({ lastSelection: msg.text, pendingMode: msg.mode }); }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "SNAP_LEARN_REQUEST") {
    if (winId) {
      chrome.sidePanel.open({ windowId: winId });
      _handleSnapLearn(sender.tab).then(() => sendResponse({ ok: true }));
    } else { sendResponse({ ok: false, error: "No window ID" }); }
    return true;
  }

  if (msg.type === "MEMORY_SAVED") {
    chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
      const n = todaySaves + 1;
      chrome.storage.local.set({ todaySaves: n });
      _updateBadge(n);
      _updateStreak();
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "YOUTUBE_TRANSCRIPT") {
    chrome.storage.local.set({ youtubeContext: msg.data });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "GET_BADGE_STATS") {
    chrome.storage.local.get(["todaySaves", "streak"], (data) => sendResponse({ todaySaves: data.todaySaves || 0, streak: data.streak || 0 }));
    return true;
  }

  if (msg.type === "AGENT_EXECUTE") {
    _executeAgentWorkflow(msg.actions, msg.goal, sender.tab);
    sendResponse({ ok: true, queued: true });
    return true;
  }

  if (msg.type === "AGENT_STEP_RESULT") {
    sendResponse({ ok: true });
    return;
  }
});

async function _executeAgentWorkflow(actions, goal, senderTab) {
  let stepsDone = 0;
  let activeTabId = senderTab?.id;
  let activeWindowId = senderTab?.windowId;

  const _broadcast = (type, payload) => {
    chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
  };

  const _log = (status, message) => {
    _broadcast("AGENT_PROGRESS", { log: { status, message } });
  };

  const _getActiveTab = async () => {
    try {
      if (activeTabId) {
        const tab = await chrome.tabs.get(activeTabId);
        if (tab && !tab.url?.startsWith("chrome://")) return tab;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch { return null; }
  };

  const _waitForTabLoad = (tabId) => new Promise((resolve) => {
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") { resolve(); return; }
      } catch {}
      setTimeout(check, 300);
    };
    check();
    setTimeout(resolve, 8000);
  });

  const _sendToContent = (tabId, action) => new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "AGENT_ACTION", action }, (response) => {
      if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
      resolve(response || { ok: false, error: "No response" });
    });
    setTimeout(() => resolve({ ok: false, error: "Timeout" }), 8000);
  });

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const stepLabel = `Step ${i + 1}/${actions.length}`;

    try {
      if (action.type === "navigate") {
        _log("running", `${stepLabel}: Navigating to ${action.url}`);
        if (!activeTabId) {
          const newTab = await chrome.tabs.create({ url: action.url, active: true });
          activeTabId = newTab.id;
          activeWindowId = newTab.windowId;
        } else {
          await chrome.tabs.update(activeTabId, { url: action.url });
        }
        await _waitForTabLoad(activeTabId);
        await _sleep(800);
        _log("success", `${stepLabel}: Navigated to ${action.url}`);

      } else if (action.type === "wait") {
        const ms = Math.min(action.ms || 1000, 5000);
        _log("running", `${stepLabel}: Waiting ${ms}ms…`);
        await _sleep(ms);
        _log("success", `${stepLabel}: Done waiting`);

      } else if (action.type === "click" || action.type === "type") {
        const tab = await _getActiveTab();
        if (!tab) throw new Error("No active tab found");
        activeTabId = tab.id;

        await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: [],
        }).catch(() => {});

        const verb = action.type === "click" ? "Clicking" : `Typing "${action.value || ""}"`;
        _log("running", `${stepLabel}: ${verb} on "${action.selector}"`);

        const result = await _sendToContent(activeTabId, action);
        if (!result.ok) {
          _log("error", `${stepLabel}: ${result.error || "Element not found"} — skipping`);
        } else {
          _log("success", `${stepLabel}: ${action.type === "click" ? "Clicked" : "Typed"} successfully`);
          await _sleep(300);
        }

      } else if (action.type === "scroll") {
        const tab = await _getActiveTab();
        if (tab) {
          activeTabId = tab.id;
          await _sendToContent(activeTabId, action);
          _log("success", `${stepLabel}: Scrolled`);
        }

      } else if (action.type === "read") {
        const tab = await _getActiveTab();
        if (tab) {
          activeTabId = tab.id;
          const result = await _sendToContent(activeTabId, action);
          if (result.ok) {
            _log("success", `${stepLabel}: Read ${result.content ? result.content.length : 0} characters from page`);
          } else {
            _log("error", `${stepLabel}: Failed to read page`);
          }
        }

      } else {
        _log("success", `${stepLabel}: Unknown action "${action.type}" — skipped`);
      }

      stepsDone++;

    } catch (err) {
      _log("error", `${stepLabel}: ${err.message}`);
      if (action.critical) {
        _broadcast("AGENT_ERROR", { message: `Critical step failed: ${err.message}` });
        return;
      }
    }
  }

  _broadcast("AGENT_DONE", { stepsDone, goal });
}

async function _handleSnapLearn(tab) {
  if (!tab?.windowId) return;
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
        func: () => window.dispatchEvent(new CustomEvent("brain:show_toast", { detail: { msg: "Saved to Brain", type: "success" } })),
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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const newStreak = lastActiveDate === yesterday.toDateString() ? streak + 1 : lastActiveDate === today ? streak : 1;
  chrome.storage.local.set({ streak: newStreak, lastActiveDate: today });
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

chrome.alarms.create("daily-reset", { when: _nextMidnight(), periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "daily-reset") { chrome.storage.local.set({ todaySaves: 0 }); _updateBadge(0); }
});

function _nextMidnight() {
  const m = new Date();
  m.setHours(24, 0, 0, 0);
  return m.getTime();
}