"use client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { FiArrowLeft, FiSun, FiMoon, FiMail, FiHelpCircle, FiMapPin, FiMessageSquare, FiCopy, FiCheck } from "react-icons/fi";

export default function SupportPage() {
    const router = useRouter();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCopy = async () => {
        const textToCopy = "support.lazynotes@gmail.com";
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                textArea.style.position = "fixed";
                textArea.style.top = "0";
                textArea.style.left = "0";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand("copy");
                } catch (err) {
                    console.error("Fallback copy failed", err);
                }
                document.body.removeChild(textArea);
            }
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/");
        }
    };

    return (
        <div className="min-h-screen w-full bg-background bg-auth-pattern py-12 px-4 sm:px-6 lg:px-8 relative overflow-y-auto">
            {mounted && (
                <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="fixed top-6 right-6 z-50 w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border text-foreground hover:bg-muted shadow-md active:scale-95 transition-all duration-150 cursor-pointer"
                    aria-label="Toggle Theme"
                >
                    {theme === "dark" ? <FiSun size={18} className="text-yellow-400" /> : <FiMoon size={18} className="text-slate-700" />}
                </button>
            )}

            <div className="max-w-3xl mx-auto space-y-8 animate-card-enter">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleBack}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border text-foreground hover:bg-muted shadow-md active:scale-95 transition-all duration-150 cursor-pointer"
                        title="Go Back"
                    >
                        <FiArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <FiHelpCircle className="text-primary" size={24} />
                        <h1 className="text-xl font-bold text-foreground">Support</h1>
                    </div>
                </div>

                <div className="p-6 sm:p-8 rounded-3xl border border-border bg-card/75 backdrop-blur-xl shadow-xl space-y-6 text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <FiMessageSquare size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground">How can we help you?</h2>
                        <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto leading-relaxed">
                            Whether you need help regarding app issues, want to share general feedback, or have feature enhancement requests, we are here to assist you.
                        </p>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2 pt-4">
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                                <FiMail size={18} />
                            </div>
                            <h3 className="font-bold text-foreground text-sm mb-1">Email Support</h3>
                            <div className="flex items-center gap-2 mt-1 bg-background/50 rounded-lg p-1 border border-border/40 w-full justify-between max-w-[240px]">
                                <a 
                                    href="mailto:support.lazynotes@gmail.com" 
                                    className="text-[13px] text-muted-foreground hover:text-primary transition-colors truncate pl-2 flex-1 text-left"
                                    title="support.lazynotes@gmail.com"
                                >
                                    support.lazynotes@gmail.com
                                </a>
                                <button
                                    onClick={handleCopy}
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                    title="Copy email"
                                >
                                    {isCopied ? <FiCheck size={14} className="text-green-500" /> : <FiCopy size={14} />}
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                                <FiMapPin size={18} />
                            </div>
                            <h3 className="font-bold text-foreground text-sm mb-1">Legal Address</h3>
                            <p className="text-sm text-muted-foreground">
                                Raipur,Chhattisgarh, India
                            </p>
                        </div>
                    </div>
                </div>

                <div className="text-center text-xs text-muted-foreground/50 pt-4 pb-8">
                    Lazy Notes © {new Date().getFullYear()}. Secure, client-encrypted personal note system.
                </div>
            </div>
        </div>
    );
}
