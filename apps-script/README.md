# Apps Script production source

This directory mirrors the live `anubanubonproject` Apps Script project. Keep
all four files together because Apps Script evaluates every `.gs` file in one
shared global scope.

- `drive-upload.gs` owns the single public `doPost(e)` dispatcher.
- `Code.gs` contains upload, Drive revision, certificate, and shared helpers.
- `telegram-queue.gs` contains the five-minute Telegram fallback, certificate
  approval callbacks, and one-off Drive maintenance utilities.
- `appsscript.json` is the production manifest.

Do not add another `doPost`, duplicate a helper name, or deploy one `.gs` file
in isolation. Deploy as a new Apps Script version while preserving the existing
web-app URL, execution owner, Script Properties, and triggers.

Required Script Properties include `TELEGRAM_BOT_TOKEN`,
`FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, and `CERTIFICATE_FOLDER_ID`.
Secrets must remain in Script Properties and must never be committed.

The five-minute notifier is a bounded recovery path, not a full historical
scanner. It processes at most 50 submissions per run, has a 55-second budget,
uses short-lived leases/claims, and advances its cursor monotonically only
after a submission notification is marked sent. It must not hold ScriptLock
while calling Firestore, Drive, or Telegram, and it must not call the cached
certificate-candidate scan on every tick.

## Safe release order

1. Keep the previous Apps Script version available for rollback.
2. Push all files in this directory to a staging copy first.
3. Test upload, resumable upload, Telegram test/fallback, Drive revisions,
   certificate preview, batch issue, recipient lookup, and revoke.
4. Create a new production version and update the existing deployment to it.
5. Test one non-destructive request for each action family before closing the release.
