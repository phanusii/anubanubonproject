# Telegram notifier (Firebase Spark / free)

This Apps Script polls Firestore once per minute and sends new submissions to Telegram. No bot token is stored in this repository or shipped to the browser.

1. Create a standalone project at `script.google.com`.
2. Paste `telegram-notifier.gs` into `Code.gs`.
3. Open **Project Settings → Script Properties** and add `TELEGRAM_BOT_TOKEN`.
4. Run `installTelegramNotifier` once and approve the requested permissions.
5. Enable Telegram and set the Chat ID from `/admin/telegram` in the website.

The first installation records the current newest submission, so old submissions are not sent. A confirmation message is sent after installation.
