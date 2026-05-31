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
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
            {items.map((n) => (
                <div
                    key={n.id}
                    className="px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200"
                    style={{
                        background: n.type === "error" ? "rgba(220,38,38,0.92)" : "rgba(30,30,30,0.92)",
                        color: n.type === "error" ? "#fff" : "#5AF5FA",
                        border: `1px solid ${n.type === "error" ? "rgba(220,38,38,0.4)" : "rgba(90,245,250,0.25)"}`,
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
