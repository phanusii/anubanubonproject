# Telegram notifier (Firebase Spark / free)

This Apps Script polls Firestore once per minute and sends new submissions to Telegram. No bot token is stored in this repository or shipped to the browser.

1. Create a standalone project at `script.google.com`.
2. Paste `telegram-notifier.gs` into `Code.gs`.
3. Open **Project Settings → Script Properties** and add `TELEGRAM_BOT_TOKEN`.
4. Run `installTelegramNotifier` once and approve the requested permissions.
5. Enable Telegram and set the Chat ID from `/admin/telegram` in the website.

The first installation records the current newest submission, so old submissions are not sent. A confirmation message is sent after installation.

For a high-volume round (for example, 300 teachers), also add `telegram-queue.gs`
to the live Apps Script project and run `installTelegramNotifierV2` once. It
replaces the old trigger, queries only records newer than its cursor, processes
up to 200 records per minute without dropping older records, and sends one
grouped Telegram summary instead of flooding the chat.

## Certificate service

1. Add `certificate-service.gs` to the existing Drive upload Apps Script project. If that project already has `doPost`, keep it and route certificate actions to `handleCertificateAction_` as shown in the deployed merged source.
2. Add the scopes from `appsscript.json` to the existing manifest while preserving its current `webapp` settings.
3. In **Project Settings → Script Properties**, add `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `CERTIFICATE_FOLDER_ID`, `ADMIN_EMAIL`, and `PUBLIC_SITE_URL`.
4. Update the existing Web app deployment, execute as the owner, with access set to **Anyone**.
5. Put the existing `/exec` URL in `NEXT_PUBLIC_CERTIFICATE_SERVICE_URL` before building the website.

The endpoint does not accept a client-provided completion flag or certificate number. It reloads the project and submissions, locks number allocation, and returns the existing certificate on repeated requests. The certificate registry and counters are stored in `certificate-registry.json` inside the configured Drive folder, avoiding paid Cloud Functions and Workspace restrictions on linking a standard Cloud project.

The certificate template is a native Google Slides presentation owned by, or shared with, the Apps Script owner. Paste the presentation URL in `/admin/certificates`, scan its text boxes, then choose the sample-name box and sample-number box. The service copies the presentation, replaces only those two selected boxes, exports PDF, then trashes the temporary copy. Legacy templates using `{{FULL_NAME}}` and `{{CERTIFICATE_NUMBER}}` remain supported.
