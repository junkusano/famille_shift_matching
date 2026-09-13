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

  // src/popup/popup.ts
  var pageStatus = document.querySelector("#page-status");
  var onboardingActions = document.querySelector("#onboarding-actions");
  var openSidePanelButton = document.querySelector("#open-side-panel");
  var taimeeActions = document.querySelector("#taimee-actions");
  var openTaimeeSidePanelButton = document.querySelector("#open-taimee-side-panel");
  var sharefullActions = document.querySelector("#sharefull-actions");
  var openSharefullSidePanelButton = document.querySelector("#open-sharefull-side-panel");
  var clientDetails = document.querySelector("#client-details");
  var kaipokeCsId = document.querySelector("#kaipoke-cs-id");
  var lookupStatus = document.querySelector("#lookup-status");
  var lineworksDetails = document.querySelector("#lineworks-details");
  var lineworksStatus = document.querySelector("#lineworks-status");
  var membersStatus = document.querySelector("#members-status");
  var updateClientButton = document.querySelector("#update-client");
  var jobRpa = document.querySelector("#job-rpa");
  var jobRpaPageStatus = document.querySelector("#job-rpa-page-status");
  var kaitekPresetRow = document.querySelector("#kaitek-preset-row");
  var kaitekPresetSelect = document.querySelector("#kaitek-preset-select");
  var ucarePresetRow = document.querySelector("#ucare-preset-row");
  var ucarePresetSelect = document.querySelector("#ucare-preset-select");
  var jobWeekStart = document.querySelector("#job-week-start");
  var jobDateOptions = document.querySelector("#job-date-options");
  var inspectJobRpaButton = document.querySelector("#inspect-job-rpa");
  var executeJobRpaButton = document.querySelector("#execute-job-rpa");
  var jobRpaStatus = document.querySelector("#job-rpa-status");
  var jobProvider = null;
  var jobPresets = [];
  var saveDiagnosticButton = document.querySelector("#save-diagnostic");
  var diagnosticStatus = document.querySelector("#diagnostic-status");
  var runnerBridgeToken = document.querySelector("#runner-bridge-token");
  var runnerBridgePort = document.querySelector("#runner-bridge-port");
  var saveRunnerBridgeButton = document.querySelector("#save-runner-bridge");
  var runnerBridgeStatus = document.querySelector("#runner-bridge-status");
  var RUNNER_BRIDGE_CONFIG_KEY = "runnerBridgeConfig";
  function setText(element, message) {
    if (element) element.textContent = message;
  }
  function formatLocalDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function renderJobDates() {
    if (!jobDateOptions || !jobWeekStart?.value) return;
    jobDateOptions.replaceChildren();
    const start = /* @__PURE__ */ new Date(`${jobWeekStart.value}T12:00:00`);
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = formatLocalDate(date);
      checkbox.checked = true;
      label.append(checkbox, ` ${date.toLocaleDateString("ja-JP", { weekday: "short", month: "numeric", day: "numeric" })}`);
      jobDateOptions.append(label);
    }
  }
  async function loadJobPresets(provider) {
    const result = await chrome.runtime.sendMessage({
      kind: "get-job-presets",
      provider
    });
    if (result.kind !== "job-presets-loaded") {
      setText(jobRpaStatus, `\u30D7\u30EA\u30BB\u30C3\u30C8\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A${result.detail}`);
      return;
    }
    jobPresets = result.presets;
    const select = provider === "kaitek" ? kaitekPresetSelect : ucarePresetSelect;
    if (!select) return;
    select.replaceChildren();
    for (const preset of jobPresets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.append(option);
    }
    if (jobPresets.length === 0) {
      const option = document.createElement("option");
      option.textContent = "\u5229\u7528\u53EF\u80FD\u306A\u30E9\u30D9\u30EB\u304C\u3042\u308A\u307E\u305B\u3093";
      option.value = "";
      select.append(option);
      select.disabled = true;
      setText(jobRpaStatus, "\u6709\u52B9\u306A\u30D7\u30EA\u30BB\u30C3\u30C8\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
    } else {
      select.disabled = false;
      setText(jobRpaStatus, `${jobPresets.length}\u4EF6\u306E\u30E9\u30D9\u30EB\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u3002`);
    }
  }
  function selectedJobPreset() {
    const select = jobProvider === "kaitek" ? kaitekPresetSelect : ucarePresetSelect;
    const presetId = select?.value;
    return jobPresets.find((preset) => preset.id === presetId) ?? null;
  }
  async function getJobPageContext(tabId) {
    const url = (await chrome.tabs.get(tabId)).url ?? "";
    if (url.includes("biz.caitech.co.jp")) {
      const message = { kind: "get-kaitek-page-context" };
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        return await chrome.tabs.sendMessage(tabId, message);
      }
    }
    if (url.includes("partner.ucare.works")) {
      const message = { kind: "get-ucare-page-context" };
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        return await chrome.tabs.sendMessage(tabId, message);
      }
    }
    return { kind: "not-kaitek-target" };
  }
  async function initializeJobRpa() {
    const tab = await currentTab();
    if (!tab?.id) return;
    try {
      const context = await getJobPageContext(tab.id);
      if (context.kind.startsWith("kaitek")) {
        jobProvider = "kaitek";
        if (kaitekPresetRow) kaitekPresetRow.hidden = false;
        setText(jobRpaPageStatus, "\u30AB\u30A4\u30C6\u30AF\u753B\u9762\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002");
      } else if (context.kind.startsWith("ucare")) {
        jobProvider = "ucare";
        if (ucarePresetRow) ucarePresetRow.hidden = false;
        setText(jobRpaPageStatus, "Ucare\u753B\u9762\u3092\u8A8D\u8B58\u3057\u307E\u3057\u305F\u3002\u30E9\u30D9\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      } else return;
      if (jobRpa) jobRpa.hidden = false;
      const target = /* @__PURE__ */ new Date();
      target.setDate(target.getDate() + 14);
      target.setDate(target.getDate() - (target.getDay() + 6) % 7);
      if (jobWeekStart) jobWeekStart.value = formatLocalDate(target);
      renderJobDates();
      await loadJobPresets(jobProvider);
    } catch {
      setText(jobRpaPageStatus, "\u5BFE\u8C61\u30DA\u30FC\u30B8\u3092\u8A8D\u8B58\u3067\u304D\u307E\u305B\u3093\u3002");
    }
  }
  function selectedJobDates() {
    return Array.from(jobDateOptions?.querySelectorAll("input[type=checkbox]:checked") ?? []).map((input) => input.value);
  }
  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  async function waitForKaitekForm(tabId) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await wait(500);
      try {
        const context = await getJobPageContext(tabId);
        if (context.kind === "kaitek-new-work") return true;
      } catch {
      }
    }
    return false;
  }
  async function navigateToKaitekNewWork(tabId) {
    await chrome.tabs.update(tabId, { url: "https://biz.caitech.co.jp/works/new" });
    return waitForKaitekForm(tabId);
  }
  async function inspectJobRpa() {
    const tab = await currentTab();
    if (!tab?.id || !jobProvider) return;
    const result = await chrome.tabs.sendMessage(tab.id, {
      kind: jobProvider === "kaitek" ? "inspect-kaitek-form" : "inspect-ucare-form"
    });
    setText(jobRpaStatus, `\u753B\u9762\u78BA\u8A8D\u5B8C\u4E86\uFF1A\u64CD\u4F5C\u9805\u76EE ${result.controls?.length ?? 0}\u4EF6`);
  }
  async function executeJobRpa() {
    const tab = await currentTab();
    const dates = selectedJobDates();
    const preset = selectedJobPreset();
    if (!tab?.id || !jobProvider || dates.length === 0) {
      setText(jobRpaStatus, "\u5BFE\u8C61\u65E5\u30921\u65E5\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    if (!preset) {
      setText(jobRpaStatus, "\u30E9\u30D9\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    if (executeJobRpaButton) executeJobRpaButton.disabled = true;
    try {
      const result = jobProvider === "kaitek" ? await (async () => {
        const request = {
          officeName: preset.office_name ?? "",
          templateName: preset.template_name,
          targetDates: dates,
          visibility: "general",
          presetId: preset.id,
          presetLabel: preset.label,
          officeId: preset.office_id,
          templateId: preset.template_id
        };
        let kaitekResult = await chrome.tabs.sendMessage(tab.id, {
          kind: "create-kaitek-batch",
          request
        });
        if (kaitekResult.kind !== "kaitek-menu-opened") return kaitekResult;
        await chrome.tabs.sendMessage(tab.id, { kind: "open-kaitek-general-form" });
        if (!await waitForKaitekForm(tab.id) && !await navigateToKaitekNewWork(tab.id)) {
          return { kind: "kaitek-batch-failed", requestedDates: dates, issuedWorks: [], error: "\u30AB\u30A4\u30C6\u30AF\u6C42\u4EBA\u4F5C\u6210\u753B\u9762\u3078\u306E\u9077\u79FB\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093" };
        }
        await wait(1e3);
        kaitekResult = await chrome.tabs.sendMessage(tab.id, { kind: "create-kaitek-batch", request });
        return kaitekResult;
      })() : await chrome.tabs.sendMessage(tab.id, {
        kind: "create-ucare-batch",
        request: {
          recruitingId: preset.recruiting_id ?? "",
          targetDates: dates,
          presetId: preset.id,
          presetLabel: preset.label,
          templateId: preset.template_id
        }
      });
      if (result.kind === "kaitek-menu-opened") {
        setText(jobRpaStatus, "\u30AB\u30A4\u30C6\u30AF\u6C42\u4EBA\u4F5C\u6210\u753B\u9762\u3078\u306E\u9077\u79FB\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002");
        return;
      }
      const completed = result.kind === "kaitek-batch-created" || result.kind === "ucare-batch-created";
      setText(jobRpaStatus, completed ? `\u5B8C\u4E86\uFF1A${dates.length}\u65E5\u5206\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002` : `\u505C\u6B62\uFF1A${result.error}`);
    } catch (error) {
      setText(jobRpaStatus, `\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A${error instanceof Error ? error.message : "\u901A\u4FE1\u30A8\u30E9\u30FC"}`);
    } finally {
      if (executeJobRpaButton) executeJobRpaButton.disabled = false;
    }
  }
  function showLineworksProgress(message, membersMessage = "\u767B\u9332\u7D50\u679C\u3092\u78BA\u8A8D\u4E2D\u3067\u3059\u2026") {
    if (lineworksDetails) lineworksDetails.hidden = false;
    setText(lineworksStatus, message);
    setText(membersStatus, membersMessage);
  }
  function isKaipokePage(url) {
    if (!url) return false;
    try {
      const { hostname, protocol } = new URL(url);
      return protocol === "https:" && (hostname === "kaipoke.biz" || hostname.endsWith(".kaipoke.biz"));
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
  function isTaimeeReviewPage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "app-new.taimee.co.jp" && /^\/clients\/\d+\/reviews\/client/.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  function isSharefullPage(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "client.sharefull.com";
    } catch {
      return false;
    }
  }
  function diagnosticService(url) {
    try {
      const hostname = new URL(url ?? "").hostname;
      if (hostname === "app-new.taimee.co.jp") return "taimee";
      if (hostname === "kaipoke.biz" || hostname.endsWith(".kaipoke.biz")) return "kaipoke";
      if (hostname.includes("digisign")) return "digisign";
    } catch {
    }
    return "other";
  }
  function diagnosticPageType(url) {
    try {
      const parsed = new URL(url ?? "");
      if (parsed.hostname === "app-new.taimee.co.jp") {
        if (/^\/clients\/\d+\/users\/\d+/.test(parsed.pathname)) return "worker_detail";
        if (/^\/clients\/\d+\/reviews\/client/.test(parsed.pathname)) return "worker_list";
        if (/^\/clients\/\d+\/offerings\/\d+/.test(parsed.pathname)) return "offering_detail";
        return "taimee_page";
      }
      if (parsed.hostname === "kaipoke.biz" || parsed.hostname.endsWith(".kaipoke.biz")) {
        return "kaipoke_client_page";
      }
    } catch {
    }
    return "unknown_page";
  }
  async function currentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  }
  async function getCurrentPage() {
    const tab = await currentTab();
    if (!tab?.id || !isKaipokePage(tab.url)) return { kind: "not-kaipoke-target" };
    if (isSupportProgressUrl(tab.url)) {
      return { kind: "support-progress-new", kaipokeCsId: null, clientName: null };
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, {
        kind: "get-kaipoke-page-context"
      });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        return await chrome.tabs.sendMessage(tab.id, {
          kind: "get-kaipoke-page-context"
        });
      } catch {
        return { kind: "not-kaipoke-target" };
      }
    }
  }
  async function finalize(page, tabId, createGroupOnly = false) {
    showLineworksProgress(
      "\u23F3 LINE WORKS\u30B0\u30EB\u30FC\u30D7\u3092\u767B\u9332\u4E2D\u2026\n30\u79D2\u301C1\u5206\u307B\u3069\u304B\u304B\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002"
    );
    const result = await chrome.runtime.sendMessage({
      kind: "finalize-client-onboarding",
      kaipokeCsId: page.kaipokeCsId,
      tabId,
      profileName: page.profile.name,
      createGroupOnly
    });
    if (result.kind === "onboarding-finalize-error") {
      setText(lineworksStatus, "\u274C \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      setText(membersStatus, "\u274C \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return;
    }
    const groupOk = result.lineworks_group?.status === "success";
    const created = result.lineworks_group?.created === true;
    setText(lineworksStatus, groupOk ? created ? "\u2705 LINE WORKS\u30B0\u30EB\u30FC\u30D7\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F" : "\u2705 LINE WORKS\u30B0\u30EB\u30FC\u30D7\u306F\u767B\u9332\u6E08\u307F\u3067\u3059" : "\u274C \u30B0\u30EB\u30FC\u30D7\u51E6\u7406\u306B\u5931\u6557");
    const count = (result.members?.added ?? 0) + (result.members?.already_exists ?? 0);
    const failed = result.members?.failed.length ?? 0;
    setText(membersStatus, failed === 0 ? `\u2705 ${count}\u540D` : `\u26A0 ${count}\u540D\uFF0F\u5931\u6557 ${failed}\u540D`);
  }
  async function registerClient(page) {
    if (!page.profile.name) {
      setText(lookupStatus, "\u274C \u6C0F\u540D\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return false;
    }
    setText(lookupStatus, "\u767B\u9332\u4E2D...");
    const result = await chrome.runtime.sendMessage({
      kind: "register-my-famille-client",
      kaipokeCsId: page.kaipokeCsId,
      profile: page.profile
    });
    if (result.kind === "client-registration-error") {
      setText(lookupStatus, "\u274C \u767B\u9332\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      showLineworksProgress("\u2014 My\u30D5\u30A1\u30DF\u30FC\u30E6\u767B\u9332\u304C\u5B8C\u4E86\u3057\u306A\u304B\u3063\u305F\u305F\u3081\u3001LINE WORKS\u767B\u9332\u306F\u958B\u59CB\u3057\u3066\u3044\u307E\u305B\u3093\u3002", "\u2014");
      return false;
    }
    setText(lookupStatus, result.kind === "client-registration-created" ? "\u2705 \u767B\u9332\u3057\u307E\u3057\u305F" : "\u2705 \u767B\u9332\u6E08\u307F");
    return true;
  }
  async function updateClient(page) {
    if (updateClientButton) updateClientButton.disabled = true;
    setText(lookupStatus, "\u66F4\u65B0\u4E2D...");
    const result = await chrome.runtime.sendMessage({
      kind: "update-my-famille-client",
      kaipokeCsId: page.kaipokeCsId,
      profile: page.profile,
      certificates: page.certificates
    });
    if (result.kind === "client-update-error") {
      setText(lookupStatus, `\u274C \u66F4\u65B0\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F
\u539F\u56E0: ${result.detail ?? "\u8A73\u7D30\u4E0D\u660E"}`);
      if (updateClientButton) updateClientButton.disabled = false;
      return;
    }
    setText(lookupStatus, "\u2705 \u66F4\u65B0\u3057\u307E\u3057\u305F");
    const tab = await currentTab();
    if (tab?.id) await finalize(page, tab.id, true);
    if (updateClientButton) updateClientButton.disabled = false;
  }
  async function initializeExistingClient(page) {
    setText(pageStatus, page.canApplyOnboardingCandidate ? "\u30AB\u30A4\u30DD\u30B1\u5229\u7528\u8005\u306E\u7DE8\u96C6\u753B\u9762\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F" : "\u30AB\u30A4\u30DD\u30B1\u5229\u7528\u8005\u30DA\u30FC\u30B8\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
    if (page.canApplyOnboardingCandidate && onboardingActions) onboardingActions.hidden = false;
    if (clientDetails) clientDetails.hidden = false;
    setText(kaipokeCsId, page.kaipokeCsId);
    const lookup = await chrome.runtime.sendMessage({
      kind: "lookup-my-famille-client",
      kaipokeCsId: page.kaipokeCsId
    });
    const tab = await currentTab();
    if (lookup.kind === "client-lookup-error") {
      setText(lookupStatus, "\u274C \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      return;
    }
    let registeredNow = false;
    if (lookup.kind === "client-lookup-not-found") {
      showLineworksProgress(
        "\u23F3 LINE WORKS\u30B0\u30EB\u30FC\u30D7\u3092\u767B\u9332\u6E96\u5099\u4E2D\u2026\nMy\u30D5\u30A1\u30DF\u30FC\u30E6\u767B\u9332\u5F8C\u300130\u79D2\u301C1\u5206\u307B\u3069\u304B\u304B\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002",
        "My\u30D5\u30A1\u30DF\u30FC\u30E6\u767B\u9332\u3092\u78BA\u8A8D\u4E2D\u3067\u3059\u2026"
      );
      if (!await registerClient(page)) return;
      registeredNow = true;
    }
    if (lookup.kind === "client-lookup-found") {
      setText(lookupStatus, "\u2705 \u767B\u9332\u6E08\u307F");
      if (updateClientButton) updateClientButton.hidden = false;
    }
    if (!tab?.id) return;
    const eligibility = await chrome.runtime.sendMessage({
      kind: "get-onboarding-finalization-eligibility",
      tabId: tab.id,
      profileName: page.profile.name
    });
    if (eligibility.kind === "onboarding-finalization-eligible") {
      await finalize(page, tab.id);
    } else if (registeredNow) {
      await finalize(page, tab.id, true);
    }
  }
  openSidePanelButton?.addEventListener("click", async () => {
    const tab = await currentTab();
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });
  openTaimeeSidePanelButton?.addEventListener("click", async () => {
    const tab = await currentTab();
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });
  openSharefullSidePanelButton?.addEventListener("click", async () => {
    const tab = await currentTab();
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });
  saveDiagnosticButton?.addEventListener("click", async () => {
    const tab = await currentTab();
    if (!tab?.id) return;
    saveDiagnosticButton.disabled = true;
    setText(diagnosticStatus, "\u30DA\u30FC\u30B8\u8A3A\u65AD\u60C5\u5831\u3092\u9001\u4FE1\u4E2D\u2026");
    const result = await chrome.runtime.sendMessage({
      kind: "capture-rpa-diagnostic",
      request: {
        service: diagnosticService(tab.url),
        pageType: diagnosticPageType(tab.url),
        purpose: "manual_snapshot",
        operation: "manual_snapshot",
        stage: "manual",
        captureType: "manual"
      },
      importantSelectors: {
        main: "main",
        table: "table",
        dialog: "[role=dialog]",
        pagination: "[aria-label*=\u30DA\u30FC\u30B8], [aria-label*=page], nav"
      }
    });
    setText(diagnosticStatus, result.kind === "rpa-diagnostic-captured" ? "\u2705 \u30DA\u30FC\u30B8\u8A3A\u65AD\u60C5\u5831\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F" : `\u274C ${result.detail}`);
    saveDiagnosticButton.disabled = false;
  });
  updateClientButton?.addEventListener("click", async () => {
    const page = await getCurrentPage();
    if (page.kind === "existing-client") await updateClient(page);
  });
  jobWeekStart?.addEventListener("change", renderJobDates);
  inspectJobRpaButton?.addEventListener("click", () => void inspectJobRpa());
  executeJobRpaButton?.addEventListener("click", () => void executeJobRpa());
  async function initializeRunnerBridgeSettings() {
    const stored = await chrome.storage.local.get(RUNNER_BRIDGE_CONFIG_KEY);
    const config = stored[RUNNER_BRIDGE_CONFIG_KEY];
    if (config && typeof config.token === "string" && typeof config.port === "number") {
      if (runnerBridgeToken) runnerBridgeToken.value = config.token;
      if (runnerBridgePort) runnerBridgePort.value = String(config.port);
      setText(runnerBridgeStatus, "\u2705 Runner\u9023\u643A\u3092\u8A2D\u5B9A\u6E08\u307F");
    }
  }
  saveRunnerBridgeButton?.addEventListener("click", async () => {
    const token = runnerBridgeToken?.value.trim() ?? "";
    const port = Number(runnerBridgePort?.value ?? "43123");
    if (token.length < 32 || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
      setText(runnerBridgeStatus, "\u5171\u6709\u30C8\u30FC\u30AF\u30F3\uFF0832\u6587\u5B57\u4EE5\u4E0A\uFF09\u3068\u30DD\u30FC\u30C8\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    await chrome.storage.local.set({ [RUNNER_BRIDGE_CONFIG_KEY]: { token, port } });
    setText(runnerBridgeStatus, "\u2705 \u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002Runner\u8D77\u52D5\u4E2D\u306F\u81EA\u52D5\u3067Job\u3092\u53D6\u5F97\u3057\u307E\u3059\u3002");
  });
  async function initialize() {
    const tab = await currentTab();
    if (isTaimeeReviewPage(tab?.url)) {
      setText(pageStatus, "\u30BF\u30A4\u30DF\u30FC\u306E\u30EC\u30D3\u30E5\u30FC\u4E00\u89A7\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
      if (taimeeActions) taimeeActions.hidden = false;
      return;
    }
    if (isSharefullPage(tab?.url)) {
      setText(pageStatus, sharefullPageLabel(sharefullPageFromUrl(tab?.url ?? "")) + "\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
      if (sharefullActions) sharefullActions.hidden = false;
      return;
    }
    const page = await getCurrentPage();
    if (page.kind === "new-client-registration") {
      setText(pageStatus, "\u30AB\u30A4\u30DD\u30B1\u65B0\u898F\u5229\u7528\u8005\u767B\u9332\u753B\u9762\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
      if (onboardingActions) onboardingActions.hidden = false;
      return;
    }
    if (page.kind === "existing-client-edit") {
      setText(pageStatus, "\u30AB\u30A4\u30DD\u30B1\u5229\u7528\u8005\u306E\u7DE8\u96C6\u753B\u9762\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
      if (onboardingActions) onboardingActions.hidden = false;
      return;
    }
    if (page.kind === "support-progress-new") {
      setText(pageStatus, "\u30AB\u30A4\u30DD\u30B1\u7D4C\u904E\u8A18\u9332\u306E\u65B0\u898F\u8FFD\u52A0\u753B\u9762\n\u2705 \u8A8D\u8B58\u3057\u307E\u3057\u305F");
      if (openSidePanelButton) openSidePanelButton.textContent = "Voice\u304B\u3089\u652F\u63F4\u7D4C\u904E\u3092\u8EE2\u8A18";
      if (onboardingActions) onboardingActions.hidden = false;
      return;
    }
    if (page.kind === "existing-client") {
      await initializeExistingClient(page);
      return;
    }
    setText(pageStatus, "\u30AB\u30A4\u30DD\u30B1\u5229\u7528\u8005\u30DA\u30FC\u30B8\u307E\u305F\u306F\u65B0\u898F\u767B\u9332\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044");
    await initializeJobRpa();
  }
  void initializeRunnerBridgeSettings();
  void initialize();
})();
