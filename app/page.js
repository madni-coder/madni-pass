"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { getFolders, getAllNotes, getNotes, deleteNote, deleteNotePermanently, restoreNote, clearBin, getUserPinHash } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import Sidebar from "@/components/Sidebar";
import NoteViewer from "@/components/NoteViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FiSearch, FiPlus, FiFileText, FiTrash2, FiLoader, FiMenu, FiRotateCcw, FiLock } from "react-icons/fi";
import { BsPinAngle } from "react-icons/bs";
import { useTheme } from "next-themes";
import { notify } from "@/lib/notify";
import PinLockScreen from "@/components/PinLockScreen";

function updateNoteInLocalCaches(userId, note, action = "upsert") {
  if (typeof window === "undefined" || !userId) return;

  const allCacheKey = `user_notes_${userId}_all`;
  try {
    const allCached = localStorage.getItem(allCacheKey);
    if (allCached) {
      let notesList = JSON.parse(allCached);
      if (action === "upsert") {
        const exists = notesList.some(n => n.id === note.id);
        if (exists) {
          notesList = notesList.map(n => n.id === note.id ? { ...n, ...note } : n);
        } else {
          notesList = [note, ...notesList];
        }
      } else if (action === "delete") {
        notesList = notesList.filter(n => n.id !== note.id);
      } else if (action === "soft_delete") {
        notesList = notesList.map(n => n.id === note.id ? { ...n, inBin: true, deletedAt: { seconds: Math.floor(Date.now() / 1000) } } : n);
      } else if (action === "restore") {
        notesList = notesList.map(n => n.id === note.id ? { ...n, inBin: false, deletedAt: null } : n);
      }
      localStorage.setItem(allCacheKey, JSON.stringify(notesList));
    }
  } catch (e) {
    console.error("Failed to update all notes cache", e);
  }

  if (note.folderId) {
    const folderCacheKey = `user_notes_${userId}_${note.folderId}`;
    try {
      const folderCached = localStorage.getItem(folderCacheKey);
      if (folderCached) {
        let notesList = JSON.parse(folderCached);
        if (action === "upsert") {
          const exists = notesList.some(n => n.id === note.id);
          if (exists) {
            notesList = notesList.map(n => n.id === note.id ? { ...n, ...note } : n);
          } else {
            notesList = [note, ...notesList];
          }
        } else if (action === "delete") {
          notesList = notesList.filter(n => n.id !== note.id);
        } else if (action === "soft_delete") {
          notesList = notesList.map(n => n.id === note.id ? { ...n, inBin: true, deletedAt: { seconds: Math.floor(Date.now() / 1000) } } : n);
        } else if (action === "restore") {
          notesList = notesList.map(n => n.id === note.id ? { ...n, inBin: false, deletedAt: null } : n);
        }
        localStorage.setItem(folderCacheKey, JSON.stringify(notesList));
      }
    } catch (e) {
      console.error("Failed to update folder notes cache", e);
    }
  }
}

export default function Home() {
  const { user, loading: authLoading, logOut } = useAuth();
  const router = useRouter();
  const notesCacheRef = useRef(new Map());

  const [folders, setFolders] = useState([]);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    const handleErr = (e) => {
      // "Script error." is an opaque cross-origin error (e.g. from Tauri-injected or
      // third-party scripts) that contains no actionable info — skip it.
      if (!e.message || e.message === "Script error.") return;
      setLastError(e.message || String(e));
    };
    const handleRejection = (e) => {
      const msg = e.reason?.message || String(e.reason);
      if (!msg || msg === "Script error.") return;
      setLastError("Promise Rejection: " + msg);
    };
    window.addEventListener("error", handleErr);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleErr);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const [notes, setNotes] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [viewingBin, setViewingBin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [unlockedFolders, setUnlockedFolders] = useState([]);
  const [globalPinHash, setGlobalPinHash] = useState(null);

  console.log("[Home] Render. authLoading:", authLoading, "user:", user ? user.uid : "null", "loading (folders):", loading);
  const [showGuestAlert, setShowGuestAlert] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("dismissedGuestAlert") !== "true";
    }
    return true;
  });

  const handleDismissGuestAlert = () => {
    setShowGuestAlert(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("dismissedGuestAlert", "true");
    }
  };

  const handleSelectFolder = (folder) => {
    setSelectedFolder(folder);
    setUnlockedFolders([]);
  };

  const handleUnlockFolder = (folderId) => {
    setUnlockedFolders((prev) => [...prev, folderId]);
  };

  useEffect(() => {
    if (!user) return;
    try {
      const cachedPin = localStorage.getItem(`user_pin_hash_${user.uid}`);
      if (cachedPin) {
        Promise.resolve().then(() => {
          setGlobalPinHash(cachedPin);
        });
      }
    } catch (e) { }
    getUserPinHash(user.uid).then((hash) => {
      setGlobalPinHash(hash);
      if (hash) {
        try { localStorage.setItem(`user_pin_hash_${user.uid}`, hash); } catch (e) { }
      } else {
        try { localStorage.removeItem(`user_pin_hash_${user.uid}`); } catch (e) { }
      }
    }).catch(() => { });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (globalPinHash) {
      try { localStorage.setItem(`user_pin_hash_${user.uid}`, globalPinHash); } catch (e) { }
    } else {
      try { localStorage.removeItem(`user_pin_hash_${user.uid}`); } catch (e) { }
    }
  }, [globalPinHash, user]);

  useEffect(() => {
    const handleReset = () => {
      setGlobalPinHash(null);
    };
    const handleSet = (e) => {
      setGlobalPinHash(e.detail.pinHash);
    };
    window.addEventListener("globalPinReset", handleReset);
    window.addEventListener("globalPinSet", handleSet);
    return () => {
      window.removeEventListener("globalPinReset", handleReset);
      window.removeEventListener("globalPinSet", handleSet);
    };
  }, []);

  const [notepadOpen, setNotepadOpen] = useState(false);
  const [activeNote, setActiveNote] = useState(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme } = useTheme();
  const logoSrc = (theme === "light") ? "/lightLogo.png" : "/lazyNoteIcon.png";

  const getNotesCacheKey = useCallback(
    (folder) => (folder?.id ? `folder:${folder.id}` : "all"),
    []
  );

  const writeNotesCache = useCallback((folder, nextNotes) => {
    notesCacheRef.current.set(getNotesCacheKey(folder), nextNotes);
  }, [getNotesCacheKey]);

  const upsertCachedNote = useCallback((savedNote) => {
    for (const [key, cachedNotes] of notesCacheRef.current.entries()) {
      const belongsToFolder = key === "all" || key === `folder:${savedNote.folderId}`;
      if (!belongsToFolder) continue;

      const exists = cachedNotes.some((note) => note.id === savedNote.id);
      const nextNotes = exists
        ? cachedNotes.map((note) => (note.id === savedNote.id ? { ...note, ...savedNote } : note))
        : [savedNote, ...cachedNotes];
      notesCacheRef.current.set(key, nextNotes);
    }
  }, []);

  const removeCachedNote = useCallback((noteId) => {
    for (const [key, cachedNotes] of notesCacheRef.current.entries()) {
      notesCacheRef.current.set(key, cachedNotes.filter((note) => note.id !== noteId));
    }
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  // Contextual back button handler
  useEffect(() => {
    const handleBackButton = (e) => {
      if (notepadOpen) {
        setNotepadOpen(false);
      } else if (mobileOpen) {
        setMobileOpen(false);
      } else if (searchQuery) {
        setSearchQuery("");
      } else if (selectedFolder || viewingBin) {
        handleSelectFolder(null);
        setViewingBin(false);
      } else {
        const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
        if (isTauri) {
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("exit_app").catch(() => { });
          }).catch(() => { });
        }
      }
    };
    window.addEventListener("android-back-button", handleBackButton);
    return () => {
      window.removeEventListener("android-back-button", handleBackButton);
    };
  }, [notepadOpen, mobileOpen, searchQuery, selectedFolder, viewingBin]);

  // Load folders once user is known
  useEffect(() => {
    if (!user) return;
    notesCacheRef.current.clear();

    try {
      const cached = localStorage.getItem(`user_folders_${user.uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        Promise.resolve().then(() => {
          setFolders(parsed);
          setLoading(false);
        });
      } else {
        Promise.resolve().then(() => setLoading(true));
      }
    } catch (e) {
      Promise.resolve().then(() => setLoading(true));
    }

    getFolders(user.uid).then((fresh) => {
      setFolders(fresh);
      try { localStorage.setItem(`user_folders_${user.uid}`, JSON.stringify(fresh)); } catch (e) { }
    }).catch(() => { }).finally(() => setLoading(false));
  }, [user]);

  // Sync folders changes to localStorage (created, deleted, renamed, locked, unlocked)
  useEffect(() => {
    if (!user || loading) return;
    try {
      localStorage.setItem(`user_folders_${user.uid}`, JSON.stringify(folders));
    } catch (e) { }
  }, [folders, user, loading]);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    const cacheKey = getNotesCacheKey(selectedFolder);
    if (notesCacheRef.current.has(cacheKey)) {
      setNotes(notesCacheRef.current.get(cacheKey));
      return;
    }

    const cacheName = `user_notes_${user.uid}_${selectedFolder?.id || "all"}`;
    try {
      const cached = localStorage.getItem(cacheName);
      if (cached) {
        setNotes(JSON.parse(cached));
      }
    } catch (e) { }

    try {
      const raw = selectedFolder
        ? await getNotes(user.uid, selectedFolder.id)
        : await getAllNotes(user.uid);

      // Use the user's Firebase UID as the encryption key automatically
      const master = user.uid;


      // Decrypt fields if possible; gracefully fallback to plaintext when decryption fails
      const processed = raw.map((n) => {
        const title = decrypt(n.title, master) ?? n.title;
        const content = decrypt(n.content, master) ?? n.content;
        return { ...n, title, content };
      });

      writeNotesCache(selectedFolder, processed);
      setNotes(processed);
      try {
        localStorage.setItem(cacheName, JSON.stringify(processed));
      } catch (e) { }
    } catch { /* ignore */ }
  }, [user, selectedFolder, getNotesCacheKey, writeNotesCache]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // If a master password is set elsewhere (NoteViewer prompts and stores it), reload notes
  useEffect(() => {
    const handler = () => { loadNotes(); };
    try { window.addEventListener("masterPasswordSet", handler); } catch { }
    return () => { try { window.removeEventListener("masterPasswordSet", handler); } catch { } };
  }, [loadNotes]);

  const displayNotes = (viewingBin
    ? notes.filter((n) => n.inBin)
    : notes.filter((n) => !n.inBin)
  ).filter((n) => {
    if (n.isPinConfig) return false;
    if (!n.folderId) return true;
    const folder = folders.find((f) => f.id === n.folderId);
    if (!folder) return true;
    if (folder.pinHash && !unlockedFolders.includes(folder.id)) {
      return selectedFolder?.id === folder.id;
    }
    return true;
  });

  const filteredNotes = searchQuery
    ? displayNotes.filter((n) => {
      const q = searchQuery.toLowerCase();
      const matchesTitle = n.title.toLowerCase().includes(q);
      const matchesContent = !n.pinHash && (n.content || "").toLowerCase().includes(q);
      return matchesTitle || matchesContent;
    })
    : displayNotes;

  const getTimestampValue = (ts) => {
    if (!ts) return 0;
    if (typeof ts === "number") return ts;
    if (ts.seconds) return ts.seconds * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return getTimestampValue(b.updatedAt || b.createdAt) - getTimestampValue(a.updatedAt || a.createdAt);
  });

  const [newNoteFolderId, setNewNoteFolderId] = useState(null);

  const handleNewNote = (folderId = null) => {
    setActiveNote(null);
    setNewNoteFolderId(folderId);
    setNotepadOpen(true);
  };

  const handleOpenNote = (note) => {
    setActiveNote(note);
    setNotepadOpen(true);
  };

  const handleSaveNote = (savedNote) => {
    // Update local state only — no extra Firestore read on every auto-save
    setNotes(prev => {
      const exists = prev.find(n => n.id === savedNote.id);
      const nextNotes = exists ? prev.map(n => n.id === savedNote.id ? { ...n, ...savedNote } : n) : [savedNote, ...prev];
      writeNotesCache(selectedFolder, nextNotes);
      return nextNotes;
    });
    updateNoteInLocalCaches(user.uid, savedNote, "upsert");
    upsertCachedNote(savedNote);
    setActiveNote(savedNote);
  };

  const handleDeleteNote = async (noteToDelete) => {
    if (!noteToDelete) return;
    try {
      if (noteToDelete.inBin) {
        // Delete permanently
        await deleteNotePermanently(noteToDelete.id);
        setNotes((prev) => {
          const nextNotes = prev.filter((note) => note.id !== noteToDelete.id);
          writeNotesCache(selectedFolder, nextNotes);
          return nextNotes;
        });
        removeCachedNote(noteToDelete.id);
        updateNoteInLocalCaches(user.uid, noteToDelete, "delete");
        notify("Note permanently deleted");
      } else {
        // Move to Bin
        await deleteNote(noteToDelete.id);
        setNotes((prev) => {
          const nextNotes = prev.map((note) => note.id === noteToDelete.id ? { ...note, inBin: true } : note);
          writeNotesCache(selectedFolder, nextNotes);
          return nextNotes;
        });
        upsertCachedNote({ ...noteToDelete, inBin: true });
        updateNoteInLocalCaches(user.uid, noteToDelete, "soft_delete");
        notify("Note moved to Bin");
      }
      if (activeNote?.id === noteToDelete.id) { setNotepadOpen(false); setActiveNote(null); }
    } catch (err) {
      notify("Failed to delete note: " + err.message, "error");
    }
  };

  const handleRestoreNote = async (noteToRestore) => {
    if (!noteToRestore) return;
    try {
      await restoreNote(noteToRestore.id);
      setNotes((prev) => {
        const nextNotes = prev.map((note) => note.id === noteToRestore.id ? { ...note, inBin: false } : note);
        writeNotesCache(selectedFolder, nextNotes);
        return nextNotes;
      });
      upsertCachedNote({ ...noteToRestore, inBin: false });
      updateNoteInLocalCaches(user.uid, noteToRestore, "restore");
      if (activeNote?.id === noteToRestore.id) {
        setActiveNote({ ...activeNote, inBin: false });
      }
      notify("Note restored");
    } catch (err) {
      notify("Failed to restore note: " + err.message, "error");
    }
  };

  const handleClearBin = async () => {
    try {
      const binNotes = notes.filter((n) => n.inBin);
      if (binNotes.length === 0) {
        notify("Bin is already empty");
        return;
      }
      await clearBin(user.uid);
      setNotes((prev) => {
        const nextNotes = prev.filter((note) => !note.inBin);
        writeNotesCache(selectedFolder, nextNotes);
        return nextNotes;
      });
      binNotes.forEach((n) => {
        removeCachedNote(n.id);
        updateNoteInLocalCaches(user.uid, n, "delete");
      });
      notify("Bin cleared");
    } catch (err) {
      notify("Failed to clear bin: " + err.message, "error");
    }
  };

  const getFolderName = (folderId) => folders.find((f) => f.id === folderId)?.name || "";

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-2 p-4">
        <FiLoader size={32} className="animate-spin text-primary" />
        {lastError && (
          <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-xl mt-4 border border-destructive/20 max-w-sm text-center break-all font-mono">
            Error: {lastError}
          </div>
        )}
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar folders={folders} setFolders={setFolders} selectedFolder={selectedFolder}
          userId={user.uid}
          userEmail={user?.email}
          onLogout={async () => { await logOut(); router.replace("/auth"); }}
          onSelectFolder={(folder) => { handleSelectFolder(folder); setViewingBin(false); setSearchQuery(""); }}
          mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
          viewingBin={viewingBin}
          onSelectBin={() => { setViewingBin(true); handleSelectFolder(null); setSearchQuery(""); }}
          unlockedFolders={unlockedFolders}
          onUnlockFolder={handleUnlockFolder}
          globalPinHash={globalPinHash}
          setGlobalPinHash={setGlobalPinHash} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-4 px-4 lg:px-8 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-5 lg:pt-6 lg:pb-6 border-b border-border bg-card/50">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Mobile: icons-only (menu handled by Sidebar) and search toggle */}
              <div className="lg:hidden flex items-center gap-3 flex-1">
                <button
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-transparent text-foreground hover:bg-muted transition-colors"
                >
                  <FiMenu size={20} />
                </button>

                <div className="relative flex-1">
                  <FiSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder='Search Anything'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-12 h-12 rounded-full bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
                  )}
                </div>

                {viewingBin ? (
                  <button onClick={handleClearBin} className="w-12 h-12 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md">
                    <FiTrash2 size={18} />
                  </button>
                ) : (
                  <button onClick={() => handleNewNote(selectedFolder?.id ?? null)} className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md">
                    <FiPlus size={18} />
                  </button>
                )}
              </div>

              {/* Desktop / larger: central search (or when mobileSearchOpen true) */}
              <div className={`relative flex-1 ${mobileSearchOpen ? '' : 'hidden lg:block'}`}>
                <FiSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder='Search Anything'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 rounded-full bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
                )}
              </div>
            </div>

            <div className={mobileSearchOpen ? 'hidden' : 'hidden lg:flex items-center gap-4'}>
              {/* Desktop labeled button: hidden on small screens */}
              <div className="hidden sm:flex">
                {viewingBin ? (
                  <Button onClick={handleClearBin} className="h-12 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground shrink-0 flex items-center gap-2">
                    <FiTrash2 size={16} />
                    <span className="ml-2">Clear Bin</span>
                  </Button>
                ) : (
                  <Button onClick={() => handleNewNote(selectedFolder?.id ?? null)} className="h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 flex items-center gap-2">
                    <FiPlus size={16} />
                    <span className="ml-2">{selectedFolder ? `Add Note` : "New Note"}</span>
                  </Button>
                )}
              </div>

              {/* app name removed from right side on desktop */}
            </div>
          </div>

          {/* Notes area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {user?.isAnonymous && showGuestAlert && (
              <div className="mb-6 p-4 rounded-xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-between gap-4 animate-card-enter">
                <div className="flex-1 text-xs sm:text-sm font-medium">
                  ⚠️ <strong>Guest Mode:</strong> Your data will not be saved in the cloud; it will only remain on your device.
                </div>
                <button
                  onClick={handleDismissGuestAlert}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 transition-all active:scale-90"
                  aria-label="Dismiss warning"
                >
                  ✕
                </button>
              </div>
            )}
            {selectedFolder && selectedFolder.pinHash && !unlockedFolders.includes(selectedFolder.id) ? (
              <PinLockScreen
                inline
                mode="unlock"
                title={`"${selectedFolder.name}" is Locked`}
                description="Enter the 4-digit PIN to access this folder."
                correctPinHash={globalPinHash}
                userId={user.uid}
                userEmail={user.email}
                onSuccess={() => handleUnlockFolder(selectedFolder.id)}
                onCancel={() => handleSelectFolder(null)}
              />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground flex-1 truncate mr-4">
                    {searchQuery ? `Search: "${searchQuery}"` : viewingBin ? "Bin" : selectedFolder ? selectedFolder.name : "All Notes"}
                  </h2>
                  <p className="text-sm text-muted-foreground shrink-0">{filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}{searchQuery && " found"}</p>
                </div>

                {filteredNotes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <FiFileText size={32} className="text-muted-foreground/50" />
                    </div>
                    {searchQuery ? (
                      <><p className="text-muted-foreground font-medium">No results found</p><p className="text-muted-foreground/60 text-sm mt-1">Nothing matched &quot;{searchQuery}&quot;</p></>
                    ) : viewingBin ? (
                      <><p className="text-muted-foreground font-medium">Bin is empty</p><p className="text-muted-foreground/60 text-sm mt-1">Deleted notes will appear here</p></>
                    ) : selectedFolder ? (
                      <><p className="text-muted-foreground font-medium">No notes in this folder</p><p className="text-muted-foreground/60 text-sm mt-1">Create a new note to get started</p></>
                    ) : (
                      <><p className="text-muted-foreground font-medium">No notes yet</p><p className="text-muted-foreground/60 text-sm mt-1">Create a folder in the sidebar, then add a note</p></>
                    )}
                  </div>
                )}

                {filteredNotes.length > 0 && (() => {
                  const pinnedNotes = sortedNotes.filter((n) => n.isPinned);
                  const otherNotes = sortedNotes.filter((n) => !n.isPinned);

                  if (pinnedNotes.length > 0) {
                    return (
                      <div className="space-y-8">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 select-none">Pinned</div>
                          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {pinnedNotes.map((note) => (
                              <NoteCard
                                key={note.id}
                                note={note}
                                searchQuery={searchQuery}
                                onClick={() => handleOpenNote(note)}
                                onDelete={handleDeleteNote}
                                onRestore={handleRestoreNote}
                                inBin={viewingBin || note.inBin}
                              />
                            ))}
                          </div>
                        </div>
                        {otherNotes.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 select-none">Others</div>
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {otherNotes.map((note) => (
                                <NoteCard
                                  key={note.id}
                                  note={note}
                                  searchQuery={searchQuery}
                                  onClick={() => handleOpenNote(note)}
                                  onDelete={handleDeleteNote}
                                  onRestore={handleRestoreNote}
                                  inBin={viewingBin || note.inBin}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sortedNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          searchQuery={searchQuery}
                          onClick={() => handleOpenNote(note)}
                          onDelete={handleDeleteNote}
                          onRestore={handleRestoreNote}
                          inBin={viewingBin || note.inBin}
                        />
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {notepadOpen && (
        <NoteViewer
          note={activeNote}
          folderId={activeNote?.folderId ?? newNoteFolderId}
          userId={user.uid}
          userEmail={user?.email}
          onSave={handleSaveNote}
          onClose={() => { setNotepadOpen(false); loadNotes(); }}
          onDelete={handleDeleteNote}
          onRestore={handleRestoreNote}
          globalPinHash={globalPinHash}
          setGlobalPinHash={setGlobalPinHash}
        />
      )}
    </>
  );
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2);
  return `${day}/${month}/${year}`;
}

function highlight(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-yellow-400/30 text-yellow-300 rounded px-0.5">{part}</mark> : <span key={i}>{part}</span>
  );
}

function NoteCard({ note, folderName, searchQuery, onClick, onDelete, onRestore, inBin }) {
  const { theme } = useTheme();
  const isLocked = !!note.pinHash;
  const snippet = isLocked ? "Locked" : (note.content || "").slice(0, 120) + ((note.content || "").length > 120 ? "..." : "");
  const date = formatDate(note.updatedAt || note.createdAt);
  const displayDate = date || formatDate(new Date());
  return (
    <div
      onClick={onClick}
      className="group relative bg-card border border-border/60 rounded-2xl cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 overflow-hidden flex flex-col"
    >
      {/* Top accent gradient */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-linear-to-r from-primary via-primary/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Card body */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        {/* Title */}
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 tracking-tight flex items-center gap-1.5">
          {note.isPinned && <BsPinAngle className="text-primary shrink-0" size={13} />}
          {isLocked && <FiLock className="text-primary shrink-0 animate-pulse" size={13} />}
          {highlight(note.title, searchQuery)}
        </h3>

        {/* Content preview */}
        {isLocked ? (
          <p className="text-[11px] text-muted-foreground italic flex-1 flex items-center gap-1">
            <FiLock size={12} className="text-muted-foreground/60 shrink-0" />
            Note content is locked.
          </p>
        ) : snippet ? (
          <p className="text-[11px] text-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap flex-1">
            {highlight(snippet, searchQuery)}
          </p>
        ) : (
          <p className="text-[11px] text-foreground italic flex-1">No content yet...</p>
        )}
      </div>

      {/* Theme-aware bold divider between content and footer */}
      <div className={`w-full ${theme === 'light' ? 'bg-primary' : 'bg-primary/70'} h-px`} />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-foreground font-medium tracking-wide shrink-0">{displayDate}</span>
          {inBin && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(note); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground hover:text-green-500 hover:bg-green-500/10 transition-all duration-150 shrink-0"
              title="Restore"
            >
              <FiRotateCcw size={13} strokeWidth={2.8} className="stroke-[2.8px]" />
            </button>
          )}
          {folderName && (
            <Badge variant="secondary" className="text-[12px] bg-primary/10 text-primary/70 border border-primary/20 px-3 py-0 h-6 font-medium truncate flex-1">
              {folderName}
            </Badge>
          )}
          {note.images?.length > 0 && (
            <span className="text-[11px] text-foreground flex items-center gap-1 shrink-0">
              <span aria-hidden>📎</span>
              <span className="text-[10px]">{note.images.length}</span>
            </span>
          )}
        </div>
        {inBin ? (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onDelete(note)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              title="Delete Permanently"
            >
              <FiTrash2 size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(note); }}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 shrink-0"
            title="Delete"
          >
            <FiTrash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
