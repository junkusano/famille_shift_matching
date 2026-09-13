"use strict";
(() => {
  // src/sharefull/close.ts
  function sharefullCloseUrl(data) {
    if (!/^[1-9]\d*$/.test(data.sharefull_order_id ?? "")) throw new Error("Sharefull\u306E\u7BA1\u7406\u756A\u53F7\uFF08URL\u306E/orders/\u306B\u7D9A\u304F\u6570\u5B57\uFF09\u304C\u5FC5\u8981\u3067\u3059\u3002");
    if (data.sharefull_job_id !== void 0 && !/^[1-9]\d*$/.test(data.sharefull_job_id)) throw new Error("Sharefull\u6C42\u4EBAID\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    return "https://client.sharefull.com/orders/" + data.sharefull_order_id;
  }
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function text(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }
  function enabled(element) {
    return visible(element) && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true" && !element.classList.contains("tool-link-disabled");
  }
  function identity(data) {
    if (location.origin + location.pathname.replace(/\/$/, "") !== sharefullCloseUrl(data)) throw new Error("Sharefull\u306E\u5BFE\u8C61\u6C42\u4EBA\u30DA\u30FC\u30B8\u3068\u7BA1\u7406\u756A\u53F7\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
    const jobId = (document.body.innerText || "").match(/求人ID\s*[：:]?\s*(\d{6,})(?![\d*-])/u)?.[1];
    if (!jobId) throw new Error("\u753B\u9762\u306ESharefull\u6C42\u4EBAID\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
    if (data.sharefull_job_id && jobId !== data.sharefull_job_id) throw new Error("Sharefull\u6C42\u4EBAID\u304C\u4E00\u81F4\u3057\u306A\u3044\u305F\u3081\u3001\u52DF\u96C6\u7D42\u4E86\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F\u3002");
    return jobId;
  }
  function isClosed() {
    const status = document.querySelector('[data-test="orderStatus"]');
    return !!status && visible(status) && text(status) === "\u52DF\u96C6\u7D42\u4E86";
  }
  async function waitUntil(read, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    do {
      const value = read();
      if (value !== null) return value;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    return null;
  }
  async function closeSharefullSpotOffer(data) {
    try {
      const jobId = identity(data);
      const result = (already_closed) => ({ kind: "sharefull-spot-offer-closed", sharefull_order_id: data.sharefull_order_id, sharefull_job_id: jobId, already_closed });
      if (isClosed()) return result(true);
      const close = document.querySelector('[data-test="closeOrderButton"]');
      if (!close || !enabled(close)) throw new Error("\u64CD\u4F5C\u53EF\u80FD\u306A\u52DF\u96C6\u7D42\u4E86\u30DC\u30BF\u30F3\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
      close.click();
      const dialog = await waitUntil(() => {
        identity(data);
        return Array.from(document.querySelectorAll('[data-test="orderCloseConfirmDialog"]')).find(visible) ?? null;
      }, 15e3);
      if (!dialog) throw new Error("\u52DF\u96C6\u7D42\u4E86\u306E\u78BA\u8A8D\u753B\u9762\u304C\u8868\u793A\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      if (!text(dialog).includes("\u3053\u306E\u52DF\u96C6\u3092\u7D42\u4E86\u3057\u307E\u3059\u304B\uFF1F")) throw new Error("\u5358\u4E00\u6C42\u4EBA\u306E\u7D42\u4E86\u78BA\u8A8D\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u8907\u6570\u65E5\u306E\u4E00\u62EC\u7D42\u4E86\u306F\u5B9F\u884C\u3057\u307E\u305B\u3093\u3002");
      const confirm = Array.from(dialog.querySelectorAll('button, [role="button"]')).filter((button) => enabled(button) && text(button) === "\u7D42\u4E86\u3059\u308B");
      if (confirm.length !== 1) throw new Error("\u52DF\u96C6\u7D42\u4E86\u78BA\u8A8D\u306E\u300C\u7D42\u4E86\u3059\u308B\u300D\u30DC\u30BF\u30F3\u3092\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002");
      identity(data);
      confirm[0].click();
      const completed = await waitUntil(() => {
        identity(data);
        return isClosed() ? true : null;
      }, 3e4);
      if (!completed) throw new Error("\u52DF\u96C6\u7D42\u4E86\u306E\u5B8C\u4E86\u72B6\u614B\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u5B9F\u884C\u524D\u306B\u6C42\u4EBA\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return result(false);
    } catch (error) {
      return { kind: "sharefull-spot-offer-close-failed", detail: error instanceof Error ? error.message : "Sharefull\u52DF\u96C6\u7D42\u4E86\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" };
    }
  }

  // src/shared/rpaDiagnostics.ts
  var MAX_HTML = 3e5;
  var MAX_TEXT = 8e4;
  var MAX_IMPORTANT = 8e4;
  function maskSensitiveText(value) {
    return value.replace(/([01]?\d\d|2[0-4]\d|25[0-5])[\s-]?\d{4}[\s-]?\d{4}/g, "$1-****-****").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => {
      const [local, domain] = email.split("@");
      return `${local.slice(0, 1)}***@${domain}`;
    });
  }
  function clip(value, max) {
    return value.length > max ? `${value.slice(0, max)}
<!-- clipped -->` : value;
  }
  function simpleHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  var SENSITIVE_FIELD_PATTERN = /(token|secret|password|passwd|authorization|csrf|viewstate|session)/i;
  var SENSITIVE_QUERY_PATTERN = /(token|key|secret|signature|authorization|auth|session)/i;
  function sanitizedUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      const queryKeys = [];
      url.searchParams.forEach((_value, key) => queryKeys.push(key));
      for (const key of queryKeys) {
        if (SENSITIVE_QUERY_PATTERN.test(key)) url.searchParams.set(key, "[MASKED]");
      }
      url.hash = "";
      return url.toString();
    } catch {
      return maskSensitiveText(value);
    }
  }
  function sanitizedHtml(element, max, includeRoot = false) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("script").forEach((script) => script.remove());
    clone.querySelectorAll("*").forEach((node) => {
      for (const attribute of Array.from(node.attributes)) {
        if (attribute.name.toLowerCase() === "nonce") node.removeAttribute(attribute.name);
        else if (attribute.name.toLowerCase().startsWith("on")) node.removeAttribute(attribute.name);
        else if (SENSITIVE_FIELD_PATTERN.test(attribute.name)) node.setAttribute(attribute.name, "[MASKED]");
      }
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        const key = `${node.getAttribute("name") ?? ""} ${node.id} ${node.getAttribute("autocomplete") ?? ""}`;
        const type = node instanceof HTMLInputElement ? node.type.toLowerCase() : "textarea";
        if (type === "password" || SENSITIVE_FIELD_PATTERN.test(key)) {
          node.setAttribute("value", "[MASKED]");
          if (node instanceof HTMLTextAreaElement) node.textContent = "[MASKED]";
        } else if (node.hasAttribute("value")) {
          node.setAttribute("value", maskSensitiveText(node.getAttribute("value") ?? ""));
        }
      }
    });
    return maskSensitiveText(clip(includeRoot ? clone.outerHTML : clone.innerHTML, max));
  }
  function captureCurrentPageSnapshot(request, importantSelectors = {}) {
    const bodyHtml = document.body ? sanitizedHtml(document.body, MAX_HTML) : "";
    const bodyText = maskSensitiveText(clip(document.body?.innerText ?? "", MAX_TEXT));
    const importantDom = {};
    const importantPresence = [];
    for (const [key, selector] of Object.entries(importantSelectors)) {
      const node = document.querySelector(selector);
      importantPresence.push(`${key}:${Boolean(node)}`);
      importantDom[key] = node ? sanitizedHtml(node, MAX_IMPORTANT, true) : "";
    }
    const scripts = Array.from(document.scripts).map((script) => ({
      src: sanitizedUrl(script.src),
      type: script.type || null,
      async: script.async,
      defer: script.defer,
      integrity: script.integrity || null,
      crossorigin: script.crossOrigin || null
    }));
    const elementSignatures = Array.from(document.body?.querySelectorAll("*") ?? []).slice(0, 5e3).map((element) => `${element.tagName.toLowerCase()}#${element.id}.${Array.from(element.classList).sort().join(".")}`).join("|");
    const structure = `${elementSignatures}|${importantPresence.join(",")}|${scripts.map((s) => s.src).join(",")}`;
    return {
      ...request,
      pageUrl: location.href,
      pagePath: `${location.pathname}${location.search}`,
      pageTitle: document.title,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      bodyHtml,
      bodyText,
      importantDom,
      scripts,
      domFingerprint: simpleHash(structure)
    };
  }

  // src/sharefull/dom.ts
  var BASE_ID = "428828";
  function isCandidateSharefullTemplateId(value) {
    return /^\d{4,}$/.test(value) && value !== BASE_ID;
  }
  function extractTemplateIdFromText(text2) {
    const labelMatch = text2.replace(/\s+/g, " ").match(/(?:テンプレートID|求人ID)\s*[：:]?\s*(\d{4,})/);
    return labelMatch && isCandidateSharefullTemplateId(labelMatch[1]) ? labelMatch[1] : null;
  }
  function readSharefullTemplateId(expectedTitle) {
    const currentUrl = new URL(location.href);
    const pathMatch = currentUrl.pathname.match(/\/order_template\/(\d+)/);
    if (pathMatch && isCandidateSharefullTemplateId(pathMatch[1])) return pathMatch[1];
    for (const key of ["orderTemplate", "orderTemplateId", "templateId"]) {
      const value = currentUrl.searchParams.get(key);
      if (value && isCandidateSharefullTemplateId(value)) return value;
    }
    const baseTitle = expectedTitle?.trim().replace(/\s*@\d+@\s*$/, "");
    if (baseTitle) {
      const titleElement = Array.from(document.querySelectorAll("a, h1, h2, h3, h4, h5, h6, div, span")).filter((element) => element.getBoundingClientRect().width > 0 && (element.innerText || element.textContent || "").replace(/\s+/g, " ").includes(baseTitle)).sort((left, right) => (left.innerText || left.textContent || "").length - (right.innerText || right.textContent || "").length)[0];
      let container = titleElement;
      for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
        const id = extractTemplateIdFromText(container.innerText || container.textContent || "");
        if (id) return id;
      }
    }
    const hrefMatch = Array.from(document.querySelectorAll("a[href]")).map((anchor) => anchor.href.match(/\/order_template\/(\d+)/)?.[1] ?? null).find((value) => value !== null && isCandidateSharefullTemplateId(value));
    if (hrefMatch) return hrefMatch;
    return extractTemplateIdFromText(visibleText());
  }
  function readSharefullTemplateStatuses() {
    if (detectSharefullPage() !== "list") return [];
    const snapshots = /* @__PURE__ */ new Map();
    const candidates = Array.from(document.querySelectorAll("button, [role='button']")).filter((element) => isEnabledOrDisabledVisible(element)).map((element) => ({
      element,
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()
    })).filter(({ text: text2 }) => text2 === "\u5BE9\u67FB\u4E2D" || text2 === "\u6C42\u4EBA\u3092\u4F5C\u6210");
    for (const { element, text: text2 } of candidates) {
      let container = element;
      for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
        const templateId = extractTemplateIdFromText(container.innerText || container.textContent || "");
        if (templateId) {
          snapshots.set(templateId, {
            templateId,
            status: text2 === "\u5BE9\u67FB\u4E2D" ? "template_review" : "ready_for_offer"
          });
          break;
        }
      }
    }
    return [...snapshots.values()];
  }
  function isEnabledOrDisabledVisible(element) {
    const style = globalThis.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }
  function detectSharefullPage(url = location.href) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "client.sharefull.com") return "unknown";
      const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
      if (pathname === "/order_template") return "list";
      if (pathname === "/order_template/thanks") return "thanks";
      if (pathname === "/orders/copy" && parsed.searchParams.get("orderTemplate")) return "offer-copy";
      if (pathname === "/order_template/new" && parsed.searchParams.get("copy") === BASE_ID) return "copy";
    } catch {
    }
    return "unknown";
  }
  function visibleText() {
    return document.body?.innerText ?? "";
  }
  function detectSharefullStep() {
    const texts = [
      document.body?.innerText ?? "",
      document.body?.textContent ?? "",
      ...Array.from(document.querySelectorAll("[aria-label], [title]")).flatMap((element) => [element.getAttribute("aria-label") ?? "", element.getAttribute("title") ?? ""])
    ];
    const match = texts.join("\n").match(/([1-4])\s*[\/／]\s*4/);
    return match ? Number(match[1]) : 0;
  }
  function fillFirst(selectors, value) {
    if (!value.trim()) return false;
    for (const selector of selectors) {
      const element = find(selector);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        setNativeValue(element, value);
        return true;
      }
    }
    return false;
  }
  function normalizeDate(value) {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
  }
  function readSharefullJobId() {
    const text2 = (document.body?.innerText ?? "").replace(/\s+/g, " ");
    const match = text2.match(/求人ID\s*[：:]?\s*(\d{6,})/);
    return match?.[1] ?? null;
  }
  async function waitFor(selector, timeoutMs = 15e3) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = find(selector);
      if (element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0) return element;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
    }
    return null;
  }
  async function selectCalendarDate(value, inputSelector) {
    const target = normalizeDate(value);
    if (!target) return false;
    const input = inputSelector ? find(inputSelector) : null;
    if (input instanceof HTMLInputElement) input.click();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const dateCell = findCalendarDateCell(value, target.day);
      if (dateCell) {
        const clickTarget = dateCell.matches(".day") ? dateCell : dateCell.querySelector(".day") ?? dateCell;
        clickTarget.click();
        const selectedDeadline = Date.now() + 2e3;
        while (Date.now() < selectedDeadline) {
          const selectedCell = findCalendarDateCell(value, target.day);
          const selectedDay = selectedCell?.matches(".day") ? selectedCell : selectedCell?.querySelector(".day");
          if (selectedDay?.classList.contains("selected")) return true;
          if (input instanceof HTMLInputElement && isTargetDateValue(input.value, target)) return true;
          await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
        }
        return false;
      }
      const header = Array.from(document.querySelectorAll(".vc-header, .vc-pane-header")).find((element) => /\d{4}年\s*\d{1,2}月/.test(element.innerText));
      const current = header?.innerText.match(/(\d{4})年\s*(\d{1,2})月/);
      if (!current) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
        continue;
      }
      const currentIndex = Number(current[1]) * 12 + Number(current[2]);
      const targetIndex = target.year * 12 + target.month;
      if (currentIndex === targetIndex) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
        continue;
      }
      const direction = targetIndex > currentIndex ? "next" : "prev";
      const button = document.querySelector(`button.vc-${direction}`);
      if (!button || button.disabled) return false;
      button.click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
    }
    return false;
  }
  function findCalendarDateCell(value, dayNumber) {
    const exactSelectors = [
      `[id="${value}"]`,
      `[data-date="${value}"]`,
      `[data-day="${value}"]`,
      `[aria-label="${value}"]`,
      `[aria-label="${value.replace(/-/g, "/")}"]`
    ];
    for (const selector of exactSelectors) {
      const element = document.querySelector(selector);
      if (element && isEnabledOrDisabledVisible(element) && !isCalendarOutsideMonth(element)) return element;
    }
    const candidates = Array.from(document.querySelectorAll(
      "[role='gridcell'], [role='button'], button, .day, [class*='day']"
    )).filter((element) => isEnabledOrDisabledVisible(element) && (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim() === String(dayNumber) && !isCalendarOutsideMonth(element));
    return candidates[0]?.closest("button, [role='button']") ?? candidates[0] ?? null;
  }
  function isTargetDateValue(value, target) {
    const normalized = value.trim().replace(/\//g, "-");
    const month = String(target.month).padStart(2, "0");
    const day = String(target.day).padStart(2, "0");
    return normalized === `${target.year}-${month}-${day}` || normalized.startsWith(`${target.year}-${month}-${day}T`) || normalized === `${target.year}-${target.month}-${target.day}` || value.trim() === `${target.year}\u5E74${target.month}\u6708${target.day}\u65E5` || value.trim() === `${month}/${day}/${target.year}`;
  }
  function isCalendarOutsideMonth(element) {
    return /outside|disabled|adjacent|other-month|not-current/i.test(element.className) || element.getAttribute("aria-disabled") === "true" || element.hasAttribute("disabled");
  }
  function numberInputInSection(label) {
    const visibleInputs = Array.from(document.querySelectorAll('input[type="number"]')).filter((input) => isEnabledOrDisabledVisible(input));
    for (const input of visibleInputs) {
      const labelledBy = input.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      if (labelledBy.some((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim().includes(label))) return input;
    }
    const labelElement = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, label, span, div")).find((element) => element.textContent?.replace(/\s+/g, " ").trim() === label);
    let container = labelElement?.parentElement ?? null;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      const inputs = Array.from(container.querySelectorAll('input[type="number"]')).filter((input) => isEnabledOrDisabledVisible(input));
      if (inputs.length === 1) return inputs[0];
      if (inputs.length > 1 && container.textContent?.includes(label)) return inputs[inputs.length - 1];
    }
    return null;
  }
  async function waitForCommuteUpperLimitInput(timeoutMs = 3e3) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((element) => element.textContent?.replace(/\s+/g, " ").trim() === "\u901A\u52E4\u4EA4\u901A\u8CBB");
      const container = heading?.closest(".content") ?? heading?.parentElement;
      const candidates = Array.from(container?.querySelectorAll('input:not([type="hidden"])') ?? []).filter((input) => isEnabledOrDisabledVisible(input) && input.getAttribute("role") !== "combobox" && input.type !== "checkbox" && input.type !== "radio");
      const numeric = candidates.find((input) => input.type === "number" || input.inputMode === "numeric" || input.inputMode === "decimal");
      if (numeric) return numeric;
      const labelled = numberInputInSection("\u4E0A\u9650\u91D1\u984D");
      if (labelled) return labelled;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    return null;
  }
  async function selectCommuteFee(value) {
    const amount = Number(value);
    const hasCommuteFee = Number.isFinite(amount) && amount > 0;
    const targetOption = hasCommuteFee ? "\u5B9F\u8CBB" : "\u7121\u3057";
    const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((element) => element.textContent?.replace(/\s+/g, " ").trim() === "\u901A\u52E4\u4EA4\u901A\u8CBB");
    const container = heading?.closest(".content") ?? heading?.parentElement;
    const selectInput = container?.querySelector('input[role="combobox"]');
    if (!selectInput) return false;
    if (selectInput.value !== targetOption) {
      selectInput.click();
      const option = await waitForVisibleText(targetOption, 2e3);
      if (!option) return false;
      option.click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
    }
    return selectInput.value === targetOption;
  }
  async function waitForVisibleText(text2, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = Array.from(document.querySelectorAll("body *")).find((candidate) => isEnabledOrDisabledVisible(candidate) && candidate.textContent?.replace(/\s+/g, " ").trim() === text2);
      if (element) return element;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    return null;
  }
  function readPublishedSharefullJobId() {
    return readSharefullJobId();
  }
  async function createSharefullSpotOffer(data) {
    if (detectSharefullPage() !== "offer-copy") return { kind: "sharefull-spot-offer-failed", detail: "\u30B7\u30A7\u30A2\u30D5\u30EB\u306E\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304B\u3089\u6C42\u4EBA\u4F5C\u6210\u753B\u9762\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" };
    const missing = [];
    if (!await selectCalendarDate(data.shift_start_date, '[data-test="shugyoKaishiJikan-date-input"] input')) missing.push("\u52E4\u52D9\u65E5");
    if (!fillFirst(['[data-test="shugyoKaishiJikan-time"] input[type="time"]'], data.shift_start_time.trim())) missing.push("\u958B\u59CB\u6642\u523B");
    if (!fillFirst(['[data-test="shugyoShuryoJikan-time"] input[type="time"]'], data.shift_end_time.trim())) missing.push("\u7D42\u4E86\u6642\u523B");
    const wage = data.hourly_wage === null ? "" : String(data.hourly_wage);
    if (!fillFirst(['[data-test="kijunTanka"] input'], wage)) missing.push("\u6642\u7D66");
    const commuteAmount = Number(data.commute_fee);
    const hasCommuteFee = Number.isFinite(commuteAmount) && commuteAmount > 0;
    if (await selectCommuteFee(data.commute_fee)) {
      if (hasCommuteFee) {
        const commuteInput = await waitForCommuteUpperLimitInput();
        if (commuteInput) setNativeValue(commuteInput, String(commuteAmount));
        else missing.push("\u4EA4\u901A\u8CBB\u4E0A\u9650\u91D1\u984D");
      }
    } else {
      missing.push("\u901A\u52E4\u4EA4\u901A\u8CBB");
    }
    const headcount = data.headcount === null || data.headcount === void 0 ? "1" : String(data.headcount);
    const headcountInput = find('[data-test="boshuNinzu"] input[type="number"]');
    if (headcountInput instanceof HTMLInputElement && headcountInput.value !== headcount) setNativeValue(headcountInput, headcount);
    if (missing.length) return { kind: "sharefull-spot-offer-failed", detail: `\u5165\u529B\u9805\u76EE\u3092\u691C\u51FA\u3067\u304D\u307E\u305B\u3093: ${missing.join("\u3001")}` };
    if (data.execution_mode !== "publish") {
      const save = await waitFor("button#Body-SaveOrder-Button.temporarily-save");
      if (!(save instanceof HTMLButtonElement)) return { kind: "sharefull-spot-offer-failed", detail: "\u300C\u4E00\u6642\u4FDD\u5B58\u3059\u308B\u300D\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" };
      save.click();
      return { kind: "sharefull-spot-offer-saved" };
    }
    const start = await waitFor('button[data-test="confirm"]');
    if (!(start instanceof HTMLButtonElement)) return { kind: "sharefull-spot-offer-failed", detail: "\u300C\u52DF\u96C6\u3092\u958B\u59CB\u3059\u308B\u300D\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" };
    start.click();
    const publish = await waitFor('button[data-test="confirm-ok"]');
    if (!(publish instanceof HTMLButtonElement)) return { kind: "sharefull-spot-offer-failed", detail: "\u300C\u6C42\u4EBA\u3092\u516C\u958B\u3059\u308B\u300D\u78BA\u8A8D\u30DC\u30BF\u30F3\u304C\u8868\u793A\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    publish.click();
    const deadline = Date.now() + 45e3;
    while (Date.now() < deadline) {
      const jobId = readSharefullJobId();
      if (jobId) return { kind: "sharefull-spot-offer-created", sharefull_job_id: jobId };
      const aiSubmit = find('[data-test="ai-check-submit-as-is"]');
      if (aiSubmit instanceof HTMLButtonElement && !aiSubmit.disabled && aiSubmit.getBoundingClientRect().width > 0) {
        aiSubmit.click();
        return { kind: "sharefull-spot-offer-submitted" };
      }
      if (detectSharefullPage() !== "offer-copy") return { kind: "sharefull-spot-offer-submitted" };
      await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
    return { kind: "sharefull-spot-offer-failed", detail: "AI\u78BA\u8A8D\u5F8C\u306E\u300C\u52DF\u96C6\u3092\u958B\u59CB\u300D\u307E\u305F\u306F\u63B2\u8F09\u5B8C\u4E86\u753B\u9762\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
  }
  function find(selector) {
    return document.querySelector(selector);
  }
  function findEnabledVisibleButtonByText(text2) {
    return Array.from(document.querySelectorAll("button")).find((button) => {
      const style = globalThis.getComputedStyle(button);
      return button.textContent?.replace(/\s+/g, " ").trim() === text2 && !button.disabled && style.display !== "none" && style.visibility !== "hidden" && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0;
    }) ?? null;
  }
  function isEnabledVisible(element) {
    const style = globalThis.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
  }
  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function fill(selector, value) {
    const element = find(selector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    setNativeValue(element, value);
    return true;
  }
  function fillRequired(missing, label, selector, value) {
    if (!value.trim() || !fill(selector, value)) missing.push(label);
  }
  async function fillPostcode(missing, value) {
    const selector = 'div[data-test="postcode"] input[maxlength="8"]';
    if (!value.trim()) {
      missing.push("\u90F5\u4FBF\u756A\u53F7");
      return;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const element = find(selector);
      if (element instanceof HTMLInputElement) {
        element.focus();
        setNativeValue(element, value);
        element.dispatchEvent(new Event("blur", { bubbles: true }));
        await new Promise((resolve) => globalThis.setTimeout(resolve, 300));
        if (element.value.trim() === value.trim()) return;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
    }
    missing.push("\u90F5\u4FBF\u756A\u53F7");
  }
  async function waitForNonEmptyValue(selector, timeoutMs = 5e3) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = find(selector);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (element.value.trim()) return true;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    return false;
  }
  async function openSharefullOptions() {
    const button = Array.from(document.querySelectorAll("button.v-expansion-panel-title")).find((candidate) => candidate.innerText.includes("\u30AA\u30D7\u30B7\u30E7\u30F3\u8A2D\u5B9A"));
    if (!button) return false;
    if (button.getAttribute("aria-expanded") !== "true") button.click();
    const deadline = Date.now() + 5e3;
    while (Date.now() < deadline) {
      if (find('div[data-test="orderMessageBody"] textarea')) return true;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    return false;
  }
  function appendParts(...parts) {
    return parts.map((part) => part?.trim()).filter(Boolean).join("\n\n");
  }
  function managementLabel(data) {
    return data.internal_label?.trim() ?? "";
  }
  function formatSharefullTemplateTitle(title, kaipokeCsId) {
    const baseTitle = title?.trim() ?? "";
    const id = kaipokeCsId?.trim() ?? "";
    if (!baseTitle || !id) return baseTitle;
    if (baseTitle.includes(`@${id}@`)) return baseTitle;
    return `${baseTitle} @${id}@`;
  }
  async function fillCurrentSharefullStep(data) {
    if (detectSharefullPage() !== "copy") return { kind: "sharefull-page-not-ready", detail: "428828\u30B3\u30D4\u30FC\u4F5C\u6210\u753B\u9762\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" };
    const step = detectSharefullStep();
    if (!step) return { kind: "sharefull-page-not-ready", detail: "1/4\u301C4/4\u306E\u753B\u9762\u3092\u5224\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002" };
    const missing = [];
    if (step === 2) {
      await fillPostcode(missing, data.meeting_yuubinn ?? "");
      if (missing.length === 0 && !await waitForNonEmptyValue('div[data-test="address1"] input[readonly]')) {
        missing.push("\u4F4F\u62401\u306E\u81EA\u52D5\u53CD\u6620");
      }
      fillRequired(missing, "\u4F4F\u62402", 'div[data-test="address2"] input', data.meeting_place_banchi ?? "");
      fillRequired(missing, "\u5C31\u696D\u5148\u540D\u79F0", 'div[data-test="shugyoBasho"] input', data.matching_place_name ?? "");
    } else if (step === 3) {
      const title = data.template_title?.trim() ?? "";
      const catchphrase = "\u652F\u3048\u308B\u3042\u306A\u305F\u3082\u3001\u5927\u5207\u306B\u3057\u305F\u3044";
      const decoratedCatchphrase = "\u{1F33F} " + catchphrase;
      const jobTitle = title.endsWith(catchphrase) ? title.replace(/(?:🌿 )?支えるあなたも、大切にしたい$/u, decoratedCatchphrase) : title ? title + "\uFF5C" + decoratedCatchphrase : title;
      fillRequired(missing, "\u6C42\u4EBA\u540D\u79F0", '[data-test="title"] input, input[name="title"]', jobTitle);
      fillRequired(missing, "\u696D\u52D9\u8A73\u7D30", 'div[data-test="gyomuShosai"] textarea', appendParts(data.work_description, data.env.sukima_detail));
      const hasActionSupport = (data.required_licenses ?? []).some((license) => /行動援護/.test(license));
      fillRequired(missing, "\u6CE8\u610F\u4E8B\u9805", 'div[data-test="chuiJiko"] textarea', appendParts(data.required_licenses?.join("\n"), hasActionSupport ? data.env.sukima_koudou : null, data.env.sukima_caution));
    } else if (step === 4) {
      if (!await openSharefullOptions()) missing.push("\u30AA\u30D7\u30B7\u30E7\u30F3\u8A2D\u5B9A");
      fillRequired(missing, "\u304A\u77E5\u3089\u305B\u672C\u6587", 'div[data-test="orderMessageBody"] textarea', appendParts(data.matching_msg, data.env.sukima_automsg));
      fillRequired(missing, "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u540D", '[data-test="templateTitle"] input, input[name="templateTitle"]', formatSharefullTemplateTitle(data.template_title, data.kaipoke_cs_id));
      fillRequired(missing, "\u7BA1\u7406\u7528\u30E9\u30D9\u30EB", '[data-test="managementLabel"] input, input[name="managementLabel"]', managementLabel(data));
    }
    if (missing.length > 0) return { kind: "sharefull-fill-failed", detail: `${step}/4\u306E\u5165\u529B\u9805\u76EE\u3092\u691C\u51FA\u3067\u304D\u307E\u305B\u3093: ${missing.join("\u3001")}` };
    return { kind: "sharefull-page-filled", step };
  }
  function clickSharefullNext() {
    const button = find('[data-test="next"]');
    if (!button) return false;
    button.click();
    return true;
  }
  function installCreateResponseCapture() {
    const key = "__familleSharefullRegisterCapture";
    if (window[key]) return;
    window[key] = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : args[0].toString();
      if (url.includes("RegisterOrderTemplate")) {
        const copy = response.clone();
        try {
          const body = await copy.json();
          const templateId = typeof body.id === "number" || typeof body.id === "string" ? String(body.id) : "";
          if (templateId && templateId !== BASE_ID && body.originTemplateId === Number(BASE_ID)) {
            window.postMessage({ source: key, templateId }, location.origin);
          }
        } catch {
        }
      }
      return response;
    };
  }
  async function clickSharefullCreate() {
    const deadline = Date.now() + 45e3;
    let createClickedAt = null;
    while (Date.now() < deadline) {
      const create = find('button[data-test="submit-create"]') ?? find('#Body-CreateOrderTemplate-Button, [data-test="create-template"], [data-test="create"]') ?? findEnabledVisibleButtonByText("\u4F5C\u6210");
      if (create && createClickedAt === null && isEnabledVisible(create) && !(create instanceof HTMLButtonElement && create.disabled)) {
        create.scrollIntoView({ block: "center", inline: "center" });
        create.focus();
        create.click();
        createClickedAt = Date.now();
      }
      const submit = find('[data-test="ai-check-submit-as-is"]');
      if (createClickedAt !== null && submit && isEnabledVisible(submit) && !(submit instanceof HTMLButtonElement && submit.disabled)) {
        submit.click();
        return true;
      }
      if (createClickedAt !== null && Date.now() - createClickedAt >= 1e4) {
        return true;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
    return false;
  }

  // src/sharefull/rpa.ts
  function getSharefullPageContext() {
    return { page: detectSharefullPage(), step: detectSharefullStep() };
  }
  function fillSharefullCopyPage(data) {
    return fillCurrentSharefullStep(data);
  }
  function advanceSharefullCopyPage() {
    return clickSharefullNext();
  }
  function prepareSharefullCreation() {
    installCreateResponseCapture();
  }
  function createSharefullTemplate() {
    return clickSharefullCreate();
  }
  function createSharefullSpotOffer2(data) {
    return createSharefullSpotOffer(data);
  }

  // src/content/kaipokeCertificates.ts
  function normalizedText(value) {
    return (value ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
  }
  function isoDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  function westernYear(era, eraYear) {
    const value = eraYear === "\u5143" ? 1 : Number(eraYear);
    if (!Number.isInteger(value) || value < 1) return null;
    if (era === "\u4EE4\u548C") return 2018 + value;
    if (era === "\u5E73\u6210") return 1988 + value;
    if (era === "\u662D\u548C") return 1925 + value;
    return null;
  }
  function extractKaipokeDates(value) {
    const normalized = value.normalize("NFKC");
    const matches = [];
    const eraPattern = /(令和|平成|昭和)\s*(元|\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/g;
    const westernPattern = /(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*日?/g;
    for (const match of normalized.matchAll(eraPattern)) {
      const year = westernYear(match[1], match[2]);
      const date = year === null ? null : isoDate(year, Number(match[3]), Number(match[4]));
      if (date) matches.push({ index: match.index ?? 0, value: date });
    }
    for (const match of normalized.matchAll(westernPattern)) {
      const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (date) matches.push({ index: match.index ?? 0, value: date });
    }
    return matches.sort((left, right) => left.index - right.index).map((match) => match.value).filter((date, index, dates) => index === 0 || date !== dates[index - 1]);
  }
  function certificateNumber(value) {
    const digits = value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, 20);
    return digits || null;
  }
  function detectKind(headers, pageText) {
    const joined = headers.join("|");
    if (/受給者証番号|受給者番号/.test(joined)) return "disabilityRecipient";
    if (/被保険者番号|介護度|認定区分/.test(joined)) return "careInsurance";
    if (/受給者証情報/.test(pageText) && headers.some((header) => /番号/.test(header))) {
      return "disabilityRecipient";
    }
    if (/被保険者証情報/.test(pageText) && headers.some((header) => /番号/.test(header))) {
      return "careInsurance";
    }
    return null;
  }
  function findPeriodIndex(headers, kind) {
    const specific = kind === "careInsurance" ? /被保.*適用期間|認定有効期間/ : /支給決定期間|受給者証.*(?:有効|適用)期間/;
    const exact = headers.findIndex((header) => specific.test(header));
    return exact >= 0 ? exact : headers.findIndex((header) => /有効期間|適用期間/.test(header));
  }
  function findNumberIndex(headers, kind) {
    const pattern = kind === "careInsurance" ? /被保険者番号/ : /受給者証番号|受給者番号/;
    const exact = headers.findIndex((header) => pattern.test(header));
    return exact >= 0 ? exact : headers.findIndex((header) => /番号/.test(header));
  }
  function newestCertificate(candidates) {
    const latest = [...candidates].sort((left, right) => {
      const end = (right.validTo ?? "").localeCompare(left.validTo ?? "");
      return end !== 0 ? end : (right.validFrom ?? "").localeCompare(left.validFrom ?? "");
    })[0];
    if (!latest) return null;
    return {
      number: latest.number,
      validFrom: latest.validFrom,
      validTo: latest.validTo
    };
  }
  function getKaipokeClientCertificates(documentValue) {
    const pageText = normalizedText(documentValue.body?.innerText ?? documentValue.body?.textContent);
    const candidates = [];
    let careInsuranceObserved = false;
    let disabilityRecipientObserved = false;
    for (const table of Array.from(documentValue.querySelectorAll("table"))) {
      const rows = Array.from(table.rows);
      const headerRowIndex = rows.findIndex((row) => row.querySelector("th") !== null);
      if (headerRowIndex < 0) continue;
      const headers = Array.from(rows[headerRowIndex].cells).map((cell) => normalizedText(cell.textContent));
      const kind = detectKind(headers, pageText);
      if (!kind) continue;
      if (kind === "careInsurance") careInsuranceObserved = true;
      else disabilityRecipientObserved = true;
      const periodIndex = findPeriodIndex(headers, kind);
      const numberIndex = findNumberIndex(headers, kind);
      if (periodIndex < 0 || numberIndex < 0) continue;
      for (const row of rows.slice(headerRowIndex + 1)) {
        const cells = Array.from(row.cells);
        if (cells.length <= Math.max(periodIndex, numberIndex)) continue;
        const dates = extractKaipokeDates(cells[periodIndex].textContent ?? "");
        const number = certificateNumber(cells[numberIndex].textContent ?? "");
        if (!number && dates.length === 0) continue;
        candidates.push({
          kind,
          number,
          validFrom: dates[0] ?? null,
          validTo: dates[1] ?? dates[0] ?? null
        });
      }
    }
    return {
      careInsuranceObserved,
      careInsurance: newestCertificate(candidates.filter((item) => item.kind === "careInsurance")),
      disabilityRecipientObserved,
      disabilityRecipient: newestCertificate(candidates.filter((item) => item.kind === "disabilityRecipient"))
    };
  }

  // src/content/index.ts
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const value = event.data;
    if (value?.source === "__familleSharefullRegisterCapture" && typeof value.templateId === "string") {
      void chrome.runtime.sendMessage({ kind: "sharefull-create-response", templateId: value.templateId });
    }
  });
  var KAIPOKE_ID_PATTERN = /^\d{1,20}$/;
  function detectKaitekPageContext() {
    if (location.hostname !== "biz.caitech.co.jp") return { kind: "not-kaitek-target" };
    if (document.body.innerText.includes("\u6848\u4EF6\u3092\u516C\u958B")) return { kind: "kaitek-new-work" };
    if (location.pathname === "/works") {
      return { kind: "kaitek-list" };
    }
    const match = location.pathname.match(/^\/works\/(\d+)\/edit$/);
    if (match) return { kind: "kaitek-work-edit", workId: match[1] };
    return { kind: "not-kaitek-target" };
  }
  function collectKaitekFormInspection() {
    const page = detectKaitekPageContext();
    const controls = Array.from(document.querySelectorAll(
      "button, input, textarea, select, [role='button'], [role='combobox'], [role='radio']"
    )).map((element) => ({
      role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
      label: element.getAttribute("aria-label") ?? element.getAttribute("name") ?? element.getAttribute("placeholder"),
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true"
    })).filter((control) => control.text || control.label);
    const visibleText2 = Array.from(document.querySelectorAll(
      "h1, h2, h3, h5, h6, label, p, [role='heading']"
    )).map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return { page, visibleText: visibleText2, controls };
  }
  function detectUcarePageContext() {
    if (location.hostname !== "partner.ucare.works") return { kind: "not-ucare-target" };
    if (location.pathname === "/recruiting-list") return { kind: "ucare-recruiting-list" };
    const match = location.pathname.match(/^\/recruiting-detail\/([^/]+)$/);
    if (!match) return { kind: "not-ucare-target" };
    const isScheduleForm = document.body.innerText.includes("\u52DF\u96C6\u65E5\u7A0B\u3092\u8FFD\u52A0") || document.body.innerText.includes("\u52DF\u96C6\u65E5\u6642\u3092\u8FFD\u52A0");
    return isScheduleForm ? { kind: "ucare-schedule-form", recruitingId: match[1] } : { kind: "ucare-recruiting-detail", recruitingId: match[1] };
  }
  function collectUcareFormInspection() {
    const page = detectUcarePageContext();
    const controls = Array.from(document.querySelectorAll(
      "button, input, textarea, select, [role='button'], [role='combobox'], [role='radio']"
    )).map((element) => ({
      role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
      label: element.getAttribute("aria-label") ?? element.getAttribute("name") ?? element.getAttribute("placeholder"),
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true"
    })).filter((control) => control.text || control.label);
    const visibleText2 = Array.from(document.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, label, p, [role='heading']"
    )).map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return { page, visibleText: visibleText2, controls };
  }
  function formatUcareDateCandidates(isoDate2) {
    const match = isoDate2.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return [isoDate2];
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return [
      isoDate2,
      `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
      `${year}\u5E74${month}\u6708${day}\u65E5`
    ];
  }
  function clickUcareDate(isoDate2) {
    const candidates = formatUcareDateCandidates(isoDate2);
    const matching = Array.from(document.querySelectorAll(
      "button, [role='button'], [data-date]"
    )).filter((element) => {
      if (element.getBoundingClientRect().width === 0 || element.getBoundingClientRect().height === 0) return false;
      const values = [
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("data-date") ?? "",
        (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()
      ];
      return candidates.some((candidate) => values.some((value) => value === candidate || value.includes(candidate)));
    });
    if (matching.length !== 1) return false;
    matching[0].click();
    return true;
  }
  function findUcareButton(text2) {
    return Array.from(document.querySelectorAll(
      "button, [role='button']"
    )).find((element) => {
      const content = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      return content === text2 && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0 && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true";
    }) ?? null;
  }
  async function createUcareBatch(message) {
    const requestedDates = message.request.targetDates;
    const fail = (error) => ({
      kind: "ucare-batch-failed",
      requestedDates,
      schedules: [],
      error
    });
    if (location.hostname !== "partner.ucare.works") return fail("Ucare\u753B\u9762\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    if (requestedDates.length < 1 || requestedDates.length > 7) return fail("\u5BFE\u8C61\u65E5\u306F1\u301C7\u65E5\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    if (!location.pathname.endsWith(message.request.recruitingId)) {
      return fail("\u6307\u5B9A\u3057\u305FUcare\u6C42\u4EBA\u306E\u8A73\u7D30\u753B\u9762\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    }
    if (detectUcarePageContext().kind === "ucare-recruiting-detail") {
      const add = findUcareButton("\u65E5\u7A0B\u3092\u8FFD\u52A0\u3059\u308B");
      if (!add) return fail("\u65E5\u7A0B\u3092\u8FFD\u52A0\u3059\u308B\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      add.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const confirm = findUcareButton("\u8FFD\u52A0\u3059\u308B");
      if (!confirm) return fail("\u65E5\u7A0B\u8FFD\u52A0\u306E\u78BA\u8A8D\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    for (const targetDate of requestedDates) {
      if (!clickUcareDate(targetDate)) return fail(`\u5BFE\u8C61\u65E5\u3092\u9078\u629E\u3067\u304D\u307E\u305B\u3093: ${targetDate}`);
    }
    const submit = findUcareButton("\u65E5\u7A0B\u3092\u8FFD\u52A0\u3059\u308B");
    if (!submit) return fail("\u65E5\u7A0B\u3092\u8FFD\u52A0\u3059\u308B\u5B9F\u884C\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    submit.click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const pageText = document.body.innerText;
    const schedules = requestedDates.map((targetDate) => ({
      targetDate,
      status: pageText.includes(targetDate.replaceAll("-", "/")) ? "added" : "unknown"
    }));
    const allConfirmed = schedules.every((schedule) => schedule.status === "added");
    return allConfirmed ? { kind: "ucare-batch-created", requestedDates, schedules } : { kind: "ucare-batch-failed", requestedDates, schedules, error: "\u8FFD\u52A0\u5F8C\u306E\u65E5\u7A0B\u3092\u753B\u9762\u4E0A\u3067\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093" };
  }
  function visibleElementsWithText(text2) {
    return Array.from(document.querySelectorAll("button, label, [role='button'], [role='option'], [role='radio']")).filter((element) => {
      const content = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      return content === text2 && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    });
  }
  function clickExactText(text2) {
    const element = visibleElementsWithText(text2)[0];
    if (!element) return false;
    element.click();
    return true;
  }
  function japaneseDateLabel(isoDate2) {
    const match = isoDate2.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return isoDate2;
    return `${match[1]}\u5E74${Number(match[2])}\u6708${Number(match[3])}\u65E5`;
  }
  function clickDate(isoDate2) {
    const label = japaneseDateLabel(isoDate2);
    const buttons = Array.from(document.querySelectorAll("button")).filter((button2) => {
      const aria = button2.getAttribute("aria-label") ?? "";
      return !button2.disabled && (aria === label || aria.includes(label));
    });
    const button = buttons[0];
    if (!button) return false;
    button.click();
    return true;
  }
  function collectIssuedKaitekWorks() {
    const isPublishedList = document.body.innerText.includes("\u516C\u958B\u4E2D");
    return Array.from(document.querySelectorAll("a[href*='/works/'][href$='/edit']")).map((link) => {
      const match = link.getAttribute("href")?.match(/\/works\/(\d+)\/edit$/);
      if (!match) return null;
      const row = link.closest("tr");
      const rowText = row?.innerText ?? "";
      const date = rowText.match(/\d{4}\/\d{2}\/\d{2}/)?.[0]?.replaceAll("/", "-") ?? "";
      return { workId: match[1], targetDate: date, published: isPublishedList || rowText.includes("\u516C\u958B") };
    }).filter((work) => work !== null);
  }
  async function createKaitekBatch(message) {
    const requestedDates = message.request.targetDates;
    const fail = (error) => ({
      kind: "kaitek-batch-failed",
      requestedDates,
      issuedWorks: [],
      error
    });
    if (location.hostname !== "biz.caitech.co.jp" || location.pathname !== "/works") {
      return fail("\u30AB\u30A4\u30C6\u30AF\u6848\u4EF6\u4E00\u89A7\u753B\u9762\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    }
    if (message.request.visibility !== "general") return fail("\u516C\u958B\u7BC4\u56F2\u306F\u4E00\u822C\u516C\u958B\u306E\u307F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u3059");
    if (requestedDates.length < 1 || requestedDates.length > 7) return fail("\u5BFE\u8C61\u65E5\u306F1\u301C7\u65E5\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    if (!clickExactText("\u65B0\u898F\u6848\u4EF6")) return fail("\u65B0\u898F\u6848\u4EF6\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!clickExactText("\u4E00\u822C\u516C\u958B")) return fail("\u4E00\u822C\u516C\u958B\u306E\u9078\u629E\u80A2\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (!clickExactText(message.request.officeName)) return fail("\u6307\u5B9A\u3057\u305F\u4E8B\u696D\u6240\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (!clickExactText(message.request.templateName)) return fail("\u6307\u5B9A\u3057\u305F\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    for (const targetDate of requestedDates) {
      if (!clickDate(targetDate)) return fail(`\u5BFE\u8C61\u65E5\u3092\u9078\u629E\u3067\u304D\u307E\u305B\u3093: ${targetDate}`);
    }
    if (!clickExactText("\u6848\u4EF6\u3092\u516C\u958B")) return fail("\u6848\u4EF6\u3092\u516C\u958B\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    const issuedWorks = collectIssuedKaitekWorks();
    const matched = issuedWorks.filter((work) => requestedDates.includes(work.targetDate));
    if (matched.length !== requestedDates.length || matched.some((work) => !work.published)) {
      return { kind: "kaitek-batch-failed", requestedDates, issuedWorks: matched, error: "\u767A\u884C\u3055\u308C\u305F\u6848\u4EF6ID\u307E\u305F\u306F\u516C\u958B\u72B6\u614B\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093" };
    }
    return { kind: "kaitek-batch-created", requestedDates, issuedWorks: matched };
  }
  var FIELD_SUFFIXES = {
    lastName: ["sei", "txtUserSurname"],
    firstName: ["mei", "userName"],
    lastKana: ["seiKana", "seiKanaName", "seiKanaText", "userSurnameKana"],
    firstKana: ["meiKana", "meiKanaName", "meiKanaText", "userNameKana"],
    postalCode: ["zipCode"],
    prefecture: ["prefectures"],
    city: ["districts"],
    address: ["houseNumber"],
    building: ["buildingNumber"],
    tel: ["tel"],
    mobile: ["cell"],
    remarks: ["remark1"]
  };
  function getKaipokeClientId(documentValue = document) {
    const input = documentValue.querySelector(
      'input[type="hidden"][id$=":userInternalId"]'
    ) ?? documentValue.querySelector(
      'input[type="hidden"][name$=":userInternalId"]'
    );
    const value = input?.value.trim() ?? "";
    return KAIPOKE_ID_PATTERN.test(value) ? value : null;
  }
  function textOrNull(value) {
    const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
    return normalized || null;
  }
  function digitsOnly(value, maxLength) {
    if (!value) return null;
    const digits = value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, maxLength);
    return digits || null;
  }
  function getKaipokeClientProfile(documentValue = document) {
    const values = /* @__PURE__ */ new Map();
    for (const row of Array.from(documentValue.querySelectorAll("tr"))) {
      const headers = Array.from(row.querySelectorAll("th")).map((header) => textOrNull(header.textContent ?? void 0)).filter((value2) => value2 !== null);
      const cell = row.querySelector("td");
      const label = headers.at(-1);
      const value = textOrNull(cell?.textContent ?? void 0);
      if (label && value && !values.has(label)) values.set(label, value);
    }
    const pageTitle = textOrNull(documentValue.querySelector("#page_title")?.textContent ?? documentValue.title);
    const titleName = pageTitle?.match(/^(.+?)\s*様(?:\s|　)*(?:基本情報|被保険者証情報|受給者証情報)/)?.[1]?.trim() ?? null;
    return {
      name: values.get("\u6C0F\u540D") ?? titleName,
      kana: values.get("\u6C0F\u540D\uFF08\u30AB\u30CA\uFF09") ?? null,
      gender: values.get("\u6027\u5225") ?? null,
      birthDate: values.get("\u751F\u5E74\u6708\u65E5") ?? null,
      postalCode: digitsOnly(values.get("\u90F5\u4FBF\u756A\u53F7") ?? null, 7),
      prefecture: values.get("\u90FD\u9053\u5E9C\u770C") ?? null,
      city: values.get("\u5E02\u533A\u753A\u6751") ?? null,
      town: values.get("\u753A\u540D\u30FB\u756A\u5730") ?? null,
      building: values.get("\u30D3\u30EB\u30FB\u30DE\u30F3\u30B7\u30E7\u30F3\u540D") ?? null,
      phone: digitsOnly(values.get("\u96FB\u8A71\u756A\u53F7") ?? null, 20),
      mobilePhone: digitsOnly(values.get("\u643A\u5E2F\u96FB\u8A71\u756A\u53F7") ?? null, 20),
      clientStatus: values.get("\u5229\u7528\u8005\u306E\u72B6\u614B") ?? null,
      biko: values.get("\u5099\u8003") ?? null
    };
  }
  function findControl(suffixes) {
    for (const suffix of suffixes) {
      const selector = [
        `input[name="${suffix}"]`,
        `textarea[name="${suffix}"]`,
        `select[name="${suffix}"]`,
        `input[name$=":${suffix}"]`,
        `textarea[name$=":${suffix}"]`,
        `select[name$=":${suffix}"]`,
        `input[id="${suffix}"]`,
        `textarea[id="${suffix}"]`,
        `select[id="${suffix}"]`,
        `input[id$=":${suffix}"]`,
        `textarea[id$=":${suffix}"]`,
        `select[id$=":${suffix}"]`
      ].join(",");
      const found = document.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  function isNewClientRegistrationPage() {
    if (getKaipokeClientId()) return false;
    const required = [findControl(FIELD_SUFFIXES.lastName), findControl(FIELD_SUFFIXES.firstName)];
    const characteristic = [
      FIELD_SUFFIXES.postalCode,
      FIELD_SUFFIXES.prefecture,
      FIELD_SUFFIXES.city,
      FIELD_SUFFIXES.address,
      FIELD_SUFFIXES.remarks
    ].filter((suffixes) => findControl(suffixes) !== null);
    const pageText = document.body?.innerText ?? "";
    return required.every(Boolean) && characteristic.length >= 3 && pageText.includes("\u8A73\u7D30\u60C5\u5831") && pageText.includes("\u78BA\u8A8D");
  }
  function canApplyOnboardingCandidate() {
    const required = [findControl(FIELD_SUFFIXES.lastName), findControl(FIELD_SUFFIXES.firstName)];
    const characteristic = [
      FIELD_SUFFIXES.postalCode,
      FIELD_SUFFIXES.prefecture,
      FIELD_SUFFIXES.city,
      FIELD_SUFFIXES.address,
      FIELD_SUFFIXES.remarks
    ].filter((suffixes) => findControl(suffixes) !== null);
    return required.every(Boolean) && characteristic.length >= 3;
  }
  function isExistingClientEditPage() {
    if (!canApplyOnboardingCandidate()) return false;
    return /\/MEM090304\.do$/i.test(location.pathname) || (document.body?.innerText ?? "").includes("\u57FA\u672C\u60C5\u5831\u3000\u5909\u66F4");
  }
  function getKaipokeClientName() {
    const texts = [
      ...Array.from(document.querySelectorAll("h1, h2, h3, title")).map((element) => element.textContent ?? ""),
      ...(document.body?.innerText ?? "").split("\n").slice(0, 30)
    ];
    for (const text2 of texts) {
      const match = text2.replace(/\s+/g, " ").match(/([^<>\n]{1,60}?)\s*様\s*(?:支援経過|経過記録)/);
      if (match?.[1]) return match[1].replace(/^.*?(?:[>＞]|TOP)\s*/, "").trim();
    }
    return null;
  }
  function isSupportProgressNewPage() {
    const path = /\/MEM(?:083022|0927\d{2})\.do$/i.test(location.pathname) || /\/care_plan\//i.test(location.pathname);
    const text2 = document.body?.innerText ?? "";
    return path && (text2.includes("\u7D4C\u904E\u8A18\u9332") || /新規(?:追加|作成)/.test(text2));
  }
  function findSupportProgressContentControl() {
    const direct = document.querySelector([
      "textarea#form\\:txtImputNote",
      "textarea[name='form:txtImputNote']",
      "textarea[id$=':txtImputNote']",
      "textarea[name$=':txtImputNote']",
      "textarea[id$='txtImputNote']",
      "textarea[name$='txtImputNote']"
    ].join(","));
    if (direct) return direct;
    if (!isSupportProgressNewPage()) return null;
    return Array.from(document.querySelectorAll("textarea")).at(-1) ?? null;
  }
  function applySupportProgress(message) {
    const control = findSupportProgressContentControl();
    if (!control) return { kind: "support-progress-apply-not-available", detail: "\u7D4C\u904E\u8A18\u9332\u306E\u5185\u5BB9\u6B04\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" };
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, message.text);
    for (const name of ["input", "change", "blur"]) control.dispatchEvent(new Event(name, { bubbles: true }));
    return { kind: "support-progress-applied" };
  }
  function detectPageContext() {
    if (isSupportProgressNewPage()) {
      return { kind: "support-progress-new", kaipokeCsId: getKaipokeClientId(), clientName: getKaipokeClientName() };
    }
    const kaipokeCsId = getKaipokeClientId();
    if (kaipokeCsId) {
      return {
        kind: "existing-client",
        kaipokeCsId,
        profile: getKaipokeClientProfile(),
        profileLookup: /基本情報/.test(document.querySelector("#page_title")?.textContent ?? "") ? "current-page" : "failed",
        certificates: getKaipokeClientCertificates(document),
        // 利用者編集画面は新規登録画面と同じ入力項目を持つが、利用者IDも存在する。
        canApplyOnboardingCandidate: canApplyOnboardingCandidate()
      };
    }
    if (isExistingClientEditPage()) return { kind: "existing-client-edit" };
    if (isNewClientRegistrationPage()) return { kind: "new-client-registration" };
    return { kind: "not-kaipoke-target" };
  }
  async function fetchKaipokeBasicDocument(expectedClientId) {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/\/[^/]+$/, "/MEM090301.do");
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok || /login/i.test(response.url)) {
      throw new Error(`\u57FA\u672C\u60C5\u5831\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F (HTTP ${response.status})`);
    }
    const fetched = new DOMParser().parseFromString(await response.text(), "text/html");
    if (getKaipokeClientId(fetched) !== expectedClientId) {
      throw new Error("\u57FA\u672C\u60C5\u5831\u306E\u5229\u7528\u8005ID\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3067\u3057\u305F");
    }
    return fetched;
  }
  async function getKaipokePageContext() {
    const current = detectPageContext();
    if (current.kind !== "existing-client" || current.profileLookup === "current-page") return current;
    try {
      const basicDocument = await fetchKaipokeBasicDocument(current.kaipokeCsId);
      return {
        ...current,
        profile: getKaipokeClientProfile(basicDocument),
        profileLookup: "fetched"
      };
    } catch (error) {
      console.error("[famille-rpa] Kaipoke basic information fetch failed", error);
      return current;
    }
  }
  function certificatePageIsReady() {
    const certificates = getKaipokeClientCertificates(document);
    return certificates.careInsuranceObserved || certificates.disabilityRecipientObserved;
  }
  function findKaipokeCertificateMenu() {
    return Array.from(document.querySelectorAll("a")).find((link) => /^(?:被保険者証情報|受給者証情報)$/.test(textOrNull(link.textContent ?? void 0) ?? "")) ?? null;
  }
  function listKaipokeClientTargetNames() {
    const names = Array.from(document.querySelectorAll("a.link-clickable")).map((link) => textOrNull(link.textContent ?? void 0)).filter((name) => name !== null);
    return [...new Set(names)];
  }
  function findKaipokeClientTarget(name) {
    return Array.from(document.querySelectorAll("a.link-clickable")).find((link) => textOrNull(link.textContent ?? void 0) === name) ?? null;
  }
  function setNativeValue2(control, value) {
    if (control instanceof HTMLSelectElement) {
      const normalized = value.replace(/\s+/g, "");
      const option = Array.from(control.options).find(
        (item) => item.text.replace(/\s+/g, "") === normalized || item.value === value
      );
      if (!option) return;
      control.value = option.value;
    } else {
      const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(control, value);
    }
    for (const eventName of ["input", "change", "blur"]) {
      control.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
  }
  function candidateValue(candidate, key) {
    switch (key) {
      case "lastName":
        return candidate.name.last.value;
      case "firstName":
        return candidate.name.first.value;
      case "lastKana":
        return candidate.name_kana.last.value;
      case "firstKana":
        return candidate.name_kana.first.value;
      case "postalCode":
        return digitsOnly(candidate.postal_code.value, 7);
      case "prefecture":
        return candidate.prefecture.value;
      case "city":
        return candidate.city.value;
      case "address":
        return candidate.address.value;
      case "building":
        return candidate.building.value;
      case "tel":
        return digitsOnly(candidate.tel.value, 20);
      case "mobile":
        return digitsOnly(candidate.mobile.value, 20);
      case "remarks":
        return candidate.remarks.value?.slice(0, 1e3) || null;
    }
  }
  function applyCandidate(message) {
    if (!isNewClientRegistrationPage() && !isExistingClientEditPage()) {
      return { kind: "candidate-apply-not-available", applied: [], unavailable: [] };
    }
    const applied = [];
    const unavailable = [];
    const keys = message.mode === "remarks" ? ["remarks"] : Object.keys(FIELD_SUFFIXES);
    for (const key of keys) {
      const value = candidateValue(message.candidate, key);
      if (!value) continue;
      const control = findControl(FIELD_SUFFIXES[key]);
      if (!control) {
        unavailable.push(key);
        continue;
      }
      setNativeValue2(control, value);
      applied.push(key);
    }
    return { kind: "candidate-applied", applied, unavailable };
  }
  var TAIMEE_USER_PATH = /^\/clients\/\d+\/users\/(\d+)(?:\/|$)/;
  var TAIMEE_OFFERING_PATH = /^\/clients\/\d+\/offerings\/(\d+)(?:\/|$)/;
  var TAIMEE_DATE_PATTERN = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/;
  var MOBILE_PHONE_PATTERN = /0[789]0[-\s]?\d{4}[-\s]?\d{4}/;
  var EXCLUDED_OFFERING_KEYWORDS = ["\u672A\u7D4C\u9A13OK", "\u7121\u8CC7\u683C", "DX"];
  var TAIMEE_BLOCK_REASON = "\u5F0A\u793E\u898F\u5B9A\u306B\u3088\u308B";
  function isTaimeePage() {
    return location.hostname === "app-new.taimee.co.jp";
  }
  function textContent(element) {
    return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function workDateFromText(value) {
    const match = value.match(TAIMEE_DATE_PATTERN);
    if (!match) return null;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  function closestReviewRow(link) {
    let node = link;
    while (node && node !== document.body) {
      const links = Array.from(node.querySelectorAll("a[href]"));
      const hasUser = links.some((item) => TAIMEE_USER_PATH.test(new URL(item.href).pathname));
      const hasOffering = links.some((item) => TAIMEE_OFFERING_PATH.test(new URL(item.href).pathname));
      if (hasUser && hasOffering && workDateFromText(textContent(node))) return node;
      node = node.parentElement;
    }
    return null;
  }
  function extractTaimeeWorkersFromPage(workDate) {
    const pageDates = /* @__PURE__ */ new Set();
    const records = /* @__PURE__ */ new Map();
    for (const userLink of Array.from(document.querySelectorAll('a[href*="/users/"]'))) {
      const userMatch = new URL(userLink.href).pathname.match(TAIMEE_USER_PATH);
      if (!userMatch) continue;
      const row = closestReviewRow(userLink);
      const rowDate = row ? workDateFromText(textContent(row)) : null;
      if (!row || !rowDate) continue;
      pageDates.add(rowDate);
      if (rowDate !== workDate) continue;
      const offeringLink = Array.from(row.querySelectorAll('a[href*="/offerings/"]')).find((item) => TAIMEE_OFFERING_PATH.test(new URL(item.href).pathname));
      const offeringMatch = offeringLink && new URL(offeringLink.href).pathname.match(TAIMEE_OFFERING_PATH);
      const workerName = textContent(userLink);
      const offeringName = textContent(offeringLink ?? null);
      if (!offeringMatch || !workerName || !offeringName) continue;
      const excludedKeyword = EXCLUDED_OFFERING_KEYWORDS.find((keyword) => offeringName.includes(keyword));
      const workerHref = new URL(userLink.href);
      const offeringHref = new URL(offeringLink.href);
      const candidate = {
        taimeeUserId: userMatch[1],
        workerName,
        // クエリを含む実際のリンクを保持する。詳細画面が一覧からの遷移情報を必要とする場合に備える。
        workerUrl: `${workerHref.pathname}${workerHref.search}${workerHref.hash}`,
        offeringId: offeringMatch[1],
        offeringName,
        offeringUrl: `${offeringHref.pathname}${offeringHref.search}${offeringHref.hash}`,
        offeringDescription: null,
        workDate,
        smsEligible: !excludedKeyword,
        smsSkipReason: excludedKeyword ? `excluded_offering_keyword:${excludedKeyword}` : null
      };
      records.set(`${candidate.taimeeUserId}:${candidate.workDate}:${candidate.offeringId}`, candidate);
    }
    return { workers: [...records.values()], dates: [...pageDates] };
  }
  function pageControl(direction) {
    const candidates = Array.from(document.querySelectorAll("button, a[role='button'], a, div"));
    const matched = candidates.find((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${textContent(element)}`;
      const disabled = element.getAttribute("aria-disabled") === "true" || element instanceof HTMLButtonElement && element.disabled;
      const matcher = direction === "next" ? /次へ|次の|next/i : /前へ|前の|previous|prev/i;
      const exactDivLabel = direction === "next" ? /^(次へ|次の|next)$/i : /^(前へ|前の|previous|prev)$/i;
      return !disabled && matcher.test(label) && (element.tagName !== "DIV" || exactDivLabel.test(textContent(element)));
    });
    if (matched) return matched;
    const iconPattern = direction === "next" ? /ArrowRight|ChevronRight|NavigateNext|KeyboardArrowRight/i : /ArrowLeft|ChevronLeft|NavigateBefore|KeyboardArrowLeft/i;
    for (const icon of Array.from(document.querySelectorAll("svg"))) {
      const marker = `${icon.getAttribute("data-testid") ?? ""} ${icon.outerHTML}`;
      if (!iconPattern.test(marker)) continue;
      const control = icon.closest("button, a[role='button'], a");
      const disabled = control?.getAttribute("aria-disabled") === "true" || control instanceof HTMLButtonElement && control.disabled;
      if (control && !disabled) return control;
    }
    const pageCounter = Array.from(document.querySelectorAll("span, p, div")).find((element) => /^\d+\s*\/\s*\d+$/.test(textContent(element)));
    let container = pageCounter?.parentElement ?? null;
    while (container && container !== document.body) {
      const controls = Array.from(container.querySelectorAll("button, a[role='button']")).filter((control) => control.getAttribute("aria-disabled") !== "true" && !(control instanceof HTMLButtonElement && control.disabled));
      if (controls.length >= 2) return direction === "next" ? controls.at(-1) ?? null : controls[0] ?? null;
      container = container.parentElement;
    }
    return null;
  }
  async function waitForReviewPageChange(previousText) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 7e3) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (textContent(document.body) !== previousText) return true;
    }
    return false;
  }
  async function extractTaimeeWorkers(workDate) {
    if (!isTaimeePage()) return { kind: "taimee-extract-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30EC\u30D3\u30E5\u30FC\u4E00\u89A7\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002" };
    const records = /* @__PURE__ */ new Map();
    for (let page = 0; page < 50; page += 1) {
      const extracted = extractTaimeeWorkersFromPage(workDate);
      for (const worker of extracted.workers) records.set(`${worker.taimeeUserId}:${worker.workDate}:${worker.offeringId}`, worker);
      const dates = extracted.dates.sort();
      const newest = dates.at(-1);
      if (newest && newest < workDate) break;
      const direction = newest && newest < workDate ? "previous" : "next";
      const pager = pageControl(direction);
      if (!pager) break;
      const previousText = textContent(document.body);
      pager.click();
      if (!await waitForReviewPageChange(previousText)) {
        return { kind: "taimee-extract-error", detail: `${direction === "next" ? "\u6B21" : "\u524D"}\u30DA\u30FC\u30B8\u306E\u8AAD\u307F\u8FBC\u307F\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30BF\u30A4\u30DF\u30FC\u753B\u9762\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002` };
      }
    }
    return { kind: "taimee-workers-extracted", workers: [...records.values()] };
  }
  async function fetchTaimeePhone(workerUrl) {
    if (!isTaimeePage() || !TAIMEE_USER_PATH.test(new URL(workerUrl, location.origin).pathname)) {
      return { kind: "taimee-phone-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30E6\u30FC\u30B6\u30FC\u8A73\u7D30URL\u304C\u4E0D\u6B63\u3067\u3059\u3002" };
    }
    try {
      const response = await fetch(new URL(workerUrl, location.origin), { credentials: "include" });
      if (!response.ok) return { kind: "taimee-phone-error", detail: `\u30E6\u30FC\u30B6\u30FC\u8A73\u7D30\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F (HTTP ${response.status})\u3002` };
      if (response.url.includes("/login")) return { kind: "taimee-phone-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30ED\u30B0\u30A4\u30F3\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002" };
      const documentText = new DOMParser().parseFromString(await response.text(), "text/html").body.textContent ?? "";
      const match = documentText.match(MOBILE_PHONE_PATTERN);
      return { kind: "taimee-phone-fetched", phoneNumber: match?.[0].replace(/[^0-9]/g, "") ?? null, workplaceWorkCount: null };
    } catch {
      return { kind: "taimee-phone-error", detail: "\u30E6\u30FC\u30B6\u30FC\u8A73\u7D30\u30DA\u30FC\u30B8\u3078\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" };
    }
  }
  function taimeeWorkplaceWorkCount() {
    for (const row of Array.from(document.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll("th, td"));
      if (cells.length < 2 || textContent(cells[0]) !== "\u3053\u306E\u5E97\u8217\u3067\u50CD\u3044\u305F\u56DE\u6570") continue;
      const match2 = textContent(cells[1]).match(/(\d+)\s*回/);
      if (match2) return Number(match2[1]);
    }
    const match = (document.body?.innerText ?? "").match(/この店舗で働いた回数\s*(\d+)\s*回/);
    return match ? Number(match[1]) : null;
  }
  function readTaimeePhoneFromCurrentPage() {
    if (!isTaimeePage() || !TAIMEE_USER_PATH.test(location.pathname)) {
      return { kind: "taimee-phone-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30E6\u30FC\u30B6\u30FC\u8A73\u7D30\u30DA\u30FC\u30B8\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    }
    const match = (document.body?.innerText ?? "").match(MOBILE_PHONE_PATTERN);
    return {
      kind: "taimee-phone-fetched",
      phoneNumber: match?.[0].replace(/[^0-9]/g, "") ?? null,
      workplaceWorkCount: taimeeWorkplaceWorkCount()
    };
  }
  function exactTextElement(selector, value, root = document) {
    return Array.from(root.querySelectorAll(selector)).find((element) => textContent(element) === value) ?? null;
  }
  async function waitForTaimeeElement(find2, timeout = 8e3) {
    const deadline = Date.now() + timeout;
    do {
      const element = find2();
      if (element) return element;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    return null;
  }
  function isTaimeeCheckboxChecked(checkbox) {
    if (checkbox.checked || checkbox.getAttribute("aria-checked") === "true") return true;
    const control = checkbox.closest('[role="checkbox"], [aria-checked], [data-state]');
    return control?.getAttribute("aria-checked") === "true" || control?.getAttribute("data-state") === "checked";
  }
  async function blockTaimeeWorker(reason) {
    if (!isTaimeePage() || !TAIMEE_USER_PATH.test(location.pathname)) {
      return { kind: "taimee-block-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30EF\u30FC\u30AB\u30FC\u8A73\u7D30\u753B\u9762\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    }
    const existingUnblock = exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u89E3\u9664") ?? exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3059\u308B");
    if (existingUnblock) return { kind: "taimee-worker-already-blocked" };
    const settings = exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u8A2D\u5B9A");
    if (!settings) return { kind: "taimee-block-error", detail: "\u300C\u30D6\u30ED\u30C3\u30AF\u8A2D\u5B9A\u300D\u30DC\u30BF\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    settings.click();
    const companyLabelText = await waitForTaimeeElement(() => exactTextElement("label span", "\u4F01\u696D\u5168\u4F53"));
    const companyLabel = companyLabelText?.closest("label");
    const companyCheckbox = companyLabel?.querySelector('input[type="checkbox"]');
    if (!companyLabel || !companyCheckbox) {
      return { kind: "taimee-block-error", detail: "\u300C\u4F01\u696D\u5168\u4F53\u300D\u306E\u30C1\u30A7\u30C3\u30AF\u6B04\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    }
    const unblockInPanel = exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u89E3\u9664") ?? exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3059\u308B");
    if (unblockInPanel) return { kind: "taimee-worker-already-blocked" };
    if (isTaimeeCheckboxChecked(companyCheckbox)) return { kind: "taimee-worker-already-blocked" };
    companyCheckbox.click();
    const textarea = await waitForTaimeeElement(() => document.querySelector('textarea[placeholder*="\u52E4\u52D9\u614B\u5EA6"]'));
    if (!textarea) return { kind: "taimee-block-error", detail: "\u300C\u30D6\u30ED\u30C3\u30AF\u3059\u308B\u7406\u7531\u300D\u306E\u5165\u529B\u6B04\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    setNativeValue2(textarea, reason || TAIMEE_BLOCK_REASON);
    const confirm = await waitForTaimeeElement(() => {
      const button = exactTextElement("button", "\u9069\u7528") ?? exactTextElement("button", "\u30D6\u30ED\u30C3\u30AF\u3059\u308B");
      return button && !button.disabled ? button : null;
    });
    if (!confirm) return { kind: "taimee-block-error", detail: "\u30D6\u30ED\u30C3\u30AF\u8A2D\u5B9A\u306E\u300C\u9069\u7528\u300D\u30DC\u30BF\u30F3\u3092\u62BC\u305B\u308B\u72B6\u614B\u306B\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
    confirm.click();
    const deadline = Date.now() + 12e3;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      if (!document.contains(confirm)) return { kind: "taimee-worker-blocked" };
    } while (Date.now() < deadline);
    return { kind: "taimee-block-error", detail: "\u30D6\u30ED\u30C3\u30AF\u5B8C\u4E86\u3092\u753B\u9762\u4E0A\u3067\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
  }
  async function fetchTaimeeOffering(offeringUrl) {
    if (!isTaimeePage() || !TAIMEE_OFFERING_PATH.test(new URL(offeringUrl, location.origin).pathname)) {
      return { kind: "taimee-offering-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u6848\u4EF6\u8A73\u7D30URL\u304C\u4E0D\u6B63\u3067\u3059\u3002" };
    }
    try {
      const response = await fetch(new URL(offeringUrl, location.origin), { credentials: "include" });
      if (!response.ok) return { kind: "taimee-offering-error", detail: `\u6848\u4EF6\u8A73\u7D30\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F (HTTP ${response.status})\u3002` };
      if (response.url.includes("/login")) return { kind: "taimee-offering-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30ED\u30B0\u30A4\u30F3\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002" };
      const description = new DOMParser().parseFromString(await response.text(), "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return { kind: "taimee-offering-fetched", description };
    } catch {
      return { kind: "taimee-offering-error", detail: "\u6848\u4EF6\u8A73\u7D30\u30DA\u30FC\u30B8\u3078\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" };
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.kind === "get-sharefull-page-context") {
      sendResponse(getSharefullPageContext());
      return;
    }
    if (message.kind === "fill-sharefull-step") {
      void fillSharefullCopyPage(message.data).then(sendResponse);
      return true;
    }
    if (message.kind === "advance-sharefull-step") {
      sendResponse({ ok: advanceSharefullCopyPage() });
      return;
    }
    if (message.kind === "prepare-sharefull-create") {
      prepareSharefullCreation();
      sendResponse({ ok: true });
      return;
    }
    if (message.kind === "create-sharefull-template") {
      void createSharefullTemplate().then((ok) => sendResponse({ ok }));
      return true;
    }
    if (message.kind === "create-sharefull-spot-offer") {
      void createSharefullSpotOffer2(message.data).then(sendResponse);
      return true;
    }
    if (message.kind === "close-sharefull-spot-offer") {
      void closeSharefullSpotOffer(message.data).then(sendResponse);
      return true;
    }
    if (message.kind === "read-sharefull-job-id") {
      sendResponse({ jobId: readPublishedSharefullJobId() });
      return;
    }
    if (message.kind === "read-sharefull-template-id") {
      sendResponse({ templateId: readSharefullTemplateId(message.expectedTitle) });
      return;
    }
    if (message.kind === "read-sharefull-template-statuses") {
      sendResponse({ statuses: readSharefullTemplateStatuses() });
      return;
    }
    if (message.kind === "get-kaitek-page-context") {
      sendResponse(detectKaitekPageContext());
      return;
    }
    if (message.kind === "inspect-kaitek-form") {
      sendResponse(collectKaitekFormInspection());
      return;
    }
    if (message.kind === "create-kaitek-batch") {
      void createKaitekBatch(message).then(sendResponse);
      return true;
    }
    if (message.kind === "get-ucare-page-context") {
      sendResponse(detectUcarePageContext());
      return;
    }
    if (message.kind === "inspect-ucare-form") {
      sendResponse(collectUcareFormInspection());
      return;
    }
    if (message.kind === "create-ucare-batch") {
      void createUcareBatch(message).then(sendResponse);
      return true;
    }
    if (message.kind === "get-kaipoke-page-context") {
      void getKaipokePageContext().then(sendResponse);
      return true;
    }
    if (message.kind === "prepare-kaipoke-certificate-page") {
      if (certificatePageIsReady()) {
        sendResponse({ kind: "kaipoke-certificate-page-ready" });
        return;
      }
      const link = findKaipokeCertificateMenu();
      if (!link) {
        sendResponse({ kind: "kaipoke-certificate-page-error", detail: "\u88AB\u4FDD\u967A\u8005\u8A3C\u60C5\u5831\uFF0F\u53D7\u7D66\u8005\u8A3C\u60C5\u5831\u306E\u30EA\u30F3\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" });
        return;
      }
      sendResponse({ kind: "kaipoke-certificate-page-opening" });
      window.setTimeout(() => link.click(), 0);
      return;
    }
    if (message.kind === "list-kaipoke-client-targets") {
      sendResponse({ kind: "kaipoke-client-targets", names: listKaipokeClientTargetNames() });
      return;
    }
    if (message.kind === "open-kaipoke-client-target") {
      const link = findKaipokeClientTarget(message.name);
      if (!link) {
        sendResponse({ kind: "kaipoke-client-open-error", detail: `\u5229\u7528\u8005\u300C${message.name}\u300D\u304C\u4E00\u89A7\u306B\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002` });
        return;
      }
      sendResponse({ kind: "kaipoke-client-opening" });
      window.setTimeout(() => link.click(), 0);
      return;
    }
    if (message.kind === "capture-rpa-diagnostic") {
      sendResponse({
        kind: "rpa-page-snapshot-captured",
        snapshot: captureCurrentPageSnapshot(message.request, message.importantSelectors)
      });
      return;
    }
    if (message.kind === "apply-onboarding-candidate") {
      sendResponse(applyCandidate(message));
      return;
    }
    if (message.kind === "apply-support-progress") {
      sendResponse(applySupportProgress(message));
      return;
    }
    if (message.kind === "extract-taimee-workers") {
      void extractTaimeeWorkers(message.workDate).then(sendResponse);
      return true;
    }
    if (message.kind === "fetch-taimee-phone") {
      void fetchTaimeePhone(message.workerUrl).then(sendResponse);
      return true;
    }
    if (message.kind === "read-taimee-phone") {
      sendResponse(readTaimeePhoneFromCurrentPage());
      return;
    }
    if (message.kind === "block-taimee-worker") {
      void blockTaimeeWorker(message.reason).then(sendResponse);
      return true;
    }
    if (message.kind === "fetch-taimee-offering") {
      void fetchTaimeeOffering(message.offeringUrl).then(sendResponse);
      return true;
    }
  });
})();
