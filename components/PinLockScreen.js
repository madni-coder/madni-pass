"use client";
import { useState, useRef, useEffect } from "react";
import CryptoJS from "crypto-js";
import { FiLock, FiUnlock, FiX, FiLoader } from "react-icons/fi";
import { db } from "@/lib/firebase";
import { addDoc, collection, getDocs, query, where, doc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { notify } from "@/lib/notify";

export default function PinLockScreen({
    mode = "unlock", // "unlock" | "set"
    title,
    description,
    correctPinHash,
    onSuccess, // (pin) => void
    onCancel,
    inline = false,
    userId,
    userEmail,
}) {
    const [currentMode, setCurrentMode] = useState(mode);
    const [pin, setPin] = useState("");
    const [step, setStep] = useState(mode === "set" ? 1 : 0); // 1 = first entry, 2 = confirm entry (for 'set' mode)
    const [firstPin, setFirstPin] = useState("");
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const inputRef = useRef(null);

    // Reset Flow States
    const [resetStep, setResetStep] = useState(null); // null | "confirm" | "verify"
    const [resetPin, setResetPin] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const resetInputRef = useRef(null);

    // Sync currentMode state when prop mode changes
    useEffect(() => {
        setCurrentMode(mode);
        setStep(mode === "set" ? 1 : 0);
    }, [mode]);

    // Auto focus the hidden input on mount/step change
    useEffect(() => {
        if (resetStep === "verify") {
            setTimeout(() => resetInputRef.current?.focus(), 50);
        } else if (resetStep === null && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [resetStep, currentMode, step]);

    // Also focus when clicking the container
    const handleContainerClick = () => {
        if (resetStep === "verify") {
            resetInputRef.current?.focus();
        } else if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    const handleInputChange = (e) => {
        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
        setPin(val);
        setError("");

        if (val.length === 4) {
            handleComplete(val);
        }
    };

    const handleComplete = (enteredPin) => {
        if (currentMode === "unlock") {
            const hash = CryptoJS.SHA256(enteredPin).toString();
            if (hash === correctPinHash) {
                onSuccess(enteredPin);
            } else {
                triggerError("Incorrect PIN");
            }
        } else if (currentMode === "set") {
            if (step === 1) {
                setFirstPin(enteredPin);
                setPin("");
                setStep(2);
                setError("");
                // refocus
                setTimeout(() => inputRef.current?.focus(), 50);
            } else if (step === 2) {
                if (enteredPin === firstPin) {
                    handleSaveNewPin(enteredPin);
                } else {
                    triggerError("PINs do not match. Restarting...");
                    // Reset to step 1
                    setTimeout(() => {
                        setStep(1);
                        setFirstPin("");
                    }, 1000);
                }
            }
        }
    };

    const handleSaveNewPin = async (enteredPin) => {
        const hash = CryptoJS.SHA256(enteredPin).toString();
        setError("");
        try {
            if (userId) {
                // Update global PIN config document
                const qPin = query(
                    collection(db, "notes"),
                    where("userId", "==", userId),
                    where("isPinConfig", "==", true)
                );
                const snapPin = await getDocs(qPin);
                if (!snapPin.empty) {
                    await updateDoc(doc(db, "notes", snapPin.docs[0].id), { pinHash: hash });
                } else {
                    await addDoc(collection(db, "notes"), {
                        userId,
                        title: "PIN Config",
                        content: "",
                        isPinConfig: true,
                        pinHash: hash,
                        createdAt: serverTimestamp(),
                    });
                }
                
                // Dispatch event to sync parent state
                window.dispatchEvent(new CustomEvent("globalPinSet", { detail: { pinHash: hash } }));
                notify("New PIN set successfully!");
            }
            onSuccess(enteredPin);
        } catch (err) {
            setError(err.message || "Failed to save new PIN");
        }
    };

    const triggerError = (msg) => {
        setError(msg);
        setShake(true);
        // vibrate if API available
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(200);
        }
        setTimeout(() => {
            setShake(false);
            if (resetStep === "verify") {
                setResetPin("");
            } else {
                setPin("");
            }
        }, 500);
    };

    const handleForgotPinClick = () => {
        if (!userEmail || !userId) {
            setError("User identity not available. Cannot reset PIN.");
            return;
        }
        setResetStep("confirm");
        setError("");
    };

    const handleResetCancel = () => {
        setResetStep(null);
        setError("");
        setPin("");
        setResetPin("");
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSendCode = async () => {
        setIsSending(true);
        setError("");
        try {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const codeHash = CryptoJS.SHA256(code).toString();

            // Delete old reset codes for this user
            const q = query(
                collection(db, "notes"),
                where("userId", "==", userId),
                where("isResetCode", "==", true)
            );
            const snap = await getDocs(q);
            const deletePromises = snap.docs.map((d) => deleteDoc(doc(db, "notes", d.id)));
            await Promise.all(deletePromises);

            // Save new reset code
            await addDoc(collection(db, "notes"), {
                userId,
                title: "Reset Code Temp",
                content: "",
                isResetCode: true,
                codeHash,
                expiresAt: Date.now() + 5 * 60 * 1000, // 5 mins
            });

            // Call API route
            const res = await fetch("/api/send-reset-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: userEmail, code }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to send reset email");
            }

            if (data.devMode) {
                notify("Dev Mode: Code printed to terminal console!");
            } else {
                notify("Reset code sent to your email!");
            }

            setResetPin("");
            setResetStep("verify");
        } catch (err) {
            setError(err.message || "Failed to send code");
        } finally {
            setIsSending(false);
        }
    };

    const handleResetInputChange = (e) => {
        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
        setResetPin(val);
        setError("");

        if (val.length === 6) {
            handleVerifyCode(val);
        }
    };

    const handleVerifyCode = async (enteredCode) => {
        setIsVerifying(true);
        setError("");
        try {
            const hash = CryptoJS.SHA256(enteredCode).toString();

            // Find valid reset code
            const q = query(
                collection(db, "notes"),
                where("userId", "==", userId),
                where("isResetCode", "==", true)
            );
            const snap = await getDocs(q);
            let isValid = false;
            let matchedDocId = null;

            for (const d of snap.docs) {
                const data = d.data();
                if (data.codeHash === hash && data.expiresAt > Date.now()) {
                    isValid = true;
                    matchedDocId = d.id;
                    break;
                }
            }

            if (isValid) {
                // Delete reset code note
                await deleteDoc(doc(db, "notes", matchedDocId));

                // Reset global PIN in Firestore
                const qPin = query(
                    collection(db, "notes"),
                    where("userId", "==", userId),
                    where("isPinConfig", "==", true)
                );
                const snapPin = await getDocs(qPin);
                if (!snapPin.empty) {
                    await updateDoc(doc(db, "notes", snapPin.docs[0].id), { pinHash: null });
                }

                notify("PIN reset successfully!");

                // Trigger page sync event to clear old hash in state
                window.dispatchEvent(new Event("globalPinReset"));

                // Transition directly to setting a new PIN
                setResetStep(null);
                setResetPin("");
                setPin("");
                setFirstPin("");
                setStep(1);
                setCurrentMode("set");
            } else {
                triggerError("Invalid or expired code");
            }
        } catch (err) {
            setError(err.message || "Verification failed");
            setResetPin("");
        } finally {
            setIsVerifying(false);
        }
    };

    const displayTitle = resetStep === "confirm"
        ? "Forgot PIN"
        : resetStep === "verify"
        ? "Enter Verification Code"
        : currentMode === "set"
        ? (step === 1 ? "Set New PIN" : "Confirm New PIN")
        : title || "Locked Content";

    const displayDesc = resetStep === "confirm"
        ? `Send a 6-digit verification code to ${userEmail}?`
        : resetStep === "verify"
        ? `Please enter the 6-digit code sent to ${userEmail}.`
        : currentMode === "set"
        ? (step === 1 ? "Please set a new 4-digit PIN." : "Re-enter the PIN to confirm.")
        : description || "Please enter the 4-digit PIN to access this.";

    const renderBoxes = () => {
        const boxes = [];
        for (let i = 0; i < 4; i++) {
            const hasChar = pin.length > i;
            const isActive = pin.length === i;
            boxes.push(
                <div
                    key={i}
                    className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all duration-200 pin-box ${
                        isActive
                            ? "border-primary bg-primary/5 shadow-[0_0_12px_rgba(76,201,208,0.25)] scale-105"
                            : hasChar
                            ? "border-primary bg-primary/20 text-foreground"
                            : "border-border/60 bg-muted/20 text-muted-foreground/30"
                    }`}
                >
                    {hasChar ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-primary animate-pulse" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                    )}
                </div>
            );
        }
        return boxes;
    };

    const renderResetBoxes = () => {
        const boxes = [];
        for (let i = 0; i < 6; i++) {
            const hasChar = resetPin.length > i;
            const isActive = resetPin.length === i;
            boxes.push(
                <div
                    key={i}
                    className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all duration-200 pin-box ${
                        isActive
                            ? "border-primary bg-primary/5 shadow-[0_0_12px_rgba(76,201,208,0.25)] scale-105"
                            : hasChar
                            ? "border-primary bg-primary/20 text-foreground"
                            : "border-border/60 bg-muted/20 text-muted-foreground/30"
                    }`}
                >
                    {hasChar ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                    )}
                </div>
            );
        }
        return boxes;
    };

    const content = (
        <div 
            onClick={handleContainerClick}
            className={`w-full max-w-sm mx-auto flex flex-col items-center p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-2xl relative select-none pin-card ${
                shake ? "shake-anim border-destructive/50" : ""
            }`}
        >
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20%, 60% { transform: translateX(-6px); }
                    40%, 80% { transform: translateX(6px); }
                }
                .shake-anim {
                    animation: shake 0.4s ease-in-out;
                }
                
                @keyframes pin-scale-in {
                    from {
                        opacity: 0;
                        transform: scale(0.92);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-pin-open {
                    animation: pin-scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                }
                
                /* Mobile Layout (width based) */
                @media (max-width: 640px) {
                    .pin-card {
                        max-width: 280px !important;
                        padding: 1.25rem !important;
                        border-radius: 1.5rem !important;
                    }
                    .pin-icon-header {
                        width: 3rem !important;
                        height: 3rem !important;
                        margin-bottom: 0.75rem !important;
                    }
                    .pin-icon-header svg {
                        width: 1.25rem !important;
                        height: 1.25rem !important;
                    }
                    .pin-title {
                        font-size: 1.1rem !important;
                        margin-bottom: 0.25rem !important;
                    }
                    .pin-desc {
                        font-size: 10px !important;
                        margin-bottom: 0.75rem !important;
                        max-width: 220px !important;
                    }
                    .pin-box {
                        width: 2.25rem !important;
                        height: 2.25rem !important;
                        border-radius: 0.75rem !important;
                    }
                    .pin-box-container {
                        margin-bottom: 0.5rem !important;
                        gap: 0.5rem !important;
                    }
                    .pin-error-space {
                        margin-top: 0.5rem !important;
                        height: 0.75rem !important;
                    }
                    
                    /* Shifting lock modal higher on mobile viewports to avoid overlapping with keyboard */
                    .pin-modal-overlay {
                        align-items: flex-start !important;
                        padding-top: 10svh !important;
                    }
                    .pin-modal-wrapper {
                        margin-top: 0 !important;
                        margin-bottom: 0 !important;
                    }
                    
                    /* Shifting inline folder lock card to the top on mobile viewports */
                    .pin-inline-container {
                        align-items: flex-start !important;
                        padding-top: 1.5rem !important;
                    }
                }

                /* Short height screens (e.g. landscape phones or laptops) */
                @media (max-height: 680px) {
                    .pin-card {
                        padding: 1.25rem !important;
                    }
                    .pin-icon-header {
                        width: 3rem !important;
                        height: 3rem !important;
                        margin-bottom: 0.75rem !important;
                    }
                    .pin-icon-header svg {
                        width: 1.25rem !important;
                        height: 1.25rem !important;
                    }
                    .pin-title {
                        font-size: 1.1rem !important;
                        margin-bottom: 0.25rem !important;
                    }
                    .pin-desc {
                        margin-bottom: 0.75rem !important;
                        max-width: 240px !important;
                    }
                    .pin-box {
                        width: 2.25rem !important;
                        height: 2.25rem !important;
                    }
                    .pin-box-container {
                        margin-bottom: 0.5rem !important;
                        gap: 0.5rem !important;
                    }
                    .pin-error-space {
                        margin-top: 0.5rem !important;
                        height: 1rem !important;
                    }
                }

                @media (max-height: 540px) {
                    .pin-icon-header {
                        display: none !important;
                    }
                    .pin-card {
                        padding: 0.75rem !important;
                    }
                    .pin-title {
                        font-size: 1rem !important;
                    }
                    .pin-desc {
                        display: none !important;
                    }
                    .pin-box-container {
                        margin-bottom: 0.5rem !important;
                    }
                }
            `}</style>

            {/* Close / Cancel Button */}
            {onCancel && resetStep === null && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onCancel();
                    }}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <FiX size={16} />
                </button>
            )}

            {/* Lock Icon Header */}
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5 text-primary border border-primary/20 shadow-[0_0_20px_rgba(76,201,208,0.1)] pin-icon-header">
                {mode === "unlock" ? <FiLock size={28} /> : <FiUnlock size={28} />}
            </div>

            {/* Title & Desc */}
            <h3 className="text-xl font-bold text-foreground text-center mb-1.5 tracking-tight pin-title">
                {displayTitle}
            </h3>
            <p className="text-xs text-muted-foreground text-center mb-6 leading-relaxed max-w-[280px] pin-desc">
                {displayDesc}
            </p>

            {/* Render conditional input interfaces based on resetStep */}
            {resetStep === null ? (
                <>
                    {/* Hidden Input to capture keyboard */}
                    <input
                        ref={inputRef}
                        type="text"
                        maxLength={4}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={pin}
                        onChange={handleInputChange}
                        className="absolute w-0 h-0 opacity-0 pointer-events-none"
                        autoFocus
                    />

                    {/* PIN boxes */}
                    <div className="flex gap-3 pin-box-container">
                        {renderBoxes()}
                    </div>
                </>
            ) : resetStep === "confirm" ? (
                <div className="flex flex-col gap-2 w-full mt-2">
                    <button
                        onClick={handleSendCode}
                        disabled={isSending}
                        className="w-full h-10 flex items-center justify-center rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/95 hover:scale-[1.01] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                        {isSending ? <FiLoader className="animate-spin mr-2" size={16} /> : null}
                        Send Reset Code
                    </button>
                    <button
                        onClick={handleResetCancel}
                        className="w-full h-10 flex items-center justify-center rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 active:scale-95 transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <>
                    {/* Hidden Input for 6 digit reset code */}
                    <input
                        ref={resetInputRef}
                        type="text"
                        maxLength={6}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={resetPin}
                        onChange={handleResetInputChange}
                        className="absolute w-0 h-0 opacity-0 pointer-events-none"
                        autoFocus
                    />

                    {/* PIN boxes for 6 digits */}
                    <div className="flex gap-2 pin-box-container">
                        {renderResetBoxes()}
                    </div>

                    <button
                        onClick={handleResetCancel}
                        disabled={isVerifying}
                        className="text-[11px] text-muted-foreground hover:text-foreground mt-4 hover:underline transition-colors cursor-pointer"
                    >
                        Cancel Reset
                    </button>
                </>
            )}

            {/* Error Message */}
            {error ? (
                <div className="text-xs font-semibold text-destructive mt-4 animate-fade-in text-center h-4 pin-error-space">
                    {error}
                </div>
            ) : (
                <div className="h-4 mt-4 pin-error-space" />
            )}

            {/* Forgot PIN button */}
            {mode === "unlock" && userId && userEmail && resetStep === null && currentMode === "unlock" && (
                <button
                    onClick={handleForgotPinClick}
                    className="text-[11px] text-primary/70 hover:text-primary hover:underline mt-1 transition-colors font-medium cursor-pointer"
                >
                    Forgot PIN?
                </button>
            )}
        </div>
    );

    if (inline) {
        return (
            <div className="w-full h-full flex items-center justify-center py-10 px-4 pin-inline-container">
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-backdrop-fade overflow-y-auto pin-modal-overlay">
            <div className="w-full max-w-sm animate-pin-open my-auto pin-modal-wrapper">
                {content}
            </div>
        </div>
    );
}
