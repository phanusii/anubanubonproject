const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
const REGION = "asia-southeast1";
const ADMIN_EMAIL = "18403p@gmail.com";
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sendTelegram(message, chatId) {
  if (!chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`);
  return true;
}

exports.notifyNewSubmission = onDocumentCreated(
  { document: "submissions/{submissionId}", region: REGION, secrets: [TELEGRAM_BOT_TOKEN] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const settings = await getFirestore().doc("settings/training").get();
    const { telegramChatId, telegramNotificationsEnabled = true } = settings.data() || {};
    if (!telegramNotificationsEnabled || !telegramChatId) return;
    const message = ["<b>📥 มีผลงานส่งเข้ามาใหม่</b>", `ผู้ส่ง: ${escapeHtml(data.fullName)}`, `หัวข้อ: ${escapeHtml(data.projectTitle)}`, `สายชั้น: ${escapeHtml(data.gradeLevel)}`, `กลุ่มสาระ: ${escapeHtml(data.subjectGroup)}`].join("\n");
    await sendTelegram(message, telegramChatId);
  },
);

exports.sendTelegramAdminNotification = onCall(
  { region: REGION, secrets: [TELEGRAM_BOT_TOKEN] },
  async (request) => {
    if (request.auth?.token?.email?.toLowerCase() !== ADMIN_EMAIL) throw new HttpsError("permission-denied", "Administrator access required");
    const message = String(request.data?.message || "").trim();
    if (!message || message.length > 3000) throw new HttpsError("invalid-argument", "Message must contain 1-3000 characters");
    const settings = await getFirestore().doc("settings/training").get();
    return { ok: await sendTelegram(escapeHtml(message), settings.data()?.telegramChatId) };
  },
);
