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
const CURSOR_PROPERTY = "TELEGRAM_LAST_SUBMISSION_TIME";
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
  const lastTime = properties.getProperty(CURSOR_PROPERTY) || "";
  const documents = listSubmissions_();
  if (!documents.length) return;

  const unseen = documents
    .filter((document) => document.createTime > lastTime)
    .sort((a, b) => a.createTime.localeCompare(b.createTime));

  unseen.forEach((document) => {
    const data = firestoreFields_(document.fields || {});
    sendTelegram_(formatSubmissionMessage_(data), chatId);
    properties.setProperty(CURSOR_PROPERTY, document.createTime);
  });
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
  const documents = listSubmissions_();
  const latest = documents.reduce(
    (value, document) => document.createTime > value ? document.createTime : value,
    ""
  );
  PropertiesService.getScriptProperties().setProperty(CURSOR_PROPERTY, latest);
}

function listSubmissions_() {
  const url = firestoreUrl_("submissions?pageSize=100&orderBy=createdAt%20desc");
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  assertSuccess_(response, "โหลดผลงาน");
  return JSON.parse(response.getContentText()).documents || [];
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
