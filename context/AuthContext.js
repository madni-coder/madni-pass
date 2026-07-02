"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
    GoogleAuthProvider,
    signInAnonymously,
    signOut,
    onAuthStateChanged,
    deleteUser,
} from "firebase/auth";
import { auth, getBrowserPopupRedirectResolver } from "@/lib/firebase";
import { deleteUserAccountData } from "@/lib/db";
import CryptoJS from "crypto-js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        if (typeof window !== "undefined") {
            try {
                const cached = localStorage.getItem("cached_user");
                return cached ? JSON.parse(cached) : null;
            } catch (e) {
                return null;
            }
        }
        return null;
    });
    const [loading, setLoading] = useState(() => {
        if (typeof window !== "undefined") {
            try {
                return !localStorage.getItem("cached_user");
            } catch (e) {
                return true;
            }
        }
        return true;
    });

    useEffect(() => {
        console.log("[AuthContext] Registering onAuthStateChanged. Auth instance:", auth);
        try {
            const unsubscribe = onAuthStateChanged(auth, (u) => {
                console.log("[AuthContext] onAuthStateChanged fired. User:", u ? u.uid : "null");
                if (u) {
                    const userData = {
                        uid: u.uid,
                        email: u.email,
                        displayName: u.displayName,
                        photoURL: u.photoURL,
                    };
                    setUser(userData);
                    try {
                        localStorage.setItem("cached_user", JSON.stringify(userData));
                    } catch (e) {}
                } else {
                    setUser(null);
                    try {
                        localStorage.removeItem("cached_user");
                    } catch (e) {}
                }
                setLoading(false);
            });
            
            // Add iOS platform class if running on iOS device/simulator
            if (typeof window !== "undefined") {
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                              (typeof navigator !== "undefined" && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                if (isIOS) {
                    document.documentElement.classList.add("platform-ios");
                }
            }
            
            return unsubscribe;
        } catch (err) {
            console.error("[AuthContext] onAuthStateChanged registration failed:", err);
            setLoading(false); // don't block the app if registration failed
        }
    }, []);

    const [webAuthMethods, setWebAuthMethods] = useState(null);

    useEffect(() => {
        const loadWebAuth = async () => {
            const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
            if (!isTauri) {
                try {
                    const [{ signInWithPopup, getRedirectResult, OAuthProvider }, resolver] = await Promise.all([
                        import("firebase/auth"),
                        getBrowserPopupRedirectResolver()
                    ]);
                    setWebAuthMethods({ signInWithPopup, OAuthProvider, resolver });
                    // Still check for any pending redirects just in case they were initiated previously
                    await getRedirectResult(auth, resolver);
                } catch (e) {
                    console.error("[AuthContext] Failed to load web auth methods:", e);
                }
            }
        };
        loadWebAuth();
    }, []);

    const signInWithGoogle = async (opts = {}) => {
        const { selectAccount = false } = opts;
        const provider = new GoogleAuthProvider();

        try {
            const isMobileTauri = typeof window !== "undefined" &&
                !!window.__TAURI_INTERNALS__ &&
                (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                 (typeof navigator !== "undefined" && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                 window.location.protocol === "tauri:");

            if (isMobileTauri) {
                const { signIn } = await import('@choochmeque/tauri-plugin-google-auth-api');
                let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                              (typeof navigator !== "undefined" && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                const isAndroid = /Android/i.test(navigator.userAgent);
                
                if (isIOS && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_IOS) {
                    clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_IOS;
                } else if (isAndroid && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                    clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                }

                if (!clientId || clientId.includes("YOUR_WEB_CLIENT_ID_HERE")) {
                    throw new Error("Google Client ID is not configured in .env.local.");
                }

                const response = await signIn({
                    clientId,
                    scopes: ['openid', 'email', 'profile']
                });

                if (!response || !response.idToken) {
                    throw new Error("Native Google Sign-In did not return an ID token.");
                }

                const credential = GoogleAuthProvider.credential(response.idToken);
                // Dynamic import to avoid pulling GAPI into the iOS bundle
                const { signInWithCredential } = await import("firebase/auth");
                const result = await signInWithCredential(auth, credential);
                const email = result?.user?.email;
                if (email) localStorage.setItem("lastGoogleEmail", email);
                return result;
            }

            const lastEmail = (() => {
                try { return localStorage.getItem("lastGoogleEmail"); } catch (e) { return null; }
            })();

            if (selectAccount) {
                provider.setCustomParameters({ prompt: "select_account" });
            } else if (lastEmail) {
                provider.setCustomParameters({ login_hint: lastEmail });
            }

            if (!webAuthMethods) {
                throw new Error("Auth methods are still loading, please try again in a moment.");
            }
            const { signInWithPopup, resolver } = webAuthMethods;
            const result = await signInWithPopup(auth, provider, resolver);
            const email = result?.user?.email;
            if (email) localStorage.setItem("lastGoogleEmail", email);
            return result;
        } catch (err) {
            throw err;
        }
    };

    const signInWithApple = async () => {
        try {
            const isMobileTauri = typeof window !== "undefined" &&
                !!window.__TAURI_INTERNALS__ &&
                (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                 (typeof navigator !== "undefined" && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                 window.location.protocol === "tauri:");

            if (isMobileTauri) {
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                              (typeof navigator !== "undefined" && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                if (!isIOS) {
                    throw new Error("Sign in with Apple is only supported on iOS devices.");
                }

                // 1. Generate a secure random raw nonce
                const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
                const array = new Uint32Array(32);
                if (typeof window !== "undefined" && window.crypto) {
                    window.crypto.getRandomValues(array);
                }
                let rawNonce = '';
                for (let i = 0; i < 32; i++) {
                    rawNonce += charset[array[i] % charset.length];
                }

                // 2. Hash the raw nonce using SHA-256 (hex format, lowercase)
                const hashedNonce = CryptoJS.SHA256(rawNonce).toString(CryptoJS.enc.Hex);

                // 3. Call the native Tauri command
                const { invoke } = await import("@tauri-apps/api/core");
                const rawResult = await invoke("apple_sign_in", { hashedNonce });
                console.log("[AuthContext] apple_sign_in raw result:", rawResult, "type:", typeof rawResult);

                // 4. Parse the JSON response (rawResult is a string from Rust)
                let resultData;
                if (typeof rawResult === "string") {
                    resultData = JSON.parse(rawResult);
                } else if (typeof rawResult === "object" && rawResult !== null) {
                    resultData = rawResult;
                } else {
                    throw new Error("Apple Sign-In returned an unexpected result format.");
                }

                if (!resultData.identityToken) {
                    throw new Error("Apple Sign-In did not return an identity token.");
                }

                // 5. Create the Firebase credential
                const { OAuthProvider, signInWithCredential } = await import("firebase/auth");
                const provider = new OAuthProvider("apple.com");
                const credential = provider.credential({
                    idToken: resultData.identityToken,
                    rawNonce: rawNonce,
                });

                // 6. Sign in to Firebase Auth
                const result = await signInWithCredential(auth, credential);
                return result;

            } else {
                // Website path: standard Firebase popup
                if (!webAuthMethods) {
                    throw new Error("Auth methods are still loading, please try again in a moment.");
                }
                const { OAuthProvider, signInWithPopup, resolver } = webAuthMethods;
                const provider = new OAuthProvider("apple.com");
                provider.addScope("email");
                provider.addScope("name");
                
                const result = await signInWithPopup(auth, provider, resolver);
                return result;
            }
        } catch (err) {
            console.error("[AuthContext] signInWithApple failed:", err);
            throw err;
        }
    };
    ;

    const signInWithGoogleSelectAccount = async () => {
        // Helper to let user pick a different Google account.
        try {
            // Clear the auto-redirect flag so redirect isn't suppressed elsewhere
            try { sessionStorage.removeItem("autoRedirectTried"); } catch (e) { }
            // Force account selection via redirect which is more reliable
            return await signInWithGoogle({ selectAccount: true });
        } catch (e) {
            throw e;
        }
    };

    const forgetLastGoogleEmail = () => {
        try { localStorage.removeItem("lastGoogleEmail"); } catch (e) { }
    };

    const signInAsGuest = async (name) => {
        const result = await signInAnonymously(auth);
        const { updateProfile } = await import("firebase/auth");
        await updateProfile(result.user, { displayName: name });
        return result;
    };

    const logOut = async () => {
        try {
            const uid = auth.currentUser?.uid;
            if (auth.currentUser?.isAnonymous) {
                localStorage.removeItem("guest_folders");
                localStorage.removeItem("guest_notes");
            } else if (uid) {
                try {
                    localStorage.removeItem(`user_folders_${uid}`);
                    localStorage.removeItem(`user_pin_hash_${uid}`);
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(`user_notes_${uid}_`)) {
                            localStorage.removeItem(key);
                        }
                    }
                } catch (e) { }
            }
            // Prevent auto-redirect from firing immediately after logout
            try { sessionStorage.setItem("autoRedirectTried", "1"); } catch (e) { }
            // Forget the saved email so chooser doesn't auto-select next time
            try { localStorage.removeItem("lastGoogleEmail"); } catch (e) { }
        } catch (e) { }
        await signOut(auth);
    };

    const deleteAccount = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const uid = currentUser.uid;

        // 1. Delete data from Firestore / local storage
        await deleteUserAccountData(uid);

        // 2. Delete user from Firebase Auth (if not guest)
        if (!currentUser.isAnonymous) {
            await deleteUser(currentUser);
        }

        // Clean up lastGoogleEmail or other state
        try { localStorage.removeItem("lastGoogleEmail"); } catch (e) { }
        try { sessionStorage.setItem("autoRedirectTried", "1"); } catch (e) { }

        // 3. Log out / Sign out
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleSelectAccount, forgetLastGoogleEmail, signInAsGuest, logOut, deleteAccount, signInWithApple }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
