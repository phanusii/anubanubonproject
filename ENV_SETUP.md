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
# NOTE: In a static export this value is still shipped to the browser. Treat it as
# semi-public and rotate it via BotFather if it leaks. The proper fix is to send
# notifications from a server (Cloud Function), where the token stays private.
NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=
```

## Required manual steps after this change

1. **Rotate the Telegram bot token** — the previous token was committed in source and must be
   considered compromised. In BotFather run `/revoke`, then put the new token in the env vars above.
2. **Create the Firebase Auth admin user** — the admin login now uses Firebase Authentication only
   (no hardcoded password). In the Firebase Console → Authentication:
   - Enable the **Email/Password** provider.
   - Add a user with the admin email and a strong password.
   The email must match the one allowed in `firestore.rules` / `storage.rules` (`ADMIN_EMAIL`).
3. **Deploy the updated `firestore.rules` and `storage.rules`** (`firebase deploy --only firestore:rules,storage`).
