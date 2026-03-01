const API_BASE = "http://localhost:5050";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const C = (id, title, parentId) =>
      chrome.contextMenus.create({
        id,
        title,
        parentId,
        contexts: ["selection"],
      });
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
  if (!skip.includes(info.menuItemId) && tab?.windowId)
    chrome.sidePanel.open({ windowId: tab.windowId });
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
    if (mode === "magic_translate" && tab?.id) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: (t) =>
            window.dispatchEvent(
              new CustomEvent("brain:magic_translate", {
                detail: { text: t, language: "Hindi" },
              }),
            ),
          args: [info.selectionText],
        })
        .catch(() => {});
    } else if (mode === "save" && tab?.id) {
      _quickSave(info.selectionText, tab.id);
    } else if (mode) {
      await chrome.storage.local.set({
        lastSelection: info.selectionText,
        pendingMode: mode,
      });
    }
  })();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-sidepanel" && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  } else if (command === "open-command-palette" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "OPEN_PALETTE" }).catch(() => {});
  } else if (command === "quick-save" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "QUICK_SAVE" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const winId = sender.tab?.windowId;

  if (msg.type === "TOOLBAR_ACTION") {
    if (!["save", "magic_translate", "snap"].includes(msg.mode) && winId)
      chrome.sidePanel.open({ windowId: winId });
    (async () => {
      if (msg.mode === "open_panel" && winId) {
        chrome.sidePanel.open({ windowId: winId });
      } else if (msg.mode === "snap") {
        if (winId) chrome.sidePanel.open({ windowId: winId });
        await _handleSnapLearn(sender.tab);
      } else if (msg.mode === "save") {
        await _quickSave(msg.text, sender.tab?.id);
      } else if (msg.mode !== "magic_translate") {
        await chrome.storage.local.set({
          lastSelection: msg.text,
          pendingMode: msg.mode,
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "SNAP_LEARN_REQUEST") {
    if (winId) {
      chrome.sidePanel.open({ windowId: winId });
      _handleSnapLearn(sender.tab).then(() => sendResponse({ ok: true }));
    } else sendResponse({ ok: false });
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
    chrome.storage.local.get(["todaySaves", "streak"], (d) =>
      sendResponse({ todaySaves: d.todaySaves || 0, streak: d.streak || 0 }),
    );
    return true;
  }

  if (msg.type === "GET_ALL_TABS") {
    chrome.tabs.query({}, (tabs) => {
      const cleaned = tabs
        .filter(
          (t) =>
            t.url &&
            !t.url.startsWith("chrome://") &&
            !t.url.startsWith("chrome-extension://") &&
            !t.url.startsWith("about:"),
        )
        .map((t) => ({ id: t.id, url: t.url, title: t.title || "Untitled" }))
        .slice(0, 60);
      sendResponse({ ok: true, tabs: cleaned });
    });
    return true;
  }

  if (msg.type === "FOCUS_TAB") {
    chrome.tabs.get(msg.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.update(msg.tabId, { active: true }, () => {
        if (tab.windowId)
          chrome.windows.update(tab.windowId, { focused: true });
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "CLUSTER_TABS") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const cleanTabs = tabs
          .filter(
            (t) =>
              t.url &&
              !t.url.startsWith("chrome://") &&
              !t.url.startsWith("chrome-extension://") &&
              !t.url.startsWith("about:"),
          )
          .map((t) => ({ id: t.id, title: t.title, url: t.url }));
        const { token } = await chrome.storage.local.get("token");
        const apiRes = await fetch(`${API_BASE}/agent/cluster-tabs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tabs: cleanTabs }),
        });
        const data = await apiRes.json();
        sendResponse({ status: "OK", clusters: data.clusters });
      } catch (e) {
        sendResponse({ status: "ERROR", message: e.message });
      }
    })();
    return true;
  }

  if (msg.type === "GROUP_TABS") {
    chrome.tabs
      .group({ tabIds: msg.tabIds })
      .then((groupId) => {
        chrome.tabGroups.update(groupId, {
          title: msg.title,
          color: msg.color,
        });
        chrome.tabs.update(msg.tabIds[0], { active: true });
        sendResponse({ ok: true });
      })
      .catch((e) => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "AGENT_EXECUTE") {
    _executeAgentWorkflow(msg.actions, msg.goal, sender.tab);
    sendResponse({ ok: true });
    return true;
  }
});

async function _executeAgentWorkflow(actions, goal, senderTab) {
  let stepsDone = 0,
    activeTabId = senderTab?.id;
  const _broadcast = (type, payload) =>
    chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
  const _log = (status, message) =>
    _broadcast("AGENT_PROGRESS", { log: { status, message } });
  const _getActiveTab = async () => {
    try {
      if (activeTabId) {
        const tab = await chrome.tabs.get(activeTabId);
        if (tab && !tab.url?.startsWith("chrome://")) return tab;
      }
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab;
    } catch {
      return null;
    }
  };
  const _waitForTabLoad = (tabId) =>
    new Promise((resolve) => {
      const check = async () => {
        try {
          const t = await chrome.tabs.get(tabId);
          if (t.status === "complete") {
            resolve();
            return;
          }
        } catch {}
        setTimeout(check, 300);
      };
      check();
      setTimeout(resolve, 10000);
    });
  const _sendToContent = (tabId, action) =>
    new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "AGENT_ACTION", action },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: "No response" });
        },
      );
      setTimeout(() => resolve({ ok: false, error: "Timeout" }), 9000);
    });

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i],
      label = `Step ${i + 1}/${actions.length}`;
    try {
      if (action.type === "navigate") {
        _log("running", `${label}: Navigating to ${action.url}`);
        if (!activeTabId) {
          const t = await chrome.tabs.create({ url: action.url, active: true });
          activeTabId = t.id;
        } else await chrome.tabs.update(activeTabId, { url: action.url });
        await _waitForTabLoad(activeTabId);
        await _sleep(1200);
        _log("success", `${label}: Navigated`);
      } else if (action.type === "wait") {
        const ms = Math.min(action.ms || 1000, 5000);
        _log("running", `${label}: Waiting ${ms}ms`);
        await _sleep(ms);
        _log("success", `${label}: Done`);
      } else if (action.type === "click" || action.type === "type") {
        const tab = await _getActiveTab();
        if (!tab) throw new Error("No active tab");
        activeTabId = tab.id;
        _log(
          "running",
          `${label}: ${action.type === "click" ? "Clicking" : "Typing"} "${action.selector}"`,
        );
        const result = await _sendToContent(activeTabId, action);
        if (!result.ok) _log("error", `${label}: ${result.error} — skipping`);
        else {
          _log("success", `${label}: ${action.type} done`);
          await _sleep(400);
        }
      } else if (["keyboard", "scroll", "read"].includes(action.type)) {
        const tab = await _getActiveTab();
        if (tab) {
          activeTabId = tab.id;
          await _sendToContent(activeTabId, action);
        }
        _log("success", `${label}: ${action.type} done`);
      } else _log("success", `${label}: Unknown "${action.type}" skipped`);
      stepsDone++;
    } catch (err) {
      _log("error", `${label}: ${err.message}`);
      if (action.critical) {
        _broadcast("AGENT_ERROR", { message: `Critical: ${err.message}` });
        return;
      }
    }
  }
  _broadcast("AGENT_DONE", { stepsDone, goal });
}

async function _handleSnapLearn(tab) {
  if (!tab?.windowId) return;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 90,
    });
    await chrome.storage.local.set({
      snapLearnImage: dataUrl,
      pendingMode: "snap_learn",
    });
  } catch (err) {}
}

async function _quickSave(text, tabId) {
  const { token, workspaceId = "General" } = await chrome.storage.local.get([
    "token",
    "workspaceId",
  ]);
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, type: "answer", workspaceId }),
    });
    if (!res.ok) return;
    chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
      const n = todaySaves + 1;
      chrome.storage.local.set({ todaySaves: n });
      _updateBadge(n);
      _updateStreak();
    });
    if (tabId)
      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () =>
            window.dispatchEvent(
              new CustomEvent("brain:show_toast", {
                detail: { msg: "Saved to Brain", type: "success" },
              }),
            ),
        })
        .catch(() => {});
  } catch {}
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
  const { streak = 0, lastActiveDate } = await chrome.storage.local.get([
    "streak",
    "lastActiveDate",
  ]);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const newStreak =
    lastActiveDate === yesterday.toDateString()
      ? streak + 1
      : lastActiveDate === today
        ? streak
        : 1;
  chrome.storage.local.set({ streak: newStreak, lastActiveDate: today });
}
function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

chrome.alarms.create("daily-reset", {
  when: _nextMidnight(),
  periodInMinutes: 1440,
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "daily-reset") {
    chrome.storage.local.set({ todaySaves: 0 });
    _updateBadge(0);
  }
});
function _nextMidnight() {
  const m = new Date();
  m.setHours(24, 0, 0, 0);
  return m.getTime();
}