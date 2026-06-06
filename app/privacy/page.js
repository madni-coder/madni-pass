"use client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { FiArrowLeft, FiShield, FiLock, FiFolder, FiImage, FiFileText, FiEyeOff, FiKey, FiSun, FiMoon } from "react-icons/fi";

export default function PrivacyPage() {
    const router = useRouter();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const activeTheme = mounted ? resolvedTheme : "dark";

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/");
        }
    };

    return (
        <div className="min-h-screen w-full bg-background bg-auth-pattern py-12 px-4 sm:px-6 lg:px-8 relative overflow-y-auto">
            {/* Theme Toggle Button */}
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
                {/* Header Navigation */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleBack}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-card border border-border text-foreground hover:bg-muted shadow-md active:scale-95 transition-all duration-150 cursor-pointer"
                        title="Go Back"
                    >
                        <FiArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <FiShield className="text-primary" size={24} />
                        <h1 className="text-xl font-bold text-foreground">Privacy Policy</h1>
                    </div>
                </div>

                {/* Hero Section */}
                <div className="p-6 sm:p-8 rounded-3xl border border-border bg-card/75 backdrop-blur-xl shadow-xl space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <FiLock size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Zero-Knowledge Data Protection</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Your privacy is guaranteed by mathematics, not just promises.</p>
                        </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        At <strong>Lazy Notes</strong>, we implement strict zero-knowledge security protocols. All your sensitive information is encrypted locally on your device prior to cloud synchronization. We cannot read, see, or share your data under any circumstances.
                    </p>
                </div>

                {/* Privacy Points Grouped in Cards */}
                <div className="space-y-6">
                    {/* Folder Encryption Points */}
                    <div className="p-6 rounded-3xl border border-border bg-card/50 hover:bg-card/75 hover:shadow-lg transition-all duration-300 space-y-3">
                        <div className="flex items-center gap-3">
                            <FiFolder className="text-primary" size={20} />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">1. Folder Name Encryption</h3>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-2 pl-2">
                            <li>Folder names are encrypted on the client-side using <strong>AES-256</strong> symmetric key encryption before syncing.</li>
                            <li>The encryption key is generated locally using your Firebase unique identifier (UID).</li>
                            <li>In the cloud database (Firestore), folder names appear as randomized cryptographic ciphertext (e.g. <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono text-primary">U2FsdGVkX19...</code>).</li>
                            <li>Folder structures are only readable by you and are decrypted in real-time when you open the app.</li>
                        </ul>
                    </div>

                    {/* Note Content Encryption Points */}
                    <div className="p-6 rounded-3xl border border-border bg-card/50 hover:bg-card/75 hover:shadow-lg transition-all duration-300 space-y-3">
                        <div className="flex items-center gap-3">
                            <FiFileText className="text-primary" size={20} />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">2. Note Title & Content Security</h3>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-2 pl-2">
                            <li>Note titles and contents are completely encrypted on your device using <strong>AES-256</strong>.</li>
                            <li>No plain-text credentials, passwords, usernames, or secrets ever hit the Firebase database.</li>
                            <li>Search indexes and previews are calculated locally on your decrypted data; they are never uploaded to the servers.</li>
                            <li>Your data remains secure even if database configurations are compromised or accessed by Firebase administrators.</li>
                        </ul>
                    </div>

                    {/* Image/Attachment Encryption Points */}
                    <div className="p-6 rounded-3xl border border-border bg-card/50 hover:bg-card/75 hover:shadow-lg transition-all duration-300 space-y-3">
                        <div className="flex items-center gap-3">
                            <FiImage className="text-primary" size={20} />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">3. Image & Media Encryption</h3>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-2 pl-2">
                            <li>Attached images undergo local client-side compression to minimize bandwidth and storage requirements.</li>
                            <li>Compressed image binary data is converted to base64 formatting and AES-256 encrypted using your master key.</li>
                            <li>The original image file name is also fully encrypted client-side using AES-256 before database saving.</li>
                            <li>The encrypted image package is stored directly in Firestore, preventing any unauthorized metadata extraction or image previewing.</li>
                        </ul>
                    </div>

                    {/* Keys & Transmission Points */}
                    <div className="p-6 rounded-3xl border border-border bg-card/50 hover:bg-card/75 hover:shadow-lg transition-all duration-300 space-y-3">
                        <div className="flex items-center gap-3">
                            <FiKey className="text-primary" size={20} />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">4. Decryption Keys & Master Password</h3>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-2 pl-2">
                            <li>Your decryption keys are created client-side and reside strictly in your device's runtime memory or temporary session storage.</li>
                            <li>Raw decryption keys and custom master passwords are never transmitted to our servers or stored in any database.</li>
                            <li>If a global lock PIN is configured, the PIN is SHA-256 hashed locally, and only the cryptographic hash is saved to verify correct input.</li>
                        </ul>
                    </div>

                    {/* Guest Mode & Local Data Storage */}
                    <div className="p-6 rounded-3xl border border-border bg-card/50 hover:bg-card/75 hover:shadow-lg transition-all duration-300 space-y-3">
                        <div className="flex items-center gap-3">
                            <FiEyeOff className="text-primary" size={20} />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">5. Guest Mode & Local Storage</h3>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-muted-foreground space-y-2 pl-2">
                            <li>When using the app in <strong>Guest Mode</strong>, no data of any kind is synced to Firebase or the cloud.</li>
                            <li>All data, folders, notes, and compressed images are stored directly in your browser's local sandbox (`localStorage`).</li>
                            <li>Logging out of Guest Mode wipes all stored credentials, folders, and notes permanently from the browser sandbox.</li>
                        </ul>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="text-center text-xs text-muted-foreground/50 pt-4 pb-8">
                    Lazy Notes © {new Date().getFullYear()}. Secure, client-encrypted personal note system.
                </div>
            </div>
        </div>
    );
}
