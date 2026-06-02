"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createNote, updateNote } from "@/lib/db";
import { storeImage, getImageSrc } from "@/lib/imageStore";
import { encrypt } from "@/lib/crypto";
import { notify } from "@/lib/notify";
import { FiSearch, FiX, FiChevronUp, FiChevronDown, FiImage, FiLoader, FiCheck, FiMoreHorizontal, FiHash, FiCopy, FiWifiOff, FiArrowLeft } from "react-icons/fi";

function escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findMatches(text, query) {
    if (!query || !text) return [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const out = [];
    let m;
    while ((m = regex.exec(text)) !== null) out.push(m.index);
    return out;
}

function parseCredentials(content) {
    if (!content) return [];
    const lines = content.split("\n");
    const creds = [];
    const regex = /^\s*(?:[\w\s\/]+?\s+)?(email|mail|gmail|username|user|login|id|password|pass|pswd|pin|key|token|link|website|url)\s*[:\-=\s]\s*(.+)$/i;
    lines.forEach((lineText, index) => {
        const m = regex.exec(lineText);
        if (m && m[2].trim().length > 0) {
            creds.push({
                lineIndex: index,
                key: m[1].toLowerCase(),
                label: m[1],
                value: m[2].trim()
            });
        }
    });
    return creds;
}

let canvas = null;
function getTextWidth(text, font) {
    if (typeof window === "undefined") return 0;
    if (!canvas) {
        canvas = document.createElement("canvas");
    }
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
}

function copyToClipboard(text) {
    if (typeof window === "undefined") return Promise.reject(new Error("No window context"));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            const successful = document.execCommand("copy");
            document.body.removeChild(textarea);
            if (successful) {
                return Promise.resolve();
            } else {
                return Promise.reject(new Error("execCommand copy failed"));
            }
        } catch (err) {
            document.body.removeChild(textarea);
            return Promise.reject(err);
        }
    }
}

function CredentialCopyButton({ value, label, top, left, lineHeight }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e) => {
        e.stopPropagation();
        copyToClipboard(value).then(() => {
            setCopied(true);
            notify(`${label} copied!`);
            setTimeout(() => setCopied(false), 2000);
        }).catch((err) => {
            notify("Copy failed: " + err.message, "error");
        });
    };

    return (
        <button
            onClick={handleCopy}
            style={{
                position: "absolute",
                top: top + (lineHeight - 24) / 2,
                left: `${left}px`,
                pointerEvents: "auto",
                zIndex: 10,
            }}
            className={`w-6 h-6 flex items-center justify-center rounded-md border transition-all duration-150 active:scale-95 shadow-sm ${
                copied
                    ? "bg-green-500/25 border-green-500 text-green-400 font-bold scale-105"
                    : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/25 hover:border-primary/40 hover:scale-105"
            }`}
            title={`Copy ${label}`}
        >
            {copied ? <FiCheck size={11} className="text-green-400" /> : <FiCopy size={11} />}
        </button>
    );
}

function buildHighlightHtml(text, query, matches, activeIdx) {
    if (!text) return "";
    if (!query || matches.length === 0) return escHtml(text);
    const qLen = query.length;
    let result = "";
    let pos = 0;
    matches.forEach((start, i) => {
        result += escHtml(text.slice(pos, start));
        if (i === activeIdx) {
            result += `<mark style="background:#f59e0b;color:#111827;border-radius:3px;padding:0 1px">${escHtml(text.slice(start, start + qLen))}</mark>`;
        } else {
            result += `<mark style="background:rgba(253,224,71,0.25);color:#fde047;border-radius:3px;padding:0 1px">${escHtml(text.slice(start, start + qLen))}</mark>`;
        }
        pos = start + qLen;
    });
    result += escHtml(text.slice(pos));
    return result;
}

export default function NoteViewer({ note, folderId, onSave, onClose, userId }) {
    const isNew = !note?.id;
    const [title, setTitle] = useState(note?.title || "");
    const [content, setContent] = useState(note?.content || "");
    const [images, setImages] = useState(note?.images || []);
    const [uploading, setUploading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saved"
    const [noteCreated, setNoteCreated] = useState(!!note?.id); // for showing images row
    const [inSearch, setInSearch] = useState("");
    const [matchIdx, setMatchIdx] = useState(0);
    const [sumResult, setSumResult] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
    const [fontStyle, setFontStyle] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("note_font_style") || "sans";
        }
        return "sans";
    });

    const handleFontStyleChange = (style) => {
        setFontStyle(style);
        localStorage.setItem("note_font_style", style);
    };

    const [scrollTop, setScrollTop] = useState(0);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [menuOpen]);
    const noteIdRef = useRef(note?.id || null);
    const imagesRef = useRef(images);
    const srRef = useRef(null);
    const bdRef = useRef(null);
    const taRef = useRef(null);
    const fileRef = useRef(null);
    const saveTimerRef = useRef(null);
    const creatingRef = useRef(false);
    useEffect(() => { imagesRef.current = images; }, [images]);

    // Close on Esc key
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const matches = findMatches(content, inSearch);
    const detectedCreds = useMemo(() => parseCredentials(content), [content]);

    const syncScroll = useCallback(() => {
        if (bdRef.current && taRef.current) {
            bdRef.current.scrollTop = taRef.current.scrollTop;
            bdRef.current.scrollLeft = taRef.current.scrollLeft;
        }
        if (taRef.current) {
            setScrollTop(taRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        if (taRef.current) {
            setScrollTop(taRef.current.scrollTop);
        }
    }, [content]);

    const scrollToMatch = useCallback((idx) => {
        const ta = taRef.current;
        if (!ta || matches.length === 0) return;
        const i = ((idx % matches.length) + matches.length) % matches.length;
        setMatchIdx(i);
        ta.setSelectionRange(matches[i], matches[i] + inSearch.length);
        const linesBefore = content.slice(0, matches[i]).split("\n").length;
        ta.scrollTop = Math.max(0, (linesBefore - 4) * 20);
        syncScroll();
    }, [matches, inSearch, content, syncScroll]);

    const gotoMatch = useCallback((idx) => {
        scrollToMatch(idx);
        taRef.current?.focus();
    }, [scrollToMatch]);

    useEffect(() => {
        if (inSearch && matches.length > 0) scrollToMatch(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inSearch]);

    // Auto-save: debounce 800ms on title/content change
    useEffect(() => {
        if (!title.trim()) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                // Create note if it doesn't exist yet
                if (!noteIdRef.current) {
                    if (creatingRef.current) return;
                    creatingRef.current = true;
                    try {
                        const master = userId;
                        const encTitle = encrypt(title.trim(), master);
                        const encContent = encrypt(content, master);
                        const id = await createNote(userId, folderId ?? null, encTitle, encContent);
                        noteIdRef.current = id;
                        setNoteCreated(true);
                        onSave({ id, title: title.trim(), content, images: [] });
                    } finally {
                        creatingRef.current = false;
                    }
                } else {
                    const master = userId;
                    const encTitle = encrypt(title.trim(), master);
                    const encContent = encrypt(content, master);
                    await updateNote(noteIdRef.current, encTitle, encContent, imagesRef.current);
                    onSave({ id: noteIdRef.current, title: title.trim(), content, images: imagesRef.current });
                }
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (err) {
                notify("Failed to save: " + err.message, "error");
                setSaveStatus("idle");
            }
        }, 800);
        return () => clearTimeout(saveTimerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, content]);

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { notify("Image 10MB se badi nahi honi chahiye", "error"); return; }
        if (!noteIdRef.current) { notify("Pehle note ka title likho, phir image daalo", "error"); return; }
        setUploading(true);
        try {
            const master = userId;
            const imgData = await storeImage(file, master);
            const newImgs = [...imagesRef.current, imgData];
            setImages(newImgs);
            const encTitle = encrypt(title, master);
            const encContent = encrypt(content, master);
            await updateNote(noteIdRef.current, encTitle, encContent, newImgs);
            onSave({ id: noteIdRef.current, title, content, images: newImgs });
            notify("Image attached!");
        } catch (err) { notify("Failed to upload image: " + (err?.message || err), "error"); }
        finally { setUploading(false); e.target.value = ""; }
    };

    const displayImages = useMemo(() => {
        const master = userId;
        return images.map(img => ({ ...img, displaySrc: getImageSrc(img, master) }));
    }, [images]);

    const handleDeleteImage = async (img, idx) => {
        const newImgs = images.filter((_, i) => i !== idx);
        setImages(newImgs);
        if (noteIdRef.current) {
            const master = userId;
            const encTitle = encrypt(title, master);
            const encContent = encrypt(content, master);
            await updateNote(noteIdRef.current, encTitle, encContent, newImgs);
            onSave({ id: noteIdRef.current, title, content, images: newImgs });
        }
        notify("Image removed");
    };

    const sharedTextStyle = {
        fontFamily: fontStyle === "mono"
            ? "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            : fontStyle === "serif"
                ? "var(--font-serif), ui-serif, Georgia, Cambria, serif"
                : "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        fontSize: fontStyle === "mono" ? "13.5px" : "15px",
        lineHeight: fontStyle === "mono" ? "1.65" : "1.6",
        padding: "16px 52px 16px 20px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        tabSize: 4,
    };

    const highlightedHtml = buildHighlightHtml(content, inSearch, matches, matchIdx);

    const credentials = useMemo(() => {
        if (!content) return [];
        const creds = [];
        const re = /^\s*(Email|Username|Password)\s*[:\-]?\s*(.+)$/gim;
        let m;
        while ((m = re.exec(content)) !== null) {
            creds.push({ key: m[1], value: m[2].trim() });
        }
        return creds;
    }, [content]);

    const handleSum = () => {
        const nums = [...content.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
        if (nums.length === 0) { setSumResult({ nums: [], total: 0 }); return; }
        setSumResult({ nums, total: nums.reduce((a, b) => a + b, 0) });
    };

    const handleCopy = () => {
        const full = title ? `${title}\n\n${content}` : content;
        copyToClipboard(full)
            .then(() => notify("Note copied!"))
            .catch((err) => notify("Copy failed: " + err.message, "error"));
    };

    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 640;
    const panelStyle = isDesktop
        ? {
            position: "fixed",
            zIndex: 1001,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            willChange: "transform",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            width: "min(calc(100vw - 2rem), 56rem)",
            height: "88svh",
            borderRadius: "0.75rem",
            display: "flex",
            flexDirection: "column",
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
        }
        : {
            position: "fixed",
            zIndex: 1001,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
        };

    return (
        <>
            <style>{`[data-bd-scroll]::-webkit-scrollbar{display:none}`}</style>
            {/* Backdrop overlay */}
            <div
                onClick={onClose}
                className="animate-backdrop-fade"
                style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)" }}
            />
            {/* Modal panel */}
            <div style={panelStyle} className="animate-note-open">
                {/* Title area — accented */}
                <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b-2 border-primary/60 bg-card/70">
                    <button
                        onClick={onClose}
                        className="flex sm:hidden w-8 h-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors mr-1 shrink-0"
                        aria-label="Back"
                    >
                        <FiArrowLeft size={18} />
                    </button>
                    <div className="hidden sm:block w-1 h-7 rounded-full bg-primary shrink-0" />
                    <input
                        autoFocus
                        placeholder="Note title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="flex-1 bg-transparent text-foreground text-lg font-bold placeholder:text-muted-foreground/50 focus:outline-none tracking-wide min-w-0"
                    />
                    {/* Auto-save status + three-dots menu */}
                    <span className="shrink-0 flex items-center gap-2 text-xs">
                        {!isOnline && <><FiWifiOff size={12} className="text-yellow-400" /><span className="text-yellow-400">Offline</span></>}
                        {isOnline && saveStatus === "saving" && <><FiLoader size={12} className="animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving...</span></>}
                        {isOnline && saveStatus === "saved" && <><FiCheck size={12} className="text-green-500" /><span className="text-green-500">Saved</span></>}
                        {/* Custom inline menu — avoids z-index portal issues */}
                        <div ref={menuRef} style={{ position: "relative" }}>
                            <button
                                onClick={() => setMenuOpen((o) => !o)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <FiMoreHorizontal size={16} />
                            </button>
                            {menuOpen && (
                                <div style={{
                                    position: "absolute", top: "110%", right: 0,
                                    zIndex: 9999, minWidth: 190,
                                    background: "var(--popover)", border: "1px solid var(--border)",
                                    borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                                    padding: "4px 0",
                                }}>
                                    <div className="px-3 py-2 border-b border-border">
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Typography</div>
                                        <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
                                            {["sans", "serif", "mono"].map((style) => (
                                                <button
                                                    key={style}
                                                    onClick={() => handleFontStyleChange(style)}
                                                    className={`flex-1 text-center py-1 text-[11px] font-medium rounded-md capitalize transition-all select-none ${
                                                        fontStyle === style
                                                            ? "bg-card text-foreground shadow-xs font-semibold"
                                                            : "text-muted-foreground hover:text-foreground hover:bg-card/30"
                                                    }`}
                                                >
                                                    {style}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => { handleSum(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                    >
                                        <span className="text-muted-foreground"><FiHash size={13} /></span>Sum Numbers
                                    </button>
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    <button onClick={() => { handleCopy(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                    >
                                        <span className="text-muted-foreground"><FiCopy size={13} /></span>Copy Note
                                    </button>
                                </div>
                            )}
                        </div>
                        {/* Close button inside flex — no overlap */}
                        <button
                            onClick={onClose}
                            className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                        >
                            <FiX size={18} />
                        </button>
                    </span>
                </div>



                {/* Sum result banner */}
                {sumResult && (
                    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-primary/30 bg-primary/10">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground shrink-0">
                                {sumResult.nums.length} numbers:
                            </span>
                            <div className="flex flex-wrap gap-1">
                                {sumResult.nums.map((n, i) => (
                                    <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">{n % 1 === 0 ? n : n}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-primary">= {sumResult.total % 1 === 0 ? sumResult.total : sumResult.total.toFixed(2)}</span>
                            <button onClick={() => setSumResult(null)} className="text-muted-foreground hover:text-foreground"><FiX size={13} /></button>
                        </div>
                    </div>
                )}

                {/* Internal search bar */}
                <div className="flex items-center gap-2 px-5 py-2 border-b border-border/50 bg-card/40">
                    <FiSearch size={14} className="text-muted-foreground/60 shrink-0" />
                    <input
                        ref={srRef}
                        placeholder="Search in note......"
                        value={inSearch}
                        onChange={(e) => { setInSearch(e.target.value); setMatchIdx(0); }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.shiftKey ? gotoMatch(matchIdx - 1) : gotoMatch(matchIdx + 1); }
                            if (e.key === "Escape") { setInSearch(""); taRef.current?.focus(); }
                        }}
                        className="flex-1 bg-transparent text-sm text-foreground/80 placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                    {inSearch && (
                        <div className="flex items-center gap-1 shrink-0">
                            <span className={`text-xs min-w-9 text-right ${matches.length === 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                {matches.length > 0 ? `${matchIdx + 1}/${matches.length}` : "0"}
                            </span>
                            <button onClick={() => gotoMatch(matchIdx - 1)} disabled={matches.length === 0} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                <FiChevronUp size={14} />
                            </button>
                            <button onClick={() => gotoMatch(matchIdx + 1)} disabled={matches.length === 0} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                                <FiChevronDown size={14} />
                            </button>
                            <button onClick={() => { setInSearch(""); taRef.current?.focus(); }} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                                <FiX size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Notepad area: backdrop highlight + transparent textarea on top */}
                <div className="flex-1 relative overflow-hidden">
                    {/* Highlight backdrop — rendered behind textarea, scrolls in sync */}
                    <div
                        ref={bdRef}
                        data-bd-scroll=""
                        aria-hidden="true"
                        style={{
                            ...sharedTextStyle,
                            color: "var(--foreground)",
                            position: "absolute",
                            inset: 0,
                            overflow: "auto",
                            overflowX: "hidden",
                            msOverflowStyle: "none",
                            scrollbarWidth: "none",
                            pointerEvents: "none",
                            margin: 0,
                            border: "none",
                            zIndex: 0,
                            display: inSearch ? "block" : "none",
                        }}
                        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                    {/* Textarea — transparent text, visible caret */}
                    <textarea
                        ref={taRef}
                        value={content}
                        onChange={(e) => { setContent(e.target.value); syncScroll(); }}
                        onScroll={syncScroll}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); srRef.current?.focus(); }
                        }}
                        style={{
                            ...sharedTextStyle,
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            background: "transparent",
                            color: inSearch ? "transparent" : "var(--foreground)",
                            caretColor: "var(--foreground)",
                            resize: "none",
                            outline: "none",
                            zIndex: 1,
                            overflowY: "auto",
                            willChange: "scroll-position",
                        }}
                        placeholder="Write your credentials here..."
                        spellCheck={false}
                    />
                    {/* Floating inline copy buttons layer */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            zIndex: 2,
                            overflow: "hidden"
                        }}
                    >
                        <div
                            style={{
                                transform: `translateY(-${scrollTop}px)`,
                                position: "relative",
                                height: taRef.current?.scrollHeight || "100%",
                            }}
                        >
                            {detectedCreds.map((cred, idx) => {
                                const lineHeight = parseFloat(sharedTextStyle.lineHeight) * parseFloat(sharedTextStyle.fontSize) || 24;
                                const paddingTop = 16;
                                const top = paddingTop + cred.lineIndex * lineHeight;
                                
                                const font = fontStyle === "mono"
                                    ? "13.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                                    : fontStyle === "serif"
                                        ? "15px ui-serif, Georgia, Cambria, serif"
                                        : "15px ui-sans-serif, system-ui, sans-serif";
                                
                                const linesText = content.split("\n");
                                const lineText = linesText[cred.lineIndex] || "";
                                const textWidth = getTextWidth(lineText, font);
                                
                                 const paddingLeft = 20;
                                const gap = 18;
                                let left = paddingLeft + textWidth + gap;
                                const maxLeft = (taRef.current?.clientWidth || 500) - 32;
                                left = Math.min(left, maxLeft);
                                
                                return (
                                    <CredentialCopyButton
                                        key={idx}
                                        value={cred.value}
                                        label={cred.label}
                                        top={top}
                                        left={left}
                                        lineHeight={lineHeight}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Inline full-size image previews */}
                {noteCreated && images.length > 0 && (
                    <div className="border-t border-border/40 overflow-y-auto flex flex-col gap-3 px-5 py-4" style={{ maxHeight: "45vh" }}>
                        {displayImages.map((img, idx) =>
                            img.displaySrc ? (
                                <div key={idx} className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={img.displaySrc}
                                        alt={img.name}
                                        style={{
                                            maxWidth: "100%",
                                            maxHeight: "40vh",
                                            width: "auto",
                                            height: "auto",
                                            objectFit: "contain",
                                            borderRadius: "0.5rem",
                                            border: "1px solid var(--border)",
                                            display: "block",
                                        }}
                                    />
                                </div>
                            ) : null
                        )}
                    </div>
                )}

                {/* Bottom credential strip removed — inline floating copy remains */}

                {/* Images row */}
                {noteCreated && (
                    <div className="border-t border-border px-5 py-3 flex items-center gap-2 flex-wrap">
                        {displayImages.map((img, idx) => (
                            <div key={idx} className="relative group shrink-0">
                                {img.displaySrc ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={img.displaySrc} alt={img.name} className="w-14 h-14 object-cover rounded-lg border border-border hover:border-primary transition-colors" />
                                ) : (
                                    <div className="w-14 h-14 bg-muted rounded-lg border border-border flex items-center justify-center">
                                        <FiLoader size={12} className="animate-spin text-muted-foreground/60" />
                                    </div>
                                )}
                                <button onClick={() => handleDeleteImage(img, idx)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full items-center justify-center hidden group-hover:flex">
                                    <FiX size={10} className="text-white" />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="w-14 h-14 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground/60 hover:border-primary hover:text-primary transition-colors shrink-0">
                            {uploading ? <FiLoader size={16} className="animate-spin" /> : <FiImage size={16} />}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </div>
                )}
            </div>
        </>
    );
}
