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
NEXT_PUBLIC_ADMIN_EMAIL=phanu9818@anubanubon.ac.th

# Google Apps Script certificate web-app /exec URL
NEXT_PUBLIC_CERTIFICATE_SERVICE_URL=

# Files are uploaded through the existing Google Drive Apps Script endpoint.
```

## Required manual steps after this change

1. **Create the Firebase Auth admin user** — the admin login uses Firebase Authentication
   (no hardcoded password). In the Firebase Console → Authentication:
   - Enable the **Email/Password** provider.
   - Add a user with the admin email and a strong password.
   The email must match the one allowed in `firestore.rules` (`ADMIN_EMAIL`).
2. Deploy the free-tier app with `npm run build && firebase deploy --only hosting,firestore:rules`.

This Spark-plan configuration intentionally does not use Cloud Functions, Secret Manager,
Firebase Storage, or Telegram Bot API. Sending Telegram messages securely requires a trusted
server and must never expose the bot token in `NEXT_PUBLIC_*` variables.
