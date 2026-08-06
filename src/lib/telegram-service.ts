/**
 * Telegram Bot Notification Helper Service
 *
 * The bot token is NEVER present in the client. Notifications are sent through a
 * same-origin server endpoint (Firebase Cloud Function via the Hosting rewrite
 * `/api/telegram-notify`), which holds the token in Secret Manager. See functions/index.js.
 */

// Same-origin endpoint backed by the `telegramNotify` Cloud Function. Overridable for
// local testing via NEXT_PUBLIC_TELEGRAM_ENDPOINT.
const TELEGRAM_ENDPOINT =
  process.env.NEXT_PUBLIC_TELEGRAM_ENDPOINT || "/api/telegram-notify";

export async function sendTelegramNotification(message: string, customChatId?: string): Promise<boolean> {
  try {
    let chatId = customChatId;

    // Chat id is not secret; it may be configured by the admin and cached locally.
    if (typeof window !== "undefined") {
      const savedChatId = localStorage.getItem("telegram_chat_id");
      if (savedChatId && !chatId) {
        chatId = savedChatId;
      }
    }

    if (!chatId) {
      console.warn("Telegram Notification skipped: No Chat ID specified yet.");
      return false;
    }

    const response = await fetch(TELEGRAM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, chatId }),
    });

    const resData = await response.json().catch(() => ({ ok: false }));
    return resData.ok === true;
  } catch (err) {
    console.error("Telegram notification fetch error:", err);
    return false;
  }
}

/**
 * Format & Notify New/Replaced Submission Event
 */
export async function notifyNewSubmissionEvent(data: {
  fullName: string;
  position: string;
  gradeLevel: string;
  subjectGroup: string;
  projectTitle: string;
  school: string;
  fileType: string;
  fileURL: string;
  isReplacement?: boolean;
}) {
  const icon = data.isReplacement ? "🔄 [อัปเดตแทนที่ผลงานเดิม]" : "📥 [ส่งผลงานใหม่]";
  const message = `
<b>${icon} ระบบส่งผลงานโรงเรียนอนุบาลอุบลราชธานี</b>
━━━━━━━━━━━━━━━━━━
<b>👤 ผู้ส่งผลงาน:</b> ${data.fullName} (${data.position})
<b>🏫 สายชั้น:</b> ${data.gradeLevel} | <b>กลุ่มสาระ:</b> ${data.subjectGroup}
<b>📌 หัวข้อผลงาน:</b> ${data.projectTitle}
<b>📁 ประเภทไฟล์:</b> ${data.fileType.toUpperCase()}
<b>🏢 โรงเรียน:</b> ${data.school}
<b>🔗 ลิงก์เปิดดูผลงาน:</b> <a href="${data.fileURL}">เปิดดูไฟล์ผลงาน</a>
━━━━━━━━━━━━━━━━━━
<i>⏰ เวลา: ${new Date().toLocaleString("th-TH")}</i>
`.trim();

  return await sendTelegramNotification(message);
}

/**
 * Format & Notify Admin Submission Edit/Delete Event
 */
export async function notifyAdminSubmissionAction(action: "edit" | "delete", data: {
  id: string;
  fullName: string;
  projectTitle: string;
}) {
  const actionText = action === "delete" ? "🗑 [แอดมินลบผลงาน]" : "✏️ [แอดมินแก้ไขข้อมูลผลงาน]";
  const message = `
<b>${actionText}</b>
━━━━━━━━━━━━━━━━━━
<b>📌 หัวข้อผลงาน:</b> ${data.projectTitle}
<b>👤 เจ้าของผลงาน:</b> ${data.fullName}
<b>🆔 รหัสรายการ:</b> ${data.id}
━━━━━━━━━━━━━━━━━━
<i>⏰ เวลา: ${new Date().toLocaleString("th-TH")}</i>
`.trim();

  return await sendTelegramNotification(message);
}

/**
 * Format & Notify Admin Login & Settings Event
 */
export async function notifyAdminSystemEvent(eventTitle: string, details: string) {
  const message = `
<b>🔔 [ระบบแอดมิน] ${eventTitle}</b>
━━━━━━━━━━━━━━━━━━
${details}
━━━━━━━━━━━━━━━━━━
<i>⏰ เวลา: ${new Date().toLocaleString("th-TH")}</i>
`.trim();

  return await sendTelegramNotification(message);
}
