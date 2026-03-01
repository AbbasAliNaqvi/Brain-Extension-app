$("agent-run-btn")?.addEventListener("click", _runAgent);

document.querySelectorAll(".agent-ex-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const input = $("agent-input");
    if (input) {
      input.value = pill.dataset.ex;
      input.focus();
    }
  });
});

async function _runAgent() {
  const prompt = $("agent-input")?.value.trim();
  if (!prompt || !token || agentRunning) return;
  agentRunning = true;

  const runBtn = $("agent-run-btn");
  const logWrap = $("agent-log-wrap");
  const logList = $("agent-log-list");
  const doneCard = $("agent-done-card");
  const errCard = $("agent-err-card");
  const errMsg = $("agent-err-msg");
  const statusBadge = $("agent-status-badge");
  const goalRow = $("agent-goal-row");
  const goalTxt = $("agent-goal-txt");
  const liveDot = $("agent-live-dot");

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = `<div class="step-spinner"></div>Planning…`;
  }
  if (logWrap) logWrap.classList.remove("hidden");
  if (logList) logList.innerHTML = "";
  if (doneCard) doneCard.classList.add("hidden");
  if (errCard) errCard.classList.add("hidden");
  if (statusBadge) {
    statusBadge.textContent = "Planning";
    statusBadge.className = "agent-status-badge";
  }
  if (liveDot) liveDot.style.animationPlayState = "running";

  _agentLog("planning", "Generating action plan..");

  try {
    const res = await fetch(`${API_BASE}/agent/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Planning failed");
    const { goal, actions } = data;
    if (!actions?.length)
      throw new Error("No actions generated. Try a more specific command.");

    if (goalRow) goalRow.classList.remove("hidden");
    if (goalTxt) goalTxt.textContent = goal || prompt;
    if (statusBadge) statusBadge.textContent = "Running";
    if (runBtn) runBtn.innerHTML = `<div class="step-spinner"></div>Running…`;

    _agentLog("running", `Executing ${actions.length} steps…`);

    chrome.runtime.sendMessage({
      type: "AGENT_EXECUTE",
      actions,
      goal: goal || prompt,
    });
  } catch (err) {
    agentRunning = false;
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>Run Agent`;
    }
    if (statusBadge) {
      statusBadge.textContent = "Error";
      statusBadge.className = "agent-status-badge error";
    }
    if (liveDot) liveDot.style.animationPlayState = "paused";
    if (errCard) errCard.classList.remove("hidden");
    if (errMsg) errMsg.textContent = err.message;
  }
}

function _agentLog(state, message) {
  const logList = $("agent-log-list");
  if (!logList) return;
  const div = document.createElement("div");
  const isActive = state === "running" || state === "planning";
  div.className = `agent-log-step ${isActive ? "running" : state}`;
  div.innerHTML = `${isActive ? '<div class="step-spinner"></div>' : `<span class="step-ic">${state === "success" ? "✅" : state === "error" ? "❌" : "⏳"}</span>`}<span class="step-txt">${_esc(message)}</span>`;
  logList.appendChild(div);
  logList.scrollTop = logList.scrollHeight;
}

function _appendAgentLog(log) {
  const logList = $("agent-log-list");
  if (!logList || !log) return;
  const div = document.createElement("div");
  div.className = `agent-log-step ${log.status}`;
  const icon =
    log.status === "success" ? "✅" : log.status === "error" ? "❌" : "⏳";
  div.innerHTML = `${log.status === "running" ? '<div class="step-spinner"></div>' : `<span class="step-ic">${icon}</span>`}<span class="step-txt">${_esc(log.message)}</span>`;
  logList.appendChild(div);
  logList.scrollTop = logList.scrollHeight;
}

function _handleAgentStatus(status) {
  agentRunning = false;
  const runBtn = $("agent-run-btn");
  const statusBadge = $("agent-status-badge");
  const doneCard = $("agent-done-card");
  const doneS = $("agent-done-s");
  const errCard = $("agent-err-card");
  const errMsg = $("agent-err-msg");
  const liveDot = $("agent-live-dot");

  if (runBtn) {
    runBtn.disabled = false;
    runBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>Run Again`;
  }
  if (liveDot) liveDot.style.animationPlayState = "paused";

  if (status.type === "done") {
    if (statusBadge) {
      statusBadge.textContent = "Complete";
      statusBadge.className = "agent-status-badge done";
    }
    if (doneCard) doneCard.classList.remove("hidden");
    if (doneS)
      doneS.textContent = `${status.stepsDone || 0} steps executed successfully.`;
  } else if (status.type === "error") {
    if (statusBadge) {
      statusBadge.textContent = "Error";
      statusBadge.className = "agent-status-badge error";
    }
    if (errCard) errCard.classList.remove("hidden");
    if (errMsg)
      errMsg.textContent = status.message || "Agent encountered an error.";
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "AGENT_PROGRESS") _appendAgentLog(msg.log);
  if (msg.type === "AGENT_DONE")
    _handleAgentStatus({ type: "done", stepsDone: msg.stepsDone });
  if (msg.type === "AGENT_ERROR")
    _handleAgentStatus({ type: "error", message: msg.message });
});
