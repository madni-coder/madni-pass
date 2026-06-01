"use client";
import { useState, useEffect } from "react";
import { _subscribe } from "@/lib/notify";

export default function Notifications() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        return _subscribe((n) => {
            setItems((prev) => [...prev, n]);
            setTimeout(() => {
                setItems((prev) => prev.filter((x) => x.id !== n.id));
            }, 2800);
        });
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="fixed bottom-5 left-1/2 z-9999 flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-none">
            {items.map((n) => (
                <div
                    key={n.id}
                    className="px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200"
                    style={{
                        background: n.type === "error" ? "color-mix(in srgb, var(--destructive) 88%, black)" : "color-mix(in srgb, var(--card) 82%, black)",
                        color: n.type === "error" ? "var(--destructive-foreground)" : "var(--primary)",
                        border: `1px solid ${n.type === "error" ? "color-mix(in srgb, var(--destructive) 55%, transparent)" : "color-mix(in srgb, var(--primary) 28%, transparent)"}`,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                    }}
                >
                    {n.message}
                </div>
            ))}
        </div>
    );
}
