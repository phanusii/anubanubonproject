import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import logger from "firebase-functions/logger";

// The Telegram bot token lives only in the server environment (Secret Manager),
// never in the client bundle. Set it with:
//   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

/**
 * Server-side proxy for sending Telegram notifications.
 *
 * Called same-origin via the Hosting rewrite POST /api/telegram-notify with a JSON
 * body: { message: string, chatId: string }. The chat id is not secret; the token is.
 */
export const telegramNotify = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN], region: "asia-southeast1", cors: true, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    if (!token) {
      logger.error("TELEGRAM_BOT_TOKEN secret is not configured.");
      res.status(500).json({ ok: false, error: "Server not configured" });
      return;
    }

    const { message, chatId } = req.body || {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "Missing 'message'" });
      return;
    }
    if (!chatId) {
      res.status(400).json({ ok: false, error: "Missing 'chatId'" });
      return;
    }

    // Basic abuse guard: cap message length.
    const safeMessage = message.slice(0, 4000);

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: safeMessage,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      });
      const data = await tgRes.json();
      res.status(tgRes.ok ? 200 : 502).json({ ok: data.ok === true });
    } catch (err) {
      logger.error("Telegram send failed:", err);
      res.status(502).json({ ok: false, error: "Upstream error" });
    }
  }
);
