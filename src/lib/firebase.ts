import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, type Firestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase web config is public by design (it ships in the browser bundle); the real
// protection is Firestore/Storage security rules. Env vars override these defaults if set.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDJxugqBnlmVeyHBM4Bx4yzmkjGv9PVeyQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "anubanubonproject.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "anubanubonproject",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "anubanubonproject.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "426373999495",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:426373999495:web:3e8274cd8fc54cc9cf4122",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Many school/office networks block Firestore's default WebChannel/gRPC streaming
// transport, which makes SDK reads hang or fail — the app then silently falls back to
// stale local-cache data (showing partial counts). Auto-detect long-polling runs over
// ordinary HTTPS and gets through those proxies. initializeFirestore must run before any
// getFirestore(); guard against a second init (hot reload) by falling back to getFirestore.
let firestore: Firestore;
try {
  // Force long-polling (not auto-detect): this network is known to block WebChannel,
  // and detection can be unreliable through the same proxy. Long-polling is plain HTTPS.
  firestore = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch {
  firestore = getFirestore(app);
}
export const db = firestore;
export const auth = getAuth(app);

export default app;
