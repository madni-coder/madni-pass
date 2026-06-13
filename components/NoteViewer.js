"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createNote, updateNote, updateNotePin, setUserPinHash, updateNotePinState } from "@/lib/db";
import { storeImage, getImageSrc } from "@/lib/imageStore";
import { encrypt, decrypt } from "@/lib/crypto";
import { notify } from "@/lib/notify";
import { FiSearch, FiX, FiChevronUp, FiChevronDown, FiImage, FiLoader, FiCheck, FiMoreHorizontal, FiHash, FiCopy, FiWifiOff, FiArrowLeft, FiTrash2, FiRotateCcw, FiLock, FiUnlock, FiPlus } from "react-icons/fi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import PinLockScreen from "./PinLockScreen";
import CryptoJS from "crypto-js";

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
    const labelRegex = /^\s*(?:[\w\s\/]+?\s+)?(email|mail|gmail|username|user|login|id|password|pass|pswd|pin|key|token|link|website|url)\s*[:\-=\s]\s*(.+)$/i;
    const emailRegex = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
    const urlRegex = /((?:https?:\/\/|www\.)\S+)/i;

    lines.forEach((lineText, index) => {
        // 1. Try label-based match
        const mLabel = labelRegex.exec(lineText);
        if (mLabel && mLabel[2].trim().length > 0) {
            creds.push({
                lineIndex: index,
                key: mLabel[1].toLowerCase(),
                label: mLabel[1],
                value: mLabel[2].trim()
            });
            return;
        }

        // 2. Try raw email match
        const mEmail = emailRegex.exec(lineText);
        if (mEmail) {
            creds.push({
                lineIndex: index,
                key: "email",
                label: "Email",
                value: mEmail[1].trim()
            });
            return;
        }

        // 3. Try raw URL match
        const mUrl = urlRegex.exec(lineText);
        if (mUrl) {
            creds.push({
                lineIndex: index,
                key: "link",
                label: "Link",
                value: mUrl[1].trim()
            });
            return;
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
            className={`w-6 h-6 flex items-center justify-center rounded-md border transition-all duration-150 active:scale-95 shadow-sm ${copied
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

function getNextUntitledTitle(notes) {
    return "Untitled";
}

function getNowSeconds() {
    return Math.floor(Date.now() / 1000);
}

export default function NoteViewer({ note, notes = [], folderId, onSave, onClose, userId, userEmail, onDelete, onRestore, globalPinHash, setGlobalPinHash }) {
    const isNew = !note?.id;
    const [title, setTitle] = useState(note?.title || "");
    const [content, setContent] = useState(note?.content || "");
    const [images, setImages] = useState(note?.images || []);
    const [notePinHash, setNotePinHash] = useState(note?.pinHash || null);
    const [isUnlocked, setIsUnlocked] = useState(!note?.pinHash);
    const [pinAction, setPinAction] = useState(null); // null | 'set' | 'remove'
    const [noteIsPinned, setNoteIsPinned] = useState(note?.isPinned || false);

    const prevNoteIdRef = useRef(note?.id || null);
    const createdAtRef = useRef(note?.createdAt || { seconds: getNowSeconds() });

    useEffect(() => {
        if (note?.id !== prevNoteIdRef.current) {
            prevNoteIdRef.current = note?.id || null;
            setNotePinHash(note?.pinHash || null);
            setIsUnlocked(!note?.pinHash);
            setNoteIsPinned(note?.isPinned || false);
            setDeleteConfirmIdx(null);
            createdAtRef.current = note?.createdAt || { seconds: getNowSeconds() };
        } else {
            setNotePinHash(note?.pinHash || null);
            setNoteIsPinned(note?.isPinned || false);
        }
    }, [note]);
    const [uploading, setUploading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saved"
    const [deleteConfirmIdx, setDeleteConfirmIdx] = useState(null);
    const deleteConfirmRef = useRef(null);

    useEffect(() => {
        if (deleteConfirmIdx === null) return;
        const handler = (e) => {
            if (deleteConfirmRef.current && !deleteConfirmRef.current.contains(e.target)) {
                setDeleteConfirmIdx(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [deleteConfirmIdx]);
    const [noteCreated, setNoteCreated] = useState(!!note?.id); // for showing images row
    const [inSearch, setInSearch] = useState("");
    const [matchIdx, setMatchIdx] = useState(0);
    const [sumResult, setSumResult] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
    const fontStyle = "sans";


    const [selectedText, setSelectedText] = useState("");
    const [floatingCopyPos, setFloatingCopyPos] = useState(null);
    const [selectionCopied, setSelectionCopied] = useState(false);

    const handleTextareaSelection = useCallback((e) => {
        const ta = taRef.current;
        if (!ta) return;
        setTimeout(() => {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (start !== undefined && end !== undefined && start !== end) {
                const text = ta.value.substring(start, end).trim();
                if (text.length > 0) {
                    setSelectedText(text);
                    setSelectionCopied(false);
                    const rect = ta.getBoundingClientRect();
                    let x = rect.width / 2;
                    let y = rect.height / 2;
                    if (e.clientX !== undefined && e.clientY !== undefined) {
                        x = e.clientX - rect.left;
                        y = e.clientY - rect.top - 40;
                        if (y < 10) y = e.clientY - rect.top + 20;
                    } else {
                        y = Math.max(30, ta.clientHeight / 3);
                    }
                    x = Math.max(40, Math.min(x, rect.width - 40));
                    y = Math.max(10, Math.min(y, rect.height - 40));
                    setFloatingCopyPos({ x, y });
                } else {
                    setSelectedText("");
                    setFloatingCopyPos(null);
                }
            } else {
                setSelectedText("");
                setFloatingCopyPos(null);
            }
        }, 10);
    }, []);

    const handlePointerDown = useCallback(() => {
        setSelectedText("");
        setFloatingCopyPos(null);
        setSelectionCopied(false);
    }, []);

    const handleFloatingCopy = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!selectedText) return;
        copyToClipboard(selectedText).then(() => {
            setSelectionCopied(true);
            notify("Selection copied!");
            setTimeout(() => {
                setFloatingCopyPos(null);
                setSelectedText("");
                setSelectionCopied(false);
            }, 1000);
        }).catch((err) => {
            notify("Copy failed: " + err.message, "error");
        });
    }, [selectedText]);

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
    const titleRef = useRef(null);
    const noteIdRef = useRef(note?.id || "note_" + Date.now() + "_" + Math.random().toString(36).slice(2));
    const imagesRef = useRef(images);
    const srRef = useRef(null);
    const bdRef = useRef(null);
    const taRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const fileRef = useRef(null);
    const saveTimerRef = useRef(null);
    const creatingRef = useRef(false);

    // Refs to track dirty state and latest values on unmount
    const isDirtyRef = useRef(false);
    const titleRefVal = useRef(title);
    const contentRefVal = useRef(content);
    const noteCreatedVal = useRef(noteCreated);
    const folderIdVal = useRef(folderId);
    const noteIsPinnedVal = useRef(noteIsPinned);

    useEffect(() => { titleRefVal.current = title; }, [title]);
    useEffect(() => { contentRefVal.current = content; }, [content]);
    useEffect(() => { noteCreatedVal.current = noteCreated; }, [noteCreated]);
    useEffect(() => { folderIdVal.current = folderId; }, [folderId]);
    useEffect(() => { noteIsPinnedVal.current = noteIsPinned; }, [noteIsPinned]);

    // Mark note as dirty when user edits title or content
    useEffect(() => {
        if (note?.inBin) return;
        if (title !== (note?.title || "") || content !== (note?.content || "")) {
            isDirtyRef.current = true;
        }
    }, [title, content, note]);

    useEffect(() => { imagesRef.current = images; }, [images]);

    // Save note on unmount if it is dirty or needs default title
    useEffect(() => {
        return () => {
            const finalContent = contentRefVal.current;
            const hasImages = imagesRef.current.length > 0;
            if (note?.inBin) return;

            let finalTitle = titleRefVal.current.trim();
            let mustSave = isDirtyRef.current;

            // If the title is empty, but we have images or content, we should set it to "Untitled X"
            if (!finalTitle && (hasImages || finalContent.trim())) {
                finalTitle = getNextUntitledTitle(notes);
                mustSave = true;
            }

            if (!finalTitle || !mustSave) return;

            const master = userId;
            const encTitle = encrypt(finalTitle, master);
            const encContent = encrypt(finalContent, master);

            if (!noteCreatedVal.current) {
                // Instantly update parent UI and local cache
                onSave({ id: noteIdRef.current, title: finalTitle, content: finalContent, images: imagesRef.current, pinHash: notePinHash, isPinned: noteIsPinnedVal.current, createdAt: createdAtRef.current, updatedAt: { seconds: getNowSeconds() } });
                // Asynchronously save to cloud
                createNote(userId, folderIdVal.current ?? null, encTitle, encContent, noteIdRef.current, imagesRef.current)
                    .catch(err => console.error("Cloud save on unmount failed:", err));
            } else {
                // Instantly update parent UI and local cache
                onSave({ id: noteIdRef.current, title: finalTitle, content: finalContent, images: imagesRef.current, pinHash: notePinHash, isPinned: noteIsPinnedVal.current, createdAt: createdAtRef.current, updatedAt: { seconds: getNowSeconds() } });
                // Asynchronously save to cloud
                updateNote(noteIdRef.current, encTitle, encContent, imagesRef.current)
                    .catch(err => console.error("Cloud save on unmount failed:", err));
            }
        };
    }, [onSave, userId, note?.inBin, notePinHash, notes]);

    useEffect(() => {
        const el = titleRef.current;
        if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
        }
    }, [title]);

    const handleClose = useCallback(() => {
        clearTimeout(saveTimerRef.current);

        const finalContent = contentRefVal.current;
        const hasImages = imagesRef.current.length > 0;

        if (note?.inBin) {
            onClose();
            return;
        }

        let finalTitle = titleRefVal.current.trim();
        let mustSave = isDirtyRef.current;

        // If the title is empty, but we have images or content, we should set it to "Untitled X"
        if (!finalTitle && (hasImages || finalContent.trim())) {
            finalTitle = getNextUntitledTitle(notes);
            mustSave = true;
        }

        if (mustSave && finalTitle) {
            const master = userId;
            const encTitle = encrypt(finalTitle, master);
            const encContent = encrypt(finalContent, master);

            // Instantly update parent UI and local cache
            onSave({
                id: noteIdRef.current,
                title: finalTitle,
                content: finalContent,
                images: imagesRef.current,
                pinHash: notePinHash,
                isPinned: noteIsPinnedVal.current,
                createdAt: createdAtRef.current,
                updatedAt: { seconds: getNowSeconds() }
            });
            isDirtyRef.current = false;

            // Asynchronously save to cloud
            if (!noteCreatedVal.current) {
                createNote(userId, folderIdVal.current ?? null, encTitle, encContent, noteIdRef.current, imagesRef.current)
                    .catch(err => console.error("Cloud save on close failed:", err));
            } else {
                updateNote(noteIdRef.current, encTitle, encContent, imagesRef.current)
                    .catch(err => console.error("Cloud save on close failed:", err));
            }
        }

        onClose();
    }, [onClose, onSave, userId, note?.inBin, notePinHash, notes]);

    // Intercept Android back gesture
    useEffect(() => {
        const handleBack = (e) => {
            e.stopImmediatePropagation();
            handleClose();
        };
        window.addEventListener("android-back-button", handleBack);
        return () => window.removeEventListener("android-back-button", handleBack);
    }, [handleClose]);

    // Close on Esc key
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") handleClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [handleClose]);

    const matches = findMatches(content, inSearch);
    const detectedCreds = useMemo(() => parseCredentials(content), [content]);

    useEffect(() => {
        const el = taRef.current;
        if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
        }
    }, [content]);

    const scrollToMatch = useCallback((idx) => {
        const ta = taRef.current;
        if (!ta || matches.length === 0) return;
        const i = ((idx % matches.length) + matches.length) % matches.length;
        setMatchIdx(i);
        ta.setSelectionRange(matches[i], matches[i] + inSearch.length);
        const linesBefore = content.slice(0, matches[i]).split("\n").length;
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = Math.max(0, (linesBefore - 4) * 20);
        }
    }, [matches, inSearch, content]);

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
        if (note?.inBin) return;
        
        // If the note doesn't exist yet, we only auto-save if we have a title.
        // If the note has already been created, we can save even if title is empty.
        if (!noteCreated && !title.trim()) return;

        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const currentTitle = title.trim();
            const currentContent = content;
            const currentImages = imagesRef.current;
            const master = userId;
            const encTitle = encrypt(currentTitle, master);
            const encContent = encrypt(currentContent, master);

            // Instantly update parent UI and local cache
            onSave({
                id: noteIdRef.current,
                title: currentTitle,
                content: currentContent,
                images: currentImages,
                pinHash: notePinHash,
                isPinned: noteIsPinnedVal.current,
                createdAt: createdAtRef.current,
                updatedAt: { seconds: getNowSeconds() }
            });
            isDirtyRef.current = false;
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);

            // Asynchronously sync with cloud in the background
            if (!noteCreated) {
                if (creatingRef.current) return;
                creatingRef.current = true;
                createNote(userId, folderId ?? null, encTitle, encContent, noteIdRef.current, currentImages)
                    .then(() => {
                        setNoteCreated(true);
                    })
                    .catch((err) => {
                        console.error("Cloud auto-save creation failed:", err);
                        isDirtyRef.current = true;
                    })
                    .finally(() => {
                        creatingRef.current = false;
                    });
            } else {
                updateNote(noteIdRef.current, encTitle, encContent, currentImages)
                    .catch((err) => {
                        console.error("Cloud auto-save update failed:", err);
                        isDirtyRef.current = true;
                    });
            }
        }, 800);
        return () => clearTimeout(saveTimerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, content]);

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { notify("Image size must be smaller than 10MB", "error"); return; }
        if (images.length >= 4) { notify("You can upload a maximum of 4 images per note", "error"); return; }
        
        let activeTitle = title.trim();
        if (!activeTitle) {
            activeTitle = getNextUntitledTitle(notes);
            setTitle(activeTitle);
        }

        setUploading(true);
        try {
            const master = userId;
            const imgData = await storeImage(file, master);
            const newImgs = [...imagesRef.current, imgData];
            setImages(newImgs);

            // Instantly update parent UI and local cache
            onSave({
                id: noteIdRef.current,
                title: activeTitle,
                content,
                images: newImgs,
                pinHash: notePinHash,
                isPinned: noteIsPinned,
                createdAt: createdAtRef.current,
                updatedAt: { seconds: getNowSeconds() }
            });
            isDirtyRef.current = false;
            notify("Image attached!");

            // Asynchronously sync with cloud in the background
            const encTitle = encrypt(activeTitle, master);
            const encContent = encrypt(content, master);

            if (!noteCreated) {
                setNoteCreated(true);
                createNote(userId, folderId ?? null, encTitle, encContent, noteIdRef.current, newImgs)
                    .catch(err => {
                        console.error("Cloud save for new note with image failed:", err);
                        isDirtyRef.current = true;
                    });
            } else {
                updateNote(noteIdRef.current, encTitle, encContent, newImgs)
                    .catch(err => {
                        console.error("Cloud save for note update with image failed:", err);
                        isDirtyRef.current = true;
                    });
            }
        } catch (err) {
            notify("Failed to upload image: " + (err?.message || err), "error");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const displayImages = useMemo(() => {
        const master = userId;
        return images.map(img => {
            let name = img.name;
            if (img.name) {
                const dec = decrypt(img.name, master);
                if (dec) name = dec;
            }
            return { ...img, name, displaySrc: getImageSrc(img, master) };
        });
    }, [images, userId]);

    const handleDeleteImage = async (img, idx) => {
        const newImgs = images.filter((_, i) => i !== idx);
        setImages(newImgs);

        // Instantly update parent UI and local cache
        onSave({
            id: noteIdRef.current,
            title,
            content,
            images: newImgs,
            pinHash: notePinHash,
            isPinned: noteIsPinned,
            createdAt: createdAtRef.current,
            updatedAt: { seconds: getNowSeconds() }
        });
        isDirtyRef.current = false;
        notify("Image removed");

        // Asynchronously sync with cloud
        if (noteCreated) {
            const master = userId;
            const encTitle = encrypt(title, master);
            const encContent = encrypt(content, master);
            updateNote(noteIdRef.current, encTitle, encContent, newImgs)
                .catch(err => {
                    console.error("Cloud delete image failed:", err);
                    isDirtyRef.current = true;
                });
        }
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

    const handleDelete = () => {
        if (noteIdRef.current) {
            if (onDelete) {
                onDelete({ id: noteIdRef.current, title: title.trim() || "Untitled Note" });
            }
        } else {
            onClose();
        }
        setMenuOpen(false);
    };

    const handleLockNoteClick = async () => {
        setMenuOpen(false);
        if (!noteCreated) return;
        if (globalPinHash) {
            try {
                await updateNotePin(noteIdRef.current, true);
                setNotePinHash(true);
                onSave({
                    id: noteIdRef.current,
                    title,
                    content,
                    images,
                    pinHash: true,
                    isPinned: noteIsPinned,
                    createdAt: createdAtRef.current,
                    updatedAt: { seconds: getNowSeconds() }
                });
                notify("Note locked using your global PIN!");
            } catch (err) {
                notify("Failed to lock note: " + err.message, "error");
            }
        } else {
            setPinAction("set");
        }
    };

    const handleTogglePin = async () => {
        if (!noteIdRef.current) return;
        const newPinnedState = !noteIsPinned;
        setNoteIsPinned(newPinnedState);
        try {
            await updateNotePinState(noteIdRef.current, newPinnedState);
            onSave({
                id: noteIdRef.current,
                title,
                content,
                images,
                pinHash: notePinHash,
                isPinned: newPinnedState,
                createdAt: createdAtRef.current,
                updatedAt: { seconds: getNowSeconds() }
            });
            notify(newPinnedState ? "Note pinned to top!" : "Note unpinned!");
        } catch (err) {
            notify("Failed to update pin: " + err.message, "error");
            setNoteIsPinned(!newPinnedState);
        }
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
            paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
        };

    if (!isUnlocked && notePinHash) {
        return (
            <PinLockScreen
                mode="unlock"
                title="Locked Note"
                description="Enter the 4-digit PIN to view note content."
                correctPinHash={globalPinHash}
                userId={userId}
                userEmail={userEmail}
                onSuccess={() => {
                    setIsUnlocked(true);
                }}
                onCancel={onClose}
            />
        );
    }

    return (
        <>
            <style>{`
                [data-bd-scroll]::-webkit-scrollbar{display:none}
                @keyframes tooltip-in-center {
                    from { opacity: 0; transform: translate(-50%, 4px) scale(0.95); }
                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }
                @keyframes tooltip-in-left {
                    from { opacity: 0; transform: translate(0, 4px) scale(0.95); }
                    to { opacity: 1; transform: translate(0, 0) scale(1); }
                }
                @keyframes tooltip-in-right {
                    from { opacity: 0; transform: translate(0, 4px) scale(0.95); }
                    to { opacity: 1; transform: translate(0, 0) scale(1); }
                }
                .animate-tooltip-center {
                    animation: tooltip-in-center 0.12s cubic-bezier(0, 0, 0.2, 1) forwards;
                }
                .animate-tooltip-left {
                    animation: tooltip-in-left 0.12s cubic-bezier(0, 0, 0.2, 1) forwards;
                }
                .animate-tooltip-right {
                    animation: tooltip-in-right 0.12s cubic-bezier(0, 0, 0.2, 1) forwards;
                }
            `}</style>
            {/* Backdrop overlay */}
            <div
                onClick={handleClose}
                className="animate-backdrop-fade"
                style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)" }}
            />
            {/* Modal panel */}
            <div style={panelStyle} className="animate-note-open">
                {/* Title area — accented */}
                <div className="flex items-start gap-3 px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:pt-4 pb-3 border-b-2 border-primary/60 bg-card/70">
                    <button
                        onClick={handleClose}
                        className="flex sm:hidden w-8 h-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors mr-1 shrink-0"
                        aria-label="Back"
                    >
                        <FiArrowLeft size={18} />
                    </button>
                    <div className="hidden sm:block w-1 h-7 rounded-full bg-primary shrink-0 mt-0.5" />
                    <textarea
                        ref={titleRef}
                        autoFocus={!note?.inBin}
                        placeholder="Note title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                taRef.current?.focus();
                            }
                        }}
                        readOnly={note?.inBin}
                        rows={1}
                        className="flex-1 bg-transparent text-foreground text-lg font-bold placeholder:text-muted-foreground/50 focus:outline-none tracking-wide min-w-0 resize-none overflow-hidden py-0.5"
                        style={{
                            height: "auto",
                            lineHeight: "1.4",
                        }}
                    />
                    {/* Three-dots menu */}
                    <span className="shrink-0 flex items-center gap-2 text-xs h-8">
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
                                    <button onClick={() => { handleSum(); setMenuOpen(false); }}
                                        className="flex items-center gap-2.5 mx-2 my-1.5 px-3 py-2 text-sm text-left rounded-md border border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-150 active:scale-95 font-semibold"
                                    >
                                        <span><FiPlus size={13} className="text-primary" /></span>Add Numbers
                                    </button>
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    <button
                                        disabled={uploading || images.length >= 4}
                                        onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                        title={images.length >= 4 ? "Maximum 4 images allowed" : "Add Image"}
                                    >
                                        <span className="text-muted-foreground"><FiImage size={13} /></span>Add Image
                                    </button>
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    <button onClick={() => { handleCopy(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                    >
                                        <span className="text-muted-foreground"><FiCopy size={13} /></span>Copy Note
                                    </button>
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    <button onClick={() => { handleTogglePin(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                    >
                                        <span className="text-muted-foreground">
                                            {noteIsPinned ? <BsPinAngleFill size={13} className="text-primary" /> : <BsPinAngle size={13} />}
                                        </span>
                                        {noteIsPinned ? "Unpin Note" : "Pin Note"}
                                    </button>
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    {notePinHash ? (
                                        <button
                                            onClick={() => { setPinAction("remove"); setMenuOpen(false); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                        >
                                            <span className="text-muted-foreground"><FiUnlock size={13} /></span>Remove Lock
                                        </button>
                                    ) : (
                                        <button
                                            disabled={!noteCreated}
                                            onClick={handleLockNoteClick}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                            title={!noteCreated ? "Save note first to lock" : "Lock this note"}
                                        >
                                            <span className="text-muted-foreground"><FiLock size={13} /></span>Lock Note
                                        </button>
                                    )}
                                    <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                    {note?.inBin ? (
                                        <>
                                            <button onClick={() => { if (onRestore) onRestore(note); setMenuOpen(false); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                                            >
                                                <span className="text-muted-foreground"><FiRotateCcw size={13} /></span>Restore Note
                                            </button>
                                            <div style={{ height: 1, background: "var(--border)", margin: "3px 0" }} />
                                            <button onClick={handleDelete}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                                            >
                                                <span className="text-destructive"><FiTrash2 size={13} /></span>Delete Permanently
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={handleDelete}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                                        >
                                            <span className="text-destructive"><FiTrash2 size={13} /></span>Delete Note
                                        </button>
                                    )}

                                </div>
                            )}
                        </div>
                        {/* Close button inside flex — no overlap */}
                        <button
                            onClick={handleClose}
                            className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                        >
                            <FiX size={18} />
                        </button>
                    </span>
                </div>

                {note?.inBin && (
                    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-amber-500/30 bg-amber-500/10 text-amber-200">
                        <span className="text-xs font-medium">This note is in the Bin. Restore it to edit.</span>
                        <button
                            onClick={() => {
                                if (onRestore) onRestore(note);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
                        >
                            <FiRotateCcw size={11} /> Restore
                        </button>
                    </div>
                )}



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
                <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border/40 bg-card/30">
                    <div className="relative flex-1 max-w-md">
                        <FiSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                        <input
                            ref={srRef}
                            placeholder="Search in this Note..."
                            value={inSearch}
                            onChange={(e) => { setInSearch(e.target.value); setMatchIdx(0); }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") { e.shiftKey ? gotoMatch(matchIdx - 1) : gotoMatch(matchIdx + 1); }
                                if (e.key === "Escape") { setInSearch(""); taRef.current?.focus(); }
                            }}
                            className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-muted/70 border border-border/40 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all duration-150"
                        />
                        {inSearch && (
                            <button
                                onClick={() => { setInSearch(""); taRef.current?.focus(); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground text-[10px] transition-all"
                            >
                                <FiX size={10} />
                            </button>
                        )}
                    </div>
                    {inSearch && (
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold font-mono border tracking-wider uppercase transition-all ${matches.length === 0
                                ? "bg-destructive/10 border-destructive/20 text-destructive-foreground/90"
                                : "bg-primary/10 border-primary/20 text-primary"
                                }`}>
                                {matches.length > 0 ? `${matchIdx + 1} of ${matches.length}` : "No matches"}
                            </span>
                            <div className="flex items-center rounded-lg border border-border bg-muted/50 overflow-hidden shadow-xs">
                                <button
                                    onClick={() => gotoMatch(matchIdx - 1)}
                                    disabled={matches.length === 0}
                                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-30 transition-all"
                                    title="Previous match (Shift+Enter)"
                                >
                                    <FiChevronUp size={15} />
                                </button>
                                <div className="w-px h-3.5 bg-border/80" />
                                <button
                                    onClick={() => gotoMatch(matchIdx + 1)}
                                    disabled={matches.length === 0}
                                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-30 transition-all"
                                    title="Next match (Enter)"
                                >
                                    <FiChevronDown size={15} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Scrollable Content Container */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto"
                    onScroll={() => {
                        setFloatingCopyPos(null);
                        setSelectedText("");
                    }}
                >
                    <div className="relative">
                        {/* Highlight backdrop — rendered behind textarea */}
                        <div
                            ref={bdRef}
                            aria-hidden="true"
                            style={{
                                ...sharedTextStyle,
                                color: "var(--foreground)",
                                position: "absolute",
                                inset: 0,
                                pointerEvents: "none",
                                margin: 0,
                                border: "none",
                                zIndex: 0,
                                display: inSearch ? "block" : "none",
                                overflow: "hidden",
                            }}
                            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                        />
                        {/* Textarea — transparent text, visible caret */}
                        <textarea
                            ref={taRef}
                            value={content}
                            onChange={(e) => { setContent(e.target.value); }}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); srRef.current?.focus(); }
                            }}
                            onPointerUp={handleTextareaSelection}
                            onKeyUp={handleTextareaSelection}
                            onPointerDown={handlePointerDown}
                            readOnly={note?.inBin}
                            style={{
                                ...sharedTextStyle,
                                position: "relative",
                                width: "100%",
                                height: "auto",
                                background: "transparent",
                                color: inSearch ? "transparent" : "var(--foreground)",
                                caretColor: "var(--foreground)",
                                resize: "none",
                                outline: "none",
                                zIndex: 1,
                                overflowY: "hidden",
                                willChange: "height",
                            }}
                            placeholder="Write your notes here..."
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

                        {/* Floating Selection Copy Button */}
                        {floatingCopyPos && selectedText && (
                            <button
                                onClick={handleFloatingCopy}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                style={{
                                    position: "absolute",
                                    left: `${floatingCopyPos.x}px`,
                                    top: `${floatingCopyPos.y}px`,
                                    transform: "translateX(-50%)",
                                    zIndex: 50,
                                    pointerEvents: "auto",
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg shadow-black/30 border transition-all duration-150 active:scale-95 animate-tooltip-center select-none ${
                                    selectionCopied
                                        ? "bg-green-600 border-green-500 text-white"
                                        : "bg-popover/95 backdrop-blur-md border-border/80 text-foreground hover:bg-accent hover:text-accent-foreground"
                                }`}
                            >
                                {selectionCopied ? (
                                    <>
                                        <FiCheck size={13} className="text-white" />
                                        <span>Copied</span>
                                    </>
                                ) : (
                                    <>
                                        <FiCopy size={13} />
                                        <span>Copy</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Inline full-size image previews */}
                    {noteCreated && images.length > 0 && (
                        <div className="border-t border-border/40 flex flex-col gap-3 px-5 py-4 pb-8">
                            {displayImages.map((img, idx) =>
                                img.displaySrc ? (
                                    <div key={idx} className="block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={img.displaySrc}
                                            alt={img.name}
                                            style={{
                                                maxWidth: "100%",
                                                maxHeight: "60vh",
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
                </div>

                {/* Bottom credential strip removed — inline floating copy remains */}

                {/* Images row */}
                {noteCreated && (images.length > 0 || uploading) && (
                    <div className="border-t border-border px-5 py-3 flex items-center gap-2 flex-wrap">
                        {displayImages.map((img, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === images.length - 1 && images.length > 1;
                            const tooltipClass = isFirst ? "animate-tooltip-left" : isLast ? "animate-tooltip-right" : "animate-tooltip-center";
                            const tooltipStyle = isFirst
                                ? { position: "absolute", bottom: "100%", left: "0", marginBottom: "8px", zIndex: 50, width: "max-content", minWidth: "90px" }
                                : isLast
                                    ? { position: "absolute", bottom: "100%", right: "0", marginBottom: "8px", zIndex: 50, width: "max-content", minWidth: "90px" }
                                    : { position: "absolute", bottom: "100%", left: "50%", marginBottom: "8px", zIndex: 50, width: "max-content", minWidth: "90px" };
                            const arrowStyle = isFirst
                                ? { position: "absolute", top: "100%", left: "28px", transform: "translateX(-50%) rotate(45deg)", marginTop: "-5px", width: "8px", height: "8px", backgroundColor: "var(--popover)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }
                                : isLast
                                    ? { position: "absolute", top: "100%", right: "28px", transform: "translateX(50%) rotate(45deg)", marginTop: "-5px", width: "8px", height: "8px", backgroundColor: "var(--popover)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }
                                    : { position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%) rotate(45deg)", marginTop: "-5px", width: "8px", height: "8px", backgroundColor: "var(--popover)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" };

                            return (
                                <div key={idx} className="relative group shrink-0">
                                    {img.displaySrc ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={img.displaySrc} alt={img.name} className="w-14 h-14 object-cover rounded-lg border border-border hover:border-primary transition-colors" />
                                    ) : (
                                        <div className="w-14 h-14 bg-muted rounded-lg border border-border flex items-center justify-center">
                                            <FiLoader size={12} className="animate-spin text-muted-foreground/60" />
                                        </div>
                                    )}
                                    <button onClick={() => setDeleteConfirmIdx(idx)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex sm:hidden sm:group-hover:flex items-center justify-center cursor-pointer">
                                        <FiX size={10} className="text-white" />
                                    </button>
                                    {deleteConfirmIdx === idx && (
                                        <div
                                            ref={deleteConfirmRef}
                                            style={tooltipStyle}
                                            className={`bg-popover border border-border rounded-lg shadow-lg p-2 flex flex-col items-center gap-1.5 ${tooltipClass}`}
                                        >
                                            <span className="text-[10px] font-semibold text-foreground select-none">Remove?</span>
                                            <div className="flex gap-1.5 w-full">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteImage(img, idx);
                                                        setDeleteConfirmIdx(null);
                                                    }}
                                                    className="flex-1 py-0.5 px-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-[9px] font-bold transition-all active:scale-95 cursor-pointer"
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirmIdx(null);
                                                    }}
                                                    className="flex-1 py-0.5 px-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-[9px] font-bold transition-all active:scale-95 border border-border cursor-pointer"
                                                >
                                                    No
                                                </button>
                                            </div>
                                            {/* Tiny arrow pointing down */}
                                            <div style={arrowStyle} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {uploading && (
                            <div className="w-14 h-14 bg-muted rounded-lg border border-border flex items-center justify-center shrink-0">
                                <FiLoader size={16} className="animate-spin text-muted-foreground/60" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {pinAction === "set" && (
                <PinLockScreen
                    mode="set"
                    title="Lock Note"
                    description="Set a 4-digit PIN to lock this note."
                    onSuccess={async (pin) => {
                        const hash = CryptoJS.SHA256(pin).toString();
                        try {
                            if (noteIdRef.current) {
                                await setUserPinHash(userId, hash);
                                setGlobalPinHash(hash);
                                await updateNotePin(noteIdRef.current, true);
                                setNotePinHash(true);
                                onSave({
                                    id: noteIdRef.current,
                                    title,
                                    content,
                                    images,
                                    pinHash: true,
                                    isPinned: noteIsPinned,
                                    createdAt: createdAtRef.current,
                                    updatedAt: { seconds: getNowSeconds() }
                                });
                                notify("Global PIN set and note locked!");
                            }
                        } catch (err) {
                            notify("Failed to lock note: " + err.message, "error");
                        }
                        setPinAction(null);
                    }}
                    onCancel={() => setPinAction(null)}
                />
            )}

            {pinAction === "remove" && (
                <PinLockScreen
                    mode="unlock"
                    title="Remove Note Lock"
                    description="Enter your 4-digit PIN to remove lock."
                    correctPinHash={globalPinHash}
                    userId={userId}
                    userEmail={userEmail}
                    onSuccess={async () => {
                        try {
                            if (noteIdRef.current) {
                                await updateNotePin(noteIdRef.current, null);
                                setNotePinHash(null);
                                onSave({
                                    id: noteIdRef.current,
                                    title,
                                    content,
                                    images,
                                    pinHash: null,
                                    isPinned: noteIsPinned,
                                    createdAt: createdAtRef.current,
                                    updatedAt: { seconds: getNowSeconds() }
                                });
                                notify("Note lock removed!");
                            }
                        } catch (err) {
                            notify("Failed to remove lock: " + err.message, "error");
                        }
                        setPinAction(null);
                    }}
                    onCancel={() => setPinAction(null)}
                />
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </>
    );
}
