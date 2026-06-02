"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
    signInWithPopup,
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
            const lastEmail = (() => {
                try { return localStorage.getItem("lastGoogleEmail"); } catch (e) { return null; }
            })();

            if (selectAccount) {
                provider.setCustomParameters({ prompt: "select_account" });
                const result = await signInWithPopup(auth, provider);
                const email = result?.user?.email;
                if (email) localStorage.setItem("lastGoogleEmail", email);
                return result;
            }

            if (lastEmail) {
                provider.setCustomParameters({ login_hint: lastEmail, prompt: "none" });
                try {
                    const silentResult = await signInWithPopup(auth, provider);
                    const email = silentResult?.user?.email;
                    if (email) localStorage.setItem("lastGoogleEmail", email);
                    return silentResult;
                } catch (silentErr) {
                    // Silent sign-in failed. Fall through to popup below.
                }
            }

            provider.setCustomParameters({ login_hint: lastEmail || undefined });
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
