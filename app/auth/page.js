"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiLock } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
    const { user, signInWithGoogle, loading } = useAuth();
    const router = useRouter();
    const [signingIn, setSigningIn] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!loading && user) router.replace("/");
    }, [user, loading, router]);

    const handleGoogle = async () => {
        setSigningIn(true);
        setError("");
        try {
            await signInWithGoogle();
            router.replace("/");
        } catch (e) {
            setError(e.message || "Sign in failed");
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

                <Button onClick={handleGoogle} disabled={signingIn} className="w-full gap-2" variant="outline">
                    <FcGoogle size={18} />
                    {signingIn ? "Signing in..." : "Continue with Google"}
                </Button>
            </div>
        </div>
    );
}
