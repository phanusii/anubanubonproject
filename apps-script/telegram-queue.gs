/** High-volume Telegram queue installed in the live Apps Script project. */
var FIREBASE_PROJECT_ID = "anubanubonproject";
var FIREBASE_API_KEY = "AIzaSyDJxugqBnlmVeyHBM4Bx4yzmkjGv9PVeyQ";
var SETTINGS_DOCUMENT = "settings/training";
var TEST_CURSOR_PROPERTY = "TELEGRAM_LAST_TEST_REQUEST";

function installTelegramNotifierV2() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return ["notifyNewSubmissions", "notifyNewSubmissionsV2"].indexOf(trigger.getHandlerFunction()) >= 0;
    })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  initializeTelegramCursorV2_();
  ScriptApp.newTrigger("notifyNewSubmissionsV2").timeBased().everyMinutes(1).create();
  installTelegramCertificateWebhook_();
  sendTelegram_("✅ อัปเกรดระบบแจ้งเตือนสำหรับผู้ส่ง 300 คนเรียบร้อยแล้ว");
}

/** Manual safe cleanup for obsolete generated certificate PDFs. */
function runCertificateStorageCleanupV2() {
  var result = cleanupObsoleteCertificatePdfs_();
  console.log("Certificate cleanup: deleted=" + result.deleted + ", kept=" + result.kept);
  return result;
}

/** Reorganize legacy project folders into separate work/certificate sections. */
function runOrganizeDriveStructureV3() {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var root = DriveApp.getFolderById(FOLDER_ID);
  var projects = root.getFolders();
  var movedFolders = 0;
  var movedCertificates = 0;
  while (projects.hasNext()) {
    var projectFolder = projects.next();
    var projectName = projectFolder.getName();
    if (projectName === "ผลงาน" || projectName === "เกียรติบัตร" || projectName === "รูปประจำตัว") continue;
    var workRoot = getOrCreateDriveFolder_(projectFolder, "ผลงาน");
    var certificateRoot = getOrCreateDriveFolder_(projectFolder, "เกียรติบัตร");
    var legacyGrades = projectFolder.getFolders();
    while (legacyGrades.hasNext()) {
      var legacyGrade = legacyGrades.next();
      var gradeName = legacyGrade.getName();
      if (gradeName === "ผลงาน" || gradeName === "เกียรติบัตร") continue;
      var workGrade = getOrCreateDriveFolder_(workRoot, gradeName);
      var certificateGrade = getOrCreateDriveFolder_(certificateRoot, gradeName);
      var files = legacyGrade.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        if (file.getMimeType() === MimeType.PDF && isGeneratedCertificatePdfName_(file.getName())) {
          file.moveTo(certificateGrade);
          movedCertificates += 1;
        } else {
          file.moveTo(workGrade);
        }
      }
      var teacherFolders = legacyGrade.getFolders();
      while (teacherFolders.hasNext()) {
        teacherFolders.next().moveTo(workGrade);
        movedFolders += 1;
      }
      try { legacyGrade.setTrashed(true); } catch (_) {}
    }
  }
  return { movedTeacherFolders: movedFolders, movedCertificates: movedCertificates };
}

/** Move every legacy profile-picture folder to one shared root-level folder. */
function runMoveProfilePicturesToSharedFolderV3() {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var root = DriveApp.getFolderById(FOLDER_ID);
  var shared = getOrCreateDriveFolder_(root, "รูปประจำตัว");
  var sources = [];
  var projects = root.getFolders();
  while (projects.hasNext()) {
    var project = projects.next();
    if (project.getId() === shared.getId()) continue;
    collectLegacyProfileFolders_(project, sources);
  }
  sources.forEach(function (source) { mergeDriveFolders_(source, shared); });
  return { movedFolders: sources.length, sharedFolderId: shared.getId() };
}

function collectLegacyProfileFolders_(folder, result) {
  var children = folder.getFolders();
  while (children.hasNext()) {
    var child = children.next();
    if (/^(รูปประจำตัว|รูปภาพประจำตัว|profile pictures?|avatars?)$/i.test(child.getName().trim())) {
      result.push(child);
    } else {
      collectLegacyProfileFolders_(child, result);
    }
  }
}

function mergeDriveFolders_(source, destination) {
  var files = source.getFiles();
  while (files.hasNext()) files.next().moveTo(destination);
  var children = source.getFolders();
  while (children.hasNext()) {
    var child = children.next();
    var target = getOrCreateDriveFolder_(destination, child.getName());
    mergeDriveFolders_(child, target);
  }
  try { source.setTrashed(true); } catch (_) {}
}

/** Common destination for any future profile-picture upload flow. */
function sharedProfilePictureFolder_(gradeLevel, teacherName) {
  if (typeof FOLDER_ID === "undefined" || !FOLDER_ID) throw new Error("ไม่พบ FOLDER_ID");
  var folder = getOrCreateDriveFolder_(DriveApp.getFolderById(FOLDER_ID), "รูปประจำตัว");
  if (gradeLevel) folder = getOrCreateDriveFolder_(folder, String(gradeLevel).trim());
  if (teacherName) folder = getOrCreateDriveFolder_(folder, String(teacherName).trim());
  return folder;
}

function notifyNewSubmissionsV2() {
  var properties = PropertiesService.getScriptProperties();
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var chatId = String(settings.telegramChatId || "").trim();
  if (settings.telegramNotificationsEnabled && chatId) {
    notifyTelegramTest_(settings, chatId, properties);
  }
  var lastTime = Number(properties.getProperty("TELEGRAM_LAST_SUBMISSION_MS") || 0);
  var lastId = String(properties.getProperty("TELEGRAM_LAST_SUBMISSION_ID") || "");
  if (!lastTime) {
    initializeTelegramCursorV2_();
    return;
  }
  var documents = listNewSubmissionsV2_(lastTime, lastId);
  if (!documents.length) return;
quotaBump_(documents);
  var newestDocument = documents[documents.length - 1];
  var newest = Number(firestoreFields_(newestDocument.fields || {}).createdAt || lastTime);
  var newestId = String(newestDocument.name || "").split("/").pop();
  // Advance only after Telegram accepts the message. When notifications are
  // disabled, advance deliberately so re-enabling does not replay old work.
  if (settings.telegramNotificationsEnabled && chatId) {
sendTelegram_(formatSubmissionSummaryV2(documents) + quotaFooter_(), chatId);
    notifyCompletedCertificateCandidatesV2_(documents, chatId);
  }
  properties.setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(newest));
  properties.setProperty("TELEGRAM_LAST_SUBMISSION_ID", newestId);
}

/** Notify once when a recipient becomes complete and attach safe action buttons. */
function notifyCompletedCertificateCandidatesV2_(documents, chatId) {
  var pairs = {}, properties = PropertiesService.getScriptProperties();
  (documents || []).forEach(function(document) {
    var item = firestoreFields_(document.fields || {});
    var projectId = String(item.projectId || "").trim();
    var fullName = normalizeName_(item.fullName);
    if (projectId && fullName) pairs[projectId + "|" + fullName.toLowerCase()] = { projectId: projectId, fullName: fullName };
  });
  Object.keys(pairs).forEach(function(key) {
    var pair = pairs[key], project, progress;
    try {
      project = getFirestoreDocument_("projects/" + encodeURIComponent(pair.projectId));
      if (!project.certificate || !project.certificate.enabled) return;
      progress = completion_(project, queryRecipientSubmissions_(pair.projectId, pair.fullName));
      if (!progress.complete) return;
      var recipientKey = normalizeName_(pair.fullName).toLowerCase();
      var record = getCertificateRecord_(certificateId_(pair.projectId, recipientKey));
      if (record && record.status === "issued") return;
      var notifiedKey = "telegram_complete_" + certificateId_(pair.projectId, recipientKey);
      if (properties.getProperty(notifiedKey)) return;
      var callback = telegramCertificateCallback_(pair.projectId, pair.fullName);
      var folderUrl = recipientWorkFolderUrlV2_(pair.projectId, project, progress.latest || {});
      var rows = [[{ text: "✅ อนุมัติออกเกียรติบัตร", callback_data: callback }]];
      if (folderUrl) rows.push([{ text: "📁 ดูโฟลเดอร์ผลงาน", url: folderUrl }]);
      var text = [
        "🎓 ส่งงานครบแล้ว รออนุมัติเกียรติบัตร",
        "",
        "👤 " + pair.fullName,
        "📚 " + String((progress.latest || {}).gradeLevel || "ไม่ระบุสายชั้น"),
        "📁 " + String(project.name || "ไม่ระบุการอบรม/โครงการ"),
        "✅ ส่งครบ " + progress.submitted + "/" + progress.required + " ชิ้น"
      ].join("\n");
      sendTelegram_(text, chatId, { inline_keyboard: rows });
      properties.setProperty(notifiedKey, String(Date.now()));
    } catch (error) {
      console.error("Telegram completion notification: " + error);
    }
  });
}

function recipientWorkFolderUrlV2_(projectId, project, latest) {
  try {
    // Uploaded files already know their real Drive parent. This remains correct
    // even after a teacher edits their name/grade or legacy folder labels differ.
    var fileId = String(latest.driveFileId || "").trim() || driveFileIdFromUrlV2_(latest.driveLink || latest.fileURL);
    if (fileId) {
      var parents = DriveApp.getFileById(fileId).getParents();
      if (parents.hasNext()) return "https://drive.google.com/drive/folders/" + parents.next().getId();
    }

    var root = certificateStorageRoot_();
    var projectFolders = matchingProjectDriveFolders_(root, project && project.name, projectId, project);
    if (!projectFolders.length) return "";
    var wantedGrade = safeDriveFolderName_(latest.gradeLevel, "ไม่ระบุสายชั้น");
    var wantedTeacher = normalizeDrivePersonNameV2_(latest.fullName);
    var fallback = "";
    for (var projectIndex = 0; projectIndex < projectFolders.length; projectIndex++) {
      var projectChildren = projectFolders[projectIndex].getFolders();
      while (projectChildren.hasNext()) {
        var projectChild = projectChildren.next();
        var childName = normalizeDriveProjectFolderKey_(projectChild.getName());
        if (childName === "เกียรติบัตร" || childName === "รูปประจำตัว") continue;
        var grades = childName === "ผลงาน" ? projectChild.getFolders() : singleFolderIteratorV2_(projectChild);
        while (grades.hasNext()) {
          var gradeFolder = grades.next();
          var teachers = gradeFolder.getFolders();
          while (teachers.hasNext()) {
            var teacherFolder = teachers.next();
            if (normalizeDrivePersonNameV2_(teacherFolder.getName()) === wantedTeacher) {
              var url = "https://drive.google.com/drive/folders/" + teacherFolder.getId();
              if (gradeFolder.getName() === wantedGrade) return url;
              if (!fallback) fallback = url;
            }
          }
        }
      }
    }
    return fallback;
  } catch (_) { return ""; }
}

function singleFolderIteratorV2_(folder) {
  var used = false;
  return {
    hasNext: function () { return !used; },
    next: function () { used = true; return folder; }
  };
}

function driveFileIdFromUrlV2_(value) {
  var text = String(value || "");
  var match = text.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || text.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return match ? match[1] : "";
}

function normalizeDrivePersonNameV2_(value) {
  return String(value || "").toLowerCase().replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "").replace(/[.\s_-]+/g, "");
}

function telegramCertificateCallback_(projectId, fullName) {
  var id = Utilities.getUuid().replace(/-/g, "").slice(0, 20);
  PropertiesService.getScriptProperties().setProperty("telegram_cert_" + id, JSON.stringify({
    projectId: String(projectId), fullName: normalizeName_(fullName), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  }));
  return "cert:" + id;
}

function installTelegramCertificateWebhook_() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var webAppUrl = PropertiesService.getScriptProperties().getProperty("CERTIFICATE_WEB_APP_URL") ||
    "https://script.google.com/macros/s/AKfycbyhEJADSzKxiEsGcl80VuJyPPBaz_5GJhG7syFaJ2LgOake0smcU2Ipge5YmgyGNYg2/exec";
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");
  var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ url: webAppUrl, allowed_updates: ["callback_query"], drop_pending_updates: false }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "ตั้งค่า Telegram Webhook");
}

function handleTelegramWebhook_(update) {
  var query = update && update.callback_query;
  if (!query || String(query.data || "").indexOf("cert:") !== 0) return json_({ ok: true });
  var settings = getDocument_(SETTINGS_DOCUMENT);
  var expectedChatId = String(settings.telegramChatId || "").trim();
  var actualChatId = String(query.message && query.message.chat && query.message.chat.id || "").trim();
  if (!expectedChatId || actualChatId !== expectedChatId) {
    answerTelegramCallbackV2_(query.id, "ไม่มีสิทธิ์อนุมัติจากห้องสนทนานี้", true); return json_({ ok: true });
  }
  var id = String(query.data).slice(5), properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty("telegram_cert_" + id);
  if (!raw) { answerTelegramCallbackV2_(query.id, "ปุ่มนี้หมดอายุแล้ว", true); return json_({ ok: true }); }
  var action = JSON.parse(raw);
  if (Number(action.expiresAt || 0) < Date.now()) {
    properties.deleteProperty("telegram_cert_" + id); answerTelegramCallbackV2_(query.id, "ปุ่มนี้หมดอายุแล้ว", true); return json_({ ok: true });
  }
  try {
    var record = issueCertificate_(action.projectId, action.fullName, false, false);
    properties.deleteProperty("telegram_cert_" + id);
    answerTelegramCallbackV2_(query.id, "ออกเกียรติบัตรเรียบร้อยแล้ว", false);
    var text = "✅ อนุมัติและออกเกียรติบัตรแล้ว\n\n👤 " + record.recipientName + "\n🔢 เลขที่ " + record.certificateNumber;
    var keyboard = record.pdfUrl ? { inline_keyboard: [[{ text: "📄 เปิดเกียรติบัตร", url: record.pdfUrl }]] } : undefined;
    sendTelegram_(text, actualChatId, keyboard);
        sendTelegram_(text, actualChatId, keyboard);
    // แก้ข้อความเดิม: ต่อท้าย "อนุมัติแล้ว" + ลบเฉพาะปุ่มอนุมัติ (เก็บปุ่มดูโฟลเดอร์ไว้)
    var origText = (query.message && query.message.text) || "";
    var keptButtons = ((query.message && query.message.reply_markup && query.message.reply_markup.inline_keyboard) || [])
      .map(function (row) { return row.filter(function (b) { return String(b.callback_data || "").indexOf("cert:") !== 0; }); })
      .filter(function (row) { return row.length; });
    editTelegramMessage_(actualChatId, query.message.message_id,
      origText + "\n\n✅ อนุมัติแล้ว — เลขที่ " + record.certificateNumber,
      keptButtons.length ? { inline_keyboard: keptButtons } : null);
  } catch (error) {
    answerTelegramCallbackV2_(query.id, String(error && error.message || error).slice(0, 180), true);
  }

  return json_({ ok: true });
}
function editTelegramMessage_(chatId, messageId, text, keyboard) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var payload = { chat_id: String(chatId), message_id: messageId, text: text };
  if (keyboard) payload.reply_markup = keyboard;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}

function answerTelegramCallbackV2_(callbackId, text, alert) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackId, text: text, show_alert: Boolean(alert) }), muteHttpExceptions: true
  });
}

function initializeTelegramCursorV2_() {
  var documents = runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    orderBy: [
      { field: { fieldPath: "createdAt" }, direction: "DESCENDING" },
      { field: { fieldPath: "__name__" }, direction: "DESCENDING" }
    ],
    limit: 1
  });
  var latest = documents.length
    ? Number(firestoreFields_(documents[0].fields || {}).createdAt || Date.now())
    : Date.now();
  PropertiesService.getScriptProperties().setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(latest));
  PropertiesService.getScriptProperties().setProperty(
    "TELEGRAM_LAST_SUBMISSION_ID",
    documents.length ? String(documents[0].name || "").split("/").pop() : ""
  );
}

function listNewSubmissionsV2_(lastTime, lastId) {
  var queries = [];
  if (lastId) {
    queries = queries.concat(runSubmissionQueryV2_({
      from: [{ collectionId: "submissions" }],
      where: { compositeFilter: { op: "AND", filters: [
        { fieldFilter: { field: { fieldPath: "createdAt" }, op: "EQUAL", value: { integerValue: String(lastTime) } } },
        { fieldFilter: { field: { fieldPath: "__name__" }, op: "GREATER_THAN", value: { referenceValue: "projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/submissions/" + lastId } } }
      ]}},
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 500
    }));
  }
  if (queries.length < 500) queries = queries.concat(runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    where: { fieldFilter: {
      field: { fieldPath: "createdAt" }, op: "GREATER_THAN", value: { integerValue: String(lastTime) }
    }},
    orderBy: [
      { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" }
    ],
    limit: 500 - queries.length
  }));
  return queries.sort(function (a, b) {
    var timeA = Number(firestoreFields_(a.fields || {}).createdAt || 0);
    var timeB = Number(firestoreFields_(b.fields || {}).createdAt || 0);
    return timeA - timeB || String(a.name || "").localeCompare(String(b.name || ""));
  }).slice(0, 500);
}

function runSubmissionQueryV2_(structuredQuery) {
  var url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents:runQuery?key=" + encodeURIComponent(FIREBASE_API_KEY);
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ structuredQuery: structuredQuery }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "โหลดผลงานใหม่");
  return (JSON.parse(response.getContentText()) || [])
    .map(function(row) { return row.document; })
    .filter(Boolean);
}

function formatSubmissionSummaryV2_(documents) {
  var items = documents.map(function(document) {
    return firestoreFields_(document.fields || {});
  });
  var grades = {};
  items.forEach(function(item) {
    var grade = String(item.gradeLevel || "ไม่ระบุ");
    grades[grade] = (grades[grade] || 0) + 1;
  });
  var lines = ["📥 มีการส่งงานใหม่ " + items.length + " รายการ", ""];
  Object.keys(grades).sort().forEach(function(grade) {
    lines.push("• " + grade + " จำนวน " + grades[grade] + " รายการ");
  });
  lines.push("", "รายการล่าสุด:");
  items.slice(-15).reverse().forEach(function(item) {
    lines.push("• " + (item.fullName || "ไม่ระบุชื่อ") + " — " + cleanWorkTitleV2_(item.projectTitle));
    var workUrl = String(item.fileURL || item.driveLink || "").trim();
    if (workUrl) lines.push("  🔗 ดูงานที่ส่ง: " + workUrl);
  });
  if (items.length > 15) lines.push("…และอีก " + (items.length - 15) + " รายการ");
  return lines.join("\n");
}

function cleanWorkTitleV2_(value) {
  var title = String(value || "ไม่ระบุชิ้นงาน").trim();
  // Remove one or more trailing notes such as (ไฟล์ PDF) or (รูปภาพ / PDF / Google Drive).
  while (/\s*\([^()]*\)\s*$/.test(title)) {
    title = title.replace(/\s*\([^()]*\)\s*$/, "").trim();
  }
  return title || "ไม่ระบุชิ้นงาน";
}

function notifyTelegramTest_(settings, chatId, properties) {
  var requestedAt = String(settings.telegramTestRequestedAt || "");
  if (!requestedAt || properties.getProperty(TEST_CURSOR_PROPERTY) === requestedAt) return;
  sendTelegram_("✅ ทดสอบการแจ้งเตือนสำเร็จ\n\nระบบพร้อมแจ้งเตือนเมื่อมีครูส่งงานหรือผลงานใหม่", chatId);
  properties.setProperty(TEST_CURSOR_PROPERTY, requestedAt);
}

function getDocument_(path) {
  var response = UrlFetchApp.fetch("https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/" + path + "?key=" + encodeURIComponent(FIREBASE_API_KEY), { muteHttpExceptions: true });
  assertSuccess_(response, "โหลดการตั้งค่า");
  return firestoreFields_(JSON.parse(response.getContentText()).fields || {});
}

function firestoreFields_(fields) {
  var result = {};
  Object.keys(fields || {}).forEach(function(key) { result[key] = telegramFieldValue_(fields[key]); });
  return result;
}

function telegramFieldValue_(field) {
  if (!field || typeof field !== "object") return field;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  if (field.arrayValue) return (field.arrayValue.values || []).map(telegramFieldValue_);
  if (field.mapValue) return firestoreFields_(field.mapValue.fields || {});
  return null;
}

function sendTelegram_(text, explicitChatId, replyMarkup) {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  var settings = explicitChatId ? null : getDocument_(SETTINGS_DOCUMENT);
  var chatId = explicitChatId || String(settings.telegramChatId || "").trim();
  if (!token || !chatId) throw new Error("Telegram token or Chat ID is missing");
  var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true, reply_markup: replyMarkup || undefined }),
    muteHttpExceptions: true
  });
  assertSuccess_(response, "ส่ง Telegram");
}

function sendTelegramTestNow_(chatId) {
  chatId = String(chatId || "").trim();
  if (!chatId) throw new Error("กรุณากรอก Telegram Chat ID");
  sendTelegram_("✅ ทดสอบการแจ้งเตือนสำเร็จ\n\nระบบพร้อมแจ้งเตือนเมื่อมีครูส่งงานหรือผลงานใหม่", chatId);
  return true;
}

function assertSuccess_(response, action) {
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(action + " ไม่สำเร็จ (HTTP " + status + "): " + response.getContentText());
}
