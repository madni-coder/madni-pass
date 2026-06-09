import "./tauri-overrides";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const existingApps = getApps();
const app = existingApps.length === 0 ? initializeApp(firebaseConfig) : existingApps[0];

// DO NOT pass browserPopupRedirectResolver here.
// When set on initializeAuth(), Firebase eagerly loads gapi.iframes at startup to
// check for pending OAuth redirects. In Tauri (even on http://localhost dev server),
// Google's servers block the tauri:// WebView origin with CORS 301 — crashing the
// app before any UI loads. Instead, pass the resolver explicitly to signInWithPopup()
// only on the web code path (see context/AuthContext.js).
let auth;
if (typeof window !== "undefined") {
    console.log("[Firebase Init] Initializing Auth in browser/Tauri...");
    try {
        auth = initializeAuth(app, {
            persistence: browserLocalPersistence,
        });
        console.log("[Firebase Init] initializeAuth succeeded!");
    } catch (e) {
        console.error("[Firebase Init] initializeAuth failed, falling back to getAuth. Error:", e);
        try {
            auth = getAuth(app);
            console.log("[Firebase Init] getAuth fallback succeeded!");
        } catch (err) {
            console.error("[Firebase Init] getAuth fallback failed too! Error:", err);
        }
    }
} else {
    console.log("[Firebase Init] Initializing Auth in SSR...");
    auth = getAuth(app);
}

// Lazy-load browserPopupRedirectResolver only when actually needed (desktop web
// sign-in path). Importing it statically causes Firebase to eagerly initialise
// gapi.iframes, which crashes on Tauri iOS due to CORS on tauri://localhost.
export async function getBrowserPopupRedirectResolver() {
    const { browserPopupRedirectResolver } = await import(/* webpackPrefetch: false, webpackPreload: false */ "firebase/auth");
    return browserPopupRedirectResolver;
}

// Initialize Firestore with persistent local cache where supported.
// iOS WKWebView (Tauri) may not support IndexedDB persistence, so we fall back
// to standard Firestore to avoid a module-level crash.
let db;
const isTauriOrMobile = typeof window !== "undefined" && (
    !!window.__TAURI_INTERNALS__ ||
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost" ||
    /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)
);

if (isTauriOrMobile) {
    console.log("[Firebase Init] Running in Tauri/Mobile context, using standard Firestore (no persistentLocalCache to prevent IndexedDB lockups)...");
    db = getFirestore(app);
} else {
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
    } catch (e) {
        console.warn("Firestore persistentLocalCache unavailable, falling back to default:", e);
        db = getFirestore(app);
    }
}
export { db, auth };

export const storage = getStorage(app);
export default app;
