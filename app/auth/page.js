"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { FcGoogle } from "react-icons/fc";
import { FiSun, FiMoon } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthPage() {
    const { user, signInWithGoogle, signInWithGoogleSelectAccount, forgetLastGoogleEmail, signInAsGuest, loading } = useAuth();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const router = useRouter();
    const [signingIn, setSigningIn] = useState(false);
    const [error, setError] = useState("");
    const [showGuestForm, setShowGuestForm] = useState(false);
    const [guestName, setGuestName] = useState("");

    const [introCompleted, setIntroCompleted] = useState(false);
    const [introFadeOut, setIntroFadeOut] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const activeTheme = mounted ? resolvedTheme : "light";

    useEffect(() => {
        // Run intro for 1.8 seconds (1.5s active + 0.3s fadeout transition)
        const timer = setTimeout(() => {
            setIntroFadeOut(true);
            const fadeTimer = setTimeout(() => {
                setIntroCompleted(true);
            }, 300);
            return () => clearTimeout(fadeTimer);
        }, 1800);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!loading && user) router.replace("/");
    }, [user, loading, router]);

    useEffect(() => {
        const handleBackButton = (e) => {
            if (showGuestForm) {
                setShowGuestForm(false);
            } else {
                const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
                if (isTauri) {
                    import("@tauri-apps/api/core").then(({ invoke }) => {
                        invoke("exit_app").catch(() => { });
                    }).catch(() => { });
                }
            }
        };
        window.addEventListener("android-back-button", handleBackButton);
        return () => {
            window.removeEventListener("android-back-button", handleBackButton);
        };
    }, [showGuestForm]);

    const getFriendlyError = (code) => {
        switch (code) {
            case "auth/popup-blocked": return "Browser blocked the popup. Please allow popups and try again.";
            case "auth/popup-closed-by-user": return "Sign in cancelled. Please try again.";
            case "auth/network-request-failed": return "Please check your internet connection and try again.";
            case "auth/too-many-requests": return "Too many requests. Please try again later.";
            case "auth/user-disabled": return "This account has been disabled.";
            default: return "Sign in failed. Please try again.";
        }
    };

    const handleGoogle = async () => {
        setSigningIn(true);
        setError("");
        try {
            await signInWithGoogle();
            router.replace("/");
        } catch (e) {
            console.error("Google sign in error:", e);
            const msg = e?.code ? getFriendlyError(e.code) : (e?.message || String(e));
            setError(msg);
        } finally {
            setSigningIn(false);
        }
    };

    const handleGuestLogin = async () => {
        if (!guestName.trim()) return;
        setSigningIn(true);
        setError("");
        try {
            await signInAsGuest(guestName.trim());
            router.replace("/");
        } catch (e) {
            console.error("Guest login error:", e);
            const msg = e?.code ? getFriendlyError(e.code) : (e?.message || String(e));
            setError(msg);
        } finally {
            setSigningIn(false);
        }
    };



    const showIntro = loading || !introCompleted;

    if (showIntro) {
        return (
            <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background bg-auth-pattern transition-all duration-300 ${introFadeOut && !loading ? 'animate-intro-container-fadeout' : ''}`}>
                {mounted && (
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="fixed top-[calc(1.5rem+env(safe-area-inset-top,0px))] right-6 z-50 w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border/80 text-foreground hover:bg-muted/80 shadow-md active:scale-95 transition-all duration-150"
                        aria-label="Toggle Theme"
                    >
                        {theme === "dark" ? <FiSun size={18} className="text-yellow-400" /> : <FiMoon size={18} className="text-slate-700" />}
                    </button>
                )}

                <div className="flex flex-col items-center gap-6 z-10">
                    <div className="w-28 h-28 rounded-full overflow-hidden border border-border/40 shadow-xl flex items-center justify-center animate-intro-logo bg-card">
                        <img
                            src="/lightLogo.png"
                            alt="Lazy Notes"
                            className="w-full h-full object-cover dark:hidden"
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/lazyNoteIcon.png'; }}
                        />
                        <img
                            src="/lazyNoteIcon.png"
                            alt="Lazy Notes"
                            className="w-full h-full object-cover hidden dark:block"
                        />
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <h1 className="animate-intro-text text-3xl font-extrabold tracking-widest text-foreground">
                            Lazy <span className="text-primary">Notes</span>
                        </h1>
                        <p className="animate-intro-text text-xs text-muted-foreground tracking-wide" style={{ animationDelay: '0.4s' }}>
                            Just Note Like Lazy Person
                        </p>
                    </div>

                    {/* Tech Loader Line */}
                    <div className="w-24 h-[3px] bg-muted rounded-full overflow-hidden relative mt-2">
                        <div className="absolute top-0 bottom-0 left-0 bg-primary animate-intro-loader rounded-full" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center bg-background bg-auth-pattern overflow-hidden px-4">
            {mounted && (
                <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="fixed top-[calc(1.5rem+env(safe-area-inset-top,0px))] right-6 z-50 w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border/80 text-foreground hover:bg-muted/80 shadow-md active:scale-95 transition-all duration-150"
                    aria-label="Toggle Theme"
                >
                    {theme === "dark" ? <FiSun size={18} className="text-yellow-400" /> : <FiMoon size={18} className="text-slate-700" />}
                </button>
            )}

            <div className="w-full max-w-md p-8 rounded-2xl border border-border/80 bg-card/75 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] space-y-6 z-10 animate-card-enter">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full overflow-hidden border border-border/40 shadow-md flex items-center justify-center hover:scale-105 transition-transform duration-300 bg-card">
                        <img
                            src="/lightLogo.png"
                            alt="Lazy Notes"
                            className="w-full h-full object-cover dark:hidden"
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/lazyNoteIcon.png'; }}
                        />
                        <img
                            src="/lazyNoteIcon.png"
                            alt="Lazy Notes"
                            className="w-full h-full object-cover hidden dark:block"
                        />
                    </div>
                    <div className="text-center space-y-1">
                        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                            Lazy <span className="text-primary">Notes</span>
                        </h1>
                        <p className="text-xs text-muted-foreground">Just Note Like A Lazy Person</p>
                    </div>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive text-center font-medium animate-pulse">
                        {error}
                    </div>
                )}



                <div className="space-y-3">
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={() => setShowGuestForm((s) => !s)}
                            aria-expanded={showGuestForm}
                            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/15 active:scale-95"
                        >
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                            </span>
                            {showGuestForm ? "Go Back to Sign In" : "Continue as Guest"}
                        </button>
                    </div>

                    {showGuestForm && (
                        <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/50 animate-card-enter">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your Name</label>
                                <Input
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="h-10 rounded-lg bg-background border-border text-foreground"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleGuestLogin();
                                    }}
                                />
                            </div>

                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                                ⚠️ <strong>Note:</strong> Your data will not be saved in the cloud; it will only remain on your device.
                            </div>

                            <Button
                                onClick={handleGuestLogin}
                                disabled={signingIn || !guestName.trim()}
                                className="w-full h-10 mt-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shadow-sm disabled:opacity-50"
                            >
                                {signingIn ? "Entering..." : "Start as Guest"}
                            </Button>
                        </div>
                    )}
                </div>

                {!showGuestForm && (
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-3 text-muted-foreground font-semibold tracking-wider text-[10px]">Or</span>
                        </div>
                    </div>
                )}

                {!showGuestForm && (
                    <Button
                        onClick={handleGoogle}
                        disabled={signingIn}
                        className="w-full h-12 gap-3 text-sm font-semibold rounded-xl bg-background border border-border hover:bg-muted/80 shadow-sm active:scale-[0.98] transition-all duration-150 text-foreground"
                        variant="outline"
                    >
                        <FcGoogle size={20} />
                        {signingIn ? "Signing in..." : "Continue with Google"}
                    </Button>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-border/40 text-xs">
                    <button
                        type="button"
                        onClick={() => signInWithGoogleSelectAccount()}
                        className="text-primary hover:underline font-medium transition-all"
                    >
                        Use different account
                    </button>
                   
                </div>

                <div className="text-center pt-2 text-[10px] text-muted-foreground/60 border-t border-border/20">
                    By using Lazy Notes, you agree to our{" "}
                    <Link href="/privacy" className="text-primary hover:underline font-semibold transition-all">
                        Privacy Policy
                    </Link>
                </div>
            </div>
        </div>
    );
}

