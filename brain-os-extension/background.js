const API_BASE = "https://brain-extension-exng.onrender.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "brain-root",
      title: "Brain OS",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-desi",
      parentId: "brain-root",
      title: "Desi Analogy",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-eli5",
      parentId: "brain-root",
      title: "ELI5 — Explain Simply",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-neural",
      parentId: "brain-root",
      title: "Neural Link (RAG)",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-debug",
      parentId: "brain-root",
      title: "Debug / Roast Code",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-arch",
      parentId: "brain-root",
      title: "Architecture Diagram",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-sep",
      parentId: "brain-root",
      type: "separator",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-translate",
      parentId: "brain-root",
      title: "Magic Translate (DOM)",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-snap",
      parentId: "brain-root",
      title: "Snap & Learn",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "brain-save",
      parentId: "brain-root",
      title: "Save to Second Brain",
      contexts: ["selection"],
    });
  });
  initBadge();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText && info.menuItemId !== "brain-snap") return;

  const modeMap = {
    "brain-desi": "desi_analogy",
    "brain-eli5": "eli5",
    "brain-neural": "neural_link",
    "brain-debug": "roast_code",
    "brain-arch": "arch_diagram",
    "brain-translate": "magic_translate",
    "brain-save": "save",
  };

  const mode = modeMap[info.menuItemId];

  if (info.menuItemId === "brain-snap") {
    await handleSnapLearn(tab);
    return;
  }

  if (info.menuItemId === "brain-translate") {
    await chrome.storage.local.set({
      lastSelection: info.selectionText,
      pendingMode: "magic_translate",
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        window.__brainMagicTranslateText = text;
        window.dispatchEvent(
          new CustomEvent("brain:magic_translate", { detail: { text } }),
        );
      },
      args: [info.selectionText],
    });
    return;
  }

  if (mode) {
    await chrome.storage.local.set({
      lastSelection: info.selectionText,
      pendingMode: mode,
    });
    if (mode !== "save") {
      chrome.sidePanel.open({ windowId: tab.windowId });
    } else {
      quickSaveInBackground(info.selectionText, tab.id);
    }
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "open-command-palette") {
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: () => window.dispatchEvent(new CustomEvent("brain:open_palette")),
      })
      .catch(() => {});
    return;
  }

  if (command === "open-sidepanel") {
    chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }

  if (command === "quick-save") {
    const [result] = await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim(),
      })
      .catch(() => [{ result: "" }]);

    const text = result?.result;
    if (text?.length > 3) {
      await chrome.storage.local.set({ lastSelection: text });
      quickSaveInBackground(text, tab.id);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tab = sender.tab;

  switch (msg.type) {
    case "TOOLBAR_ACTION": {
      const { mode, text } = msg;
      chrome.storage.local.set(
        { lastSelection: text, pendingMode: mode },
        async () => {
          if (mode === "magic_translate") {
            sendResponse({ ok: true, inPage: true });
            return;
          }
          if (mode === "save") {
            quickSaveInBackground(text, tab.id);
            sendResponse({ ok: true });
            return;
          }
          if (mode === "snap") {
            await handleSnapLearn(tab);
            sendResponse({ ok: true });
            return;
          }
          chrome.sidePanel.open({ windowId: tab.windowId });
          sendResponse({ ok: true });
        },
      );
      return true; 
    }

    case "MEMORY_SAVED": {
      chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
        const n = todaySaves + 1;
        chrome.storage.local.set({ todaySaves: n });
        updateBadge(n);
        updateStreak();
      });
      sendResponse({ ok: true });
      break;
    }

    case "GET_BADGE_STATS": {
      chrome.storage.local.get(["todaySaves", "streak"], (data) => {
        sendResponse({
          todaySaves: data.todaySaves || 0,
          streak: data.streak || 0,
        });
      });
      return true;
    }

    case "SNAP_LEARN_REQUEST": {
      handleSnapLearn(tab)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    case "YOUTUBE_TRANSCRIPT": {
      chrome.storage.local.set({ youtubeContext: msg.data });
      sendResponse({ ok: true });
      break;
    }
  }
});

async function handleSnapLearn(tab) {
  if (!tab) return;

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "jpeg",
    quality: 90,
  });

  await chrome.storage.local.set({
    snapLearnImage: dataUrl,
    pendingMode: "snap_learn",
  });

  chrome.sidePanel.open({ windowId: tab.windowId });
}

async function quickSaveInBackground(text, tabId) {
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

    if (res.ok) {
      chrome.storage.local.get("todaySaves", ({ todaySaves = 0 }) => {
        const n = todaySaves + 1;
        chrome.storage.local.set({ todaySaves: n });
        updateBadge(n);
        updateStreak();
      });

      if (tabId) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: (t) =>
              window.dispatchEvent(
                new CustomEvent("brain:show_toast", {
                  detail: { msg: t, type: "success" },
                }),
              ),
            args: [text.substring(0, 60) + (text.length > 60 ? "…" : "")],
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[Brain OS] Quick save failed:", err.message);
  }
}

async function initBadge() {
  const { todaySaves = 0 } = await chrome.storage.local.get("todaySaves");
  updateBadge(todaySaves);
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({
    color: count > 9 ? "#6366f1" : "#10b981",
  });
}

async function updateStreak() {
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

chrome.alarms.create("daily", {
  when: getNextMidnight(),
  periodInMinutes: 1440,
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "daily") {
    chrome.storage.local.set({ todaySaves: 0 });
    updateBadge(0);
  }
});

function getNextMidnight() {
  const m = new Date();
  m.setHours(24, 0, 0, 0);
  return m.getTime();
}