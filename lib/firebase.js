import { getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
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

let auth;
if (typeof window !== "undefined") {
    const isMobileTauri = !!window.__TAURI_INTERNALS__ &&
        /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobileTauri) {
        auth = initializeAuth(app, {
            persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        });
    } else {
        auth = getAuth(app);
    }
} else {
    auth = getAuth(app);
}

// Use standard Firestore instance (avoid persistentLocalCache to prevent
// browser-side warnings about exclusive access to the persistence layer).
const db = getFirestore(app);
export { db, auth };

export const storage = getStorage(app);
export default app;
