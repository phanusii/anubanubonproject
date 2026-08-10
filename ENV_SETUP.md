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
NEXT_PUBLIC_ADMIN_EMAIL=18403p@gmail.com

# Do not add a Telegram token to any NEXT_PUBLIC_* variable.
```

## Required manual steps after this change

1. **Rotate the Telegram bot token**, then store it only in Firebase Secret Manager:
   `firebase functions:secrets:set TELEGRAM_BOT_TOKEN`.
2. **Create the Firebase Auth admin user** — the admin login now uses Firebase Authentication only
   (no hardcoded password). In the Firebase Console → Authentication:
   - Enable the **Email/Password** provider.
   - Add a user with the admin email and a strong password.
   The email must match the one allowed in `firestore.rules` / `storage.rules` (`ADMIN_EMAIL`).
3. Install functions with `npm --prefix functions install`.
4. Deploy with `firebase deploy --only functions,firestore:rules,storage`.
5. Enable Firebase App Check enforcement for Firestore, Storage, and Functions.
