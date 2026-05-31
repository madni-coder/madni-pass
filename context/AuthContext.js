"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // masterPassword is kept only in memory — never stored anywhere
    const [masterPassword, setMasterPassword] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
            if (!u) setMasterPassword(null);
        });
        return unsubscribe;
    }, []);

    const signUp = async (email, password, master) => {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        setMasterPassword(master);
        return cred;
    };

    const signIn = async (email, password, master) => {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        setMasterPassword(master);
        return cred;
    };

    const logOut = async () => {
        setMasterPassword(null);
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, loading, masterPassword, signUp, signIn, logOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
