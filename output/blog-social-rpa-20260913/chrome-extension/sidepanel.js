"use strict";
(() => {
  // src/sharefull/page.ts
  function sharefullPageFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "client.sharefull.com") return "unknown";
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      if (path === "/order_template") return "list";
      if (path === "/order_template/thanks") return "thanks";
      if (path === "/orders/copy" && parsed.searchParams.get("orderTemplate")) return "offer-copy";
      if (path === "/order_template/new" && parsed.searchParams.get("copy") === "428828") return "copy";
      if (/^\/orders\/\d+$/.test(path)) return "order-detail";
      if (path === "/orders") return "order-list";
      return "other";
    } catch {
      return "unknown";
    }
  }
  function sharefullPageLabel(page) {
    switch (page) {
      case "list":
        return "Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4E00\u89A7";
      case "copy":
        return "Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210";
      case "thanks":
        return "Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210\u5B8C\u4E86";
      case "offer-copy":
        return "Sharefull\u6C42\u4EBA\u4F5C\u6210";
      case "order-detail":
        return "Sharefull\u6C42\u4EBA\u8A73\u7D30";
      case "order-list":
        return "Sharefull\u6C42\u4EBA\u4E00\u89A7";
      default:
        return "Sharefull\u753B\u9762";
    }
  }

  // src/sidepanel/taimee.ts
  var TAIMEE_HOST = "app-new.taimee.co.jp";
  function tokyoToday() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
    const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function currentTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab ?? null);
  }
  function isTaimeeReviewPage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === TAIMEE_HOST && /^\/clients\/\d+\/reviews\/client/.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  function workerKey(worker) {
    return `${worker.taimeeUserId}:${worker.workDate}:${worker.offeringId}`;
  }
  function statusText(worker) {
    if (worker.smsSkipReason === "phone_not_found") return "\u96FB\u8A71\u756A\u53F7\u306A\u3057";
    if (worker.smsSkipReason === "same_day_duplicate_worker") return "\u540C\u65E5\u91CD\u8907\uFF08SMS\u306F1\u901A\u306E\u307F\uFF09";
    if (worker.smsSkipReason === "existing_entry") return "\u5BFE\u8C61\u5916\uFF1A\u30A8\u30F3\u30C8\u30EA\u30FC\u6E08\u307F";
    if (!worker.smsEligible) return `\u5BFE\u8C61\u5916${worker.smsSkipReason ? `\uFF1A${worker.smsSkipReason.replace("excluded_offering_keyword:", "")}` : ""}`;
    return { unsent: "\u672A\u9001\u4FE1", sent: "\u9001\u4FE1\u6E08\u307F", failed: "\u9001\u4FE1\u5931\u6557", duplicate: "\u9001\u4FE1\u6E08\u307F\u30FB\u91CD\u8907", skipped: "\u30B9\u30AD\u30C3\u30D7", phone_not_found: "\u96FB\u8A71\u756A\u53F7\u306A\u3057" }[worker.smsStatus];
  }
  function count(state, predicate) {
    return state.candidates.filter(predicate).length;
  }
  function setMessage(message, error = false) {
    const element = document.querySelector("#taimee-status");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", error);
  }
  function render(state) {
    const summary = document.querySelector("#taimee-summary");
    const list = document.querySelector("#taimee-worker-list");
    const send = document.querySelector("#taimee-send-sms");
    if (!summary || !list || !send) return;
    const eligible = count(state, (worker) => worker.smsEligible && worker.smsStatus === "unsent");
    const excluded = count(state, (worker) => !worker.smsEligible && (worker.smsSkipReason?.startsWith("excluded_offering_keyword:") === true || worker.smsSkipReason === "existing_entry"));
    const sent = count(state, (worker) => worker.smsStatus === "sent" || worker.smsStatus === "duplicate");
    summary.textContent = `\u5BFE\u8C61\u8005\uFF1A${eligible}\u540D\u3000\u5BFE\u8C61\u5916\uFF1A${excluded}\u540D\u3000\u9001\u4FE1\u6E08\u307F\uFF1A${sent}\u540D`;
    list.replaceChildren();
    for (const worker of state.candidates) {
      const item = document.createElement("article");
      item.className = "taimee-worker";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = worker.selected;
      checkbox.disabled = !worker.smsEligible || worker.smsStatus !== "unsent";
      checkbox.setAttribute("aria-label", `${worker.workerName}\u3078SMS\u3092\u9001\u4FE1`);
      checkbox.addEventListener("change", () => void updateSelection(worker, checkbox.checked));
      const details = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = worker.workerName;
      const date = document.createElement("span");
      date.textContent = `\u52E4\u52D9\u65E5\uFF1A${worker.workDate}`;
      const offering = document.createElement("span");
      offering.textContent = worker.offeringName;
      const phone = document.createElement("span");
      phone.textContent = `\u96FB\u8A71\u756A\u53F7\uFF1A${worker.phoneNumber ? "\u53D6\u5F97\u6E08\u307F" : "\u672A\u53D6\u5F97"}`;
      const sms = document.createElement("span");
      sms.className = worker.smsEligible ? "taimee-ok" : "taimee-muted";
      sms.textContent = `SMS\uFF1A${statusText(worker)}`;
      details.append(name, date, offering, phone, sms);
      if (worker.workplaceWorkCount !== void 0 && worker.workplaceWorkCount !== null) {
        const workCount = document.createElement("span");
        workCount.className = "taimee-muted";
        workCount.textContent = `\u30D5\u30A1\u30DF\u30FC\u30E6\u3067\u306E\u5C31\u696D\u56DE\u6570\uFF1A${worker.workplaceWorkCount}\u56DE`;
        details.append(workCount);
      }
      if (worker.blockStatus) {
        const block = document.createElement("span");
        block.className = worker.blockStatus === "failed" ? "taimee-error" : "taimee-muted";
        block.textContent = worker.blockStatus === "blocked" ? "\u30BF\u30A4\u30DF\u30FC\uFF1A\u4F01\u696D\u5168\u4F53\u30D6\u30ED\u30C3\u30AF\u6E08\u307F" : worker.blockStatus === "already_blocked" ? "\u30BF\u30A4\u30DF\u30FC\uFF1A\u4F01\u696D\u5168\u4F53\u30D6\u30ED\u30C3\u30AF\u8A2D\u5B9A\u6E08\u307F" : "\u30BF\u30A4\u30DF\u30FC\uFF1A\u4F01\u696D\u5168\u4F53\u30D6\u30ED\u30C3\u30AF\u5931\u6557";
        details.append(block);
      }
      if (worker.smsSkipReason === "existing_entry") {
        const entry = document.createElement("span");
        entry.className = "taimee-muted";
        entry.textContent = "My\u30D5\u30A1\u30DF\u30FC\u30E6\uFF1A\u767B\u9332\u6E08\u307F\uFF08\u30A8\u30F3\u30C8\u30EA\u30FC\u6E08\u307F\uFF09";
        details.append(entry);
      } else if (worker.registrationStatus) {
        const registration = document.createElement("span");
        registration.className = "taimee-muted";
        registration.textContent = worker.registrationStatus === "already_registered" ? "\u30BF\u30A4\u30DF\u30FC\u30EA\u30B9\u30C8\uFF1A\u767B\u9332\u60C5\u5831\u3092\u66F4\u65B0" : "\u30BF\u30A4\u30DF\u30FC\u30EA\u30B9\u30C8\uFF1A\u767B\u9332\u60C5\u5831\u3092\u4F5C\u6210";
        details.append(registration);
      }
      if (worker.error) {
        const error = document.createElement("small");
        error.className = "taimee-error";
        error.textContent = worker.error;
        details.append(error);
      }
      item.append(checkbox, details);
      list.append(item);
    }
    const selected = count(state, (worker) => worker.selected && worker.smsEligible && worker.smsStatus === "unsent");
    send.disabled = selected === 0 || state.status === "fetching" || state.status === "sending";
    send.textContent = `\u2462 \u9078\u629E\u3057\u305F${selected}\u540D\u3078SMS\u9001\u4FE1`;
    if (state.progressMessage) setMessage(state.progressMessage, state.status === "error");
    if (state.fatalError) setMessage(state.fatalError, true);
  }
  async function readState() {
    return chrome.runtime.sendMessage({ kind: "get-taimee-processing-state" });
  }
  async function updateSelection(worker, selected) {
    const result = await chrome.runtime.sendMessage({ kind: "set-taimee-worker-selection", key: workerKey(worker), selected });
    if (result.kind === "taimee-action-completed") render(result.state);
  }
  async function fetchWorkers() {
    const input = document.querySelector("#taimee-work-date");
    const button = document.querySelector("#taimee-fetch-workers");
    const tab = await currentTab();
    if (!input?.value || !tab?.id) return;
    if (!isTaimeeReviewPage(tab.url)) {
      setMessage("\u30BF\u30A4\u30DF\u30FC\u306E\u30EC\u30D3\u30E5\u30FC\u4E00\u89A7\u3092\u958B\u3044\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    if (button) button.disabled = true;
    setMessage("\u5BFE\u8C61\u8005\u3092\u53D6\u5F97\u3057\u3066\u3044\u307E\u3059\u3002SMS\u306F\u307E\u3060\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002");
    const result = await chrome.runtime.sendMessage({ kind: "start-taimee-worker-fetch", tabId: tab.id, workDate: input.value });
    if (button) button.disabled = false;
    if (result.kind === "taimee-action-error") {
      if (result.state) render(result.state);
      setMessage(result.detail, true);
      return;
    }
    render(result.state);
  }
  async function toggleTemplate() {
    const editor = document.querySelector("#taimee-template-editor");
    const textarea = document.querySelector("#taimee-template");
    if (!editor || !textarea) return;
    if (!editor.hidden) {
      editor.hidden = true;
      return;
    }
    setMessage("SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059\u3002");
    const result = await chrome.runtime.sendMessage({ kind: "get-taimee-sms-template" });
    if (result.kind === "taimee-template-error") {
      setMessage(result.detail ?? "SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", true);
      return;
    }
    textarea.value = result.template;
    editor.hidden = false;
    setMessage("SMS\u672C\u6587\u3092\u78BA\u8A8D\u30FB\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002{{work_date_phrase}} \u306FMy\u30D5\u30A1\u30DF\u30FC\u30E6\u5074\u3067\u5909\u63DB\u3055\u308C\u307E\u3059\u3002");
  }
  async function saveTemplate() {
    const textarea = document.querySelector("#taimee-template");
    const editor = document.querySelector("#taimee-template-editor");
    const button = document.querySelector("#taimee-save-template");
    if (!textarea || !editor || !button) return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    setMessage("SMS\u672C\u6587\u3092\u4FDD\u5B58\u3057\u3066\u3044\u307E\u3059\u2026");
    try {
      const result = await chrome.runtime.sendMessage({ kind: "save-taimee-sms-template", template: textarea.value });
      if (result.kind === "taimee-template-loaded") {
        editor.hidden = true;
        setMessage("SMS\u672C\u6587\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u7DE8\u96C6\u6B04\u3092\u9589\u3058\u307E\u3057\u305F\u3002");
      } else {
        setMessage(result.detail ?? "SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", true);
      }
    } catch {
      setMessage("SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002My\u30D5\u30A1\u30DF\u30FC\u30E6\u306E\u30ED\u30B0\u30A4\u30F3\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", true);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
  async function sendSms() {
    const state = await readState();
    const selected = count(state, (worker) => worker.selected && worker.smsEligible && worker.smsStatus === "unsent");
    const eligible = count(state, (worker) => worker.smsEligible);
    const excluded = count(state, (worker) => !worker.smsEligible && (worker.smsSkipReason?.startsWith("excluded_offering_keyword:") === true || worker.smsSkipReason === "existing_entry"));
    const sent = count(state, (worker) => worker.smsStatus === "sent" || worker.smsStatus === "duplicate");
    const workDate = state.workDate.replaceAll("-", "\u5E74").replace(/年(\d{2})$/, "\u6708$1\u65E5");
    if (!window.confirm(`${workDate}\u306E\u52E4\u52D9\u8005\u3078SMS\u3092\u9001\u4FE1\u3057\u307E\u3059\u3002

\u53D6\u5F97\u4EBA\u6570\uFF1A${state.candidates.length}\u540D
SMS\u5BFE\u8C61\uFF1A${eligible}\u540D
\u5BFE\u8C61\u5916\uFF1A${excluded}\u540D
\u9001\u4FE1\u6E08\u307F\uFF1A${sent}\u540D

\u4ECA\u56DE\u9001\u4FE1\u4E88\u5B9A\uFF1A${selected}\u540D

\u3053\u306E\u307E\u307E\u9001\u4FE1\u3057\u307E\u3059\u304B\uFF1F`)) return;
    const result = await chrome.runtime.sendMessage({ kind: "send-taimee-sms" });
    if (result.kind === "taimee-action-error") {
      if (result.state) render(result.state);
      setMessage(result.detail, true);
      return;
    }
    render(result.state);
  }
  async function initializeTaimeeSidePanel() {
    const tab = await currentTab();
    if (!isTaimeeReviewPage(tab?.url)) return false;
    const onboarding = document.querySelector("#onboarding-panel");
    const panel = document.querySelector("#taimee-panel");
    if (onboarding) onboarding.hidden = true;
    if (panel) panel.hidden = false;
    const input = document.querySelector("#taimee-work-date");
    if (input) input.value = tokyoToday();
    document.querySelector("#taimee-fetch-workers")?.addEventListener("click", () => void fetchWorkers());
    document.querySelector("#taimee-edit-template")?.addEventListener("click", () => void toggleTemplate());
    document.querySelector("#taimee-save-template")?.addEventListener("click", () => void saveTemplate());
    document.querySelector("#taimee-send-sms")?.addEventListener("click", () => void sendSms());
    render(await readState());
    window.setInterval(() => {
      void readState().then((state) => {
        if (state.status === "fetching" || state.status === "sending") render(state);
      }).catch(() => void 0);
    }, 1e3);
    return true;
  }

  // src/sidepanel/sidepanel.ts
  var pageStatus = document.querySelector("#page-status");
  var documentSelect = document.querySelector("#document-select");
  var documentStatus = document.querySelector("#document-status");
  var pdfPreview = document.querySelector("#pdf-preview");
  var candidateSection = document.querySelector("#candidate-section");
  var sourceSummary = document.querySelector("#source-summary");
  var applyAllButton = document.querySelector("#apply-all");
  var applyRemarksButton = document.querySelector("#apply-remarks");
  var applyStatus = document.querySelector("#apply-status");
  var postalCodeInput = document.querySelector("#postal-code");
  var lookupPostalCodeButton = document.querySelector("#lookup-postal-code");
  var postalCodeOptions = document.querySelector("#postal-code-options");
  var postalLookupDetails = document.querySelector("#postal-lookup-details");
  var postalLookupLog = document.querySelector("#postal-lookup-log");
  var postalRequiredInputs = ["prefecture", "city", "address"].map((id) => document.getElementById(id)).filter((input) => input !== null);
  var selectedDocument = null;
  var currentPageContext = { kind: "not-kaipoke-target" };
  var sharefullPanel = document.querySelector("#sharefull-panel");
  var onboardingPanel = document.querySelector("#onboarding-panel");
  var sharefullStatus = document.querySelector("#sharefull-status");
  var sharefullPageStatus = document.querySelector("#sharefull-page-status");
  var sharefullList = document.querySelector("#sharefull-case-list");
  var sharefullSearch = document.querySelector("#sharefull-case-search");
  var sharefullRefresh = document.querySelector("#sharefull-case-refresh");
  var sharefullCases = [];
  var supportProgressPanel = document.querySelector("#support-progress-panel");
  var supportProgressPageStatus = document.querySelector("#support-progress-page-status");
  var supportProgressClient = document.querySelector("#support-progress-client");
  var loadSupportProgressButton = document.querySelector("#load-support-progress");
  var supportProgressStatus = document.querySelector("#support-progress-status");
  var supportProgressList = document.querySelector("#support-progress-list");
  var summarizeSupportProgressButton = document.querySelector("#summarize-support-progress");
  var applySupportProgressButton = document.querySelector("#apply-support-progress");
  var supportProgressRaw = document.querySelector("#support-progress-raw");
  var supportProgressSummary = document.querySelector("#support-progress-summary");
  var supportProgressCandidates = [];
  var fieldMap = {
    "name-last": (c) => c.name.last,
    "name-first": (c) => c.name.first,
    "kana-last": (c) => c.name_kana.last,
    "kana-first": (c) => c.name_kana.first,
    gender: (c) => c.gender,
    "birth-date": (c) => c.birth_date,
    "postal-code": (c) => c.postal_code,
    prefecture: (c) => c.prefecture,
    city: (c) => c.city,
    address: (c) => c.address,
    building: (c) => c.building,
    tel: (c) => c.tel,
    mobile: (c) => c.mobile,
    remarks: (c) => c.remarks
  };
  function setNotice(element, message, error = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", error);
  }
  function setSharefullNotice(message, error = false) {
    if (!sharefullStatus) return;
    sharefullStatus.hidden = false;
    setNotice(sharefullStatus, message, error);
  }
  function renderSharefullCases() {
    if (!sharefullList) return;
    const query = sharefullSearch?.value.trim().toLocaleLowerCase("ja-JP") ?? "";
    const rows = [...sharefullCases].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.client_name ?? "-").localeCompare(b.client_name ?? "-", "ja");
    }).filter((row) => !query || [row.template_title, row.internal_label, row.matching_place_name, row.meeting_place].some((value) => value?.toLocaleLowerCase("ja-JP").includes(query)));
    sharefullList.replaceChildren();
    if (!rows.length) {
      sharefullList.textContent = "\u6848\u4EF6\u304C\u3042\u308A\u307E\u305B\u3093\u3002";
      return;
    }
    for (const row of rows) {
      const card = document.createElement("div");
      card.className = "sharefull-case";
      const title = document.createElement("strong");
      title.textContent = row.template_title || "(\u7121\u984C)";
      const detail = document.createElement("span");
      detail.textContent = [row.matching_place_name, row.meeting_place, row.start_at && row.end_at ? `${row.start_at}\u301C${row.end_at}` : null].filter(Boolean).join("\uFF5C");
      const button = document.createElement("button");
      button.type = "button";
      const existingTemplateId = row.sharefull_template_id?.trim() ?? "";
      if (existingTemplateId) {
        button.disabled = true;
        button.textContent = row.sharefull_template_status === "template_review" ? `\u5BE9\u67FB\u4E2D\uFF08ID: ${existingTemplateId}\uFF09` : `\u4F5C\u6210\u6E08\u307F\uFF08ID: ${existingTemplateId}\uFF09`;
        button.title = "\u65E2\u5B58\u306ESharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304C\u3042\u308B\u305F\u3081\u3001\u91CD\u8907\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3002";
      } else {
        button.textContent = "Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210";
        button.addEventListener("click", () => void startSharefull(row.core_id, button));
      }
      card.append(title, detail, button);
      sharefullList.append(card);
    }
  }
  async function loadSharefullCases() {
    setSharefullNotice("\u6848\u4EF6\u4E00\u89A7\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059...");
    const sync = await chrome.runtime.sendMessage({ kind: "sync-sharefull-template-statuses" });
    const result = await chrome.runtime.sendMessage({ kind: "get-sharefull-cases" });
    if (result.kind !== "sharefull-case-list-loaded") {
      setSharefullNotice(result.detail, true);
      return false;
    }
    sharefullCases = result.cases;
    const updates = sync.kind === "sharefull-template-status-sync-complete" && (sync.updated ?? 0) > 0 ? `\u5BE9\u67FB\u72B6\u614B ${sync.updated}\u4EF6\u66F4\u65B0` : "";
    const reset = sync.kind === "sharefull-template-status-sync-complete" && (sync.reset ?? 0) > 0 ? `\u524A\u9664\u6E08\u307F\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8 ${sync.reset}\u4EF6\u3092\u518D\u4F5C\u6210\u5BFE\u8C61\u3078\u623B\u3057\u307E\u3057\u305F` : "";
    const suffix = [updates, reset].filter(Boolean).join("\uFF0F");
    setSharefullNotice(`\u6848\u4EF6 ${sharefullCases.length}\u4EF6\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u3002${suffix ? `\uFF08${suffix}\uFF09` : ""}`);
    renderSharefullCases();
    return true;
  }
  async function reloadSharefullCasesFromButton() {
    if (!sharefullRefresh || sharefullRefresh.disabled) return;
    sharefullRefresh.disabled = true;
    sharefullRefresh.setAttribute("aria-busy", "true");
    sharefullRefresh.textContent = "\u518D\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026";
    setSharefullNotice("Sharefull\u306E\u5BE9\u67FB\u72B6\u614B\u3068\u6848\u4EF6\u4E00\u89A7\u3092\u518D\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u2026");
    try {
      const loaded = await loadSharefullCases();
      sharefullRefresh.textContent = loaded ? "\u518D\u8AAD\u307F\u8FBC\u307F\u5B8C\u4E86" : "\u518D\u8AAD\u307F\u8FBC\u307F\u5931\u6557";
      setTimeout(() => {
        if (sharefullRefresh) sharefullRefresh.textContent = "\u6848\u4EF6\u4E00\u89A7\u3092\u518D\u8AAD\u307F\u8FBC\u307F";
      }, 1600);
    } catch (error) {
      sharefullRefresh.textContent = "\u518D\u8AAD\u307F\u8FBC\u307F\u5931\u6557";
      setTimeout(() => {
        if (sharefullRefresh) sharefullRefresh.textContent = "\u6848\u4EF6\u4E00\u89A7\u3092\u518D\u8AAD\u307F\u8FBC\u307F";
      }, 2200);
      throw error;
    } finally {
      sharefullRefresh.removeAttribute("aria-busy");
      sharefullRefresh.disabled = false;
    }
  }
  async function startSharefull(coreId, button) {
    button.disabled = true;
    setSharefullNotice("Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210\u3092\u958B\u59CB\u3057\u307E\u3059\u3002\u6848\u4EF6\u9078\u629E\u6E08\u307F\u3067\u3059...");
    const result = await chrome.runtime.sendMessage({ kind: "start-sharefull-template", coreId });
    if (result?.kind === "sharefull-start-error") {
      setSharefullNotice(result.detail, true);
      button.disabled = false;
      return;
    }
    setSharefullNotice("\u30B3\u30D4\u30FC\u753B\u9762\u3092\u958B\u304D\u30011/4\u301C4/4\u3092\u51E6\u7406\u3057\u307E\u3059\u3002\u5B8C\u4E86\u307E\u3067\u3053\u306E\u30BF\u30D6\u3092\u9589\u3058\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002");
  }
  async function getActiveSharefullContext() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { page: sharefullPageFromUrl(tab?.url ?? ""), step: 0 };
  }
  function isKaipokePage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (parsed.hostname === "kaipoke.biz" || parsed.hostname.endsWith(".kaipoke.biz"));
    } catch {
      return false;
    }
  }
  function isSupportProgressUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.hostname.endsWith(".kaipoke.biz") && (/\/MEM(?:083022|0927\d{2})\.do$/i.test(parsed.pathname) || /\/care_plan\//i.test(parsed.pathname));
    } catch {
      return false;
    }
  }
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  }
  async function getPageContext() {
    const tab = await getActiveTab();
    if (!tab?.id || !isKaipokePage(tab.url)) return { kind: "not-kaipoke-target" };
    try {
      const context = await chrome.tabs.sendMessage(tab.id, { kind: "get-kaipoke-page-context" });
      if (context.kind === "support-progress-new" && context.clientName) return context;
      if (isSupportProgressUrl(tab.url)) return { kind: "support-progress-new", kaipokeCsId: context.kind === "existing-client" ? context.kaipokeCsId : null, clientName: null };
      return context;
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        const context = await chrome.tabs.sendMessage(tab.id, { kind: "get-kaipoke-page-context" });
        return isSupportProgressUrl(tab.url) ? { kind: "support-progress-new", kaipokeCsId: context.kind === "existing-client" ? context.kaipokeCsId : null, clientName: context.kind === "support-progress-new" ? context.clientName : null } : context;
      } catch {
        return { kind: "not-kaipoke-target" };
      }
    }
  }
  function metaLabel(field) {
    if (!field.value) return "\u26A0 \u60C5\u5831\u306A\u3057";
    const confidence = { high: "\u9AD8", medium: "\u4E2D", low: "\u4F4E" }[field.confidence];
    const source = field.source === "both" ? "OCR\uFF0Bsummary" : field.source === "ocr" ? "OCR" : field.source === "summary" ? "summary" : field.source === "address_lookup" ? "\u4F4F\u6240\u304B\u3089\u9006\u5F15\u304D" : "\u6839\u62E0\u672A\u7279\u5B9A";
    return `\u4FE1\u983C\u5EA6 ${confidence}\u30FB${source}`;
  }
  function setPostalCode(postalCode, source = null) {
    if (postalCodeInput) postalCodeInput.value = digitsOnly(postalCode, 7) ?? "";
    const meta = document.querySelector('[data-meta="postal-code"]');
    if (meta && source === "address_lookup") meta.textContent = "\u4FE1\u983C\u5EA6 \u4E2D\u30FB\u4F4F\u6240\u304B\u3089\u9006\u5F15\u304D";
  }
  function setPostalLookupLog(lines) {
    if (postalLookupDetails) postalLookupDetails.hidden = lines.length === 0;
    if (postalLookupLog) postalLookupLog.textContent = lines.join("\n");
  }
  function currentAddressParts() {
    const value = (id) => document.getElementById(id)?.value.trim() || null;
    return { prefecture: value("prefecture"), city: value("city"), address: value("address") };
  }
  function updatePostalLookupRequirements() {
    for (const input of postalRequiredInputs) {
      const missing = !input.value.trim();
      input.classList.toggle("postal-required-missing", missing);
      input.setAttribute("aria-invalid", String(missing));
    }
  }
  function renderPostalCodeOptions(candidates) {
    if (!postalCodeOptions) return;
    postalCodeOptions.replaceChildren();
    if (candidates.length <= 1) {
      postalCodeOptions.hidden = true;
      return;
    }
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "\u90F5\u4FBF\u756A\u53F7\u5019\u88DC\u3092\u9078\u629E";
    postalCodeOptions.append(placeholder);
    for (const candidate of candidates) {
      const option = document.createElement("option");
      option.value = candidate.postal_code;
      option.textContent = `${candidate.postal_code}\uFF5C${candidate.prefecture}${candidate.city}${candidate.town}`;
      postalCodeOptions.append(option);
    }
    postalCodeOptions.hidden = false;
  }
  async function lookupPostalCode() {
    const { prefecture, city, address } = currentAddressParts();
    if (!prefecture || !city || !address) {
      updatePostalLookupRequirements();
      setPostalLookupLog(["\u691C\u7D22\u4E0D\u53EF\uFF1A\u90FD\u9053\u5E9C\u770C\u30FB\u5E02\u533A\u753A\u6751\u30FB\u753A\u540D\u30FB\u756A\u5730\u306E\u3044\u305A\u308C\u304B\u304C\u672A\u5165\u529B\u3067\u3059\u3002"]);
      setNotice(documentStatus, "\u90F5\u4FBF\u756A\u53F7\u691C\u7D22\u306B\u306F\u90FD\u9053\u5E9C\u770C\u30FB\u5E02\u533A\u753A\u6751\u30FB\u753A\u540D\u30FB\u756A\u5730\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    if (lookupPostalCodeButton) lookupPostalCodeButton.disabled = true;
    setNotice(documentStatus, "\u4F4F\u6240\u304B\u3089\u90F5\u4FBF\u756A\u53F7\u3092\u691C\u7D22\u4E2D\u3067\u3059...");
    const result = await chrome.runtime.sendMessage({
      kind: "lookup-postal-codes",
      prefecture,
      city,
      address
    });
    setPostalLookupLog(result.diagnostics);
    if (lookupPostalCodeButton) lookupPostalCodeButton.disabled = false;
    if (result.kind !== "postal-codes-found") {
      renderPostalCodeOptions([]);
      setNotice(documentStatus, result.kind === "postal-codes-not-found" ? "\u90F5\u4FBF\u756A\u53F7\u3092\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5019\u88DC\u3092\u624B\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : "\u90F5\u4FBF\u756A\u53F7\u306E\u691C\u7D22\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    renderPostalCodeOptions(result.candidates);
    if (result.candidates.length === 1) {
      setPostalCode(result.candidates[0].postal_code, "address_lookup");
      setNotice(documentStatus, `\u2705 \u90F5\u4FBF\u756A\u53F7 ${result.candidates[0].postal_code} \u3092\u4F4F\u6240\u304B\u3089\u5165\u529B\u3057\u307E\u3057\u305F\u3002`);
    } else {
      setNotice(documentStatus, `\u5019\u88DC\u304C${result.candidates.length}\u4EF6\u3042\u308A\u307E\u3059\u3002\u90F5\u4FBF\u756A\u53F7\u5019\u88DC\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002`);
    }
  }
  function digitsOnly(value, maxLength) {
    if (!value) return null;
    const digits = value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, maxLength);
    return digits || null;
  }
  function displayValue(id, value) {
    if (id === "postal-code") return digitsOnly(value, 7) ?? "";
    if (id === "tel" || id === "mobile") return digitsOnly(value, 20) ?? "";
    return value ?? "";
  }
  function renderCandidate(documentData) {
    selectedDocument = documentData;
    if (candidateSection) candidateSection.hidden = false;
    if (sourceSummary) sourceSummary.textContent = documentData.summary || "summary\u306F\u3042\u308A\u307E\u305B\u3093";
    if (pdfPreview) {
      pdfPreview.hidden = !documentData.preview_url;
      pdfPreview.src = documentData.preview_url ?? "about:blank";
    }
    for (const [id, getField] of Object.entries(fieldMap)) {
      const field = getField(documentData.candidate);
      const input = document.getElementById(id);
      if (input) input.value = displayValue(id, field.value);
      const meta = document.querySelector(`[data-meta="${id}"]`);
      if (meta) meta.textContent = metaLabel(field);
    }
    updatePostalLookupRequirements();
  }
  function editableCandidate() {
    if (!selectedDocument) return null;
    const original = selectedDocument.candidate;
    const read = (id, source) => {
      const input = document.getElementById(id);
      const entered = input?.value.trim() || null;
      const value = id === "postal-code" ? digitsOnly(entered, 7) : id === "tel" || id === "mobile" ? digitsOnly(entered, 20) : entered;
      return { ...source, value };
    };
    return {
      name: { last: read("name-last", original.name.last), first: read("name-first", original.name.first) },
      name_kana: { last: read("kana-last", original.name_kana.last), first: read("kana-first", original.name_kana.first) },
      gender: read("gender", original.gender),
      birth_date: read("birth-date", original.birth_date),
      postal_code: read("postal-code", original.postal_code),
      prefecture: read("prefecture", original.prefecture),
      city: read("city", original.city),
      address: read("address", original.address),
      building: read("building", original.building),
      tel: read("tel", original.tel),
      mobile: read("mobile", original.mobile),
      remarks: read("remarks", original.remarks)
    };
  }
  async function apply(mode, pageContext) {
    const candidate = editableCandidate();
    const tab = await getActiveTab();
    if (!candidate || !tab?.id) return;
    const result = await chrome.tabs.sendMessage(tab.id, {
      kind: "apply-onboarding-candidate",
      mode,
      candidate
    });
    const expectedName = `${candidate.name.last.value ?? ""}${candidate.name.first.value ?? ""}`.replace(/[\s\u3000]+/g, "").trim();
    if (applyStatus) applyStatus.hidden = false;
    if (result.kind !== "candidate-applied") {
      setNotice(applyStatus, "\u30AB\u30A4\u30DD\u30B1\u306E\u5229\u7528\u8005\u65B0\u898F\u767B\u9332\u753B\u9762\u307E\u305F\u306F\u8A73\u7D30\u60C5\u5831\u306E\u7DE8\u96C6\u753B\u9762\u3067\u53CD\u6620\u3057\u3066\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    if (pageContext.kind === "new-client-registration" && result.applied.length > 0 && expectedName && selectedDocument) {
      await chrome.runtime.sendMessage({
        kind: "begin-onboarding-registration",
        documentId: selectedDocument.id,
        expectedName,
        tabId: tab.id
      });
    }
    const suffix = result.unavailable.length ? `
\u753B\u9762\u306B\u898B\u3064\u304B\u3089\u306A\u3044\u9805\u76EE: ${result.unavailable.length}\u4EF6` : "";
    const nextStep = pageContext.kind === "new-client-registration" ? "\u767B\u9332\u5F8C\u3001\u540C\u3058\u30BF\u30D6\u306E\u5229\u7528\u8005\u8A73\u7D30\u753B\u9762\u3067\u81EA\u52D5\u9023\u643A\u3057\u307E\u3059\u3002" : "\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u3001\u30AB\u30A4\u30DD\u30B1\u306E\u300C\u78BA\u8A8D\u753B\u9762\u3078\u300D\u304B\u3089\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    setNotice(applyStatus, `\u2705 ${result.applied.length}\u9805\u76EE\u3092\u53CD\u6620\u3057\u307E\u3057\u305F\u3002${nextStep}${suffix}`);
  }
  async function loadDocument(documentId) {
    setNotice(documentStatus, "OCR\u3068summary\u304B\u3089\u767B\u9332\u5019\u88DC\u3092\u6574\u7406\u4E2D\u3067\u3059...");
    if (candidateSection) candidateSection.hidden = true;
    const result = await chrome.runtime.sendMessage({
      kind: "get-onboarding-document",
      documentId
    });
    if (result.kind !== "document-loaded") {
      setNotice(documentStatus, "\u767B\u9332\u5019\u88DC\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u30ED\u30B0\u30A4\u30F3\u3068AI\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    await chrome.storage.session.set({ onboardingSelectedDocId: documentId });
    setNotice(documentStatus, "\u2705 PDF\u3068\u767B\u9332\u5019\u88DC\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u3002");
    renderCandidate(result.document);
    if (!digitsOnly(result.document.candidate.postal_code.value, 7)) {
      await lookupPostalCode();
    }
  }
  async function loadDocumentList() {
    const result = await chrome.runtime.sendMessage({ kind: "list-onboarding-documents" });
    if (!documentSelect) return;
    documentSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = result.kind === "document-list-loaded" ? "\u57FA\u672C\u60C5\u5831PDF\u3092\u9078\u629E" : "\u6587\u66F8\u4E00\u89A7\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F";
    documentSelect.append(placeholder);
    if (result.kind !== "document-list-loaded") {
      documentSelect.disabled = true;
      setNotice(documentStatus, "My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304B\u3089\u518D\u5EA6\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002", true);
      return;
    }
    for (const doc of result.documents) {
      const option = document.createElement("option");
      option.value = doc.id;
      const date = new Date(doc.created_at).toLocaleDateString("ja-JP");
      const details = [doc.client_name ?? "\u5229\u7528\u8005\u540D\u672A\u53D6\u5F97", doc.address, doc.sender, date].filter((value) => Boolean(value)).join("\uFF5C");
      option.textContent = details || doc.summary_excerpt || doc.doc_name || "\u57FA\u672C\u60C5\u5831";
      documentSelect.append(option);
    }
    const stored = await chrome.storage.session.get("onboardingSelectedDocId");
    if (typeof stored.onboardingSelectedDocId === "string" && result.documents.some((doc) => doc.id === stored.onboardingSelectedDocId)) {
      documentSelect.value = stored.onboardingSelectedDocId;
      await loadDocument(stored.onboardingSelectedDocId);
    }
  }
  function selectedSupportProgressCandidates() {
    if (!supportProgressList) return [];
    const ids = new Set(Array.from(supportProgressList.querySelectorAll("input[type=checkbox]:checked")).map((input) => input.value));
    return supportProgressCandidates.filter((candidate) => ids.has(candidate.id));
  }
  function updateSupportProgressPreview() {
    const selected = selectedSupportProgressCandidates();
    if (supportProgressRaw) supportProgressRaw.value = selected.map((candidate) => `\u3010${new Date(candidate.recorded_at).toLocaleString("ja-JP")}\uFF5C${candidate.context_name ?? "\u9805\u76EE\u672A\u8A2D\u5B9A"}\u3011
${candidate.transcript_raw ?? ""}`).join("\n\n");
    if (supportProgressSummary && selected.length === 0) supportProgressSummary.value = "";
    if (summarizeSupportProgressButton) summarizeSupportProgressButton.disabled = selected.length === 0;
    if (applySupportProgressButton) applySupportProgressButton.disabled = selected.length === 0 || !supportProgressSummary?.value.trim();
  }
  function renderSupportProgressCandidates(candidates) {
    supportProgressCandidates = candidates;
    if (!supportProgressList) return;
    supportProgressList.replaceChildren();
    if (!candidates.length) {
      supportProgressList.textContent = "\u4E00\u81F4\u3059\u308B\u5B8C\u4E86\u6E08\u307F\u9332\u97F3\u306F\u3042\u308A\u307E\u305B\u3093\u3002";
      return;
    }
    for (const candidate of candidates) {
      const label = document.createElement("label");
      label.className = "support-progress-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = candidate.id;
      checkbox.addEventListener("change", updateSupportProgressPreview);
      const body = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = `${new Date(candidate.recorded_at).toLocaleString("ja-JP")}\uFF5C${candidate.context_name ?? "\u9805\u76EE\u672A\u8A2D\u5B9A"}`;
      const meta = document.createElement("small");
      meta.textContent = `${candidate.match_kind === "unassigned" ? "\u5229\u7528\u8005\u672A\u9078\u629E" : candidate.match_kind === "client_id" ? "ID\u4E00\u81F4" : "\u540D\u524D\u4E00\u81F4"}\uFF5C${candidate.recorder_email ?? "\u9332\u97F3\u8005\u4E0D\u660E"}`;
      body.append(title, meta);
      label.append(checkbox, body);
      supportProgressList.append(label);
    }
    updateSupportProgressPreview();
  }
  async function loadSupportProgressCandidates() {
    if (loadSupportProgressButton) loadSupportProgressButton.disabled = true;
    setNotice(supportProgressStatus, "Voice\u5019\u88DC\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059...");
    const page = currentPageContext.kind === "support-progress-new" ? currentPageContext : null;
    const result = await chrome.runtime.sendMessage({ kind: "list-recording-transcript-candidates", kaipokeCsId: page?.kaipokeCsId ?? null, clientName: page?.clientName ?? null });
    if (loadSupportProgressButton) loadSupportProgressButton.disabled = false;
    if (result.kind !== "recording-transcript-candidates-loaded") {
      setNotice(supportProgressStatus, result.detail, true);
      return;
    }
    renderSupportProgressCandidates(result.candidates);
    setNotice(supportProgressStatus, `${result.candidates.length}\u4EF6\u306E\u5019\u88DC\u3092\u8868\u793A\u3057\u307E\u3057\u305F\u3002`);
  }
  async function summarizeSelectedSupportProgress() {
    const selected = selectedSupportProgressCandidates();
    if (!selected.length) return;
    if (summarizeSupportProgressButton) summarizeSupportProgressButton.disabled = true;
    setNotice(supportProgressStatus, "\u9078\u629E\u5185\u5BB9\u3092\u8981\u7D04\u4E2D\u3067\u3059...");
    const result = await chrome.runtime.sendMessage({ kind: "summarize-recording-transcripts", transcriptIds: selected.map((candidate) => candidate.id) });
    if (summarizeSupportProgressButton) summarizeSupportProgressButton.disabled = false;
    if (result.kind !== "recording-transcripts-summarized") {
      setNotice(supportProgressStatus, result.detail, true);
      return;
    }
    if (supportProgressSummary) supportProgressSummary.value = result.summary;
    updateSupportProgressPreview();
    setNotice(supportProgressStatus, "\u2705 \u8981\u7D04\u6587\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\u3002\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u8EE2\u8A18\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  async function applySelectedSupportProgress() {
    const text = supportProgressSummary?.value.trim() ?? "";
    const tab = await getActiveTab();
    if (!text || !tab?.id) return;
    const result = await chrome.tabs.sendMessage(tab.id, { kind: "apply-support-progress", text });
    setNotice(supportProgressStatus, result.kind === "support-progress-applied" ? "\u2705 \u5185\u5BB9\u6B04\u3078\u8EE2\u8A18\u3057\u307E\u3057\u305F\u3002\u767B\u9332\u306F\u624B\u52D5\u3067\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002" : result.detail, result.kind !== "support-progress-applied");
  }
  documentSelect?.addEventListener("change", () => {
    if (documentSelect.value) void loadDocument(documentSelect.value);
  });
  lookupPostalCodeButton?.addEventListener("click", () => void lookupPostalCode());
  postalCodeOptions?.addEventListener("change", () => {
    if (postalCodeOptions.value) setPostalCode(postalCodeOptions.value, "address_lookup");
  });
  postalRequiredInputs.forEach((input) => input.addEventListener("input", updatePostalLookupRequirements));
  applyAllButton?.addEventListener("click", () => void apply("all", currentPageContext));
  applyRemarksButton?.addEventListener("click", () => void apply("remarks", currentPageContext));
  loadSupportProgressButton?.addEventListener("click", () => void loadSupportProgressCandidates());
  summarizeSupportProgressButton?.addEventListener("click", () => void summarizeSelectedSupportProgress());
  applySupportProgressButton?.addEventListener("click", () => void applySelectedSupportProgress());
  supportProgressSummary?.addEventListener("input", updateSupportProgressPreview);
  async function initialize() {
    if (await initializeTaimeeSidePanel()) return;
    const sharefullContext = await getActiveSharefullContext();
    if (sharefullContext.page !== "unknown") {
      if (sharefullPanel) sharefullPanel.hidden = false;
      if (onboardingPanel) onboardingPanel.hidden = true;
      const subtitle = document.querySelector("#panel-subtitle");
      if (subtitle) subtitle.textContent = "Sharefull\u52DF\u96C6\u7BA1\u7406";
      setNotice(sharefullPageStatus, `\u2705 ${sharefullPageLabel(sharefullContext.page)}\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002`);
      sharefullRefresh?.addEventListener("click", () => void reloadSharefullCasesFromButton());
      sharefullSearch?.addEventListener("input", renderSharefullCases);
      await loadSharefullCases();
      return;
    }
    const context = await getPageContext();
    currentPageContext = context;
    if (context.kind === "support-progress-new") {
      if (onboardingPanel) onboardingPanel.hidden = true;
      if (supportProgressPanel) supportProgressPanel.hidden = false;
      setNotice(supportProgressPageStatus, "\u2705 \u30AB\u30A4\u30DD\u30B1\u7D4C\u904E\u8A18\u9332\u306E\u65B0\u898F\u8FFD\u52A0\u753B\u9762\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002");
      if (supportProgressClient) supportProgressClient.textContent = `\u5229\u7528\u8005\uFF1A${context.clientName ?? "\u540D\u524D\u672A\u53D6\u5F97"}${context.kaipokeCsId ? `\uFF08ID: ${context.kaipokeCsId}\uFF09` : ""}`;
      await loadSupportProgressCandidates();
      return;
    }
    const available = context.kind === "new-client-registration" || context.kind === "existing-client-edit" || context.kind === "existing-client" && context.canApplyOnboardingCandidate;
    setNotice(
      pageStatus,
      available ? context.kind === "new-client-registration" ? "\u2705 \u30AB\u30A4\u30DD\u30B1\u65B0\u898F\u5229\u7528\u8005\u767B\u9332\u753B\u9762\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002" : "\u2705 \u30AB\u30A4\u30DD\u30B1\u5229\u7528\u8005\u306E\u7DE8\u96C6\u753B\u9762\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002" : "\u30AB\u30A4\u30DD\u30B1\u306E\u300C\u8A73\u7D30\u60C5\u5831 \u7DE8\u96C6\u300D\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002",
      !available
    );
    if (applyAllButton) applyAllButton.disabled = !available;
    if (applyRemarksButton) applyRemarksButton.disabled = !available;
    await loadDocumentList();
  }
  void initialize();
})();
