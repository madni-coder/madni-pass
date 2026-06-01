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
        getRedirectResult(auth).catch(() => { });
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            return await signInWithPopup(auth, provider);
        } catch (err) {
            if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
                // Fallback to redirect for browsers that block popups
                await signInWithRedirect(auth, provider);
                return;
            }
            throw err;
        }
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
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithTestCredentials, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
