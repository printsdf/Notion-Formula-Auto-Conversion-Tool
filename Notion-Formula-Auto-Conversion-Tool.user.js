// ==UserScript==
// @name         Notion-Formula-Auto-Conversion-Tool
// @namespace    http://tampermonkey.net/
// @version      3.5.2
// @description  Notion 自动公式转换工具
// @author       skyance、0xstride、fengjy73、Sparidae、ckrvxr
// @match        https://www.notion.so/*
// @match        https://app.notion.com/*
// @match        https://notion.com/*
// @match        https://*.notion.com/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @github       https://github.com/printsdf/Notion-Formula-Auto-Conversion-Tool
// @downloadURL https://raw.githubusercontent.com/printsdf/Notion-Formula-Auto-Conversion-Tool/main/Notion-Formula-Auto-Conversion-Tool.user.js
// @updateURL https://raw.githubusercontent.com/printsdf/Notion-Formula-Auto-Conversion-Tool/main/Notion-Formula-Auto-Conversion-Tool.user.js
// ==/UserScript==

(function () {
  "use strict";

  GM_addStyle(`
    #formula-helper {
      position: fixed;
      right: 30px;
      bottom: 100px;
      z-index: 9999;
      height: 40px;
      width: 40px;
      border-radius: 22px;
      background: #ffffff;
      box-shadow: 0px 6px 16px -4px rgba(0, 0, 0, 0.08),
                  0px 8px 12px 0px rgba(25,25,25,.027),
                  0px 2px 6px 0px rgba(25,25,25,.027),
                  0px 0px 0px 1px rgba(42,28,0,.10);
      display: flex;
      align-items: center;
      overflow: hidden;
      cursor: pointer;
      touch-action: none;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                  border-radius 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                  transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Apple Chancery', 'Gabriola', 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      user-select: none;
    }
    #formula-helper.hover,
    #formula-helper.processing {
      width: 200px;
      border-radius: 22px;
      transform: scale(1.08);
    }
    #formula-helper > * {
      pointer-events: none;
    }
    .button-icon {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Apple Chancery', 'Gabriola', 'Georgia', 'Times New Roman', serif;
      font-size: 19px;
      font-weight: 700;
      color: rgb(55, 53, 47);
      line-height: 1;
    }
    .progress-wrapper {
      display: flex;
      align-items: center;
      flex-grow: 1;
      overflow: hidden;
      padding-right: 12px;
      white-space: nowrap;
    }
    .progress-bar-container {
      flex-grow: 1;
      height: 4px;
      background: rgba(55, 53, 47, 0.09);
      border-radius: 2px;
      margin-right: 8px;
    }
    .progress-bar-fill {
      width: 0%;
      height: 100%;
      background: rgb(35, 131, 226);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .progress-text {
      font-size: 14px;
      color: rgba(55, 53, 47, 0.7);
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-color-scheme: dark) {
      #formula-helper {
        background: rgb(211, 211, 211);
      }
    }
  `);

  let panel, progressBar, progressText;
  let isProcessing = false;
  let shouldStop = false;
  let hoverTimer = null;
  const DEBUG_MODE = false;

  // ---------- 固定快速模式 ----------
  const FAST_DELAY_SCALE = 0.12;
  const FAST_MIN_DELAY = 1;

  const getDelay = (ms = 0) => {
    const requested = Math.max(0, Number(ms) || 0);
    if (requested === 0) {
      return FAST_MIN_DELAY;
    }
    return Math.max(FAST_MIN_DELAY, Math.ceil(requested * FAST_DELAY_SCALE));
  };

  // ---------- 工具函数 ----------
  const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, getDelay(ms)));

  // ---------- 菜单状态 ----------
  let totalConverted = GM_getValue("totalConverted", 0);
  let totalMenuId = null;
  let panelVisible = GM_getValue("panelVisible", true);

  function refreshTotalMenu() {
    if (totalMenuId !== null) GM_unregisterMenuCommand(totalMenuId);
    totalMenuId = GM_registerMenuCommand(
      `📊 累计转换: ${totalConverted} 个公式`,
      () => {}
    );
  }

  function updateProgress(current, total, textOverride = null) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = textOverride || `${current}/${total}`;
  }

  function createPanel() {
    panel = document.createElement("div");
    panel.id = "formula-helper";
    panel.innerHTML = `
        <span class="button-icon">M</span>
        <div class="progress-wrapper">
            <div class="progress-bar-container">
                <div class="progress-bar-fill"></div>
            </div>
            <span class="progress-text">0</span>
        </div>
    `;
    document.body.appendChild(panel);
    if (!panelVisible) panel.style.display = "none";

    progressBar = panel.querySelector(".progress-bar-fill");
    progressText = panel.querySelector(".progress-text");

    // ---------- 拖拽 & 位置记忆 ----------
    let dragState = null;
    let dragTimer = null;

    const savedRight = GM_getValue("panelRight", null);
    const savedBottom = GM_getValue("panelBottom", null);
    if (savedRight !== null && savedBottom !== null) {
      panel.style.right = savedRight + "px";
      panel.style.bottom = savedBottom + "px";
    }

    function startDrag(clientX, clientY) {
      if (isProcessing || dragTimer) return;
      const rect = panel.getBoundingClientRect();
      dragState = {
        offsetR: rect.right - clientX,
        offsetB: rect.bottom - clientY,
      };
      dragTimer = setTimeout(() => {
        dragState.activated = true;
        panel.style.cursor = "grabbing";
        panel.style.transition = "none";
      }, 500);
    }

    function moveDrag(clientX, clientY) {
      if (!dragState?.activated) return;
      let r = window.innerWidth - clientX - dragState.offsetR;
      let b = window.innerHeight - clientY - dragState.offsetB;
      r = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, r));
      b = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, b));
      panel.style.right = r + "px";
      panel.style.bottom = b + "px";
    }

    function endDrag() {
      clearTimeout(dragTimer);
      dragTimer = null;
      if (!dragState) return;
      if (dragState.activated) {
        const rect = panel.getBoundingClientRect();
        const r = Math.max(0, Math.min(window.innerWidth - rect.width, window.innerWidth - rect.right));
        const b = Math.max(0, Math.min(window.innerHeight - rect.height, window.innerHeight - rect.bottom));
        panel.style.right = r + "px";
        panel.style.bottom = b + "px";
        GM_setValue("panelRight", r);
        GM_setValue("panelBottom", b);
        panel.style.cursor = "pointer";
        panel.style.transition = "";
        const blockClick = (e) => {
          e.stopImmediatePropagation();
          document.removeEventListener("click", blockClick, true);
        };
        document.addEventListener("click", blockClick, true);
        dragState = null;
      } else {
        dragState = null;
      }
    }

    panel.addEventListener("mousedown", (e) => {
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener("mouseup", () => {
      endDrag();
    });

    panel.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: true });

    document.addEventListener("touchend", () => {
      endDrag();
    }, { passive: true });

    // 自动检测待处理个数
    let lastCount = -1;
    const updateCount = () => {
      if (isProcessing) return;
      let count = 0;
      for (const editor of getEditableEditors()) {
        count += findFormulas(editor.textContent).length;
      }
      count += findCrossBlockGroups().length;
      if (count !== lastCount) {
        lastCount = count;
        progressText.textContent = count ? `${count}` : "0";
      }
    };

    // 初始检测
    updateCount();

    // Hover 逻辑
    panel.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      updateCount();
      hoverTimer = setTimeout(() => {
        if (!panel.classList.contains("hover")) {
          panel.classList.add("hover");
        }
      }, 150);
    });

    panel.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimer);
      if (isProcessing) return;
      hoverTimer = setTimeout(() => {
        panel.classList.remove("hover");
      }, 800);
    });

    // 点击处理（拖拽时不触发）
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isProcessing) {
        shouldStop = true;
        progressText.textContent = "Stopping…";
      } else {
        convertFormulas();
      }
    });
  }

  async function waitForCondition(
    checkFn,
    { timeout = 240, interval = 12 } = {},
  ) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const result = checkFn();
      if (result) {
        return result;
      }
      await sleep(interval);
    }
    return null;
  }

  function updateStatus(text, timeout = 0) {
    console.log("[状态]", text);
  }

  function describeElement(element) {
    if (!element) {
      return "[null]";
    }

    const tag = element.tagName ? element.tagName.toLowerCase() : "unknown";
    const id = element.id ? `#${element.id}` : "";
    const className =
      typeof element.className === "string"
        ? element.className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .join(".")
        : "";
    const classes = className ? `.${className}` : "";
    const role = element.getAttribute?.("role");
    const roleText = role ? `[role="${role}"]` : "";
    const aria =
      element.getAttribute?.("aria-roledescription") ||
      element.getAttribute?.("aria-label") ||
      "";
    const text = (element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return `${tag}${id}${classes}${roleText}${aria ? `("${aria}")` : ""}${text ? ` text="${text}"` : ""}`;
  }

  function debugLog(...args) {
    if (!DEBUG_MODE) {
      return;
    }
    console.log("[FormulaDebug]", ...args);
  }

  function isEscaped(text, index) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
      slashCount++;
    }
    return slashCount % 2 === 1;
  }

  function findLineBoundaries(text, start, end) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = text.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const before = text.slice(lineStart, start).trim();
    const after = text.slice(end, lineEnd).trim();

    return {
      lineStart,
      lineEnd,
      standaloneBlock: before === "" && after === "",
    };
  }

  function findNextFormulaStart(text, fromIndex) {
    let dollarIndex = text.indexOf("$", fromIndex);
    let slashIndex = text.indexOf("\\", fromIndex);

    while (dollarIndex !== -1 && isEscaped(text, dollarIndex)) {
      dollarIndex = text.indexOf("$", dollarIndex + 1);
    }

    while (slashIndex !== -1 && isEscaped(text, slashIndex)) {
      slashIndex = text.indexOf("\\", slashIndex + 1);
    }

    if (dollarIndex === -1) return slashIndex;
    if (slashIndex === -1) return dollarIndex;
    return Math.min(dollarIndex, slashIndex);
  }

  function findUnescapedToken(text, token, fromIndex, stopAtNewline = false) {
    const newlineIndex = stopAtNewline ? text.indexOf("\n", fromIndex) : -1;
    let index = text.indexOf(token, fromIndex);

    while (index !== -1) {
      if (newlineIndex !== -1 && newlineIndex < index) {
        return -1;
      }
      if (!isEscaped(text, index)) {
        return index;
      }
      index = text.indexOf(token, index + 1);
    }

    return -1;
  }

  function findClosingSingleDollar(text, startIndex) {
    let index = findUnescapedToken(text, "$", startIndex, true);
    while (index !== -1) {
      if (text[index - 1] !== "$" && text[index + 1] !== "$") {
        return index;
      }
      index = findUnescapedToken(text, "$", index + 1, true);
    }
    return -1;
  }

  function findClosingDoubleDollar(text, startIndex) {
    return findUnescapedToken(text, "$$", startIndex);
  }

  function findClosingLatex(text, startIndex, closeChar) {
    return findUnescapedToken(text, `\\${closeChar}`, startIndex);
  }

  function isValidInlineDollar(text, start, end) {
    const content = text.slice(start + 1, end);
    if (!content.trim() || /\n/.test(content)) {
      return false;
    }

    const firstChar = text[start + 1];
    const lastChar = text[end - 1];
    return !!(
      firstChar &&
      lastChar &&
      !/\s/.test(firstChar) &&
      !/\s/.test(lastChar)
    );
  }

  function buildFormulaToken(text, start, end, openLength, closeLength, type, syntax) {
    const boundaries = findLineBoundaries(text, start, end);
    return {
      raw: text.slice(start, end),
      start,
      end,
      type,
      syntax,
      content: text.slice(start + openLength, end - closeLength),
      lineStart: boundaries.lineStart,
      lineEnd: boundaries.lineEnd,
      standaloneBlock: type === "block" ? boundaries.standaloneBlock : false,
    };
  }

  // 公式查找
  function findFormulas(text) {
    const formulas = [];
    if (!text || !/[\\$]/.test(text)) {
      return formulas;
    }

    let i = 0;
    while (i < text.length) {
      i = findNextFormulaStart(text, i);
      if (i === -1) break;

      if (text[i] === "$") {
        if (text[i + 1] === "$") {
          const closeIndex = findClosingDoubleDollar(text, i + 2);
          if (closeIndex !== -1) {
            const end = closeIndex + 2;
            const token = buildFormulaToken(text, i, end, 2, 2, "block", "$$");
            if (token.content.trim()) formulas.push(token);
            i = end;
            continue;
          }
        } else {
          const closeIndex = findClosingSingleDollar(text, i + 1);
          if (closeIndex !== -1 && isValidInlineDollar(text, i, closeIndex)) {
            const end = closeIndex + 1;
            formulas.push(buildFormulaToken(text, i, end, 1, 1, "inline", "$"));
            i = end;
            continue;
          }
        }
      } else if (text[i] === "\\") {
        if (text[i + 1] === "(") {
          const closeIndex = findClosingLatex(text, i + 2, ")");
          if (closeIndex !== -1) {
            const end = closeIndex + 2;
            const token = buildFormulaToken(text, i, end, 2, 2, "inline", "\\(\\)");
            if (token.content.trim()) formulas.push(token);
            i = end;
            continue;
          }
        } else if (text[i + 1] === "[") {
          const closeIndex = findClosingLatex(text, i + 2, "]");
          if (closeIndex !== -1) {
            const end = closeIndex + 2;
            const token = buildFormulaToken(text, i, end, 2, 2, "block", "\\[\\]");
            if (token.content.trim()) formulas.push(token);
            i = end;
            continue;
          }
        }
      }

      i++;
    }
    return formulas;
  }

  function createRangeFromOffsets(editor, start, end) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let firstPos = null;
    let lastPos = null;
    let startPos = null;
    let endPos = null;
    let node;

    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (!length) {
        continue;
      }

      if (!firstPos) {
        firstPos = { node, offset: 0 };
      }

      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + length;

      if (!startPos) {
        if (start <= 0) {
          startPos = firstPos;
        } else if (start >= nodeStart && start < nodeEnd) {
          startPos = {
            node,
            offset: start - nodeStart,
          };
        }
      }

      if (!endPos) {
        if (end <= 0) {
          endPos = firstPos;
        } else if (end > nodeStart && end <= nodeEnd) {
          endPos = {
            node,
            offset: end - nodeStart,
          };
        }
      }

      currentOffset = nodeEnd;
      lastPos = {
        node,
        offset: length,
      };

      if (startPos && endPos) {
        break;
      }
    }

    if (!firstPos) {
      return null;
    }

    startPos = startPos || lastPos;
    endPos = endPos || lastPos;
    if (!startPos || !endPos) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    return range;
  }

  function findTextPosition(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (offset <= currentOffset + length) {
        return {
          node,
          offset: Math.min(Math.max(offset - currentOffset, 0), length),
        };
      }
      currentOffset += length;
    }
    return null;
  }

  async function focusEditor(editor) {
    if (!editor) return;
    await ensureFocus(editor);
    await sleep(10);
  }

  async function selectRange(editor, start, end) {
    const range = createRangeFromOffsets(editor, start, end);
    if (!range) {
      return null;
    }

    await focusEditor(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await sleep(10);
    return range;
  }

  function normalizeFormulaContent(content, { useDisplayStyle = false } = {}) {
    let normalized = content.trim();
    if (
      useDisplayStyle &&
      normalized &&
      !/^\\displaystyle\b/.test(normalized)
    ) {
      normalized = `\\displaystyle ${normalized}`;
    }
    return normalized;
  }

  function isSafeInlineInputElement(element, editor) {
    if (!element || element === editor) {
      return false;
    }

    if (element.closest("#formula-helper")) {
      return false;
    }

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return true;
    }

    if (!element.isContentEditable) {
      return false;
    }

    if (editor.contains(element)) {
      return true;
    }

    return !!element.closest(
      '.notion-overlay-container, [role="dialog"], .notion-modal, .notion-equation-block',
    );
  }

  function selectElementContents(element) {
    if (!element) {
      return false;
    }

    element.focus();

    if (typeof element.select === "function") {
      element.select();
      return true;
    }

    if (element.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    return false;
  }

  function isVisibleElement(element) {
    if (!element || element.getClientRects().length === 0) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findVisibleSafeElement(elements, editor) {
    for (const element of elements) {
      if (isVisibleElement(element) && isSafeInlineInputElement(element, editor)) {
        return element;
      }
    }
    return null;
  }

  function findInlineInputCandidate(editor) {
    const inputSelectors = 'input, textarea, [contenteditable="true"]';
    const localCandidate = findVisibleSafeElement(
      editor.querySelectorAll(inputSelectors),
      editor,
    );
    if (localCandidate) {
      return localCandidate;
    }

    const overlayRoots = Array.from(
      document.querySelectorAll('.notion-overlay-container, [role="dialog"], .notion-modal, .notion-equation-block'),
    ).reverse();

    for (const root of overlayRoots) {
      const candidate = findVisibleSafeElement(root.querySelectorAll(inputSelectors), editor);
      if (candidate) {
        debugLog("inline input candidate", describeElement(candidate));
        return candidate;
      }
    }

    return null;
  }

  async function waitForInlineInput(editor, attempts = 8, interval = 12) {
    for (let i = 0; i < attempts; i++) {
      const activeElement = document.activeElement;
      debugLog(`waitForInlineInput attempt ${i + 1}`, {
        activeElement: describeElement(activeElement),
        editor: describeElement(editor),
      });
      if (isSafeInlineInputElement(activeElement, editor)) {
        return activeElement;
      }

      const candidate = findInlineInputCandidate(editor);
      if (candidate) {
        return candidate;
      }

      await sleep(interval);
    }
    return null;
  }

  function isSimpleTableCellEditor(editor) {
    return (
      !!editor &&
      !!editor.closest("td, th") &&
      editor.matches(
        '.notion-table-cell-text[contenteditable="true"], [data-content-editable-leaf="true"][contenteditable="true"]',
      )
    );
  }

  function getEditableEditors() {
    return Array.from(
      document.querySelectorAll('[contenteditable="true"]'),
    ).filter((editor) => {
      const simpleTableCell = isSimpleTableCellEditor(editor);
      if (editor.closest("#formula-helper, .notion-code-block, .notion-equation-block")) {
        return false;
      }
      if (editor.closest('.notion-table-view, [role="gridcell"], [role="cell"]')) {
        return false;
      }
      if (!simpleTableCell && editor.closest('.notion-simple-table-block, td, th')) {
        return false;
      }
      if (!editor.textContent || !editor.textContent.trim()) {
        return false;
      }
      if (editor.getClientRects().length === 0) {
        return false;
      }
      return !editor.querySelector('[contenteditable="true"]');
    });
  }

  function collectFormulaTasks(filterFn = () => true) {
    const tasks = [];

    for (const editor of getEditableEditors()) {
      const simpleTableCell = isSimpleTableCellEditor(editor);
      const formulas = findFormulas(editor.textContent).filter(
        (formula) => filterFn(formula) && (!simpleTableCell || formula.type === "inline"),
      );
      if (!formulas.length) {
        continue;
      }
      tasks.push({ editor, formulas });
    }

    return tasks;
  }

  // 跨块块公式：粘贴多行 LaTeX 时，Notion 把每一行拆成独立块。
  // 例：块 A 只有 "\["，中间是公式行，块 Z 只有 "\]"。
  // Notion 的块不一定互为兄弟节点，所以先向上找兄弟，再向下找可编辑块。
  function nextEditableBlock(editor) {
    let node = editor.closest("[data-block-id]") || editor;
    let guard = 0;
    while (node && node !== document.body && guard++ < 40) {
      let sibling = node.nextElementSibling;
      while (!sibling) {
        node = node.parentElement;
        if (!node || node === document.body) return null;
        sibling = node.nextElementSibling;
      }
      const leaves = sibling.matches('[contenteditable="true"]')
        ? [sibling]
        : Array.from(sibling.querySelectorAll('[contenteditable="true"]'));
      if (leaves.length) {
        const next = leaves[0];
        if (next.closest(
          ".notion-code-block, .notion-equation-block, .notion-table-view, td, th",
        )) {
          return null;
        }
        return next;
      }
      node = sibling;
    }
    return null;
  }

  function findCrossBlockGroups() {
    const editors = getEditableEditors();
    const groups = [];
    const consumed = new Set();

    const findOpener = (text) => {
      let best = null;
      const consider = (token, closeToken) => {
        let idx = text.indexOf(token);
        while (idx !== -1 && isEscaped(text, idx)) {
          idx = text.indexOf(token, idx + token.length);
        }
        if (idx === -1) return;
        // 同一块内能闭合的公式由 findFormulas 处理。
        if (findUnescapedToken(text, closeToken, idx + token.length) !== -1) return;
        if (!best || idx < best.start) best = { start: idx, closeToken };
      };
      consider("\\[", "\\]");
      consider("$$", "$$");
      return best;
    };

    for (const editor of editors) {
      if (consumed.has(editor)) continue;
      const text = editor.textContent || "";
      const opener = findOpener(text);
      if (!opener) continue;
      if (text.slice(0, opener.start).trim() !== "") continue;

      const wrapper = editor.closest("[data-block-id]");
      if (!wrapper) continue;

      const texts = [text];
      const groupEditors = [editor];
      let currentEditor = editor;
      let prevRect = editor.getBoundingClientRect();
      let endEditor = null;
      let closeIndex = -1;
      let valid = true;
      let steps = 0;

      while (!endEditor && steps++ < 80) {
        const nextEditor = nextEditableBlock(currentEditor);
        if (!nextEditor) {
          valid = false;
          break;
        }
        const nextRect = nextEditor.getBoundingClientRect();
        if (
          nextRect.top < prevRect.bottom - 4 ||
          nextRect.right <= prevRect.left ||
          nextRect.left >= prevRect.right
        ) {
          valid = false;
          break;
        }
        prevRect = nextRect;
        currentEditor = nextEditor;
        const nextText = nextEditor.textContent || "";
        groupEditors.push(nextEditor);
        texts.push(nextText);
        const idx = findUnescapedToken(nextText, opener.closeToken, 0);
        if (idx !== -1) {
          if (nextText.slice(idx + opener.closeToken.length).trim() !== "") {
            valid = false;
          } else {
            endEditor = nextEditor;
            closeIndex = idx;
          }
          break;
        }
      }

      if (!valid || !endEditor) continue;

      const lastText = texts[texts.length - 1];
      const content = [
        text.slice(opener.start + 2),
        ...texts.slice(1, texts.length - 1),
        lastText.slice(0, closeIndex),
      ].join(" ").trim();
      if (!content) continue;

      const endWrapper = endEditor.closest("[data-block-id]");
      const nextWrapper = endWrapper?.nextElementSibling;
      const nextBlockId =
        nextWrapper?.getAttribute("data-block-id") ||
        nextWrapper?.querySelector("[data-block-id]")?.getAttribute("data-block-id") ||
        null;

      groups.push({
        startEditor: editor,
        start: opener.start,
        endEditor,
        end: closeIndex + 2,
        blockId: wrapper.getAttribute("data-block-id"),
        endBlockId: endWrapper?.getAttribute("data-block-id") || null,
        nextBlockId,
        raw: [
          text.slice(opener.start),
          ...texts.slice(1, texts.length - 1),
          lastText.slice(0, closeIndex + 2),
        ].join("\n"),
        content,
      });

      groupEditors.forEach((item) => consumed.add(item));
    }

    return groups;
  }

  function restoreSelection(range) {
    if (!range) {
      return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    debugLog("selection restored", {
      text: selection.toString(),
      anchorNode: selection.anchorNode?.textContent?.slice(0, 60) || null,
    });
  }

  async function openInlineEquationEditor(editor, selectedRange = null) {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    await ensureFocus(editor);
    await sleep(isSimpleTableCellEditor(editor) ? 16 : 8);
    restoreSelection(selectedRange);
    await sleep(isSimpleTableCellEditor(editor) ? 16 : 8);
    debugLog("openInlineEquationEditor shortcut mode", {
      editor: describeElement(editor),
      selectedText: selectedRange?.toString() || "",
      activeElement: describeElement(document.activeElement),
    });
    await simulateShortcut(isMac ? "Meta+Shift+E" : "Ctrl+Shift+E", document.activeElement || editor);
    await sleep(isSimpleTableCellEditor(editor) ? 20 : 10);
    return true;
  }

  // 文本输入模拟
  async function simulateTyping(text, quick = false) {
    const activeElement = document.activeElement;
    if (activeElement) {
      if (quick) {
        // 快速模式：直接插入整段文本 (模拟粘贴)
        const inputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        });
        activeElement.dispatchEvent(inputEvent);

        document.execCommand("insertText", false, text);

        const inputEventAfter = new InputEvent("input", {
          bubbles: true,
          cancelable: false,
          inputType: "insertText",
          data: text,
        });
        activeElement.dispatchEvent(inputEventAfter);
      } else {
        // 普通模式：逐字输入 (用于触发命令菜单等)
        for (const char of text) {
          const inputEvent = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: char,
          });
          activeElement.dispatchEvent(inputEvent);

          document.execCommand("insertText", false, char);

          const inputEventAfter = new InputEvent("input", {
            bubbles: true,
            cancelable: false,
            inputType: "insertText",
            data: char,
          });
          activeElement.dispatchEvent(inputEventAfter);

          await sleep(5);
        }
      }
    }
  }

  // 单个按键模拟
  async function simulateKey(keyName, target = null) {
    const keyInfo = getKeyCode(keyName);
    const eventTarget =
      target || document.activeElement || document.body || document;
    const keydownEvent = new KeyboardEvent("keydown", {
      key: keyInfo.key,
      code: keyInfo.code,
      keyCode: keyInfo.keyCode,
      bubbles: true,
    });
    const keyupEvent = new KeyboardEvent("keyup", {
      key: keyInfo.key,
      code: keyInfo.code,
      keyCode: keyInfo.keyCode,
      bubbles: true,
    });

    eventTarget.dispatchEvent(keydownEvent);
    await sleep(4);
    eventTarget.dispatchEvent(keyupEvent);
  }

  // 聚焦到目标元素，避免行顺序错位
  async function ensureFocus(element) {
    if (!element) return;

    // 表格单元格需要先激活 td 父元素，才能让内部编辑器真正进入编辑状态
    if (isSimpleTableCellEditor(element)) {
      const td = element.closest("td, th");
      if (td && document.activeElement !== element) {
        await simulateClick(td);
        await sleep(40);
      }
    }

    element.focus();
    await sleep(8);
    if (document.activeElement !== element) {
      await simulateClick(element);
    }
  }


  // Slash commands are handled by Notion's editor. Insert one character at a time
  // and wait for an actual menu instead of pasting "/block equation" as plain text.
  async function typeSlashQuery(text) {
    for (const char of text) {
      const target = document.activeElement;
      if (!target || !(target.isContentEditable || target.matches("input, textarea"))) {
        return false;
      }
      const options = {
        key: char,
        code: char === "/" ? "Slash" : "Key" + char.toUpperCase(),
        bubbles: true,
        cancelable: true,
      };
      target.dispatchEvent(new KeyboardEvent("keydown", options));
      target.dispatchEvent(new KeyboardEvent("keypress", options));
      target.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, inputType: "insertText", data: char,
      }));
      const ok = document.execCommand("insertText", false, char);
      target.dispatchEvent(new KeyboardEvent("keyup", options));
      if (!ok) return false;
      // Do not emit an extra input event; execCommand already does so.
      await new Promise(resolve => setTimeout(resolve, 65));
    }
    return true;
  }

  function slashMenuRoots() {
    return Array.from(
      document.querySelectorAll('.notion-overlay-container, [role="menu"], [role="listbox"]')
    ).filter(root =>
      isVisibleElement(root) &&
      root.querySelector('.notion-selectable, [role="menuitem"], [role="option"]')
    );
  }

  function slashMenuRoot() {
    return slashMenuRoots()[0] || null;
  }

  function findBlockEquationMenuItem() {
    for (const root of slashMenuRoots()) {
      const items = root.querySelectorAll(
        '.notion-selectable, [role="menuitem"], [role="option"]'
      );
      for (const item of items) {
        if (!isVisibleElement(item)) continue;
        const label = (item.textContent || "").replace(/\s+/g, " ").trim();
        if (!label || label.length > 140 || /inline equation|行内公式|内联公式/i.test(label)) {
          continue;
        }
        if (/block equation|math equation|equation|数学公式|块级公式|公式块|公式|方程式/i.test(label)) {
          return item;
        }
      }
    }
    return null;
  }

  async function restoreFailedSlash(editor, start, original, blockId = null, query = "") {
    // Notion may re-render the block while the slash menu is open. Re-resolve
    // the editor from its block id instead of using a stale element reference.
    let liveEditor = editor?.isConnected ? editor : null;
    if (!liveEditor && blockId) {
      liveEditor = document.querySelector(
        `[data-block-id="${CSS.escape(blockId)}"] [contenteditable="true"]`,
      );
    }
    if (!liveEditor) return false;
    // Restore only when the current editor still contains the slash query
    // at the original position. Never overwrite an unrelated Notion block.
    const expected = `/${query || ""}`;
    const suffix = (liveEditor.textContent || "").slice(start);
    if (!suffix.startsWith(expected)) return false;
    const selection = await selectRange(liveEditor, start, start + expected.length);
    if (!selection || selection.toString() !== expected) return false;
    return !!document.execCommand("insertText", false, original);
  }

  async function insertBlockEquation(editor, content) {
    const blockId =
      editor.closest?.("[data-block-id]")?.getAttribute("data-block-id") || null;
    let query = null;
    const fail = (reason, mutated) => ({ ok: false, reason, mutated, blockId, query });

    if (!await typeSlashQuery("/")) {
      return fail("无法触发块公式命令", false);
    }
    const menuRoot = await waitForCondition(slashMenuRoot, {timeout: 1100, interval: 30});
    if (!menuRoot) {
      return fail("斜杠菜单未打开", true);
    }

    let menuItem = findBlockEquationMenuItem();
    if (!menuItem) {
      // Notion slash search matches the localized item name. Typing "math"
      // in a Chinese UI filters out every item, so pick the query by menu language.
      query = /[㐀-鿿]/.test(menuRoot.textContent || "") ? "公式" : "math";
      if (!await typeSlashQuery(query)) {
        return fail("无法输入命令关键词", true);
      }
      menuItem = await waitForCondition(findBlockEquationMenuItem, {
        timeout: 1500, interval: 35,
      });
    }
    if (!menuItem) {
      return fail("未找到块公式菜单项", true);
    }
    await simulateClick(menuItem);

    const blockInput = await waitForInlineInput(editor, 40, 35);
    if (!blockInput) {
      return fail("块公式输入框未出现", true);
    }
    if (!selectElementContents(blockInput)) {
      return fail("无法选中块公式输入框", true);
    }
    await simulateTyping(normalizeFormulaContent(content), true);
    await sleep(30);
    await simulateKey("Enter", blockInput);
    await waitForCondition(() => document.activeElement !== blockInput, {
      timeout: 800, interval: 35,
    });
    return { ok: true };
  }

  // 优化的公式转换
  async function convertFormula(editor, formulaObj) {
    try {
      let { type, content, start, end, lineStart, lineEnd, standaloneBlock } =
        formulaObj;
      let renderMode = type;
      let useDisplayStyle = false;

      debugLog("convertFormula start", {
        editor: describeElement(editor),
        type,
        syntax: formulaObj.syntax,
        start,
        end,
        content,
      });

      if (type === "block" && !standaloneBlock) {
        console.log("检测到非独立行块公式，自动降级为行内公式");
        renderMode = "inline";
        useDisplayStyle = true;
      }

      // Only replace the formula itself: deleting its entire line can lose content.
      const rangeStart = start;
      const rangeEnd = end;
      const range = await selectRange(editor, rangeStart, rangeEnd);
      if (!range) {
        console.warn("未找到匹配的文本范围");
        return false;
      }

      debugLog("convertFormula range selected", {
        renderMode,
        selectedText: range.toString(),
        activeElement: describeElement(document.activeElement),
      });

      const normalizedContent = normalizeFormulaContent(content, {
        useDisplayStyle,
      });

      if (renderMode === "block") {
        if (window.getSelection()?.toString() !== formulaObj.raw) {
          updateStatus("块公式选区不匹配，已跳过");
          return false;
        }

        const result = await insertBlockEquation(editor, content);
        if (!result.ok) {
          if (result.mutated) {
            const restored = await restoreFailedSlash(
              editor, start, formulaObj.raw, result.blockId, result.query,
            );
            updateStatus(`${result.reason}，${restored ? "已恢复原文" : "请检查原文"}`);
          } else {
            updateStatus(`${result.reason}，已跳过`);
          }
          return false;
        }
      } else {
        const opened = await openInlineEquationEditor(editor, range);
        if (!opened) {
          return false;
        }

        // 仅在焦点进入独立公式输入框时继续，避免误伤正文
        const inlineInput = await waitForInlineInput(
          editor,
          isSimpleTableCellEditor(editor) ? 30 : 8,
          isSimpleTableCellEditor(editor) ? 25 : 12,
        );
        if (!inlineInput) {
          updateStatus(
            "行内公式输入框未打开，已跳过当前公式以避免误替换",
            4000,
          );
          return false;
        }

        if (!selectElementContents(inlineInput)) {
          updateStatus("无法安全选中行内公式输入框，已跳过当前公式", 4000);
          return false;
        }

        debugLog("inline input ready", {
          inlineInput: describeElement(inlineInput),
          activeElement: describeElement(document.activeElement),
          selectedText: window.getSelection()?.toString() || "",
        });

        await simulateTyping(normalizedContent, true);
        await sleep(10);

        debugLog("inline input typed", {
          activeElement: describeElement(document.activeElement),
          inlineInputText: inlineInput.value || inlineInput.textContent || "",
        });

        // 按 Enter 确认
        await simulateKey("Enter", inlineInput);
        await waitForCondition(() => document.activeElement !== inlineInput, {
          timeout: 140,
          interval: 10,
        });
        debugLog("inline input confirmed", {
          activeElement: describeElement(document.activeElement),
          editorText: editor.textContent,
        });
      }

      return renderMode;
    } catch (error) {
      console.error("转换公式时出错:", error);
      updateStatus(`错误: ${error.message}`);
      throw error;
    }
  }

  async function insertPlainText(editor, text) {
    if (!editor?.isConnected) return false;
    await ensureFocus(editor);
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await sleep(10);
    return !!document.execCommand("insertText", false, text);
  }

  async function convertCrossBlockFormula(group) {
    const { start, end, raw, content } = group;
    const lookupEditor = (id) =>
      id
        ? document.querySelector(
          `[data-block-id="${CSS.escape(id)}"] [contenteditable="true"]`,
        )
        : null;
    const startEditor =
      (group.startEditor?.isConnected ? group.startEditor : null) ||
      lookupEditor(group.blockId);
    const endEditor =
      (group.endEditor?.isConnected ? group.endEditor : null) ||
      lookupEditor(group.endBlockId);
    const startPos = startEditor && findTextPosition(startEditor, start);
    const endPos = endEditor && findTextPosition(endEditor, end);
    if (!startPos || !endPos) {
      updateStatus("跨块公式选区创建失败，已跳过");
      return false;
    }

    const compact = (text) => (text || "").replace(/\s+/g, "");

    await focusEditor(startEditor);
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await sleep(40);

    if (compact(selection.toString()) !== compact(raw)) {
      updateStatus("跨块公式选区不匹配，已跳过");
      return false;
    }

    // 用 Notion 自己的 Backspace 删除跨块选区，浏览器 execCommand 不能跨编辑根删除。
    await simulateKey("Backspace", document.activeElement || startEditor);
    const removed = await waitForCondition(() => {
      const root = document.querySelector(".notion-page-content") || document.body;
      return !compact(root.innerText).includes(compact(raw));
    }, {timeout: 1500, interval: 40});
    if (!removed) {
      updateStatus("跨块公式删除失败，已跳过");
      return false;
    }

    let target = lookupEditor(group.blockId);
    if (!target && group.nextBlockId) {
      const anchor = document.querySelector(
        `[data-block-id="${CSS.escape(group.nextBlockId)}"]`,
      );
      const prev = anchor?.previousElementSibling;
      target = prev?.matches('[contenteditable="true"]')
        ? prev
        : prev?.querySelector('[contenteditable="true"]') || null;
    }
    if (!target && document.activeElement?.isContentEditable) {
      target = document.activeElement;
    }
    if (!target) {
      updateStatus("未找到块公式插入位置，内容可能丢失");
      return false;
    }
    if (compact(target.textContent) !== "") {
      updateStatus("块公式插入位置不为空，已跳过，请检查原文");
      return false;
    }

    await focusEditor(target);
    const result = await insertBlockEquation(target, content);
    if (!result.ok) {
      const restored = await insertPlainText(target, raw);
      updateStatus(
        `${result.reason}，${restored ? "已恢复为单行文本" : "内容可能丢失"}`,
      );
      return false;
    }
    return true;
  }

  // ---------- 核心转换 ----------
  async function convertFormulas() {
    if (isProcessing) return;
    isProcessing = true; shouldStop = false;
    panel.classList.add("processing");
    try {
      // 扫描并获取总数
      const initialTasks = collectFormulaTasks();
      let totalFormulas = initialTasks.reduce((sum, item) => sum + item.formulas.length, 0);
      totalFormulas += findCrossBlockGroups().length;
      if (totalFormulas === 0) {
        progressText.textContent = "0";
        progressBar.style.width = "0%";
        return;
      }

      let formulaCount = 0;
      let lastProgressUpdate = 0;
      updateProgress(0, totalFormulas, "scanning");

      const updateProgressIfNeeded = (force = false) => {
        const now = Date.now();
        if (
          force ||
          formulaCount === totalFormulas ||
          now - lastProgressUpdate >= 80
        ) {
          updateProgress(formulaCount, totalFormulas, `${formulaCount}/${totalFormulas}`);
          lastProgressUpdate = now;
        }
      };

      const phases = [
        { name: "Inline", getTasks: () => initialTasks.map(({ editor, formulas }) => ({ editor, formulas: formulas.filter(f => f.type === "inline") })).filter(item => item.formulas.length) },
        { name: "Block", getTasks: () => collectFormulaTasks(f => f.type === "block") }
      ];

      for (const phase of phases) {
        if (shouldStop) break;
        const phaseTasks = phase.getTasks();
        for (const { editor, formulas } of phaseTasks.slice().reverse()) {
          if (shouldStop) break;
          for (const formulaObj of formulas.slice().reverse()) {
            if (shouldStop) break;
            const result = await convertFormula(editor, formulaObj);
            if (result) {
              formulaCount++;
              updateProgressIfNeeded();
            }
          }
        }
      }

      // 跨块块公式放在最后，从页面底部往上转换，避免删除块影响前面的位置。
      for (const group of findCrossBlockGroups().slice().reverse()) {
        if (shouldStop) break;
        const result = await convertCrossBlockFormula(group);
        if (result) {
          formulaCount++;
          updateProgressIfNeeded();
        }
      }

      if (formulaCount > 0) {
        totalConverted += formulaCount;
        GM_setValue("totalConverted", totalConverted);
      }

      updateProgressIfNeeded(true);
      updateProgress(formulaCount, totalFormulas, shouldStop ? "Stopped" : "Done");
      refreshTotalMenu();
    } finally {
      isProcessing = false;
      panel.classList.remove("processing");
      if (!shouldStop) {
        setTimeout(() => {
          panel.classList.remove("hover");
        }, 1200);
      }
    }
  }

  // 点击事件模拟
  async function simulateClick(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const events = [
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      }),
      new MouseEvent("mouseenter", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      }),
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      }),
      new MouseEvent("mouseup", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      }),
      new MouseEvent("click", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      }),
    ];

    for (const event of events) {
      element.dispatchEvent(event);
    }
    await sleep(8);
  }

  // 键盘快捷键模拟
  async function simulateShortcut(keyCombination, target = null) {
    const keys = keyCombination.split("+");
    const keyEvents = [];
    const eventTarget =
      target || document.activeElement || document.body || document;

    // 创建键盘事件
    for (const key of keys) {
      const keyCode = getKeyCode(key);

      keyEvents.push({
        key: keyCode.key,
        code: keyCode.code,
        keyCode: keyCode.keyCode,
        ctrlKey: keys.includes("Ctrl"),
        shiftKey: keys.includes("Shift"),
        altKey: keys.includes("Alt"),
        metaKey: keys.includes("Meta"),
        bubbles: true,
      });
    }

    // 先按下所有修饰键
    for (let i = 0; i < keyEvents.length - 1; i++) {
      const event = keyEvents[i];
      eventTarget.dispatchEvent(new KeyboardEvent("keydown", event));
    }

    // 按下最终按键
    const finalEvent = keyEvents[keyEvents.length - 1];
    eventTarget.dispatchEvent(new KeyboardEvent("keydown", finalEvent));
    eventTarget.dispatchEvent(new KeyboardEvent("keyup", finalEvent));

    // 释放所有修饰键
    for (let i = keyEvents.length - 2; i >= 0; i--) {
      const event = keyEvents[i];
      eventTarget.dispatchEvent(new KeyboardEvent("keyup", event));
    }

    await sleep(6);
  }

  // 获取键盘按键信息
  function getKeyCode(key) {
    const keyMap = {
      ctrl: { key: "Control", code: "ControlLeft", keyCode: 17 },
      shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 },
      alt: { key: "Alt", code: "AltLeft", keyCode: 18 },
      meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
      enter: { key: "Enter", code: "Enter", keyCode: 13 },
      escape: { key: "Escape", code: "Escape", keyCode: 27 },
      backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
      e: { key: "e", code: "KeyE", keyCode: 69 },
    };

    return (
      keyMap[key.toLowerCase()] || {
        key: key,
        code: `Key${key.toUpperCase()}`,
        keyCode: key.toUpperCase().charCodeAt(0),
      }
    );
  }

  // 初始化
  createPanel();

  // ---------- 注册菜单 ----------
  const menuIds = { toggle: null };

  function refreshToggleMenu() {
    if (menuIds.toggle !== null) GM_unregisterMenuCommand(menuIds.toggle);
    menuIds.toggle = GM_registerMenuCommand(`👀 悬浮按钮: ${panelVisible ? "隐藏" : "显示"}`, () => {
      panelVisible = !panelVisible;
      GM_setValue("panelVisible", panelVisible);
      const helper = document.getElementById("formula-helper");
      if (helper) helper.style.display = panelVisible ? "" : "none";
      refreshToggleMenu();
    });
  }

  GM_registerMenuCommand("🔄 执行公式转换", () => { if (!isProcessing) convertFormulas(); });

  refreshToggleMenu();

  GM_registerMenuCommand("🔗 反馈问题", () => window.open("https://github.com/printsdf/Notion-Formula-Auto-Conversion-Tool/issues"));

  refreshTotalMenu();

  // ===== 检测 Notion 侧边栏/设置面板/对话框/其他页面，自动隐藏按钮 =====
  function shouldHide() {
    return (
      document.querySelector('.chat_sidebar') ||
      document.querySelector('.notion-space-settings') ||
      document.querySelector('.notion-dialog')
    );
  }

  const sidebarObserver = new MutationObserver(() => {
    const helper = document.getElementById('formula-helper');
    if (!helper) return;

    if (!panelVisible) {
      if (helper.style.display !== 'none') {
        helper.style.display = 'none';
      }
      return;
    }

    if (shouldHide()) {
      if (helper.style.display !== 'none') {
        helper.style.display = 'none';
      }
    } else {
      if (helper.style.display !== '') {
        helper.style.display = '';
      }
    }
  });

  sidebarObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  // 监听ESC键取消
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isProcessing) {
      shouldStop = true;
      progressText.textContent = "Stopping…";
    }
  });

  console.log("Formula hover-to-convert tool loaded");
})();
