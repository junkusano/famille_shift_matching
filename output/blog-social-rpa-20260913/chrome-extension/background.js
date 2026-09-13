"use strict";
(() => {
  // src/shared/progressEvent.ts
  var eventCodes = ["job_received", "attempt_started", "retry_scheduled", "job_completed", "job_failed", "extension_requested", "extension_received", "extension_completed", "extension_failed", "list_started", "list_completed", "worker_progress", "phone_started", "sms_started", "sms_completed", "day_skipped", "api_started", "api_completed", "template_step", "outbox_expired"];
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function cleanEvent(input) {
    if (!input || typeof input !== "object") return null;
    const e = input;
    if (!uuid.test(String(e.event_id)) || !uuid.test(String(e.run_id)) || e.job_id !== null && !uuid.test(String(e.job_id)) || !Number.isInteger(e.attempt) || Number(e.attempt) < 1 || Number(e.attempt) > 100 || !["runner", "extension", "api"].includes(String(e.source)) || !eventCodes.includes(e.code)) return null;
    if (typeof e.occurred_at !== "string" || !Number.isFinite(Date.parse(e.occurred_at))) return null;
    const data = {};
    const raw = e.data && typeof e.data === "object" ? e.data : {};
    for (const key of ["target_count", "current_index", "sent_count", "skipped_count", "failed_count", "eligible_count", "duration_ms", "http_status", "retry_count", "step"]) if (typeof raw[key] === "number" && Number.isFinite(raw[key]) && Number(raw[key]) >= 0 && Number(raw[key]) <= 864e5) data[key] = raw[key];
    if (typeof raw.work_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.work_date)) data.work_date = raw.work_date;
    if (["cases", "workers", "sms", "template", "session"].includes(String(raw.operation))) data.operation = String(raw.operation);
    if (typeof raw.dry_run === "boolean") data.dry_run = raw.dry_run;
    if (["sent", "duplicate", "skipped", "phone_not_found", "not_selected", "no_eligible_workers", "failed", "unsent"].includes(String(raw.reason))) data.reason = String(raw.reason);
    return { event_id: String(e.event_id), job_id: e.job_id, run_id: String(e.run_id), attempt: Number(e.attempt), source: e.source, code: e.code, occurred_at: e.occurred_at, version: typeof e.version === "string" && /^[0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9.-]+)?$/i.test(e.version) ? e.version : "0.0.0", data };
  }

  // src/shared/progress.ts
  var current = null;
  var tail = Promise.resolve();
  var flushing = false;
  var KEY = "rpaProgressOutbox";
  function setProgressContext(value) {
    current = value;
  }
  function getProgressContext() {
    return current;
  }
  function manualProgressContext() {
    return { job_id: null, run_id: crypto.randomUUID(), attempt: 1 };
  }
  function serial(fn) {
    const p = tail.then(fn);
    tail = p.catch(() => void 0);
    return p;
  }
  async function read() {
    const s = await chrome.storage.local.get(KEY);
    return (Array.isArray(s[KEY]) ? s[KEY] : []).map(cleanEvent).filter((e) => !!e && Date.parse(e.occurred_at) > Date.now() - 30 * 864e5);
  }
  async function progress(code, data = {}, context = current) {
    if (!context) return;
    const e = cleanEvent({ ...context, event_id: crypto.randomUUID(), source: "extension", code, data, version: chrome.runtime.getManifest().version, occurred_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (!e) return;
    await serial(async () => {
      const all = await read();
      all.push(e);
      await chrome.storage.local.set({ [KEY]: all });
    });
  }
  async function flushProgress(send) {
    if (flushing) return;
    flushing = true;
    try {
      for (const runner of [true, false]) for (; ; ) {
        const batch = await serial(async () => (await read()).filter((e) => !!e.job_id === runner).slice(0, 100));
        if (!batch.length || !await send(batch, runner)) break;
        const ids = new Set(batch.map((e) => e.event_id));
        await serial(async () => chrome.storage.local.set({ [KEY]: (await read()).filter((e) => !ids.has(e.event_id)) }));
      }
    } catch {
    } finally {
      flushing = false;
    }
  }

  // src/social/payload.ts
  function validateSocialSharePayload(value) {
    const p = value;
    if (!p || typeof p !== "object" || p.platform !== "x" && p.platform !== "threads" || typeof p.account !== "string" || !/^[A-Za-z0-9_.]{1,64}$/.test(p.account) || typeof p.text !== "string" || !p.text.trim() || [...p.text].length > 500 || typeof p.article_url !== "string" || typeof p.operation_key !== "string" || !/^blog-social:[a-z0-9:-]{1,160}$/.test(p.operation_key) || p.dry_run !== void 0 && typeof p.dry_run !== "boolean") throw new Error("SOCIAL_INVALID_PAYLOAD");
    const url = new URL(p.article_url);
    if (url.protocol !== "https:" || !["shi-on.net", "www.shi-on.net"].includes(url.hostname) || url.username || url.password || url.port || url.pathname.startsWith("/wp-") || url.pathname === "/" || !p.text.endsWith(p.article_url)) throw new Error("SOCIAL_INVALID_ARTICLE_URL");
    if (p.platform === "x" && [...p.text.slice(0, -p.article_url.length)].length * 2 + 23 > 280) throw new Error("SOCIAL_TEXT_TOO_LONG");
    return p;
  }
  function socialIntentUrl(p) {
    const url = new URL(p.platform === "x" ? "https://x.com/intent/post" : "https://www.threads.com/intent/post");
    url.searchParams.set("text", p.text);
    return url.href;
  }
  function socialProfileUrl(p) {
    return p.platform === "x" ? `https://x.com/${p.account}` : `https://www.threads.com/@${p.account}`;
  }

  // src/social/page.ts
  async function socialPageAction(p, action) {
    const normalize = (s) => s.replace(/\s+/g, " ").trim();
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const host = location.hostname;
    if (p.platform === "x" ? host !== "x.com" : !["threads.com", "www.threads.com"].includes(host)) throw new Error("SOCIAL_WRONG_SITE");
    const expectedProfile = p.platform === "x" ? `/${p.account}` : `/@${p.account}`;
    const profileLinks = Array.from(document.querySelectorAll(p.platform === "x" ? 'a[data-testid="AppTabBar_Profile_Link"]' : "a[href]")).filter((a) => {
      if (!visible(a)) return false;
      const href = new URL(a.href, location.href);
      if (href.pathname.toLowerCase() !== expectedProfile.toLowerCase()) return false;
      return p.platform === "x" || !!a.querySelector('svg[aria-label="\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB"],svg[aria-label="Profile"]') || /^(プロフィール|Profile)+$/.test(normalize(a.textContent || ""));
    });
    if (profileLinks.length === 0) throw new Error("SOCIAL_LOGIN_REQUIRED: \u6295\u7A3F\u5148\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
    if (action === "find_post") {
      if (location.pathname.toLowerCase().replace(/\/$/, "") !== expectedProfile.toLowerCase()) throw new Error("SOCIAL_WRONG_PROFILE");
      const expectedText = normalize(p.text.slice(0, -p.article_url.length));
      const articlePath = new URL(p.article_url).pathname.replace(/\/$/, "");
      const links = Array.from(document.querySelectorAll("a[href]"));
      const postLinks = links.filter((a) => {
        const u = new URL(a.href, location.href);
        const prefix = p.platform === "x" ? `${expectedProfile}/status/` : `${expectedProfile}/post/`;
        return u.origin === location.origin && u.pathname.toLowerCase().startsWith(prefix.toLowerCase()) && /^[A-Za-z0-9_-]+$/.test(u.pathname.slice(prefix.length)) && visible(a);
      });
      for (const link of postLinks) {
        let container = link.parentElement;
        for (let depth = 0; container && depth < 14 && container !== document.body; depth++, container = container.parentElement) {
          const content = normalize(container.innerText || container.textContent || "");
          if (content.length > 5e3) break;
          if (!content.includes(expectedText)) continue;
          const uniquePosts = new Set(postLinks.filter((a) => container.contains(a)).map((a) => new URL(a.href).pathname));
          if (uniquePosts.size !== 1) continue;
          const articleFound = Array.from(container.querySelectorAll("a[href]")).some((a) => {
            for (const raw of [a.href, a.getAttribute("data-expanded-url"), a.getAttribute("title")]) {
              try {
                let u = new URL(raw || "");
                if (u.hostname === "l.threads.com" && u.searchParams.has("u")) u = new URL(u.searchParams.get("u"));
                if (["shi-on.net", "www.shi-on.net"].includes(u.hostname) && u.pathname.replace(/\/$/, "") === articlePath) return true;
              } catch {
              }
            }
            return false;
          });
          if (articleFound) return { state: "published", post_url: new URL(link.href).origin + new URL(link.href).pathname, account: p.account };
        }
      }
      return { state: "not_found", account: p.account };
    }
    const composers = Array.from(document.querySelectorAll('[role="dialog"] [role="textbox"][contenteditable="true"]')).filter(visible);
    if (composers.length !== 1) throw new Error("SOCIAL_COMPOSER_NOT_READY: \u6295\u7A3F\u6B04\u3092\u4E00\u3064\u306B\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002");
    const composer = composers[0];
    const dialog = composer.closest('[role="dialog"]');
    if (normalize(composer.innerText || composer.textContent || "") !== normalize(p.text)) throw new Error("SOCIAL_TEXT_MISMATCH: \u6295\u7A3F\u6587\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
    const buttons = Array.from(dialog.querySelectorAll(p.platform === "x" ? '[data-testid="tweetButton"]' : '[role="button"],button')).filter((e) => visible(e) && !e.hasAttribute("disabled") && e.getAttribute("aria-disabled") !== "true" && (p.platform === "x" || /^(投稿|Post)$/.test(normalize(e.textContent || ""))));
    if (buttons.length !== 1) throw new Error("SOCIAL_BUTTON_NOT_READY: \u6295\u7A3F\u30DC\u30BF\u30F3\u3092\u4E00\u3064\u306B\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002");
    if (action === "inspect") return { state: "ready", account: p.account, text: normalize(p.text) };
    buttons[0].click();
    const deadline = Date.now() + 3e4;
    while (Date.now() < deadline) {
      if (!composer.isConnected || !visible(composer)) return { state: "submitted", account: p.account };
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("SOCIAL_POST_UNCERTAIN: \u6295\u7A3F\u64CD\u4F5C\u5F8C\u306E\u5B8C\u4E86\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002\u518D\u6295\u7A3F\u305B\u305A\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }

  // src/social/background.ts
  async function runSocialShare(raw) {
    const p = validateSocialSharePayload(raw);
    const markerKey = `social-share:${p.operation_key}`;
    const marker = (await chrome.storage.local.get(markerKey))[markerKey];
    if (!p.dry_run && marker?.state === "published" && marker.text === p.text && marker.account === p.account) return { ...marker, already_posted: true };
    if (marker && (marker.text !== p.text || marker.account !== p.account)) throw new Error("SOCIAL_OPERATION_CONFLICT");
    const tab = await chrome.tabs.create({ url: socialProfileUrl(p), active: false });
    if (!tab.id) throw new Error("SOCIAL_TAB_FAILED");
    const tabId = tab.id;
    let safeToClose = false;
    const execute = async (action) => {
      const result = await chrome.scripting.executeScript({ target: { tabId }, func: socialPageAction, args: [p, action] });
      if (!result[0]?.result) throw new Error("SOCIAL_PAGE_UNAVAILABLE");
      return result[0].result;
    };
    const waitFor = async (action, timeout) => {
      const deadline = Date.now() + timeout;
      let lastError;
      do {
        try {
          const state = await execute(action);
          if (state.state === "published" || state.state === "ready") return state;
          lastError = null;
        } catch (e) {
          lastError = e;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      } while (Date.now() < deadline);
      if (lastError) throw lastError;
      return null;
    };
    const remember = async (post, already) => {
      if (!post.post_url) throw new Error("SOCIAL_POST_UNCERTAIN");
      const result = {
        state: "published",
        platform: p.platform,
        account: p.account,
        text: p.text,
        article_url: p.article_url,
        post_url: post.post_url,
        operation_key: p.operation_key,
        verified_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await chrome.storage.local.set({ [markerKey]: result });
      safeToClose = true;
      return { ...result, already_posted: already };
    };
    try {
      const existing = await waitFor("find_post", 12e3);
      if (existing?.state === "published" && !p.dry_run) return await remember(existing, true);
      if (marker && !p.dry_run) throw new Error("SOCIAL_POST_UNCERTAIN: \u524D\u56DE\u306E\u6295\u7A3F\u64CD\u4F5C\u3092\u78BA\u8A8D\u3067\u304D\u306A\u3044\u305F\u3081\u518D\u6295\u7A3F\u3057\u307E\u305B\u3093\u3002");
      await chrome.tabs.update(tabId, { url: socialIntentUrl(p) });
      const ready = await waitFor("inspect", 3e4);
      if (!ready) throw new Error("SOCIAL_COMPOSER_NOT_READY");
      if (p.dry_run) {
        safeToClose = true;
        return { state: "ready", dry_run: true, platform: p.platform, account: p.account, text: p.text };
      }
      await chrome.storage.local.set({ [markerKey]: { state: "submitting", text: p.text, account: p.account, created_at: (/* @__PURE__ */ new Date()).toISOString() } });
      const submitted = await execute("submit");
      if (submitted.state !== "submitted") throw new Error("SOCIAL_POST_UNCERTAIN");
      await chrome.tabs.update(tabId, { url: socialProfileUrl(p) });
      const verified = await waitFor("find_post", 4e4);
      if (!verified || verified.state !== "published") throw new Error("SOCIAL_POST_UNCERTAIN: \u6295\u7A3FURL\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002\u518D\u6295\u7A3F\u305B\u305A\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return await remember(verified, false);
    } finally {
      if (safeToClose) await chrome.tabs.remove(tabId).catch(() => void 0);
    }
  }

  // src/sharefull/close.ts
  function sharefullCloseUrl(data) {
    if (!/^[1-9]\d*$/.test(data.sharefull_order_id ?? "")) throw new Error("Sharefull\u306E\u7BA1\u7406\u756A\u53F7\uFF08URL\u306E/orders/\u306B\u7D9A\u304F\u6570\u5B57\uFF09\u304C\u5FC5\u8981\u3067\u3059\u3002");
    if (data.sharefull_job_id !== void 0 && !/^[1-9]\d*$/.test(data.sharefull_job_id)) throw new Error("Sharefull\u6C42\u4EBAID\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    return "https://client.sharefull.com/orders/" + data.sharefull_order_id;
  }

  // src/background/index.ts
  var API_BASE = "https://myfamille.shi-on.net/api/rpa";
  var VOICE_APP_ORIGIN = "https://famille-shift-matching-git-master-junkusanos-projects.vercel.app";
  var ONBOARDING_SESSION_KEY = "onboardingRegistrationSession";
  var TAIMEE_PROCESSING_STATE_KEY = "taimeeProcessingState";
  var SHAREFULL_RUN_KEY = "sharefullRun";
  var pendingSharefullCreates = /* @__PURE__ */ new Map();
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  async function apiFetch(path, init) {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...init?.headers
      }
    });
  }
  async function voiceApi(path, init) {
    const tabs = await chrome.tabs.query({ url: `${VOICE_APP_ORIGIN}/*` });
    const tab = tabs.find((item) => item.id && item.status === "complete" && item.url?.includes("/cm-portal/recording-transcripts")) ?? tabs.find((item) => item.id && item.status === "complete");
    if (!tab?.id) throw new Error("Voice\u6587\u5B57\u8D77\u3053\u3057\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : void 0;
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (url, requestMethod, requestBody) => {
        let accessToken = null;
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
          try {
            const session = JSON.parse(localStorage.getItem(key) ?? "null");
            if (typeof session?.access_token === "string") {
              accessToken = session.access_token;
              break;
            }
          } catch {
          }
        }
        const request = (authorization) => fetch(url, {
          method: requestMethod,
          credentials: "include",
          headers: { Accept: "application/json", ...authorization ? { Authorization: `Bearer ${authorization}` } : {}, ...requestBody ? { "Content-Type": "application/json" } : {} },
          body: requestBody
        });
        let response = await request();
        if (response.status === 401 && accessToken) response = await request(accessToken);
        return { status: response.status, text: await response.text() };
      },
      args: body === void 0 ? [`${VOICE_APP_ORIGIN}${path}`, method] : [`${VOICE_APP_ORIGIN}${path}`, method, body]
    });
    const result = execution?.result;
    if (!result || typeof result.status !== "number" || typeof result.text !== "string") throw new Error("Voice\u30DA\u30FC\u30B8\u3068\u306E\u8A8D\u8A3C\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
    return new Response(result.text, { status: result.status, headers: { "Content-Type": "application/json" } });
  }
  async function sharefullApi(path, init, context = getProgressContext()) {
    return taimeeApi(`/sharefull${path}`, init, context);
  }
  async function getSharefullCases() {
    const logContext = manualProgressContext();
    await progress("list_started", {}, logContext).catch(() => void 0);
    try {
      const response = await sharefullApi("/cases", void 0, logContext);
      await progress("api_completed", { http_status: response.status }, logContext).catch(() => void 0);
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body) || !Array.isArray(body.cases)) {
        return { kind: "sharefull-case-list-error", detail: response.status === 401 ? "My\u30D5\u30A1\u30DF\u30FC\u30E6\u306E\u30ED\u30B0\u30A4\u30F3\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059\u3002My\u30D5\u30A1\u30DF\u30FC\u30E6\u306B\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304B\u3089\u6848\u4EF6\u4E00\u89A7\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : `\u6848\u4EF6\u4E00\u89A7\u53D6\u5F97\u5931\u6557 (HTTP ${response.status})` };
      }
      await progress("list_completed", { target_count: body.cases.length }, logContext).catch(() => void 0);
      return { kind: "sharefull-case-list-loaded", cases: body.cases };
    } catch (error) {
      return { kind: "sharefull-case-list-error", detail: error instanceof Error ? error.message : "\u6848\u4EF6\u4E00\u89A7\u53D6\u5F97\u5931\u6557" };
    }
  }
  async function syncSharefullTemplateStatuses() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.startsWith("https://client.sharefull.com/order_template")) {
        return { kind: "sharefull-template-status-sync-error", detail: "Sharefull\u306E\u6C42\u4EBA\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4E00\u89A7\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002" };
      }
      const page = await sendToSharefullTab(tab.id, { kind: "read-sharefull-template-statuses" });
      const snapshots = Array.isArray(page.statuses) ? page.statuses : [];
      const casesResult = await getSharefullCases();
      if (casesResult.kind !== "sharefull-case-list-loaded") {
        return { kind: "sharefull-template-status-sync-error", detail: casesResult.detail };
      }
      const reconcileResponse = await sharefullApi("/template-reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observed_template_ids: snapshots.map((snapshot) => snapshot.templateId), list_complete: true })
      });
      const reconcileBody = await reconcileResponse.json().catch(() => null);
      if (!reconcileResponse.ok || !isRecord(reconcileBody)) {
        throw new Error(`\u524A\u9664\u6E08\u307F\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u306E\u518D\u7167\u5408\u5931\u6557 (HTTP ${reconcileResponse.status})`);
      }
      const reset = typeof reconcileBody.reset_count === "number" ? reconcileBody.reset_count : 0;
      const casesByTemplateId = new Map(
        casesResult.cases.filter((item) => item.sharefull_template_id?.trim()).map((item) => [item.sharefull_template_id.trim(), item])
      );
      let updated = 0;
      for (const snapshot of snapshots) {
        const row = casesByTemplateId.get(snapshot.templateId);
        if (!row) continue;
        if (row.sharefull_template_status === snapshot.status && snapshot.status !== "ready_for_offer") continue;
        const response = await sharefullApi("/template-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ core_id: row.core_id, sharefull_template_status: snapshot.status })
        });
        if (!response.ok) throw new Error(`\u5BE9\u67FB\u72B6\u614B\u66F4\u65B0\u5931\u6557 (HTTP ${response.status})`);
        updated += 1;
      }
      return { kind: "sharefull-template-status-sync-complete", updated, reset };
    } catch (error) {
      return { kind: "sharefull-template-status-sync-error", detail: error instanceof Error ? error.message : "\u5BE9\u67FB\u72B6\u614B\u540C\u671F\u5931\u6557" };
    }
  }
  async function getSharefullTemplateData(coreId) {
    const response = await sharefullApi(`/template-data?core_id=${encodeURIComponent(coreId)}`);
    const body = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body) || !isRecord(body.data)) throw new Error("\u9078\u629E\u6848\u4EF6\u306E\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u30C7\u30FC\u30BF\u53D6\u5F97\u5931\u6557");
    return body.data;
  }
  async function saveSharefullTemplateId(coreId, templateId) {
    const response = await sharefullApi("/template-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ core_id: coreId, sharefull_template_id: templateId })
    });
    if (!response.ok) throw new Error("Supabase\u3078\u306ESharefull template ID\u4FDD\u5B58\u5931\u6557");
  }
  async function sendToSharefullTab(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }
  async function navigateSharefullTab(tabId, url) {
    const target = new URL(url);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        error ? reject(error) : resolve();
      };
      const onUpdated = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        if (tab.url && new URL(tab.url).pathname === target.pathname) finish();
      };
      const timeout = globalThis.setTimeout(() => finish(new Error("Sharefull\u30B3\u30D4\u30FC\u753B\u9762\u306E\u8AAD\u307F\u8FBC\u307F\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002")), 2e4);
      chrome.tabs.onUpdated.addListener(onUpdated);
      void chrome.tabs.update(tabId, { url: target.toString() }).then((tab) => {
        if (tab?.status === "complete" && tab.url && new URL(tab.url).pathname === target.pathname) finish();
      }).catch(() => finish(new Error("Sharefull\u30B3\u30D4\u30FC\u753B\u9762\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002")));
    });
  }
  async function waitForSharefullStep(tabId, expected) {
    const deadline = Date.now() + 15e3;
    let lastContext = null;
    while (Date.now() < deadline) {
      const context = await sendToSharefullTab(tabId, { kind: "get-sharefull-page-context" });
      lastContext = context;
      if (context.page === "copy" && context.step === expected) return;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    console.error("[famille-rpa] Sharefull step detection timed out", {
      expected,
      lastContext,
      tabUrl: tab?.url ?? null,
      tabStatus: tab?.status ?? null
    });
    throw new Error(`${expected}/4\u753B\u9762\u3078\u306E\u9077\u79FB\u5931\u6557`);
  }
  async function waitForCreateResponse(tabId, expectedTitle) {
    const deadline = Date.now() + 3e4;
    let lastUrl = "";
    while (Date.now() < deadline) {
      const captured = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timeout);
          pendingSharefullCreates.delete(tabId);
          resolve(value);
        };
        const timeout = globalThis.setTimeout(() => finish(null), 400);
        pendingSharefullCreates.set(tabId, (result) => finish(result?.templateId ?? null));
      });
      if (captured && captured !== "428828") return captured;
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      lastUrl = tab?.url ?? lastUrl;
      const urlMatch = tab?.url?.match(/\/order_template\/(\d+)/);
      if (urlMatch && urlMatch[1] !== "428828") return urlMatch[1];
      const page = await sendToSharefullTab(tabId, { kind: "read-sharefull-template-id", expectedTitle }).catch(() => null);
      if (page?.templateId && page.templateId !== "428828") return page.templateId;
    }
    throw new Error(`\u65B0\u898Ftemplate ID\u53D6\u5F97\u5931\u6557\uFF08URL: ${lastUrl || "\u4E0D\u660E"}\uFF09`);
  }
  async function waitForPublishedSharefullJobId(tabId, timeoutMs = 6e4) {
    const deadline = Date.now() + timeoutMs;
    let lastUrl = "";
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url?.startsWith("https://client.sharefull.com/")) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
        continue;
      }
      lastUrl = tab.url;
      const result = await sendToSharefullTab(tabId, { kind: "read-sharefull-job-id" }).catch(() => null);
      if (result?.jobId) return result.jobId;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    }
    throw new Error(`\u63B2\u8F09\u5B8C\u4E86\u5F8C\u306E\u5B9F\u969B\u306E\u6C42\u4EBAID\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08URL: ${lastUrl || "\u4E0D\u660E"}\uFF09\u3002\u5185\u90E8\u6CE8\u6587ID\u306F\u4FDD\u5B58\u3057\u307E\u305B\u3093\u3002`);
  }
  async function runSharefullCloseSpotOffer(payload) {
    if (!isRecord(payload) || typeof payload.sharefull_order_id !== "string" || payload.sharefull_job_id !== void 0 && typeof payload.sharefull_job_id !== "string") throw new Error("Sharefull\u52DF\u96C6\u7D42\u4E86\u306E\u6307\u5B9A\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    const data = { sharefull_order_id: payload.sharefull_order_id, sharefull_job_id: payload.sharefull_job_id };
    const url = sharefullCloseUrl(data);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://client.sharefull.com/")) throw new Error("Sharefull\u306E\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002");
    if (new URL(tab.url).origin + new URL(tab.url).pathname.replace(/\/$/, "") !== url) await navigateSharefullTab(tab.id, url);
    const deadline = Date.now() + 2e4;
    let ready = false;
    while (Date.now() < deadline) {
      const page = await sendToSharefullTab(tab.id, { kind: "read-sharefull-job-id" }).catch(() => null);
      if (page?.jobId) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("Sharefull\u6C42\u4EBA\u8A73\u7D30\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    const result = await chrome.tabs.sendMessage(tab.id, { kind: "close-sharefull-spot-offer", data });
    if (result?.kind !== "sharefull-spot-offer-closed") throw new Error(result?.detail ?? "Sharefull\u52DF\u96C6\u7D42\u4E86\u306E\u7D50\u679C\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002");
    return { sharefull_order_id: result.sharefull_order_id, sharefull_job_id: result.sharefull_job_id, closed: true, already_closed: result.already_closed };
  }
  async function runSharefullSpotOffer(payload) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const templateId = isRecord(payload) && typeof payload.sharefull_template_id === "string" ? payload.sharefull_template_id.trim() : "";
    if (!tab?.id || !tab.url?.startsWith("https://client.sharefull.com/")) {
      throw new Error("Sharefull\u306E\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    const currentUrl = new URL(tab.url);
    const isTargetCopyPage = currentUrl.pathname === "/orders/copy" && currentUrl.searchParams.get("orderTemplate") === templateId;
    if (!isTargetCopyPage) {
      if (!templateId) throw new Error("Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8ID\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
      await navigateSharefullTab(
        tab.id,
        `https://client.sharefull.com/orders/copy?orderTemplate=${encodeURIComponent(templateId)}`
      );
    }
    let result = null;
    try {
      result = await sendToSharefullTab(tab.id, { kind: "create-sharefull-spot-offer", data: payload });
    } catch {
    }
    if (!result && isRecord(payload) && payload.execution_mode !== "publish") throw new Error("Sharefull\u4E00\u6642\u4FDD\u5B58\u51E6\u7406\u3068\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
    if (result?.kind === "sharefull-spot-offer-saved") return { saved: true };
    if (result?.kind === "sharefull-spot-offer-created" && result.sharefull_job_id) return { sharefull_job_id: result.sharefull_job_id, sharefull_order_id: (await chrome.tabs.get(tab.id)).url?.match(/\/orders\/(\d+)(?:[/?#]|$)/)?.[1] ?? null };
    if (result?.kind === "sharefull-spot-offer-failed") throw new Error(result.detail ?? "Sharefull\u6C42\u4EBA\u63B2\u8F09\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
    if (result && result.kind !== "sharefull-spot-offer-submitted") throw new Error("Sharefull\u6C42\u4EBA\u516C\u958B\u64CD\u4F5C\u306E\u5B8C\u4E86\u72B6\u614B\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    const jobId = await waitForPublishedSharefullJobId(tab.id);
    return { sharefull_job_id: jobId, sharefull_order_id: (await chrome.tabs.get(tab.id)).url?.match(/\/orders\/(\d+)(?:[/?#]|$)/)?.[1] ?? null };
  }
  async function installSharefullCreateCapture(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const key = "__familleSharefullRegisterCapture";
        const page = window;
        if (page[key]) return;
        page[key] = true;
        const publish = (body) => {
          const isObject = (value) => typeof value === "object" && value !== null;
          const idKeys = /* @__PURE__ */ new Set(["id", "templateId", "template_id", "orderTemplateId", "order_template_id", "orderTemplate", "order_template", "template"]);
          const ids = [];
          const visit = (value, depth = 0) => {
            if (!isObject(value) || depth > 8) return;
            for (const [key2, nested] of Object.entries(value)) {
              if (idKeys.has(key2) && (typeof nested === "number" || typeof nested === "string")) ids.push(nested);
              else if (isObject(nested)) visit(nested, depth + 1);
            }
          };
          visit(body);
          const id = ids.find((value) => /^\d{4,}$/.test(String(value)) && String(value) !== "428828");
          if (id !== void 0 && String(id) !== "428828") {
            window.postMessage({ source: key, templateId: String(id) }, location.origin);
          }
        };
        const publishText = (text) => {
          try {
            publish(JSON.parse(text));
            return;
          } catch {
          }
          try {
            const decoded = atob(text.trim());
            publish(JSON.parse(decoded));
            return;
          } catch {
          }
          const idMatch = text.match(/(?:template[_-]?id|order[_-]?template[_-]?id|\"id\")\s*[:=]\s*\"?(\d{4,})/i);
          if (idMatch && idMatch[1] !== "428828") {
            window.postMessage({ source: key, templateId: idMatch[1] }, location.origin);
          }
        };
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await originalFetch(...args);
          const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : args[0].toString();
          const method = args[1]?.method ?? (args[0] instanceof Request ? args[0].method : "GET");
          const isCreateRequest = /registerordertemplate/i.test(url) || method.toUpperCase() === "POST" && /order_template|ordertemplate/i.test(url);
          if (isCreateRequest) {
            void response.clone().text().then(publishText).catch(() => void 0);
          }
          return response;
        };
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        const open = originalOpen;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this.addEventListener("load", () => {
            const isCreateRequest = /registerordertemplate/i.test(String(url)) || method.toUpperCase() === "POST" && /order_template|ordertemplate/i.test(String(url));
            if (isCreateRequest) {
              publishText(this.responseText);
            }
          });
          return open.call(this, method, url, rest[0], rest[1], rest[2]);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          return originalSend.apply(this, args);
        };
      }
    });
  }
  async function runSharefullFlow(tabId, data) {
    for (let step = 1; step <= 4; step += 1) {
      await waitForSharefullStep(tabId, step);
      const filled = await sendToSharefullTab(tabId, { kind: "fill-sharefull-step", data });
      if (filled.kind !== "sharefull-page-filled") throw new Error(filled.detail ?? `${step}/4\u753B\u9762\u5165\u529B\u5931\u6557`);
      if (step < 4) {
        const advanced = await sendToSharefullTab(tabId, { kind: "advance-sharefull-step" });
        if (!advanced.ok) throw new Error(`${step}/4\u2192${step + 1}/4\u9077\u79FB\u5931\u6557`);
        continue;
      }
      await installSharefullCreateCapture(tabId);
      await sendToSharefullTab(tabId, { kind: "prepare-sharefull-create" });
      const responsePromise = waitForCreateResponse(tabId, data.template_title ?? void 0);
      const created = await sendToSharefullTab(tabId, { kind: "create-sharefull-template" });
      if (!created.ok) throw new Error("4/4\u300C\u4F5C\u6210\u300D\u5B9F\u884C\u5931\u6557");
      const templateId = await responsePromise;
      if (templateId === "428828") throw new Error("BASE_TEMPLATE_PROTECTION");
      await saveSharefullTemplateId(data.core_id, templateId);
      return templateId;
    }
    throw new Error("Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210\u30D5\u30ED\u30FC\u304C\u5B8C\u4E86\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
  }
  async function runSharefullTemplateJob(payload) {
    if (!isRecord(payload) || typeof payload.core_id !== "string" || !payload.core_id.trim()) throw new Error("Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4F5C\u6210\u306E\u6307\u5B9A\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://client.sharefull.com/")) throw new Error("Sharefull\u306E\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002");
    const data = await getSharefullTemplateData(payload.core_id.trim());
    if (data.sharefull_template_id?.trim()) return { sharefull_template_id: data.sharefull_template_id.trim(), already_exists: true };
    await chrome.storage.session.set({ [SHAREFULL_RUN_KEY]: { tabId: tab.id, coreId: data.core_id, data } });
    try {
      await navigateSharefullTab(tab.id, "https://client.sharefull.com/order_template/new?copy=428828");
      const templateId = await runSharefullFlow(tab.id, data);
      return { sharefull_template_id: templateId };
    } finally {
      await chrome.storage.session.remove(SHAREFULL_RUN_KEY);
    }
  }
  async function startSharefullTemplate(coreId) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.startsWith("https://client.sharefull.com/")) throw new Error("Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u4E00\u89A7\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002");
      const data = await getSharefullTemplateData(coreId);
      if (data.sharefull_template_id?.trim()) {
        const status = data.sharefull_template_status === "template_review" ? "\u5BE9\u67FB\u4E2D" : "\u4F5C\u6210\u6E08\u307F";
        throw new Error(`Sharefull\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u306F\u65E2\u306B${status}\u3067\u3059\uFF08ID: ${data.sharefull_template_id}\uFF09\u3002`);
      }
      await chrome.storage.session.set({ [SHAREFULL_RUN_KEY]: { tabId: tab.id, coreId, data } });
      await navigateSharefullTab(tab.id, "https://client.sharefull.com/order_template/new?copy=428828");
      void runSharefullFlow(tab.id, data).then(() => chrome.storage.session.remove(SHAREFULL_RUN_KEY)).catch(async (error) => {
        console.error("[famille-rpa] Sharefull flow failed", error);
        await chrome.storage.session.remove(SHAREFULL_RUN_KEY);
      });
      return { kind: "sharefull-started" };
    } catch (error) {
      return { kind: "sharefull-start-error", detail: error instanceof Error ? error.message : "Sharefull\u51E6\u7406\u958B\u59CB\u5931\u6557" };
    }
  }
  async function lookupClient(kaipokeCsId) {
    const query = new URLSearchParams({ kaipoke_cs_id: kaipokeCsId });
    try {
      const response = await apiFetch(`/client-lookup?${query}`);
      if (!response.ok) return { kind: "client-lookup-error" };
      const body = await response.json();
      if (typeof body.exists !== "boolean" || body.kaipoke_cs_id !== kaipokeCsId) {
        return { kind: "client-lookup-error" };
      }
      return body.exists ? { kind: "client-lookup-found" } : { kind: "client-lookup-not-found" };
    } catch {
      return { kind: "client-lookup-error" };
    }
  }
  async function registerClient(message) {
    try {
      const response = await apiFetch("/client-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kaipoke_cs_id: message.kaipokeCsId, profile: message.profile })
      });
      if (!response.ok) return { kind: "client-registration-error" };
      const body = await response.json();
      if (!isRecord(body) || typeof body.created !== "boolean") {
        return { kind: "client-registration-error" };
      }
      return body.created ? { kind: "client-registration-created" } : { kind: "client-registration-already-exists" };
    } catch {
      return { kind: "client-registration-error" };
    }
  }
  async function updateClient(message) {
    try {
      const response = await apiFetch("/client-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kaipoke_cs_id: message.kaipokeCsId,
          profile: message.profile,
          certificates: message.certificates
        })
      });
      if (response.ok) return { kind: "client-updated" };
      const body = await response.json().catch(() => null);
      const detail = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      console.error("[famille-rpa] client-update failed", { status: response.status, detail });
      return { kind: "client-update-error", detail };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "\u901A\u4FE1\u30A8\u30E9\u30FC";
      console.error("[famille-rpa] client-update request failed", { detail });
      return { kind: "client-update-error", detail };
    }
  }
  async function listRecordingTranscriptCandidates(kaipokeCsId, clientName) {
    try {
      const query = new URLSearchParams();
      if (kaipokeCsId) query.set("client_id", kaipokeCsId);
      if (clientName) query.set("client_name", clientName);
      const response = await voiceApi(`/api/rpa/recording-transcripts?${query}`);
      if (!response.ok) return { kind: "recording-transcript-candidates-error", detail: `HTTP ${response.status}` };
      const body = await response.json();
      return Array.isArray(body.candidates) ? { kind: "recording-transcript-candidates-loaded", candidates: body.candidates } : { kind: "recording-transcript-candidates-error", detail: "\u5019\u88DC\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059" };
    } catch (error) {
      return { kind: "recording-transcript-candidates-error", detail: error instanceof Error ? error.message : "Voice\u5019\u88DC\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F" };
    }
  }
  async function summarizeRecordingTranscripts(ids) {
    try {
      const response = await voiceApi("/api/rpa/recording-transcripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript_ids: ids }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.summary) return { kind: "recording-transcripts-summary-error", detail: body?.error ?? `HTTP ${response.status}` };
      return { kind: "recording-transcripts-summarized", summary: body.summary };
    } catch (error) {
      return { kind: "recording-transcripts-summary-error", detail: error instanceof Error ? error.message : "\u8981\u7D04\u306B\u5931\u6557\u3057\u307E\u3057\u305F" };
    }
  }
  async function listDocuments() {
    try {
      const response = await apiFetch("/onboarding/documents");
      if (!response.ok) return { kind: "document-list-error" };
      const body = await response.json();
      if (!isRecord(body) || !Array.isArray(body.documents)) return { kind: "document-list-error" };
      return { kind: "document-list-loaded", documents: body.documents };
    } catch {
      return { kind: "document-list-error" };
    }
  }
  async function getDocument(documentId) {
    try {
      const response = await apiFetch(`/onboarding/documents/${encodeURIComponent(documentId)}`);
      if (!response.ok) return { kind: "document-load-error" };
      const body = await response.json();
      if (!isRecord(body) || !isRecord(body.document)) return { kind: "document-load-error" };
      return { kind: "document-loaded", document: body.document };
    } catch {
      return { kind: "document-load-error" };
    }
  }
  async function lookupPostalCodes(message) {
    try {
      const response = await apiFetch("/onboarding/postal-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefecture: message.prefecture,
          city: message.city,
          address: message.address
        })
      });
      const body = await response.json().catch(() => null);
      const diagnostics = isRecord(body) && Array.isArray(body.diagnostics) ? body.diagnostics.filter((item) => typeof item === "string") : [`My\u30D5\u30A1\u30DF\u30FC\u30E6 API: HTTP ${response.status}`];
      if (!response.ok) return { kind: "postal-codes-error", diagnostics };
      if (!isRecord(body) || !Array.isArray(body.postal_codes)) return { kind: "postal-codes-error", diagnostics };
      const candidates = body.postal_codes.filter(isRecord).flatMap((item) => {
        const postalCode = item.postal_code;
        const prefecture = item.prefecture;
        const city = item.city;
        const town = item.town;
        return typeof postalCode === "string" && typeof prefecture === "string" && typeof city === "string" && typeof town === "string" ? [{ postal_code: postalCode, prefecture, city, town }] : [];
      });
      return candidates.length ? { kind: "postal-codes-found", candidates, diagnostics } : { kind: "postal-codes-not-found", diagnostics };
    } catch {
      return { kind: "postal-codes-error", diagnostics: ["\u62E1\u5F35\u6A5F\u80FD\u304B\u3089My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F"] };
    }
  }
  async function captureRpaDiagnostic(tabId, request, importantSelectors) {
    try {
      const response = await sendTaimeeContentMessage(tabId, {
        kind: "capture-rpa-diagnostic",
        request: {
          ...request,
          extensionVersion: chrome.runtime.getManifest().version,
          manifestVersion: String(chrome.runtime.getManifest().manifest_version)
        },
        importantSelectors
      });
      const snapshot = isRecord(response) && isRecord(response.snapshot) ? response.snapshot : null;
      if (!snapshot) throw new Error("\u5BFE\u8C61\u30DA\u30FC\u30B8\u306EDOM\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u5BFE\u8C61\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      const diagnosticRequest = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot)
      };
      let apiResponse;
      try {
        apiResponse = await taimeeApi("/diagnostics", diagnosticRequest);
      } catch {
        apiResponse = await apiFetch("/diagnostics", diagnosticRequest);
      }
      const body = await apiResponse.json().catch(() => null);
      if (!apiResponse.ok || !isRecord(body) || body.ok !== true) {
        const detail = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${apiResponse.status}`;
        throw new Error(`\u8A3A\u65AD\u60C5\u5831\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08${detail}\uFF09`);
      }
      return {
        kind: "rpa-diagnostic-captured",
        diagnosticId: typeof body.diagnosticId === "string" ? body.diagnosticId : null,
        snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : ""
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "\u8A3A\u65AD\u60C5\u5831\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      console.warn("[famille-rpa] diagnostic capture failed", detail);
      return { kind: "rpa-diagnostic-capture-error", detail };
    }
  }
  function normalizeName(value) {
    return (value ?? "").replace(/[\s\u3000]+/g, "").trim();
  }
  async function getOnboardingSession() {
    const stored = await chrome.storage.session.get(ONBOARDING_SESSION_KEY);
    const session = stored[ONBOARDING_SESSION_KEY];
    if (!isRecord(session) || typeof session.documentId !== "string" || typeof session.expectedName !== "string" || typeof session.sourceTabId !== "number" || typeof session.sourceUrl !== "string" || typeof session.transitionObserved !== "boolean" || typeof session.startedAt !== "number") return null;
    return session;
  }
  async function getFinalizationEligibility(tabId, profileName) {
    const session = await getOnboardingSession();
    if (!session) return { kind: "onboarding-finalization-waiting", reason: "no_session" };
    if (session.sourceTabId !== tabId) return { kind: "onboarding-finalization-waiting", reason: "different_tab" };
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const transitioned = session.transitionObserved || Boolean(tab?.url && tab.url !== session.sourceUrl);
    if (!transitioned) return { kind: "onboarding-finalization-waiting", reason: "not_transitioned" };
    if (!profileName || normalizeName(profileName) !== session.expectedName) {
      return { kind: "onboarding-finalization-waiting", reason: "name_mismatch" };
    }
    return { kind: "onboarding-finalization-eligible" };
  }
  async function beginOnboardingRegistration(message) {
    const tab = await chrome.tabs.get(message.tabId);
    if (!tab.url) return;
    await chrome.storage.session.set({
      [ONBOARDING_SESSION_KEY]: {
        documentId: message.documentId,
        expectedName: normalizeName(message.expectedName),
        sourceTabId: message.tabId,
        sourceUrl: tab.url,
        transitionObserved: false,
        startedAt: Date.now()
      }
    });
  }
  async function finalizeOnboarding(kaipokeCsId, tabId, profileName, createGroupOnly = false) {
    try {
      if (createGroupOnly) {
        const response2 = await apiFetch("/onboarding/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kaipoke_cs_id: kaipokeCsId, cs_doc_id: null, expected_name: null })
        });
        if (!response2.ok) return { kind: "onboarding-finalize-error" };
        const body2 = await response2.json();
        return isRecord(body2) ? { kind: "onboarding-finalized", ...body2 } : { kind: "onboarding-finalize-error" };
      }
      const eligibility = await getFinalizationEligibility(tabId, profileName);
      const session = await getOnboardingSession();
      if (eligibility.kind !== "onboarding-finalization-eligible" || !session) {
        return { kind: "onboarding-finalize-error" };
      }
      const response = await apiFetch("/onboarding/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kaipoke_cs_id: kaipokeCsId,
          cs_doc_id: session.documentId,
          expected_name: session.expectedName
        })
      });
      if (!response.ok) return { kind: "onboarding-finalize-error" };
      const body = await response.json();
      if (!isRecord(body)) return { kind: "onboarding-finalize-error" };
      const document2 = isRecord(body.document) ? body.document : void 0;
      if (document2?.status === "linked" || document2?.status === "already_linked") {
        await chrome.storage.session.remove([ONBOARDING_SESSION_KEY, "onboardingSelectedDocId"]);
      }
      return { kind: "onboarding-finalized", ...body };
    } catch {
      return { kind: "onboarding-finalize-error" };
    }
  }
  function emptyTaimeeState(workDate = "") {
    return { workDate, candidates: [], currentIndex: 0, status: "idle", startedAt: null, progressMessage: null, fatalError: null };
  }
  function isTaimeeState(value) {
    return isRecord(value) && typeof value.workDate === "string" && Array.isArray(value.candidates) && typeof value.currentIndex === "number" && typeof value.status === "string" && (value.startedAt === null || typeof value.startedAt === "number") && (value.progressMessage === null || typeof value.progressMessage === "string") && (value.fatalError === null || typeof value.fatalError === "string");
  }
  async function getTaimeeState() {
    const stored = await chrome.storage.session.get(TAIMEE_PROCESSING_STATE_KEY);
    return isTaimeeState(stored[TAIMEE_PROCESSING_STATE_KEY]) ? stored[TAIMEE_PROCESSING_STATE_KEY] : emptyTaimeeState();
  }
  async function saveTaimeeState(state) {
    await chrome.storage.session.set({ [TAIMEE_PROCESSING_STATE_KEY]: state });
    await progress("worker_progress", { work_date: state.workDate, target_count: state.candidates.length, current_index: Math.min(state.currentIndex + 1, state.candidates.length), sent_count: state.candidates.filter((w) => w.smsStatus === "sent").length, skipped_count: state.candidates.filter((w) => ["duplicate", "skipped"].includes(w.smsStatus)).length, failed_count: state.candidates.filter((w) => ["failed", "phone_not_found"].includes(w.smsStatus)).length }).catch(() => void 0);
    return state;
  }
  function workerKey(worker) {
    return `${worker.taimeeUserId}:${worker.workDate}:${worker.offeringId}`;
  }
  function taimeeStatus(value) {
    return value === "sent" || value === "failed" || value === "duplicate" || value === "skipped" || value === "phone_not_found" ? value : "unsent";
  }
  async function taimeeApi(path, init, context = getProgressContext()) {
    const tabs = await chrome.tabs.query({ url: "https://myfamille.shi-on.net/*" });
    const tab = tabs.find((item) => item.id && item.status === "complete" && item.url?.includes("/portal/")) ?? tabs.find((item) => item.id && item.status === "complete");
    if (!tab?.id) throw new Error("My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u30ED\u30B0\u30A4\u30F3\u3057\u305F\u30BF\u30D6\u3092\u958B\u3044\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    const traceHeaders = context ? { "X-RPA-Run-ID": context.run_id, "X-RPA-Attempt": String(context.attempt), ...context.job_id ? { "X-RPA-Job-ID": context.job_id } : {} } : {};
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : void 0;
    const executeRequest = async (requestTabId) => {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: requestTabId },
        world: "MAIN",
        func: async (apiPath, requestMethod, requestBody, trace) => {
          let accessToken = null;
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
            try {
              const session = JSON.parse(localStorage.getItem(key) ?? "null");
              if (typeof session?.access_token === "string") {
                accessToken = session.access_token;
                break;
              }
            } catch {
            }
          }
          const headers = {
            Accept: "application/json",
            ...trace,
            ...requestBody ? { "Content-Type": "application/json" } : {}
          };
          let response2 = await fetch(apiPath, {
            method: requestMethod,
            credentials: "include",
            headers,
            body: requestBody || void 0
          });
          if (response2.status === 401 && accessToken) {
            response2 = await fetch(apiPath, { method: requestMethod, credentials: "include", headers: { ...headers, Authorization: "Bearer " + accessToken }, body: requestBody || void 0 });
          }
          return { status: response2.status, text: await response2.text() };
        },
        // GETは第3引数自体を省く。Chromeはundefined/nullの引数を受け付けないことがある。
        args: [`${API_BASE}${path}`, method, body ?? "", traceHeaders]
      });
      const result = execution?.result;
      if (!result || typeof result.status !== "number" || typeof result.text !== "string") {
        throw new Error("My\u30D5\u30A1\u30DF\u30FC\u30E6\u3068\u306E\u8A8D\u8A3C\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      return new Response(result.text, { status: result.status, headers: { "Content-Type": "application/json" } });
    };
    const requestStarted = Date.now();
    const response = await executeRequest(tab.id);
    if (path !== "/events") await progress("api_completed", { duration_ms: Date.now() - requestStarted, http_status: response.status }).catch(() => void 0);
    if (response.status !== 401) return response;
    const fresh = await chrome.tabs.create({ url: "https://myfamille.shi-on.net/portal/", active: false });
    if (!fresh.id) return response;
    try {
      const deadline = Date.now() + 15e3;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const current2 = await chrome.tabs.get(fresh.id);
        if (current2.status !== "complete") continue;
        const retried = await executeRequest(fresh.id);
        if (retried.status !== 401) return retried;
      }
      return response;
    } finally {
      await chrome.tabs.remove(fresh.id).catch(() => void 0);
    }
  }
  async function registerTaimeeWorker(worker) {
    const response = await taimeeApi("/taimee/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taimee_user_id: worker.taimeeUserId,
        worker_name: worker.workerName,
        phone_number: worker.phoneNumber,
        work_date: worker.workDate,
        offering_id: worker.offeringId,
        offering_name: worker.offeringName,
        source: "rpa",
        fetched_at: (/* @__PURE__ */ new Date()).toISOString(),
        sms_eligible: worker.smsEligible,
        sms_skip_reason: worker.smsSkipReason
      })
    });
    if (!response.ok) {
      const body2 = await response.json().catch(() => null);
      const apiError = isRecord(body2) && typeof body2.error === "string" ? body2.error : null;
      const detail = response.status === 401 ? `My\u30D5\u30A1\u30DF\u30FC\u30E6\u306E\u30ED\u30B0\u30A4\u30F3\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08HTTP 401${apiError ? `: ${apiError}` : ""}\uFF09\u3002\u30ED\u30B0\u30A4\u30F3\u6E08\u307F\u306E /portal/ \u753B\u9762\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002` : response.status === 403 ? `My\u30D5\u30A1\u30DF\u30FC\u30E6\u306E\u6A29\u9650\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059\uFF08HTTP 403${apiError ? `: ${apiError}` : ""}\uFF09\u3002admin \u307E\u305F\u306F manager \u6A29\u9650\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002` : `My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F (HTTP ${response.status}${apiError ? `: ${apiError}` : ""})\u3002`;
      throw new Error(detail);
    }
    const body = await response.json().catch(() => ({}));
    const registrationStatus = isRecord(body) && (body.registration_status === "registered" || body.registration_status === "already_registered") ? body.registration_status : null;
    return {
      smsStatus: isRecord(body) ? taimeeStatus(body.sms_status) : "unsent",
      registrationStatus,
      smsSkipReason: isRecord(body) && typeof body.sms_skip_reason === "string" ? body.sms_skip_reason : null
    };
  }
  async function sendTaimeeContentMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }
  async function navigateTaimeeTab(tabId, url) {
    const target = new URL(url, "https://app-new.taimee.co.jp");
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        error ? reject(error) : resolve();
      };
      const onUpdated = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        if (tab.url && new URL(tab.url).pathname === target.pathname) finish();
      };
      const timeout = globalThis.setTimeout(() => finish(new Error("\u30DA\u30FC\u30B8\u306E\u8AAD\u307F\u8FBC\u307F\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002")), 2e4);
      chrome.tabs.onUpdated.addListener(onUpdated);
      void chrome.tabs.update(tabId, { url: target.toString() }).then((tab) => {
        if (tab?.status === "complete" && tab.url && new URL(tab.url).pathname === target.pathname) finish();
      }).catch(() => finish(new Error("\u30BF\u30A4\u30DF\u30FC\u753B\u9762\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002")));
    });
  }
  async function readPhoneByNavigation(tabId, workerUrl, reviewUrl) {
    let lastResult = { kind: "taimee-phone-fetched", phoneNumber: null, workplaceWorkCount: null };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await navigateTaimeeTab(tabId, workerUrl);
      const deadline = Date.now() + 12e3;
      do {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
        lastResult = await sendTaimeeContentMessage(tabId, { kind: "read-taimee-phone" });
        if (lastResult.kind === "taimee-phone-fetched" && (lastResult.phoneNumber || lastResult.workplaceWorkCount !== null)) return lastResult;
      } while (Date.now() < deadline);
      if (attempt === 0) await navigateTaimeeTab(tabId, reviewUrl);
    }
    return lastResult;
  }
  async function startTaimeeFetch(tabId, workDate, options = {}) {
    const sourceTab = await chrome.tabs.get(tabId).catch(() => null);
    if (!sourceTab?.url || !/^https:\/\/app-new\.taimee\.co\.jp\/clients\/\d+\/reviews\/client/.test(sourceTab.url)) {
      return { kind: "taimee-action-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30EC\u30D3\u30E5\u30FC\u4E00\u89A7\u3092\u958B\u3044\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    }
    const reviewUrl = sourceTab.url;
    let extracted;
    try {
      await progress("list_started", { work_date: workDate }).catch(() => void 0);
      extracted = await sendTaimeeContentMessage(tabId, { kind: "extract-taimee-workers", workDate });
    } catch {
      void captureRpaDiagnostic(tabId, {
        service: "taimee",
        pageType: "worker_list",
        purpose: "worker_list_fetch",
        operation: "worker_list_fetch",
        stage: "page_loaded",
        captureType: "error",
        error: { name: "ContentScriptError", message: "\u30BF\u30A4\u30DF\u30FC\u4E00\u89A7DOM\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F" }
      }, { workerTable: "table", pagination: "nav" });
      return { kind: "taimee-action-error", detail: "\u30BF\u30A4\u30DF\u30FC\u306E\u30EC\u30D3\u30E5\u30FC\u4E00\u89A7\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304B\u3089\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    }
    if (extracted.kind !== "taimee-workers-extracted") {
      void captureRpaDiagnostic(tabId, {
        service: "taimee",
        pageType: "worker_list",
        purpose: "worker_list_fetch",
        operation: "worker_list_fetch",
        stage: "pagination",
        captureType: "error",
        error: { name: "RpaExtractionError", message: extracted.detail }
      }, { workerTable: "table", pagination: "nav" });
      return { kind: "taimee-action-error", detail: extracted.detail };
    }
    await progress("list_completed", { work_date: workDate, target_count: extracted.workers.length }).catch(() => void 0);
    let state = {
      workDate,
      candidates: extracted.workers.map((worker) => ({ ...worker, phoneNumber: null, smsStatus: "unsent", selected: false })),
      currentIndex: 0,
      status: "fetching",
      startedAt: Date.now(),
      progressMessage: `\u5BFE\u8C61\u8005 ${extracted.workers.length}\u540D\u3092\u78BA\u8A8D\u4E2D...`,
      fatalError: null
    };
    await saveTaimeeState(state);
    if (options.dryRun) {
      state = { ...state, currentIndex: state.candidates.length, status: "completed", progressMessage: "dry-run: \u5BFE\u8C61\u8005\u53D6\u5F97\u5B8C\u4E86\u3002SMS\u306F\u9001\u4FE1\u3057\u3066\u3044\u307E\u305B\u3093\u3002" };
      await saveTaimeeState(state);
      return { kind: "taimee-action-completed", state };
    }
    const alreadyHandled = /* @__PURE__ */ new Set();
    for (let index = 0; index < state.candidates.length; index += 1) {
      const candidate = state.candidates[index];
      state = { ...state, currentIndex: index, progressMessage: `[${index + 1}/${state.candidates.length}] ${candidate.workerName} \u3092\u51E6\u7406\u4E2D...` };
      if (candidate.smsEligible) {
        try {
          const offering = await sendTaimeeContentMessage(tabId, { kind: "fetch-taimee-offering", offeringUrl: candidate.offeringUrl });
          if (offering.kind === "taimee-offering-fetched") {
            candidate.offeringDescription = offering.description;
            const keyword = [candidate.offeringName, offering.description].find((value) => value.includes("\u7121\u8CC7\u683C") || value.includes("\u672A\u7D4C\u9A13OK"));
            if (keyword) {
              const matched = keyword.includes("\u7121\u8CC7\u683C") ? "\u7121\u8CC7\u683C" : "\u672A\u7D4C\u9A13OK";
              candidate.smsEligible = false;
              candidate.smsSkipReason = `excluded_offering_keyword:${matched}`;
              candidate.smsStatus = "skipped";
            }
          } else candidate.error = offering.detail;
        } catch {
          candidate.error = "\u4ED5\u4E8B\u5185\u5BB9\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
        }
      }
      const handledKey = `${candidate.taimeeUserId}:${candidate.workDate}`;
      const duplicateWorker = alreadyHandled.has(handledKey);
      if (duplicateWorker) {
        if (candidate.smsEligible) {
          candidate.smsEligible = false;
          candidate.smsSkipReason = "same_day_duplicate_worker";
          candidate.smsStatus = "duplicate";
        }
      } else {
        alreadyHandled.add(handledKey);
        try {
          await progress("phone_started", { work_date: workDate, target_count: state.candidates.length, current_index: index + 1 }).catch(() => void 0);
          state = { ...state, progressMessage: `[${index + 1}/${state.candidates.length}] ${candidate.workerName} \u3055\u3093\u306E\u8A73\u7D30\u3092\u958B\u304D\u3001\u96FB\u8A71\u756A\u53F7\u3092\u53D6\u5F97\u4E2D...` };
          await saveTaimeeState(state);
          const phone = await readPhoneByNavigation(tabId, candidate.workerUrl, reviewUrl);
          if (phone.kind === "taimee-phone-fetched") {
            candidate.phoneNumber = phone.phoneNumber;
            candidate.workplaceWorkCount = phone.workplaceWorkCount;
          } else candidate.error = phone.detail;
        } catch {
          candidate.error = "\u96FB\u8A71\u756A\u53F7\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
        }
        if (!candidate.phoneNumber && candidate.smsEligible) {
          candidate.smsEligible = false;
          candidate.smsSkipReason = "phone_not_found";
          candidate.smsStatus = "phone_not_found";
        }
      }
      try {
        const registration = await registerTaimeeWorker(candidate);
        if (candidate.smsStatus === "unsent") candidate.smsStatus = registration.smsStatus;
        candidate.registrationStatus = registration.registrationStatus;
        if (registration.smsSkipReason === "existing_entry") {
          candidate.smsEligible = false;
          candidate.smsSkipReason = registration.smsSkipReason;
          candidate.selected = false;
        }
        candidate.selected = candidate.smsEligible && candidate.smsStatus === "unsent";
      } catch (error) {
        const detail = error instanceof Error ? error.message : "My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
        if (detail.includes("\u8A8D\u8A3C") || detail.includes("\u30ED\u30B0\u30A4\u30F3")) {
          state = { ...state, status: "error", fatalError: detail, progressMessage: null };
          if (!duplicateWorker) await navigateTaimeeTab(tabId, reviewUrl).catch(() => void 0);
          await saveTaimeeState(state);
          return { kind: "taimee-action-error", detail, state };
        }
        candidate.error = detail;
        if (candidate.smsStatus === "unsent") candidate.selected = candidate.smsEligible;
      }
      const excludedBlockKeyword = ["\u7121\u8CC7\u683C", "DX"].find((keyword) => candidate.offeringName.includes(keyword));
      const blockTrigger = excludedBlockKeyword ? "excluded_offering" : candidate.smsSkipReason === "existing_entry" ? "existing_entry" : (candidate.workplaceWorkCount ?? 0) >= 2 ? "workplace_work_count" : null;
      candidate.blockTrigger = blockTrigger;
      if (blockTrigger && !duplicateWorker) {
        try {
          state = { ...state, progressMessage: `[${index + 1}/${state.candidates.length}] ${candidate.workerName} \u3055\u3093\u3092\u4F01\u696D\u5168\u4F53\u3067\u30D6\u30ED\u30C3\u30AF\u4E2D...` };
          await saveTaimeeState(state);
          await navigateTaimeeTab(tabId, candidate.workerUrl);
          const blocked = await sendTaimeeContentMessage(tabId, { kind: "block-taimee-worker", reason: "\u5F0A\u793E\u898F\u5B9A\u306B\u3088\u308B" });
          if (blocked.kind === "taimee-worker-blocked") candidate.blockStatus = "blocked";
          else if (blocked.kind === "taimee-worker-already-blocked") candidate.blockStatus = "already_blocked";
          else {
            candidate.blockStatus = "failed";
            candidate.error = candidate.error ? `${candidate.error} ${blocked.detail}` : blocked.detail;
          }
        } catch {
          candidate.blockStatus = "failed";
          const detail = "\u30BF\u30A4\u30DF\u30FC\u306E\u4F01\u696D\u5168\u4F53\u30D6\u30ED\u30C3\u30AF\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
          candidate.error = candidate.error ? `${candidate.error} ${detail}` : detail;
        }
      }
      candidate.selected = candidate.smsEligible && candidate.smsStatus === "unsent";
      if (!duplicateWorker) {
        await navigateTaimeeTab(tabId, reviewUrl).catch(() => void 0);
      }
      await saveTaimeeState(state);
    }
    state = { ...state, currentIndex: state.candidates.length, status: "completed", progressMessage: "\u53D6\u5F97\u5B8C\u4E86\u3002\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066SMS\u9001\u4FE1\u5BFE\u8C61\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    await saveTaimeeState(state);
    return { kind: "taimee-action-completed", state };
  }
  async function getTaimeeTemplate() {
    try {
      const response = await taimeeApi("/taimee/sms/template");
      const body = await response.json().catch(() => null);
      if (!response.ok || !isRecord(body) || typeof body.template !== "string") return { kind: "taimee-template-error", detail: "SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
      return { kind: "taimee-template-loaded", template: body.template };
    } catch (error) {
      return { kind: "taimee-template-error", detail: error instanceof Error ? error.message : "My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" };
    }
  }
  async function saveTaimeeTemplate(template) {
    try {
      const response = await taimeeApi("/taimee/sms/template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template }) });
      if (!response.ok) return { kind: "taimee-template-error", detail: "SMS\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
      return { kind: "taimee-template-loaded", template };
    } catch (error) {
      return { kind: "taimee-template-error", detail: error instanceof Error ? error.message : "My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306E\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" };
    }
  }
  async function sendTaimeeSms() {
    let state = await getTaimeeState();
    const workers = state.candidates.filter((worker) => worker.selected && worker.smsEligible && worker.smsStatus === "unsent");
    if (!workers.length) return { kind: "taimee-action-error", detail: "\u9001\u4FE1\u3067\u304D\u308B\u5BFE\u8C61\u8005\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", state };
    await progress("sms_started", { work_date: state.workDate, target_count: workers.length }).catch(() => void 0);
    state = { ...state, status: "sending", progressMessage: `${workers.length}\u540D\u3078\u306ESMS\u9001\u4FE1\u3092\u958B\u59CB\u3057\u307E\u3059...` };
    await saveTaimeeState(state);
    for (let index = 0; index < workers.length; index += 1) {
      const worker = workers[index];
      await progress("sms_started", { work_date: state.workDate, target_count: workers.length, current_index: index + 1 }).catch(() => void 0);
      state = { ...state, progressMessage: `[${index + 1}/${workers.length}] ${worker.workerName} \u3055\u3093\u3078SMS\u3092\u9001\u4FE1\u4E2D...` };
      await saveTaimeeState(state);
      try {
        const response = await taimeeApi("/taimee/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_date: state.workDate, message_type: "recruitment", workers: [worker] }) });
        const body = await response.json().catch(() => null);
        if (!response.ok || !isRecord(body) || !Array.isArray(body.results)) throw new Error(`SMS\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F (HTTP ${response.status})\u3002`);
        const result = body.results.find((item) => isRecord(item) && item.taimee_user_id === worker.taimeeUserId);
        if (!result) throw new Error("SMS\u9001\u4FE1\u7D50\u679C\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        state.candidates = state.candidates.map((candidate) => candidate === worker ? { ...candidate, smsStatus: taimeeStatus(result.status), selected: false, error: typeof result.error_message === "string" ? result.error_message : candidate.error } : candidate);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "SMS\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
        state.candidates = state.candidates.map((candidate) => candidate === worker ? { ...candidate, smsStatus: "failed", selected: false, error: detail } : candidate);
      }
      await saveTaimeeState(state);
    }
    await progress("sms_completed", { work_date: state.workDate, sent_count: state.candidates.filter((w) => w.smsStatus === "sent").length }).catch(() => void 0);
    state = { ...state, status: "send_completed", progressMessage: "SMS\u9001\u4FE1\u51E6\u7406\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002" };
    await saveTaimeeState(state);
    return { kind: "taimee-action-completed", state };
  }
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    void (async () => {
      const session = await getOnboardingSession();
      if (!session || session.sourceTabId !== tabId || changeInfo.url === session.sourceUrl) return;
      await chrome.storage.session.set({
        [ONBOARDING_SESSION_KEY]: { ...session, transitionObserved: true }
      });
    })();
  });
  var RUNNER_BRIDGE_CONFIG_KEY = "runnerBridgeConfig";
  var runnerBridgePolling = false;
  var manualTaimeeBusy = false;
  function isRunnerBridgeConfig(value) {
    return isRecord(value) && typeof value.token === "string" && value.token.length >= 32 && typeof value.port === "number" && Number.isSafeInteger(value.port) && value.port > 0 && value.port < 65536;
  }
  function jstDate(offsetDays) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(/* @__PURE__ */ new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }
  async function runTaimeeDailyWorkerFollowSms(payload) {
    if (!isRecord(payload) || payload.client_id !== "263546" || !Array.isArray(payload.days) || !payload.days.every((day) => Number.isSafeInteger(day) && typeof day === "number" && day <= 0 && day >= -31) || typeof payload.dry_run !== "boolean") throw new Error("Invalid taimee daily worker follow payload");
    const dryRun = payload.dry_run;
    const reviewUrl = `https://app-new.taimee.co.jp/clients/${payload.client_id}/reviews/client`;
    const tab = await chrome.tabs.create({ url: "about:blank", active: false });
    if (!tab.id) throw new Error("TAIMEE_PAGE_NOT_READY: RPA\u5C02\u7528\u30BF\u30D6\u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    const days = [];
    try {
      await navigateTaimeeTab(tab.id, reviewUrl);
      const session = await taimeeApi("/taimee/session");
      if (!session.ok) throw new Error("MYFAMILLE_LOGIN_REQUIRED: My\u30D5\u30A1\u30DF\u30FC\u30E6\u306E\u30ED\u30B0\u30A4\u30F3\u307E\u305F\u306F\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      for (const offset of payload.days) {
        const date = jstDate(offset);
        const fetched = await startTaimeeFetch(tab.id, date, { dryRun });
        if (fetched.kind === "taimee-action-error") throw new Error(`TAIMEE_PAGE_NOT_READY: ${fetched.detail}`);
        const targetCount = fetched.state.candidates.length;
        if (dryRun) {
          days.push({ date, target_count: targetCount, sms_sent: false, sent_count: 0, status: "completed" });
          continue;
        }
        const eligibleCount = fetched.state.candidates.filter((worker) => worker.selected && worker.smsEligible && worker.smsStatus === "unsent").length;
        if (eligibleCount === 0) {
          const skipReasons = {};
          for (const worker of fetched.state.candidates) {
            const reason = worker.smsSkipReason || worker.smsStatus || "not_selected";
            skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
          }
          await progress("day_skipped", { work_date: date, target_count: targetCount, skipped_count: targetCount, reason: "no_eligible_workers", sent_count: fetched.state.candidates.filter((w) => w.smsStatus === "sent" || w.smsStatus === "duplicate").length }).catch(() => void 0);
          days.push({ date, target_count: targetCount, eligible_count: 0, sms_sent: false, sent_count: 0, status: "completed", reason: "no_eligible_workers", skip_reasons: skipReasons });
          continue;
        }
        const sent = await sendTaimeeSms();
        if (sent.kind === "taimee-action-error") throw new Error(`SMS_SEND_FAILED: ${sent.detail}`);
        const sentCount = sent.state.candidates.filter((worker) => worker.smsStatus === "sent").length;
        days.push({ date, target_count: targetCount, eligible_count: eligibleCount, sms_sent: sentCount > 0, sent_count: sentCount, status: "completed" });
      }
      return { success: true, dry_run: dryRun, days };
    } finally {
      await chrome.tabs.remove(tab.id).catch(() => void 0);
    }
  }
  function kaipokeClientSyncPayload(value) {
    if (!isRecord(value) || typeof value.dry_run !== "boolean") {
      throw new Error("INVALID_PAYLOAD: dry_run \u304C\u5FC5\u8981\u3067\u3059\u3002");
    }
    if (value.max_clients !== void 0 && (!Number.isSafeInteger(value.max_clients) || typeof value.max_clients !== "number" || value.max_clients < 1 || value.max_clients > 500)) {
      throw new Error("INVALID_PAYLOAD: max_clients \u306F1\u301C500\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    return {
      dry_run: value.dry_run,
      ...typeof value.max_clients === "number" ? { max_clients: value.max_clients } : {}
    };
  }
  async function sendKaipokeContentMessage(tabId, message) {
    return sendTaimeeContentMessage(tabId, message);
  }
  async function waitForKaipokeNavigation(tabId, trigger, isOpening) {
    let finish;
    let fail;
    const navigation = new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      cleanup();
      finish?.();
    };
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      fail?.(new Error("KAIPOKE_PAGE_TIMEOUT: \u30AB\u30A4\u30DD\u30B1\u753B\u9762\u306E\u8AAD\u307F\u8FBC\u307F\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002"));
    }, 25e3);
    chrome.tabs.onUpdated.addListener(onUpdated);
    try {
      const result = await trigger();
      if (!isOpening(result)) {
        cleanup();
        return result;
      }
      await navigation;
      return result;
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  async function prepareKaipokeCertificatePage(tabId) {
    const result = await waitForKaipokeNavigation(
      tabId,
      () => sendKaipokeContentMessage(tabId, { kind: "prepare-kaipoke-certificate-page" }),
      (value) => value.kind === "kaipoke-certificate-page-opening"
    );
    if (result.kind === "kaipoke-certificate-page-error") {
      throw new Error(`KAIPOKE_CERTIFICATE_PAGE_NOT_FOUND: ${result.detail}`);
    }
  }
  async function openKaipokeClient(tabId, name) {
    const result = await waitForKaipokeNavigation(
      tabId,
      () => sendKaipokeContentMessage(tabId, { kind: "open-kaipoke-client-target", name }),
      (value) => value.kind === "kaipoke-client-opening"
    );
    if (result.kind === "kaipoke-client-open-error") {
      throw new Error(`KAIPOKE_CLIENT_NOT_FOUND: ${result.detail}`);
    }
  }
  async function readKaipokeContext(tabId) {
    const deadline = Date.now() + 12e3;
    let lastKind = "unavailable";
    do {
      try {
        const context = await sendKaipokeContentMessage(tabId, { kind: "get-kaipoke-page-context" });
        lastKind = context.kind;
        if (context.kind === "existing-client") return context;
      } catch {
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 300));
    } while (Date.now() < deadline);
    throw new Error(`KAIPOKE_PAGE_NOT_READY: \u5229\u7528\u8005\u753B\u9762\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093 (${lastKind})\u3002`);
  }
  async function findKaipokeSourceTab() {
    const tabs = await chrome.tabs.query({ url: "https://r.kaipoke.biz/kaipokebiz/common/MEM090002.do*" });
    const source = tabs.find((tab) => {
      if (typeof tab.id !== "number" || typeof tab.url !== "string") return false;
      try {
        return new URL(tab.url).pathname.endsWith("/MEM090002.do");
      } catch {
        return false;
      }
    });
    if (!source) {
      throw new Error("KAIPOKE_LOGIN_REQUIRED: \u30AB\u30A4\u30DD\u30B1\u306E\u30C8\u30C3\u30D7\u30DA\u30FC\u30B8\u304B\u3089\u5BFE\u8C61\u4E8B\u696D\u6240\u30FB\u30B5\u30FC\u30D3\u30B9\u3092\u9078\u3073\u3001\u300C\u5229\u7528\u8005\u60C5\u5831\u4E00\u89A7\u300D\u753B\u9762\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    return source;
  }
  async function duplicateKaipokeSourceTab(sourceTabId) {
    try {
      const duplicated = await chrome.tabs.duplicate(sourceTabId);
      if (!duplicated?.id) throw new Error("\u8907\u88FD\u3057\u305F\u30AB\u30A4\u30DD\u30B1\u30BF\u30D6\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return duplicated.id;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "\u5229\u7528\u8005\u60C5\u5831\u4E00\u89A7\u753B\u9762\u3092\u8907\u88FD\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
      throw new Error(`KAIPOKE_PAGE_NOT_READY: ${detail}`);
    }
  }
  async function runKaipokeClientSync(rawPayload) {
    const payload = kaipokeClientSyncPayload(rawPayload);
    const source = await findKaipokeSourceTab();
    let workingTabId = await duplicateKaipokeSourceTab(source.id);
    const failures = [];
    const capturedDiagnosticStages = /* @__PURE__ */ new Set();
    const processedIds = /* @__PURE__ */ new Set();
    let upsertedCount = 0;
    let careInsuranceCount = 0;
    let disabilityRecipientCount = 0;
    try {
      const targetResult = await sendKaipokeContentMessage(workingTabId, { kind: "list-kaipoke-client-targets" });
      const names = [...new Set(targetResult.names)];
      if (names.length === 0) {
        throw new Error("KAIPOKE_CLIENT_NOT_FOUND: \u5229\u7528\u8005\u60C5\u5831\u4E00\u89A7\u306B\u5229\u7528\u8005\u30EA\u30F3\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u5BFE\u8C61\u306E\u4E8B\u696D\u6240\u30FB\u30B5\u30FC\u30D3\u30B9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      const limited = names.slice(0, payload.max_clients ?? names.length);
      for (let index = 0; index < limited.length; index += 1) {
        const requestedName = limited[index];
        try {
          if (index > 0) {
            await chrome.tabs.remove(workingTabId).catch(() => void 0);
            workingTabId = await duplicateKaipokeSourceTab(source.id);
          }
          await openKaipokeClient(workingTabId, requestedName);
          await prepareKaipokeCertificatePage(workingTabId);
          const context = await readKaipokeContext(workingTabId);
          if (processedIds.has(context.kaipokeCsId)) continue;
          processedIds.add(context.kaipokeCsId);
          if (context.profileLookup === "failed") {
            throw new Error("\u57FA\u672C\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
          }
          if (!context.certificates.careInsuranceObserved && !context.certificates.disabilityRecipientObserved) {
            throw new Error("\u4ECB\u8B77\u4FDD\u967A\u8A3C\uFF0F\u969C\u5BB3\u30B5\u30FC\u30D3\u30B9\u53D7\u7D66\u8005\u8A3C\u306E\u4E00\u89A7\u3092\u5224\u5225\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
          }
          if (context.certificates.careInsuranceObserved) careInsuranceCount += 1;
          if (context.certificates.disabilityRecipientObserved) disabilityRecipientCount += 1;
          if (!payload.dry_run) {
            const updated = await updateClient({
              kind: "update-my-famille-client",
              kaipokeCsId: context.kaipokeCsId,
              profile: context.profile,
              certificates: context.certificates
            });
            if (updated.kind !== "client-updated") throw new Error(updated.detail ?? "My\u30D5\u30A1\u30DF\u30FC\u30E6\u3078\u306Eupsert\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
            upsertedCount += 1;
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : "\u5229\u7528\u8005\u540C\u671F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
          const stage = "client_sync";
          if (!capturedDiagnosticStages.has(stage)) {
            capturedDiagnosticStages.add(stage);
            await captureRpaDiagnostic(workingTabId, {
              service: "kaipoke",
              pageType: "client_certificate",
              purpose: "client_sync",
              operation: "kaipoke_client_sync",
              stage,
              captureType: "error",
              error: { name: error instanceof Error ? error.name : "KaipokeClientSyncError", message: detail }
            }, {
              content: "#contents",
              certificateTabs: "#contents ul, #contents nav",
              clientLinks: "a.link-clickable",
              reauthentication: "#common_login",
              table: "#contents table"
            });
          }
          failures.push({
            name: requestedName,
            kaipoke_cs_id: null,
            stage,
            detail
          });
        }
      }
      return {
        success: failures.length === 0,
        status: failures.length === 0 ? "completed" : "completed_with_errors",
        dry_run: payload.dry_run,
        processed_count: processedIds.size,
        upserted_count: upsertedCount,
        care_insurance_count: careInsuranceCount,
        disability_recipient_count: disabilityRecipientCount,
        failure_count: failures.length,
        failures
      };
    } finally {
      await chrome.tabs.remove(workingTabId).catch(() => void 0);
    }
  }
  async function pollRunnerBridge() {
    if (runnerBridgePolling || manualTaimeeBusy) return;
    runnerBridgePolling = true;
    try {
      const stored = await chrome.storage.local.get(RUNNER_BRIDGE_CONFIG_KEY);
      const config = stored[RUNNER_BRIDGE_CONFIG_KEY];
      if (!isRunnerBridgeConfig(config)) return;
      const headers = { "X-Famille-Rpa-Extension-Token": config.token };
      const response = await fetch(`http://127.0.0.1:${config.port}/jobs/next`, { headers, cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !isRecord(body) || !isRecord(body.command) || typeof body.command.id !== "string" || !isRecord(body.command.job)) return;
      const jobId = body.command.job.id;
      if (typeof jobId !== "string") return;
      setProgressContext({ job_id: jobId, run_id: jobId, attempt: typeof body.command.job.attempt === "number" ? body.command.job.attempt : 1 });
      await progress("extension_received").catch(() => void 0);
      let result = null;
      let failure = null;
      try {
        if (body.command.job.job_type === "social.share_blog") {
          result = await runSocialShare(body.command.job.payload);
        } else if (body.command.job.job_type === "taimee.daily_worker_follow_sms") {
          result = await runTaimeeDailyWorkerFollowSms(body.command.job.payload);
        } else if (body.command.job.job_type === "sharefull.create_template") {
          result = await runSharefullTemplateJob(body.command.job.payload);
        } else if (body.command.job.job_type === "sharefull.create_spot_offer") {
          result = await runSharefullSpotOffer(body.command.job.payload);
        } else if (body.command.job.job_type === "sharefull.close_spot_offer") {
          result = await runSharefullCloseSpotOffer(body.command.job.payload);
        } else if (body.command.job.job_type === "kaipoke.client_sync") {
          result = await runKaipokeClientSync(body.command.job.payload);
        } else {
          throw new Error("UNKNOWN_JOB_TYPE");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chrome extension job failed";
        failure = { error_code: message.split(":")[0] || "EXTENSION_JOB_FAILED", error_message: message };
      }
      await progress(failure ? "extension_failed" : "extension_completed").catch(() => void 0);
      await flushRpaProgress();
      await fetch(`http://127.0.0.1:${config.port}/jobs/${encodeURIComponent(body.command.id)}/result`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(failure ? { ok: false, ...failure } : { ok: true, result })
      });
    } catch {
    } finally {
      setProgressContext(null);
      runnerBridgePolling = false;
    }
  }
  chrome.alarms.create("runnerBridgePoll", { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "runnerBridgePoll") void pollRunnerBridge();
  });
  void pollRunnerBridge();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.kind === "get-sharefull-cases") {
      void getSharefullCases().then(sendResponse);
      return true;
    }
    if (message.kind === "sync-sharefull-template-statuses") {
      void syncSharefullTemplateStatuses().then(sendResponse);
      return true;
    }
    if (message.kind === "start-sharefull-template") {
      void startSharefullTemplate(message.coreId).then(sendResponse);
      return true;
    }
    if (message.kind === "sharefull-create-response") {
      const senderTabId = _sender.tab?.id;
      if (senderTabId !== void 0) pendingSharefullCreates.get(senderTabId)?.({ templateId: message.templateId });
      sendResponse({ ok: true });
      return;
    }
    switch (message.kind) {
      case "capture-rpa-diagnostic":
        void (async () => {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = tabs[0]?.id;
          if (!tabId) {
            sendResponse({ kind: "rpa-diagnostic-capture-error", detail: "\u30A2\u30AF\u30C6\u30A3\u30D6\u306A\u30BF\u30D6\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002" });
            return;
          }
          sendResponse(await captureRpaDiagnostic(tabId, message.request, message.importantSelectors));
        })();
        return true;
      case "lookup-my-famille-client":
        void lookupClient(message.kaipokeCsId).then(sendResponse);
        return true;
      case "register-my-famille-client":
        void registerClient(message).then(sendResponse);
        return true;
      case "update-my-famille-client":
        void updateClient(message).then(sendResponse);
        return true;
      case "list-recording-transcript-candidates":
        void listRecordingTranscriptCandidates(message.kaipokeCsId, message.clientName).then(sendResponse);
        return true;
      case "summarize-recording-transcripts":
        void summarizeRecordingTranscripts(message.transcriptIds).then(sendResponse);
        return true;
      case "list-onboarding-documents":
        void listDocuments().then(sendResponse);
        return true;
      case "get-onboarding-document":
        void getDocument(message.documentId).then(sendResponse);
        return true;
      case "lookup-postal-codes":
        void lookupPostalCodes(message).then(sendResponse);
        return true;
      case "begin-onboarding-registration":
        void beginOnboardingRegistration(message).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
      case "get-onboarding-finalization-eligibility":
        void getFinalizationEligibility(message.tabId, message.profileName).then(sendResponse);
        return true;
      case "finalize-client-onboarding":
        void finalizeOnboarding(
          message.kaipokeCsId,
          message.tabId,
          message.profileName,
          message.createGroupOnly
        ).then(sendResponse);
        return true;
      case "start-taimee-worker-fetch":
        void withManualTaimeeProgress(() => startTaimeeFetch(message.tabId, message.workDate), true).then(sendResponse);
        return true;
      case "get-taimee-processing-state":
        void getTaimeeState().then(sendResponse);
        return true;
      case "set-taimee-worker-selection":
        void (async () => {
          const state = await getTaimeeState();
          const candidate = state.candidates.find((worker) => workerKey(worker) === message.key);
          if (candidate && candidate.smsEligible && candidate.smsStatus === "unsent") candidate.selected = message.selected;
          sendResponse({ kind: "taimee-action-completed", state: await saveTaimeeState(state) });
        })();
        return true;
      case "get-taimee-sms-template":
        void getTaimeeTemplate().then(sendResponse);
        return true;
      case "save-taimee-sms-template":
        void saveTaimeeTemplate(message.template).then(sendResponse);
        return true;
      case "send-taimee-sms":
        void withManualTaimeeProgress(() => sendTaimeeSms(), false).then(sendResponse);
        return true;
    }
  });
  async function flushRpaProgress() {
    await flushProgress(async (events, runner) => {
      if (!runner) {
        const response2 = await taimeeApi("/events", { method: "POST", body: JSON.stringify({ events }) });
        return response2.ok;
      }
      const stored = await chrome.storage.local.get(RUNNER_BRIDGE_CONFIG_KEY);
      const config = stored[RUNNER_BRIDGE_CONFIG_KEY];
      if (!isRunnerBridgeConfig(config)) return false;
      const response = await fetch("http://127.0.0.1:" + config.port + "/events", { method: "POST", signal: AbortSignal.timeout(5e3), headers: { "X-Famille-Rpa-Extension-Token": config.token, "Content-Type": "application/json" }, body: JSON.stringify({ events }) });
      return response.ok;
    });
  }
  chrome.alarms.create("rpaProgressFlush", { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "rpaProgressFlush") void flushRpaProgress();
  });
  void flushRpaProgress();
  async function withManualTaimeeProgress(action, newRun) {
    if (runnerBridgePolling || manualTaimeeBusy) return { kind: "taimee-action-error", detail: "\u5225\u306ERPA\u51E6\u7406\u304C\u5B9F\u884C\u4E2D\u3067\u3059\u3002\u5B8C\u4E86\u5F8C\u306B\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    manualTaimeeBusy = true;
    try {
      const stored = await chrome.storage.session.get("manualTaimeeRun");
      const old = stored.manualTaimeeRun;
      const context = !newRun && isRecord(old) && typeof old.run_id === "string" ? { job_id: null, run_id: old.run_id, attempt: 1 } : manualProgressContext();
      setProgressContext(context);
      await chrome.storage.session.set({ manualTaimeeRun: context });
      await progress("extension_received").catch(() => void 0);
      const result = await action();
      await progress(result.kind === "taimee-action-error" ? "extension_failed" : "extension_completed").catch(() => void 0);
      return result;
    } catch {
      await progress("extension_failed").catch(() => void 0);
      return { kind: "taimee-action-error", detail: "RPA\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u5B9F\u884C\u30ED\u30B0\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
    } finally {
      setProgressContext(null);
      manualTaimeeBusy = false;
      void flushRpaProgress();
    }
  }
})();
