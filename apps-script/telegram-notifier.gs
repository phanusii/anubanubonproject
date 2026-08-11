/**
 * Free Telegram notifier for the Firebase Spark plan.
 *
 * Script Properties required:
 *   TELEGRAM_BOT_TOKEN  - Telegram bot token (never commit this value)
 *
 * Run installTelegramNotifier() once. It creates a one-minute trigger and
 * initializes the cursor without sending historical submissions.
 */
const FIREBASE_PROJECT_ID = "anubanubonproject";
const FIREBASE_API_KEY = "AIzaSyDJxugqBnlmVeyHBM4Bx4yzmkjGv9PVeyQ";
const SETTINGS_DOCUMENT = "settings/training";
const CURSOR_PROPERTY = "TELEGRAM_LAST_SUBMISSION_MS";
const TEST_CURSOR_PROPERTY = "TELEGRAM_LAST_TEST_REQUEST";

function installTelegramNotifier() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN in Script Properties");

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "notifyNewSubmissions")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  initializeTelegramCursor_();
  ScriptApp.newTrigger("notifyNewSubmissions").timeBased().everyMinutes(1).create();
  sendTelegram_("✅ เปิดใช้การแจ้งเตือนผลงานใหม่เรียบร้อยแล้ว");
}

function notifyNewSubmissions() {
  const settings = getDocument_(SETTINGS_DOCUMENT);
  if (!settings.telegramNotificationsEnabled) return;

  const chatId = String(settings.telegramChatId || "").trim();
  if (!chatId) return;

  const properties = PropertiesService.getScriptProperties();
  notifyTelegramTest_(settings, chatId, properties);
  const lastTime = Number(properties.getProperty(CURSOR_PROPERTY) || 0);
  if (!lastTime) {
    initializeTelegramCursor_();
    return;
  }
  const documents = listNewSubmissions_(lastTime);
  if (!documents.length) return;

  // One summary per minute avoids Telegram's per-chat/group flood limits. The
  // cursor moves only after Telegram accepts the summary, so failures retry.
  sendTelegram_(formatSubmissionSummary_(documents), chatId);
  const newest = documents.reduce((value, document) => {
    const createdAt = Number(firestoreFields_(document.fields || {}).createdAt || 0);
    return Math.max(value, createdAt);
  }, lastTime);
  properties.setProperty(CURSOR_PROPERTY, String(newest));
}

function notifyTelegramTest_(settings, chatId, properties) {
  const requestedAt = String(settings.telegramTestRequestedAt || "");
  if (!requestedAt || properties.getProperty(TEST_CURSOR_PROPERTY) === requestedAt) return;
  sendTelegram_(
    "✅ ทดสอบการแจ้งเตือนสำเร็จ\n\nระบบพร้อมแจ้งเตือนเมื่อมีครูส่งงานหรือผลงานใหม่",
    chatId
  );
  properties.setProperty(TEST_CURSOR_PROPERTY, requestedAt);
}

function initializeTelegramCursor_() {
  const documents = runSubmissionQuery_({
    from: [{ collectionId: "submissions" }],
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
    limit: 1,
  });
  const latest = documents.length
    ? Number(firestoreFields_(documents[0].fields || {}).createdAt || Date.now())
    : Date.now();
  PropertiesService.getScriptProperties().setProperty(CURSOR_PROPERTY, String(latest));
}

function listNewSubmissions_(lastTime) {
  return runSubmissionQuery_({
    from: [{ collectionId: "submissions" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "createdAt" },
        op: "GREATER_THAN",
        value: { integerValue: String(lastTime) },
      },
    },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: 200,
  });
}

function runSubmissionQuery_(structuredQuery) {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents:runQuery?key=" + encodeURIComponent(FIREBASE_API_KEY);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ structuredQuery: structuredQuery }),
    muteHttpExceptions: true,
  });
  assertSuccess_(response, "โหลดผลงานใหม่");
  return (JSON.parse(response.getContentText()) || [])
    .map((row) => row.document)
    .filter(Boolean);
}

function getDocument_(path) {
  const response = UrlFetchApp.fetch(firestoreUrl_(path), { muteHttpExceptions: true });
  assertSuccess_(response, "โหลดการตั้งค่า");
  return firestoreFields_(JSON.parse(response.getContentText()).fields || {});
}

function firestoreUrl_(path) {
  return "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/" + path +
    (path.indexOf("?") >= 0 ? "&key=" : "?key=") + FIREBASE_API_KEY;
}

function firestoreFields_(fields) {
  const result = {};
  Object.keys(fields).forEach((key) => result[key] = fieldValue_(fields[key]));
  return result;
}

function fieldValue_(field) {
  if (field === null || field === undefined || typeof field !== "object") return field;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  return field;
}

function formatSubmissionMessage_(data) {
  const lines = [
    "📥 มีการส่งงานใหม่",
    "",
    "👤 " + (data.fullName || "ไม่ระบุชื่อ"),
    "🏷️ " + (data.position || "ไม่ระบุตำแหน่ง"),
    "📚 " + (data.gradeLevel || "-") + " · " + shortSubject_(data.subjectGroup || "-"),
    "📝 " + (data.projectTitle || "ไม่ระบุชิ้นงาน"),
    "📁 " + (data.projectName || "ไม่ระบุรอบ"),
  ];
  if (data.fileURL) lines.push("🔗 " + data.fileURL);
  return lines.join("\n");
}

function formatSubmissionSummary_(documents) {
  const items = documents.map((document) => firestoreFields_(document.fields || {}));
  const grades = {};
  items.forEach((item) => {
    const grade = String(item.gradeLevel || "ไม่ระบุ");
    grades[grade] = (grades[grade] || 0) + 1;
  });
  const lines = [
    "📥 มีการส่งงานใหม่ " + items.length + " รายการ",
    "",
    ...Object.keys(grades).sort().map((grade) => "• " + grade + " จำนวน " + grades[grade] + " รายการ"),
    "",
    "รายการล่าสุด:",
  ];
  items.slice(-15).reverse().forEach((item) => {
    lines.push("• " + (item.fullName || "ไม่ระบุชื่อ") + " — " + (item.projectTitle || "ไม่ระบุชิ้นงาน"));
  });
  if (items.length > 15) lines.push("…และอีก " + (items.length - 15) + " รายการ");
  return lines.join("\n");
}

function shortSubject_(value) {
  return String(value).replace(/^กลุ่มสาระการเรียนรู้/, "").trim();
}

function sendTelegram_(text, explicitChatId) {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  const settings = explicitChatId ? null : getDocument_(SETTINGS_DOCUMENT);
  const chatId = explicitChatId || String(settings.telegramChatId || "").trim();
  if (!token || !chatId) throw new Error("Telegram token or Chat ID is missing");

  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
    muteHttpExceptions: true,
  });
  assertSuccess_(response, "ส่ง Telegram");
}

/** Called by the authenticated admin web page; returns Telegram's real result immediately. */
function sendTelegramTestNow_(chatId) {
  chatId = String(chatId || "").trim();
  if (!chatId) throw new Error("กรุณากรอก Telegram Chat ID");
  sendTelegram_("✅ ทดสอบการแจ้งเตือนสำเร็จ\n\nระบบพร้อมแจ้งเตือนเมื่อมีครูส่งงานหรือผลงานใหม่", chatId);
  return true;
}

function assertSuccess_(response, action) {
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(action + " ไม่สำเร็จ (HTTP " + status + "): " + response.getContentText());
  }
}
