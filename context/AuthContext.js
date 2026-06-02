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
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const AuthContext = createContext(null);
const TEST_LOGIN_ID = "test";
const TEST_LOGIN_PASSWORD = "123";

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Handle redirect result (from signInWithRedirect fallback)
        // If a redirect sign-in completed, persist the signed-in user's email
        getRedirectResult(auth)
            .then((result) => {
                try {
                    const email = result?.user?.email;
                    if (email) localStorage.setItem("lastGoogleEmail", email);
                } catch (e) { }
            })
            .catch(() => { });
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);

            // Clear the auto-redirect flag after a successful sign-in.
            if (u) {
                try { sessionStorage.removeItem("autoRedirectTried"); } catch (e) { }
                return;
            }

            // If there's no user but we remember a last Google email, attempt
            // an automatic redirect sign-in once per session. This will take
            // the user away briefly but can sign them in silently if their
            // Google session is active.
            try {
                const lastEmail = localStorage.getItem("lastGoogleEmail");
                const tried = sessionStorage.getItem("autoRedirectTried");
                if (lastEmail && !tried) {
                    sessionStorage.setItem("autoRedirectTried", "1");
                    const provider = new GoogleAuthProvider();
                    try {
                        provider.setCustomParameters({ login_hint: lastEmail });
                        signInWithRedirect(auth, provider);
                    } catch (e) {
                        // swallow errors — we'll let the user trigger manual sign-in
                    }
                }
            } catch (e) { }
        });
        return unsubscribe;
    }, []);

    const signInWithGoogle = async (opts = {}) => {
        const { selectAccount = false } = opts;
        const provider = new GoogleAuthProvider();
        // Try a silent sign-in first if we remember the last-used email.
        try {
            const lastEmail = (() => {
                try { return localStorage.getItem("lastGoogleEmail"); } catch (e) { return null; }
            })();

            if (selectAccount) {
                // Prefer a small popup for account selection (better UX than full redirect).
                try {
                    provider.setCustomParameters({ prompt: "select_account" });
                    const result = await signInWithPopup(auth, provider);
                    const email = result?.user?.email;
                    if (email) localStorage.setItem("lastGoogleEmail", email);
                    return result;
                } catch (popupErr) {
                    // If popup is blocked or closed, fall back to redirect as last resort.
                    if (popupErr.code === "auth/popup-blocked" || popupErr.code === "auth/popup-closed-by-user") {
                        try {
                            provider.setCustomParameters({ prompt: "select_account" });
                            await signInWithRedirect(auth, provider);
                            return;
                        } catch (redirectErr) {
                            // swallow and allow further fall-through
                        }
                    }
                    // other errors: fall through to normal flow which may try silent/interative
                }
            }

            if (!selectAccount && lastEmail) {
                // Attempt a silent popup (prompt=none) which succeeds only if
                // the user still has an active Google session and no interaction
                // is required. This avoids showing the account chooser.
                provider.setCustomParameters({ login_hint: lastEmail, prompt: "none" });
                try {
                    const silentResult = await signInWithPopup(auth, provider);
                    const email = silentResult?.user?.email;
                    if (email) localStorage.setItem("lastGoogleEmail", email);
                    return silentResult;
                } catch (silentErr) {
                    // Silent sign-in failed (interaction required). Fall through
                    // to interactive flows below.
                }
            }

            // Interactive popup: hint the last email so chooser preselects it
            try {
                provider.setCustomParameters({ login_hint: lastEmail || undefined });
                const result = await signInWithPopup(auth, provider);
                const email = result?.user?.email;
                if (email) localStorage.setItem("lastGoogleEmail", email);
                return result;
            } catch (popupErr) {
                // If popup is blocked or closed, fall back to redirect.
                if (popupErr.code === "auth/popup-blocked" || popupErr.code === "auth/popup-closed-by-user") {
                    // provider already has login_hint set above.
                    await signInWithRedirect(auth, provider);
                    return;
                }
                throw popupErr;
            }
        } catch (err) {
            throw err;
        }
    };

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

    const signInWithTestCredentials = async (loginId, password) => {
        if (loginId.trim() !== TEST_LOGIN_ID || password !== TEST_LOGIN_PASSWORD) {
            const err = new Error("Invalid test credentials");
            err.code = "auth/invalid-test-credentials";
            throw err;
        }

        return signInAnonymously(auth);
    };

    const logOut = async () => {
        try {
            // Prevent auto-redirect from firing immediately after logout
            try { sessionStorage.setItem("autoRedirectTried", "1"); } catch (e) { }
            // Forget the saved email so chooser doesn't auto-select next time
            try { localStorage.removeItem("lastGoogleEmail"); } catch (e) { }
        } catch (e) { }
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleSelectAccount, forgetLastGoogleEmail, signInWithTestCredentials, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
