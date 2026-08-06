# Environment Variables

Create a `.env.local` file in the project root (already gitignored) with the following keys.
For production (Firebase Hosting via GitHub Actions), add these as repository/environment secrets
and expose them to the `next build` step.

```bash
# --- Firebase (client SDK config; safe to expose, but set your real project values) ---
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# --- Telegram bot ---
# The bot token is NOT a client env var anymore. It is stored server-side in Secret
# Manager and used by the telegramNotify Cloud Function. See FUNCTIONS_SETUP.md.
# (Optional) Override the notify endpoint for local testing only:
# NEXT_PUBLIC_TELEGRAM_ENDPOINT=
```

## Required manual steps after this change

1. **Rotate the Telegram bot token** — the previous token was committed in source and must be
   considered compromised. In BotFather run `/revoke`, then store the NEW token server-side with
   `firebase functions:secrets:set TELEGRAM_BOT_TOKEN` (see FUNCTIONS_SETUP.md). It is no longer a client env var.
2. **Create the Firebase Auth admin user** — the admin login now uses Firebase Authentication only
   (no hardcoded password). In the Firebase Console → Authentication:
   - Enable the **Email/Password** provider.
   - Add a user with the admin email and a strong password.
   The email must match the one allowed in `firestore.rules` / `storage.rules` (`ADMIN_EMAIL`).
3. **Deploy the updated `firestore.rules` and `storage.rules`** (`firebase deploy --only firestore:rules,storage`).
