"use client";
import { useState, useRef, useEffect } from "react";
import CryptoJS from "crypto-js";
import { FiLock, FiUnlock, FiX } from "react-icons/fi";

export default function PinLockScreen({
    mode = "unlock", // "unlock" | "set"
    title,
    description,
    correctPinHash,
    onSuccess, // (pin) => void
    onCancel,
    inline = false,
}) {
    const [pin, setPin] = useState("");
    const [step, setStep] = useState(mode === "set" ? 1 : 0); // 1 = first entry, 2 = confirm entry (for 'set' mode)
    const [firstPin, setFirstPin] = useState("");
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const inputRef = useRef(null);

    // Auto focus the hidden input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Also focus when clicking the container
    const handleContainerClick = () => {
        if (inputRef.current) {
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
        if (mode === "unlock") {
            const hash = CryptoJS.SHA256(enteredPin).toString();
            if (hash === correctPinHash) {
                onSuccess(enteredPin);
            } else {
                triggerError("Incorrect PIN");
            }
        } else if (mode === "set") {
            if (step === 1) {
                setFirstPin(enteredPin);
                setPin("");
                setStep(2);
                setError("");
                // refocus
                setTimeout(() => inputRef.current?.focus(), 50);
            } else if (step === 2) {
                if (enteredPin === firstPin) {
                    onSuccess(enteredPin);
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

    const triggerError = (msg) => {
        setError(msg);
        setShake(true);
        // vibrate if API available
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(200);
        }
        setTimeout(() => {
            setShake(false);
            setPin("");
        }, 500);
    };

    const displayTitle = title || (mode === "set" ? (step === 1 ? "Set 4-Digit PIN" : "Confirm 4-Digit PIN") : "Locked Content");
    const displayDesc = description || (mode === "set" ? (step === 1 ? "Enter a PIN to lock this folder or note." : "Re-enter the PIN to confirm.") : "Please enter the 4-digit PIN to access this.");

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
            {onCancel && (
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

            {/* Error Message */}
            {error ? (
                <div className="text-xs font-semibold text-destructive mt-4 animate-fade-in text-center h-4 pin-error-space">
                    {error}
                </div>
            ) : (
                <div className="h-4 mt-4 pin-error-space" />
            )}
        </div>
    );

    if (inline) {
        return (
            <div className="w-full h-full flex items-center justify-center py-10 px-4">
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
