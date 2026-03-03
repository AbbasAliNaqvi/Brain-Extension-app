let globalAgentAbort = false;

async function _executeAgentWorkflow(actions, goal, senderTab) {
  let stepsDone = 0, activeTabId = senderTab?.id;
  globalAgentAbort = false; 
  const _broadcast = (type, payload) => chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
  const _log = (status, message) => _broadcast("AGENT_PROGRESS", { log: { status, message } });
  
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
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") { resolve(); return; }
      } catch {}
      setTimeout(check, 300);
    };
    check();
    setTimeout(resolve, 10000);
  });

  const _sendToContent = async (tabId, action, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const result = await new Promise((resolve) => {
        let answered = false;
        chrome.tabs.sendMessage(tabId, { type: "AGENT_ACTION", action }, (resp) => {
          answered = true;
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: "No response" });
          }
        });
        setTimeout(() => { if (!answered) resolve({ ok: false, error: "Timeout" }); }, 9000);
      });

      if (result.ok || (result.error && !result.error.includes("Receiving end does not exist"))) {
        return result;
      }

      console.log(`[Agent] Content script missing. Auto-healing... (${i+1}/${retries})`);
      await _sleep(1000);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["agent-content.js"]
        });
      } catch (e) {}
    }
    return { ok: false, error: "Connection lost. Page may have refreshed." };
  };

  for (let i = 0; i < actions.length; i++) {
    if (globalAgentAbort) {
      _log("error", `Emergency Stop: Agent halted at step ${i + 1}/${actions.length}`);
      break; 
    }
    const action = actions[i], label = `Step ${i + 1}/${actions.length}`;
    try {
      if (action.type === "navigate") {
        _log("running", `${label}: Navigating to ${action.url}`);
        if (!activeTabId) {
          const t = await chrome.tabs.create({ url: action.url, active: true });
          activeTabId = t.id;
        } else await chrome.tabs.update(activeTabId, { url: action.url });
        await _waitForTabLoad(activeTabId);
        await _sleep(1500); // Give SPAs extra time
        _log("success", `${label}: Navigated`);
      } else if (action.type === "wait") {
        const ms = Math.min(action.ms || 1000, 8000);
        _log("running", `${label}: Waiting ${ms}ms`);
        await _sleep(ms);
        _log("success", `${label}: Done`);
      } else if (action.type === "click" || action.type === "type" || action.type === "fill") {
        const tab = await _getActiveTab();
        if (!tab) throw new Error("No active tab");
        activeTabId = tab.id;
        _log("running", `${label}: ${action.type === "click" ? "Clicking" : "Typing"} "${action.selector}"`);
        
        const result = await _sendToContent(activeTabId, action);
        
        if (!result.ok) _log("error", `${label}: ${result.error}`);
        else { _log("success", `${label}: ${action.type} done`); await _sleep(600); }
      }
      stepsDone++;
    } catch (err) {
      _log("error", `${label}: ${err.message}`);
      if (action.critical) break;
    }
  }
  if (!globalAgentAbort) _broadcast("AGENT_DONE", { stepsDone, goal });
}

const WS_URL = "wss://brain-extension-exng.onrender.com";
let extSocket = null;
let extUserId = null;
let keepAliveTimer = null;

async function initExtensionSocket() {
  if (extSocket && extSocket.readyState === WebSocket.OPEN) return;
  
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    console.log("[Agent] No token found. Login required.");
    return;
  }

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    
    extUserId = payload.id || payload._id || payload.userId || payload.sub; 
    
    if (!extUserId) {
        console.error("[Agent] User ID not found in token:", payload);
        return;
    }
  } catch (e) { 
    console.error("[Agent] JWT Decode Error:", e);
    return; 
  }

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&token=${token}`;
  extSocket = new WebSocket(wsUrl);

  extSocket.onopen = () => {
    console.log("[Agent] Native WebSocket Bridge Connected.");
    extSocket.send("40"); 

    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => { 
      if (extSocket.readyState === WebSocket.OPEN) extSocket.send("2"); 
    }, 20000);
    setTimeout(() => {
      _emitExtEvent("register_extension", extUserId);
    }, 500);
  };

  extSocket.onmessage = async (event) => {
    const msg = event.data;
    if (msg === "3") return; 
    if (msg.startsWith("42")) {
      try {
        const [eventName, data] = JSON.parse(msg.slice(2));
        if (eventName === "EXECUTE_REMOTE_TASK") { await _processRemoteTask(data); } 
        else if (eventName === "FLUSH_QUEUED_TASKS") {
          for (const task of data.tasks) { if (globalAgentAbort) break; await _processRemoteTask(task); }
        } 
        else if (eventName === "STOP_REMOTE_TASK") {
          globalAgentAbort = true;
          _emitExtEvent("EXTENSION_EXECUTION_UPDATE", { userId: extUserId, status: "error", message: "Execution halted." });
        }
      } catch (e) { console.error("[Agent] Socket Message Parse Error", e); }
    }
  };

  extSocket.onclose = () => { 
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    extSocket = null; 
    setTimeout(initExtensionSocket, 5000); 
  };
}

function _emitExtEvent(event, data) {
  if (extSocket && extSocket.readyState === WebSocket.OPEN) {
    extSocket.send(`42${JSON.stringify([event, data])}`);
  }
}

async function _processRemoteTask(taskPayload) {
  const { goal, actions } = taskPayload;
  _emitExtEvent("EXTENSION_EXECUTION_UPDATE", { userId: extUserId, status: "running", message: `Remote Task Started.` });
  try {
    await _executeAgentWorkflow(actions, goal, { id: null });
    _emitExtEvent("EXTENSION_EXECUTION_UPDATE", { userId: extUserId, status: "done", message: `Remote Task Completed.` });
  } catch (err) {
    _emitExtEvent("EXTENSION_EXECUTION_UPDATE", { userId: extUserId, status: "error", message: `Task failed.` });
  }
}

initExtensionSocket();

chrome.storage.onChanged.addListener((changes) => { 
  if (changes.token) {
    if (extSocket) extSocket.close();
    initExtensionSocket(); 
  }
});

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }