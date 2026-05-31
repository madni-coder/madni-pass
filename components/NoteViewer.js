"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createNote, updateNoteData } from "@/lib/storage";
import { saveImage, removeImage, loadImageUrl } from "@/lib/imageStore";
import { toast } from "sonner";
import { FiSearch, FiX, FiChevronUp, FiChevronDown, FiImage, FiLoader, FiCheck } from "react-icons/fi";

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

export default function NoteViewer({ note, folderId, onSave, onClose }) {
    const isNew = !note?.id;
    const [title, setTitle] = useState(note?.title || "");
    const [content, setContent] = useState(note?.content || "");
    const [images, setImages] = useState(note?.images || []);
    const [imgUrls, setImgUrls] = useState({});
    const [uploading, setUploading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saved"
    const [noteCreated, setNoteCreated] = useState(!!note?.id); // for showing images row
    const [inSearch, setInSearch] = useState("");
    const [matchIdx, setMatchIdx] = useState(0);

    const taRef = useRef(null);
    const bdRef = useRef(null);
    const srRef = useRef(null);
    const fileRef = useRef(null);
    const saveTimerRef = useRef(null);
    const noteIdRef = useRef(note?.id || null);
    const imagesRef = useRef(images);
    useEffect(() => { imagesRef.current = images; }, [images]);

    useEffect(() => {
        if (!note?.images?.length) return;
        note.images.forEach(async (img) => {
            const url = await loadImageUrl(img.id);
            if (url) setImgUrls((p) => ({ ...p, [img.id]: url }));
        });
    }, [note]);

    const matches = findMatches(content, inSearch);

    const syncScroll = useCallback(() => {
        if (bdRef.current && taRef.current) {
            bdRef.current.scrollTop = taRef.current.scrollTop;
            bdRef.current.scrollLeft = taRef.current.scrollLeft;
        }
    }, []);

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
        saveTimerRef.current = setTimeout(() => {
            try {
                if (!noteIdRef.current) {
                    const saved = createNote(folderId ?? null, title.trim(), content);
                    noteIdRef.current = saved.id;
                    setNoteCreated(true);
                    onSave({ ...saved });
                } else {
                    updateNoteData(noteIdRef.current, title.trim(), content, imagesRef.current);
                    onSave({ id: noteIdRef.current, title: title.trim(), content, images: imagesRef.current });
                }
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (err) {
                toast.error("Failed to save: " + err.message);
                setSaveStatus("idle");
            }
        }, 800);
        return () => clearTimeout(saveTimerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, content]);

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!noteIdRef.current) { toast.error("Pehle note ka title likho, phir image daalo"); return; }
        setUploading(true);
        try {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            await saveImage(id, file);
            const url = URL.createObjectURL(file);
            const newImgs = [...imagesRef.current, { id, name: file.name }];
            setImages(newImgs);
            setImgUrls((p) => ({ ...p, [id]: url }));
            updateNoteData(noteIdRef.current, title, content, newImgs);
            toast.success("Image attached!");
        } catch { toast.error("Failed to upload image"); }
        finally { setUploading(false); e.target.value = ""; }
    };

    const handleDeleteImage = async (img, idx) => {
        await removeImage(img.id).catch(() => { });
        const newImgs = images.filter((_, i) => i !== idx);
        setImages(newImgs);
        if (noteIdRef.current) updateNoteData(noteIdRef.current, title, content, newImgs);
        toast.success("Image removed");
    };

    const sharedTextStyle = {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "14px",
        lineHeight: "1.625",
        padding: "16px 20px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        tabSize: 4,
    };

    const highlightedHtml = buildHighlightHtml(content, inSearch, matches, matchIdx);

    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 640;
    const panelStyle = isDesktop
        ? {
            position: "fixed",
            zIndex: 1001,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
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
                style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)" }}
            />
            {/* Modal panel */}
            <div style={panelStyle}>
                {/* Close button — always pinned top-right */}
                <button
                    onClick={onClose}
                    style={{ position: "absolute", top: 10, right: 10, zIndex: 99 }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-muted text-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                >
                    <FiX size={22} />
                </button>

                {/* Title area — accented */}
                <div className="flex items-center gap-3 px-5 pt-4 pb-3 pr-14 border-b-2 border-primary/60 bg-card/70">
                    <div className="w-1 h-7 rounded-full bg-primary shrink-0" />
                    <input
                        autoFocus
                        placeholder="Note title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="flex-1 bg-transparent text-foreground text-lg font-bold placeholder:text-muted-foreground/50 focus:outline-none tracking-wide min-w-0"
                    />
                    {/* Auto-save status indicator */}
                    <span className="shrink-0 flex items-center gap-1 text-xs">
                        {saveStatus === "saving" && <><FiLoader size={12} className="animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving...</span></>}
                        {saveStatus === "saved" && <><FiCheck size={12} className="text-green-500" /><span className="text-green-500">Saved</span></>}
                    </span>
                </div>

                {/* Internal search bar */}
                <div className="flex items-center gap-2 px-5 py-2 border-b border-border/50 bg-card/40">
                    <FiSearch size={14} className="text-muted-foreground/60 shrink-0" />
                    <input
                        ref={srRef}
                        placeholder="Search in note... (Cmd+F)"
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
                        }}
                        dangerouslySetInnerHTML={{ __html: highlightedHtml || "<span style='color:var(--muted-foreground)'>Write your credentials here...\n\nExample:\nInstagram: john@gmail.com\nPassword: abc123</span>" }}
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
                        }}
                        spellCheck={false}
                    />
                </div>

                {/* Images row */}
                {noteCreated && (
                    <div className="border-t border-border px-5 py-3 flex items-center gap-2 flex-wrap">
                        {images.map((img, idx) => (
                            <div key={img.id} className="relative group shrink-0">
                                {imgUrls[img.id] ? (
                                    <a href={imgUrls[img.id]} target="_blank" rel="noopener noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={imgUrls[img.id]} alt={img.name} className="w-14 h-14 object-cover rounded-lg border border-border hover:border-primary transition-colors" />
                                    </a>
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
