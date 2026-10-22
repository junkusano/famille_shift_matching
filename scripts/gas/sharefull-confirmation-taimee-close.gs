/**
 * Sharefullの案件確定メールを受け、MyFamilleへタイミー募集停止を依頼する。
 * Script Properties:
 * - MYFAMILLE_API_BASE_URL (https://myfamille.shi-on.net)
 * - SHAREFULL_CONFIRMATION_GAS_TOKEN
 * - SHAREFULL_CONFIRMATION_GMAIL_QUERY (例: from:(sharefull) newer_than:14d)
 * - SHAREFULL_CONFIRMATION_FROM_EMAIL (確認メールの送信元アドレス)
 * - TAIMEE_CONFIRMATION_GAS_TOKEN
 * - TAIMEE_CONFIRMATION_GMAIL_QUERY (例: from:supporter@timee.co.jp newer_than:14d)
 * - TAIMEE_CONFIRMATION_FROM_EMAIL (supporter@timee.co.jp)
 */
function processSharefullConfirmationsForTaimeeClose() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSharefullConfirmationsForTaimeeCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

function processSharefullConfirmationsForTaimeeCloseLocked_() {
  var config = readSharefullCloseConfig_();
  var processed = sharefullCloseProcessedIds_();
  var props = PropertiesService.getScriptProperties();
  var label = confirmationProcessedLabel_("MYFAMILLE_SHAREFULL_CONFIRMATION_PROCESSED");
  var activationTimestamp = confirmationActivationTimestamp_();
  var messages = {}, threads = [], failed = false;
  var deadline = Date.now() + 240000;
  // ラベルは表示用。旧版の誤ラベルや同スレッドへの新着でメールを見失わない。
  // 旧設定が確定件名やラベルに絞られていても、取消を含む送信元の通知を補完する。
  var queries = [config.gmailQuery, "from:" + config.senderEmail + " newer_than:14d"];
  queries.filter(function(query,index) {return queries.indexOf(query) === index;}).forEach(function(query) {
   for (var start = 0; Date.now() < deadline; start += 100) {
    var page = GmailApp.search(query, start, 100);
    if (!page.length) break;
    page.forEach(function(thread) {
      var relevant = thread.getMessages().filter(function(message) {
        return !isConfirmationMessageBeforeActivation_(message, activationTimestamp)
          && sharefullMessageHasSignal_(message, config.senderEmail);
      });
      relevant.forEach(function(message) {
        messages[message.getId()] = message;
        if (!processed[message.getId()]) props.setProperty("SHAREFULL_CONFIRMATION_PENDING_" + message.getId(), "1");
      });
      threads.push({thread:thread,messages:relevant});
    });
   }
  });
  // 検索期間を過ぎた失敗メールも、IDを残して取り直す。
  Object.keys(props.getProperties()).filter(function(key) {
    return key.indexOf("SHAREFULL_CONFIRMATION_PENDING_") === 0;
  }).forEach(function(key) {
    var id = key.substring("SHAREFULL_CONFIRMATION_PENDING_".length);
    if (processed[id]) { props.deleteProperty(key); return; }
    if (!messages[id]) {
      try { messages[id] = GmailApp.getMessageById(id); }
      catch (e) { failed = true; console.warn(JSON.stringify({stage:"gmail_retry",event_id:id,code:"MESSAGE_UNAVAILABLE"})); }
    }
  });
  // 取消を先に反映し、追いつき処理で古い確定から停止指示を作らない。
  Object.keys(messages).map(function(id) {return messages[id];}).sort(function(a,b) {
    return b.getDate().getTime() - a.getDate().getTime();
  }).forEach(function(message) {
    if (Date.now() >= deadline) { failed = true; return; }
    if (!processSharefullConfirmationMessage_(message,config,activationTimestamp,processed)) failed = true;
  });
  threads.forEach(function(item) {
    if (item.messages.length && item.messages.every(function(message) {return !!processed[message.getId()];})) {
      try { item.thread.addLabel(label); }
      catch (e) { failed = true; console.warn(JSON.stringify({stage:"gmail_label",code:"LABEL_FAILED"})); }
    }
  });
  if (failed) throw new Error("SHAREFULL_CONFIRMATION_RETRY_PENDING");
}

function sharefullMessageHasSignal_(message, expectedSender) {
  var from = message.getFrom(), match = /<([^>]+)>/.exec(from);
  if ((match ? match[1] : from).trim().toLowerCase() !== expectedSender) return false;
  var text = message.getSubject() + "\n" + message.getPlainBody();
  return sharefullConfirmationSignal_(text,"confirmed") || sharefullConfirmationSignal_(text,"cancelled");
}

function processSharefullConfirmationMessage_(message, config, activationTimestamp, processed, requiredState) {
  var messageId = message.getId();
  if (processed[messageId]) return true;
  if (isConfirmationMessageBeforeActivation_(message,activationTimestamp)) return true;
  if (!sharefullMessageHasSignal_(message,config.senderEmail)) return true;
  var props = PropertiesService.getScriptProperties();
  props.setProperty("SHAREFULL_CONFIRMATION_PENDING_" + messageId, "1");
  try {
    var event = parseSharefullConfirmationMail_(message,config.senderEmail);
    if (!event) {
      console.warn(JSON.stringify({stage:"parse",event_id:messageId,code:"ORDER_ID_MISSING"}));
      return false;
    }
    if (requiredState && event.state !== requiredState) return true;
    var endpoint = event.state === "cancelled" ? "cancelled" : "confirmed";
    var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/sharefull/" + endpoint, {
      method:"post",contentType:"application/json",headers:{Authorization:"Bearer " + config.apiToken},
      payload:JSON.stringify(event),muteHttpExceptions:true
    });
    var code = response.getResponseCode(), result;
    try {result = JSON.parse(response.getContentText() || "{}");} catch (e) {result = {};}
    if (code < 200 || code >= 300 || result.ok !== true || result.recorded !== true
        || result.event_id !== messageId || ["queued","cancelled","stale","work_finished","already_processed"].indexOf(result.outcome) === -1
        || (result.outcome === "queued" && !result.close_request_id)) {
      var errorCode = /^[A-Z_]{1,80}$/.test(result.code || "") ? result.code : "ACK_NOT_CONFIRMED";
      console.warn(JSON.stringify({stage:"api",event_id:messageId,http_status:code,code:errorCode}));
      return false;
    }
    props.setProperty("SHAREFULL_CONFIRMATION_ACK_" + messageId, new Date().toISOString());
    props.deleteProperty("SHAREFULL_CONFIRMATION_PENDING_" + messageId);
    processed[messageId] = true;
    console.log(JSON.stringify({stage:"ack",event_id:messageId,outcome:result.outcome,close_request_id:result.close_request_id || null}));
    return true;
  } catch (e) {
    console.warn(JSON.stringify({stage:"delivery",event_id:messageId,code:"DELIVERY_EXCEPTION"}));
    return false;
  }
}

/** 両媒体のメールをまとめて5分ごとに確認する。 */
function processSpotOfferConfirmationEmails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var props = PropertiesService.getScriptProperties();
  var run = {version:"mail-delivery-v2",started_at:new Date().toISOString(),status:"running",failed_providers:[]};
  try {
    props.setProperty("SPOT_OFFER_CONFIRMATION_LAST_RUN",JSON.stringify(run));
    try {processSharefullConfirmationsForTaimeeCloseLocked_();} catch (e) {recordConfirmationProviderFailure_(run,"sharefull",e);}
    try {processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_();} catch (e) {recordConfirmationProviderFailure_(run,"taimee",e);}
    run.status = run.failed_providers.length ? "retry_pending" : "completed";
    run.finished_at = new Date().toISOString();
    props.setProperty("SPOT_OFFER_CONFIRMATION_LAST_RUN",JSON.stringify(run));
    if (run.failed_providers.length) throw new Error("CONFIRMATION_RETRY_PENDING: " + run.failed_providers.join(","));
  } finally {
    lock.releaseLock();
  }
}

function recordConfirmationProviderFailure_(run,provider,error) {
  run.failed_providers.push(provider);
  var message = String(error && error.message || "");
  var code = /authorization|permission|scope|権限/i.test(message) ? "AUTHORIZATION_REQUIRED"
    : /quota|too many|Service invoked|制限/i.test(message) ? "QUOTA_EXCEEDED"
    : /Script Properties|有効化|起動時刻/.test(message) ? "CONFIGURATION_MISSING" : "RETRY_PENDING";
  console.warn(JSON.stringify({stage:"provider",provider:provider,code:code}));
}

function logSpotOfferConfirmationStatus() {
  var props = PropertiesService.getScriptProperties();
  console.log(props.getProperty("SPOT_OFFER_CONFIRMATION_LAST_RUN") || "No runs recorded");
  console.log(JSON.stringify({sharefull_pending:Object.keys(props.getProperties()).filter(function(key) {
    return key.indexOf("SHAREFULL_CONFIRMATION_PENDING_") === 0;
  }).length}));
}

/** 初回設定時に一度実行し、両メール種別の5分ごとの確認トリガーを作成する。 */
function installSpotOfferConfirmationTriggers() {
  // 必須設定が不足した状態でトリガーや有効化時刻だけを先に作らない。
  readSharefullCloseConfig_();
  readTaimeeCloseConfig_();

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT")) {
    props.setProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT", new Date().toISOString());
  }
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if ([
      "processSpotOfferConfirmationEmails",
      "processSharefullConfirmationsForTaimeeClose",
      "processTaimeeConfirmationsForSharefullClose"
    ].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("processSpotOfferConfirmationEmails").timeBased().everyMinutes(5).create();
}

function confirmationActivationTimestamp_() {
  var raw = PropertiesService.getScriptProperties().getProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT");
  var timestamp = raw ? Date.parse(raw) : NaN;
  if (!isFinite(timestamp)) {
    throw new Error("installSpotOfferConfirmationTriggersを先に実行し、起動時刻を保存してください");
  }
  return timestamp;
}

function isConfirmationMessageBeforeActivation_(message, activationTimestamp) {
  return message.getDate().getTime() <= activationTimestamp;
}

function parseSharefullConfirmationMail_(message, expectedSender) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== expectedSender) return null;

  var subject = message.getSubject();
  var body = message.getPlainBody();
  var text = subject + "\n" + body;
  var cancelled = sharefullConfirmationSignal_(text, "cancelled");
  // 一般的な「確定」を含むだけのメールを誤検知しないよう、決定を表す語を限定する。
  if (!cancelled && !sharefullConfirmationSignal_(text, "confirmed")) return null;

  var jobId = sharefullCloseCapture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = sharefullCloseCapture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i)
    || sharefullCloseCapture_(text, /https?:\/\/client\.sharefull\.com\/orders\/([0-9]+)/i)
    || sharefullCloseCapture_(text, /(?:^|[\s(])\/orders\/([0-9]+)/im);
  var applicationId = sharefullCloseCapture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = sharefullCloseCapture_(text, /(?:^|\r?\n)[ \t]*[◆♦]?[ \t]*(?:キャンセルした応募者|応募者|候補者|氏名)[ \t]*[：:][ \t]*([^\n\r]+)/i)
    || sharefullCloseCapture_(text, /(?:^|\r?\n)[ \t]*[◆♦]?[ \t]*(?:キャンセルした応募者|応募者|候補者)[ \t]*\r?\n[ \t]*([^\n\r]+)/i);
  applicant = applicant.replace(/\s*さん.*$/i, "").replace(/\s*\d+\s*歳.*$/, "").replace(/\s*[（(](女性|男性|その他).*$/, "").trim();
  var cancellationReason = sharefullCloseCapture_(text, /(?:選択した理由|キャンセル理由)[ \t]*[：:][ \t]*([^\n\r]+)/i);
  var reasonComment = sharefullCloseCapture_(text, /理由詳細コメント[ \t]*[：:][ \t]*([^\n\r]+)/i);
  if (reasonComment) cancellationReason = [cancellationReason, reasonComment].filter(Boolean).join(" / ");
  if (!jobId && !orderId) return null;

  return {
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    application_key: applicationId || [orderId || jobId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    applicant_name: applicant || null,
    cancellation_reason: cancelled ? cancellationReason || null : null,
    state: cancelled ? "cancelled" : "confirmed",
    occurred_at: message.getDate().toISOString()
  };
}

function sharefullConfirmationSignal_(text, state) {
  if (state === "cancelled") {
    return /応募キャンセル|応募者のキャンセル|キャンセルした応募者|応募をキャンセル/.test(text);
  }
  return /応募確定|応募が確定|採用決定|採用が決定|マッチング成立|候補者決定|候補者が決定|案件確定/.test(text);
}

function readSharefullCloseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiBaseUrl = sharefullCloseRequired_(props, "MYFAMILLE_API_BASE_URL").replace(/\/$/, "");
  if (apiBaseUrl !== "https://myfamille.shi-on.net") {
    throw new Error("MYFAMILLE_API_BASE_URLは本番URL https://myfamille.shi-on.net に設定してください");
  }
  return {
    apiBaseUrl: apiBaseUrl,
    apiToken: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_GAS_TOKEN"),
    gmailQuery: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_GMAIL_QUERY"),
    senderEmail: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_FROM_EMAIL").toLowerCase()
  };
}

function sharefullCloseRequired_(props, key) {
  var value = props.getProperty(key);
  if (!value || !value.trim()) throw new Error("Script Properties未設定: " + key);
  return value.trim();
}

function confirmationProcessedLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function sharefullCloseCapture_(text, pattern) {
  var match = pattern.exec(text);
  return match ? match[1].trim() : "";
}

function sharefullCloseProcessedIds_() {
  var properties = PropertiesService.getScriptProperties().getProperties(), processed = {};
  Object.keys(properties).forEach(function(key) {
    if (key.indexOf("SHAREFULL_CONFIRMATION_ACK_") === 0) {
      if (Date.parse(properties[key]) < Date.now() - 30 * 24 * 60 * 60 * 1000) {
        PropertiesService.getScriptProperties().deleteProperty(key);
        return;
      }
      processed[key.substring("SHAREFULL_CONFIRMATION_ACK_".length)] = true;
    }
  });
  return processed;
}

/** タイミーのマッチング通知を受け、シェアフル募集停止を依頼する。 */
function processSpotOfferTaimeeConfirmationsForSharefullClose() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

function processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_() {
  var config = readTaimeeCloseConfig_();
  var processed = taimeeCloseProcessedIds_();
  var label = confirmationProcessedLabel_("MYFAMILLE_TAIMEE_CONFIRMATION_PROCESSED");
  var activationTimestamp = confirmationActivationTimestamp_();

  for (;;) {
    // 処理済みスレッドを検索対象から外し、先頭から確実に読み進める。
    var threads = GmailApp.search(config.gmailQuery + " -label:" + label.getName(), 0, 100);
    if (!threads.length) break;
    var failed = false;
    threads.forEach(function(thread) {
      var threadSucceeded = true;
      thread.getMessages().forEach(function(message) {
        var messageId = message.getId();
        if (processed[messageId]) return;

        if (isConfirmationMessageBeforeActivation_(message, activationTimestamp)) {
          processed[messageId] = true;
          saveTaimeeCloseProcessedIds_(processed);
          return;
        }

        var event = parseSpotOfferTaimeeConfirmationMail_(message, config.senderEmail);
        if (!event) return;

        var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/taimee/confirmed", {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + config.apiToken },
          payload: JSON.stringify(event),
          muteHttpExceptions: true
        });
        var code = response.getResponseCode();
        var result;
        try { result = JSON.parse(response.getContentText() || "{}"); } catch (e) { result = {}; }
        if (code < 200 || code >= 300 || !result.ok) {
          console.warn("タイミーマッチング通知の処理に失敗しました。HTTP " + code);
          threadSucceeded = false;
          return;
        }

        processed[messageId] = true;
        saveTaimeeCloseProcessedIds_(processed);
      });
      if (threadSucceeded) thread.addLabel(label);
      else failed = true;
    });
    // 失敗メールを残して次回トリガーで再試行する。
    if (failed) break;
  }
}

function parseSpotOfferTaimeeConfirmationMail_(message, expectedSender) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== expectedSender) return null;

  var subject = message.getSubject();
  var body = message.getPlainBody();
  var fullText = subject + "\n" + body;
  // Daily matching-status summaries and chat notices also mention matching.
  // Only accept the individual worker-confirmation notification.
  if (!/ワーカーが\s*\d+名マッチングしました/.test(fullText)) return null;

  // タイミー通知に含まれる /offerings/{id} は実際のタイミー求人ID。
  // 業務タイトルの @数字@ はMyFamille側の介護事業所IDとして使われるため、求人IDには使わない。
  var taimeeJobId = taimeeCloseCapture_(fullText, /\/offerings\/([0-9]{4,})(?:[/?#\s)\]>]|$)/i);
  if (!taimeeJobId) {
    taimeeJobId = taimeeCloseCapture_(fullText, /(?:求人ID|求人番号|募集ID|募集番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  }
  var title = taimeeCloseCapture_(fullText, /(?:業務タイトル|求人タイトル|仕事タイトル)\s*[：:]?\s*([^\n\r]+)/i);
  var titleJobId = /@([0-9]{4,})@/.exec(title);
  if (titleJobId) title = title.replace(/\s*@([0-9]{4,})@\s*/g, " ").trim();
  var workStart = parseTaimeeWorkStart_(fullText);
  if (!taimeeJobId && (!title || !workStart)) return null;

  return {
    taimee_job_id: taimeeJobId || undefined,
    template_title: title || undefined,
    shift_start_date: workStart ? workStart.date : undefined,
    shift_start_time: workStart ? workStart.time : undefined,
    application_key: [taimeeJobId || title, workStart ? workStart.date : "", workStart ? workStart.time : ""].join("::"),
    event_id: message.getId(),
    occurred_at: message.getDate().toISOString()
  };
}

function parseTaimeeWorkStart_(text) {
  var scheduleLine = /(?:就業日時|勤務日時|就業時間|勤務時間|日時)\s*[：:]?\s*([^\n\r]+)/.exec(text);
  if (!scheduleLine) return null;
  var dateMatch = /(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/.exec(scheduleLine[1]);
  var timeMatch = /(\d{1,2}):(\d{2})/.exec(scheduleLine[1]);
  if (!dateMatch || !timeMatch) return null;
  return {
    date: dateMatch[1] + "-" + ("0" + dateMatch[2]).slice(-2) + "-" + ("0" + dateMatch[3]).slice(-2),
    time: ("0" + timeMatch[1]).slice(-2) + ":" + timeMatch[2]
  };
}

function readTaimeeCloseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiBaseUrl = sharefullCloseRequired_(props, "MYFAMILLE_API_BASE_URL").replace(/\/$/, "");
  if (apiBaseUrl !== "https://myfamille.shi-on.net") {
    throw new Error("MYFAMILLE_API_BASE_URLは本番URL https://myfamille.shi-on.net に設定してください");
  }
  return {
    apiBaseUrl: apiBaseUrl,
    apiToken: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_GAS_TOKEN"),
    gmailQuery: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_GMAIL_QUERY"),
    senderEmail: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_FROM_EMAIL").toLowerCase()
  };
}

function taimeeCloseCapture_(text, pattern) {
  var match = pattern.exec(text);
  return match ? match[1].trim() : "";
}

function taimeeCloseProcessedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty("TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS") || "[]";
  try {
    return JSON.parse(raw).reduce(function(map, id) { map[id] = true; return map; }, {});
  } catch (e) {
    return {};
  }
}

function saveTaimeeCloseProcessedIds_(processed) {
  var ids = Object.keys(processed);
  PropertiesService.getScriptProperties().setProperty(
    "TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS",
    JSON.stringify(ids.slice(-100))
  );
}

