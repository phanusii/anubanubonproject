# Server-side Telegram notifications (Cloud Function)

The bot token is now kept **only** on the server (Firebase Secret Manager). The web app
calls a same-origin endpoint `POST /api/telegram-notify`, which Firebase Hosting rewrites
to the `telegramNotify` Cloud Function (`functions/index.js`). The token never reaches the browser.

## Requirements

- Firebase project on the **Blaze (pay-as-you-go)** plan — Cloud Functions require it.
  (This function has `maxInstances: 5` and near-zero traffic, so real cost is effectively $0.)
- Firebase CLI logged in: `firebase login`.

## One-time setup

```bash
# 1. Install function dependencies
cd functions && npm install && cd ..

# 2. Store the bot token as a secret (paste the NEW token from BotFather when prompted)
firebase functions:secrets:set TELEGRAM_BOT_TOKEN

# 3. Deploy the function + hosting rewrite + rules
firebase deploy --only functions,firestore:rules,storage,hosting
```

The function is deployed to region `asia-southeast1` (see `firebase.json` rewrite and
`functions/index.js`). Change the region in both places if you prefer another.

## How the client uses it

`src/lib/telegram-service.ts` POSTs `{ message, chatId }` to `/api/telegram-notify`.
The chat id is configured by the admin on the Telegram settings page (not secret).
No `NEXT_PUBLIC_TELEGRAM_BOT_TOKEN` is needed anymore — remove it from your env if set.

## Local testing (optional)

```bash
cd functions
firebase emulators:start --only functions
# then set NEXT_PUBLIC_TELEGRAM_ENDPOINT to the emulator URL for `npm run dev`
```
