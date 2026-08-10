import { getFunctions, httpsCallable } from "firebase/functions";
import app from "./firebase";

const functions = getFunctions(app, "asia-southeast1");

export async function sendTelegramNotification(message: string): Promise<boolean> {
  try {
    const send = httpsCallable<{ message: string }, { ok: boolean }>(functions, "sendTelegramAdminNotification");
    const result = await send({ message });
    return result.data.ok === true;
  } catch (error) {
    console.error("Telegram notification error:", error);
    return false;
  }
}

export async function notifyAdminSubmissionAction(
  action: "edit" | "delete",
  data: { id: string; fullName: string; projectTitle: string },
) {
  const label = action === "delete" ? "แอดมินลบผลงาน" : "แอดมินแก้ไขข้อมูลผลงาน";
  return sendTelegramNotification(`${label}\nหัวข้อ: ${data.projectTitle}\nเจ้าของผลงาน: ${data.fullName}\nรหัส: ${data.id}`);
}

export async function notifyAdminSystemEvent(eventTitle: string, details: string) {
  return sendTelegramNotification(`${eventTitle}\n${details}`);
}
