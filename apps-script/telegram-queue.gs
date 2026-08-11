/** High-volume Telegram queue installed in the live Apps Script project. */
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
  sendTelegram_("✅ อัปเกรดระบบแจ้งเตือนสำหรับผู้ส่ง 300 คนเรียบร้อยแล้ว");
}

function notifyNewSubmissionsV2() {
  var settings = getDocument_(SETTINGS_DOCUMENT);
  if (!settings.telegramNotificationsEnabled) return;
  var chatId = String(settings.telegramChatId || "").trim();
  if (!chatId) return;
  var properties = PropertiesService.getScriptProperties();
  notifyTelegramTest_(settings, chatId, properties);
  var lastTime = Number(properties.getProperty("TELEGRAM_LAST_SUBMISSION_MS") || 0);
  if (!lastTime) {
    initializeTelegramCursorV2_();
    return;
  }
  var documents = listNewSubmissionsV2_(lastTime);
  if (!documents.length) return;
  sendTelegram_(formatSubmissionSummaryV2_(documents), chatId);
  var newest = documents.reduce(function(value, document) {
    var createdAt = Number(firestoreFields_(document.fields || {}).createdAt || 0);
    return Math.max(value, createdAt);
  }, lastTime);
  properties.setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(newest));
}

function initializeTelegramCursorV2_() {
  var documents = runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: 1
  });
  var latest = documents.length
    ? Number(firestoreFields_(documents[0].fields || {}).createdAt || Date.now())
    : Date.now();
  PropertiesService.getScriptProperties().setProperty("TELEGRAM_LAST_SUBMISSION_MS", String(latest));
}

function listNewSubmissionsV2_(lastTime) {
  return runSubmissionQueryV2_({
    from: [{ collectionId: "submissions" }],
    where: { fieldFilter: {
      field: { fieldPath: "createdAt" },
      op: "GREATER_THAN",
      value: { integerValue: String(lastTime) }
    }},
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: 200
  });
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
    lines.push("• " + (item.fullName || "ไม่ระบุชื่อ") + " — " + (item.projectTitle || "ไม่ระบุชิ้นงาน"));
  });
  if (items.length > 15) lines.push("…และอีก " + (items.length - 15) + " รายการ");
  return lines.join("\n");
}
