/**
 * Telegram Bot Notification Helper Service
 *
 * SECURITY NOTE: In a static export the bot token is still shipped to the browser,
 * so this is only a stop-gap. The token is read from an env var (not hardcoded) so it
 * can be rotated without a code change. The proper fix is to move this call behind a
 * server endpoint (e.g. a Firebase Cloud Function) so the token never reaches clients.
 */

export const DEFAULT_TELEGRAM_BOT_TOKEN =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || "";

export async function sendTelegramNotification(message: string, customChatId?: string): Promise<boolean> {
  try {
    const token = DEFAULT_TELEGRAM_BOT_TOKEN;
    let chatId = customChatId;

    // Check if custom chatId saved in localStorage/settings
    if (typeof window !== "undefined") {
      const savedChatId = localStorage.getItem("telegram_chat_id");
      if (savedChatId && !chatId) {
        chatId = savedChatId;
      }
    }

    if (!token) {
      console.warn("Telegram Notification skipped: NEXT_PUBLIC_TELEGRAM_BOT_TOKEN is not configured.");
      return false;
    }

    if (!chatId) {
      console.warn("Telegram Notification skipped: No Chat ID specified yet.");
      return false;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const resData = await response.json();
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
