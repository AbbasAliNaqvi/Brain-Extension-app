(function () {
  "use strict";
  if (window.__BrainOS_agent_v1) return;
  window.__BrainOS_agent_v1 = true;

  function _findElement(selectorOrText) {
    if (!selectorOrText) return null;
    try {
      const direct = document.querySelector(selectorOrText);
      if (direct) return direct;
    } catch {}

    if (
      selectorOrText.startsWith("//") ||
      selectorOrText.startsWith("/html") ||
      selectorOrText.startsWith("(")
    ) {
      try {
        const xResult = document.evaluate(
          selectorOrText,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        if (xResult.singleNodeValue) return xResult.singleNodeValue;
      } catch {}
    }

    const text = selectorOrText.toLowerCase().trim();
    const interactables = [
      ...document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [role="link"], [role="menuitem"], label',
      ),
    ];

    const exactMatch = interactables.find((el) => {
      const elText = (
        el.textContent ||
        el.value ||
        el.placeholder ||
        el.getAttribute("aria-label") ||
        ""
      )
        .toLowerCase()
        .trim();
      return (
        elText === text ||
        el.getAttribute("data-testid") === selectorOrText ||
        el.id === selectorOrText
      );
    });
    if (exactMatch) return exactMatch;

    const partialMatch = interactables.find((el) => {
      const elText = (
        el.textContent ||
        el.value ||
        el.placeholder ||
        el.getAttribute("aria-label") ||
        ""
      ).toLowerCase();
      return elText.includes(text);
    });
    if (partialMatch) return partialMatch;

    return null;
  }

  function _simulateInput(el, value) {
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set ||
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  function _simulateClick(el) {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.click?.();
  }

  async function _retryFindElement(
    selectorOrText,
    maxRetries = 10,
    interval = 300,
  ) {
    for (let i = 0; i < maxRetries; i++) {
      const el = _findElement(selectorOrText);
      if (el) return el;
      await new Promise((r) => setTimeout(r, interval));
    }
    return null;
  }

  async function _executeAction(action) {
    if (action.type === "wait") {
      await new Promise((r) => setTimeout(r, Math.min(action.ms || 500, 5000)));
      return { ok: true };
    }
    if (action.type === "scroll") {
      window.scrollBy({ top: action.y || 400, behavior: "smooth" });
      return { ok: true };
    }
    if (action.type === "click") {
      const el = await _retryFindElement(action.selector);
      if (!el)
        return { ok: false, error: `Element not found: ${action.selector}` };
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise((r) => setTimeout(r, 150));
      _simulateClick(el);
      return { ok: true };
    }
    if (action.type === "type") {
      const el = await _retryFindElement(action.selector);
      if (!el)
        return { ok: false, error: `Input not found: ${action.selector}` };
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      await new Promise((r) => setTimeout(r, 100));
      _simulateInput(el, action.value || "");
      if (action.pressEnter) {
        await new Promise((r) => setTimeout(r, 100));
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            bubbles: true,
          }),
        );
      }
      return { ok: true };
    }
    return { ok: false, error: `Unknown action type: ${action.type}` };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "AGENT_ACTION") {
      _executeAction(msg.action)
        .then((r) => sendResponse(r))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  });
})();
