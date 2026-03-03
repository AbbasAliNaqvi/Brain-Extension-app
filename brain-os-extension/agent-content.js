(function () {
  "use strict";
  if (window.__BrainOS_agent_v1) return;
  window.__BrainOS_agent_v1 = true;

  function _findElement(selector) {
    if (!selector) return null;
    let textToMatch = null;
    let cssSelector = selector;

    if (selector.toLowerCase().startsWith("text=")) {
      textToMatch = selector.substring(5).trim().toLowerCase();
      cssSelector = null;
    }

    if (
      selector.startsWith("//") ||
      selector.startsWith("/html") ||
      selector.startsWith("(")
    ) {
      try {
        const xResult = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        if (xResult.singleNodeValue) return xResult.singleNodeValue;
      } catch {}
    }
    if (cssSelector) {
      try {
        const direct = document.querySelector(cssSelector);
        if (direct) return direct;
      } catch {}
    }
    const searchStr = textToMatch || selector.toLowerCase().trim();
    const interactables = [
      ...document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [role="link"], [role="menuitem"], label, [contenteditable="true"]',
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
        elText === searchStr ||
        el.getAttribute("data-testid")?.toLowerCase() === searchStr ||
        el.id?.toLowerCase() === searchStr
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
      return elText.includes(searchStr);
    });

    return partialMatch || null;
  }

  function _simulateInput(el, value) {
    el.focus();

    const execSuccess = document.execCommand("insertText", false, value);

    if (!execSuccess) {
      try {
        if (el.tagName === "TEXTAREA") {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          if (nativeSetter) nativeSetter.call(el, value);
          else el.value = value;
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          if (nativeSetter) nativeSetter.call(el, value);
          else el.value = value;
        }
      } catch (e) {
        el.value = value;
      }
    }

    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  function _simulateClick(el) {
    el.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, composed: true }),
    );
    el.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, composed: true }),
    );
    el.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, composed: true }),
    );
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
    el.click?.();
  }

  async function _retryFindElement(selector, maxRetries = 10, interval = 300) {
    for (let i = 0; i < maxRetries; i++) {
      const el = _findElement(selector);
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
    if (action.type === "type" || action.type === "fill") {
      let el = await _retryFindElement(action.selector);
      if (!el && action.selector === "body") {
        el = document.body;
      }
      if (!el)
        return { ok: false, error: `Input not found: ${action.selector}` };

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise((r) => setTimeout(r, 100));

      _simulateInput(el, action.value || "");

      if (action.pressEnter) {
        await new Promise((r) => setTimeout(r, 200));
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
          }),
        );
        el.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
          }),
        );
        el.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
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