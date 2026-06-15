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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("[AuthContext] Registering onAuthStateChanged. Auth instance:", auth);
        try {
            const unsubscribe = onAuthStateChanged(auth, (u) => {
                console.log("[AuthContext] onAuthStateChanged fired. User:", u ? u.uid : "null");
                setUser(u);
                setLoading(false);
            });
            
            // Add iOS platform class if running on iOS device/simulator
            if (typeof window !== "undefined") {
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

    const signInWithGoogle = async (opts = {}) => {
        const { selectAccount = false } = opts;
        const provider = new GoogleAuthProvider();

        try {
            // Detect Tauri iOS/Android context — use native plugin instead of popup.
            // Check: __TAURI_INTERNALS__ present AND (mobile UA OR tauri:// protocol)
            const isMobileTauri = typeof window !== "undefined" &&
                !!window.__TAURI_INTERNALS__ &&
                (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                 window.location.protocol === "tauri:");

            if (isMobileTauri) {
                const { signIn } = await import('@choochmeque/tauri-plugin-google-auth-api');
                let clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

            // Dynamic import signInWithPopup + resolver only on desktop web path.
            // This prevents gapi.iframes from ever loading on Tauri iOS.
            const [{ signInWithPopup }, resolver] = await Promise.all([
                import(/* webpackPrefetch: false, webpackPreload: false */ "firebase/auth"),
                getBrowserPopupRedirectResolver(),
            ]);
            const result = await signInWithPopup(auth, provider, resolver);
            const email = result?.user?.email;
            if (email) localStorage.setItem("lastGoogleEmail", email);
            return result;
        } catch (err) {
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
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleSelectAccount, forgetLastGoogleEmail, signInAsGuest, logOut, deleteAccount }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
