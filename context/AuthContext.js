"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signInAnonymously,
    signOut,
    onAuthStateChanged,
    signInWithCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Handle redirect result if we just returned from Google sign-in
        getRedirectResult(auth)
            .then((result) => {
                if (result) {
                    const email = result?.user?.email;
                    if (email) localStorage.setItem("lastGoogleEmail", email);
                }
            })
            .catch((error) => {
                console.error("Redirect auth error:", error);
            });

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signInWithGoogle = async (opts = {}) => {
        const { selectAccount = false } = opts;
        const provider = new GoogleAuthProvider();

        try {
            const isMobileTauri = typeof window !== "undefined" &&
                !!window.__TAURI_INTERNALS__ &&
                /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

            if (isMobileTauri) {
                const { signIn } = await import('@choochmeque/tauri-plugin-google-auth-api');
                const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                if (!clientId || clientId.includes("YOUR_WEB_CLIENT_ID_HERE")) {
                    throw new Error("Google Web Client ID is not configured in .env.local (NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
                }

                const response = await signIn({
                    clientId,
                    scopes: ['openid', 'email', 'profile']
                });

                if (!response || !response.idToken) {
                    throw new Error("Native Google Sign-In did not return an ID token.");
                }

                const credential = GoogleAuthProvider.credential(response.idToken);
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

            const result = await signInWithPopup(auth, provider);
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

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleSelectAccount, forgetLastGoogleEmail, signInAsGuest, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
