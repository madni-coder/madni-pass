"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiLock } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthPage() {
    const { user, signInWithGoogle, signInWithTestCredentials, loading } = useAuth();
    const router = useRouter();
    const [signingIn, setSigningIn] = useState(false);
    const [error, setError] = useState("");
    const [loginId, setLoginId] = useState("test");
    const [password, setPassword] = useState("123");

    useEffect(() => {
        if (!loading && user) router.replace("/");
    }, [user, loading, router]);

    const getFriendlyError = (code) => {
        switch (code) {
            case "auth/popup-blocked": return "Browser ne popup block kar di. Please allow popups ya dobarah try karo.";
            case "auth/popup-closed-by-user": return "Sign in cancel ho gayi. Dobara try karo.";
            case "auth/network-request-failed": return "Internet connection check karo aur dobara try karo.";
            case "auth/too-many-requests": return "Bahut zyada tries. Thodi der baad try karo.";
            case "auth/user-disabled": return "Ye account disable ho gaya hai.";
            case "auth/invalid-test-credentials": return "Test login ke liye ID `test` aur password `123` use karo.";
            default: return "Sign in fail hua. Dobara try karo.";
        }
    };

    const handleGoogle = async () => {
        setSigningIn(true);
        setError("");
        try {
            await signInWithGoogle();
            router.replace("/");
        } catch (e) {
            setError(getFriendlyError(e.code));
        } finally {
            setSigningIn(false);
        }
    };

    const handleTestLogin = async () => {
        setSigningIn(true);
        setError("");
        try {
            await signInWithTestCredentials(loginId, password);
            router.replace("/");
        } catch (e) {
            setError(getFriendlyError(e.code));
        } finally {
            setSigningIn(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-sm p-8 rounded-xl border border-border bg-card space-y-6">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                        <FiLock size={22} className="text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-bold text-foreground">Madni Notes</h1>
                    <p className="text-sm text-muted-foreground text-center">Apne notes securely store karo</p>
                </div>

                {error && <p className="text-sm text-destructive text-center">{error}</p>}

                <div className="space-y-3">
                    <Input
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        placeholder="User ID"
                        autoComplete="username"
                    />
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoComplete="current-password"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleTestLogin();
                        }}
                    />
                    <Button onClick={handleTestLogin} disabled={signingIn} className="w-full">
                        {signingIn ? "Signing in..." : "Login with Test Account"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">Test login: ID test, password 123</p>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                </div>

                <Button onClick={handleGoogle} disabled={signingIn} className="w-full gap-2" variant="outline">
                    <FcGoogle size={18} />
                    {signingIn ? "Signing in..." : "Continue with Google"}
                </Button>
            </div>
        </div>
    );
}
