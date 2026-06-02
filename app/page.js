"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFolders, getAllNotes, getNotes, deleteNote } from "@/lib/db";
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
import { FiSearch, FiPlus, FiFileText, FiTrash2, FiLoader, FiMenu } from "react-icons/fi";
import { useTheme } from "next-themes";
import { notify } from "@/lib/notify";

export default function Home() {
  const { user, loading: authLoading, logOut } = useAuth();
  const router = useRouter();
  const notesCacheRef = useRef(new Map());

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [notepadOpen, setNotepadOpen] = useState(false);
  const [activeNote, setActiveNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
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

  // Load folders once user is known
  useEffect(() => {
    if (!user) return;
    notesCacheRef.current.clear();
    getFolders(user.uid).then(setFolders).catch(() => { }).finally(() => setLoading(false));
  }, [user]);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    const cacheKey = getNotesCacheKey(selectedFolder);
    if (notesCacheRef.current.has(cacheKey)) {
      setNotes(notesCacheRef.current.get(cacheKey));
      return;
    }

    try {
      const raw = selectedFolder
        ? await getNotes(user.uid, selectedFolder.id)
        : await getAllNotes(user.uid);

      // Try to get master password from sessionStorage. If not present,
      // do NOT prompt the user; treat missing value as plaintext (null).
      let master = null;
      try { master = sessionStorage.getItem("masterPassword"); } catch { }

      // Decrypt fields if possible; gracefully fallback to plaintext when decryption fails
      const processed = raw.map((n) => {
        const title = decrypt(n.title, master) ?? n.title;
        const content = decrypt(n.content, master) ?? n.content;
        return { ...n, title, content };
      });

      writeNotesCache(selectedFolder, processed);
      setNotes(processed);
    } catch { /* ignore */ }
  }, [user, selectedFolder, getNotesCacheKey, writeNotesCache]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const filteredNotes = searchQuery
    ? notes.filter((n) => {
      const q = searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q);
    })
    : notes;

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
    upsertCachedNote(savedNote);
    setActiveNote(savedNote);
  };

  const handleDeleteNote = async () => {
    await deleteNote(deleteTarget.id);
    setNotes((prev) => {
      const nextNotes = prev.filter((note) => note.id !== deleteTarget.id);
      writeNotesCache(selectedFolder, nextNotes);
      return nextNotes;
    });
    removeCachedNote(deleteTarget.id);
    if (activeNote?.id === deleteTarget.id) { setNotepadOpen(false); setActiveNote(null); }
    setDeleteTarget(null);
    notify("Note deleted");
  };

  const getFolderName = (folderId) => folders.find((f) => f.id === folderId)?.name || "";

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <FiLoader size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar folders={folders} setFolders={setFolders} selectedFolder={selectedFolder}
          userId={user.uid}
          onLogout={async () => { await logOut(); router.replace("/auth"); }}
          onSelectFolder={(folder) => { setSelectedFolder(folder); setSearchQuery(""); }}
          mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-4 px-4 lg:px-8 py-5 lg:py-6 border-b border-border bg-card/50">
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

                <button onClick={() => handleNewNote(selectedFolder?.id ?? null)} className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md">
                  <FiPlus size={18} />
                </button>
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
                <Button onClick={() => handleNewNote(selectedFolder?.id ?? null)} className="h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 flex items-center gap-2">
                  <FiPlus size={16} />
                  <span className="ml-2">{selectedFolder ? `Add Note` : "New Note"}</span>
                </Button>
              </div>

              {/* app name removed from right side on desktop */}
            </div>
          </div>

          {/* Notes area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex-1 truncate mr-4">
                {searchQuery ? `Search: "${searchQuery}"` : selectedFolder ? selectedFolder.name : "All Notes"}
              </h2>
              <p className="text-sm text-muted-foreground shrink-0">{filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}{searchQuery && " found"}</p>
            </div>

            {filteredNotes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <FiFileText size={32} className="text-muted-foreground/50" />
                </div>
                {searchQuery ? (
                  <><p className="text-muted-foreground font-medium">No results found</p><p className="text-muted-foreground/60 text-sm mt-1">Nothing matched "{searchQuery}"</p></>
                ) : selectedFolder ? (
                  <><p className="text-muted-foreground font-medium">No notes in this folder</p><p className="text-muted-foreground/60 text-sm mt-1">Create a new note to get started</p></>
                ) : (
                  <><p className="text-muted-foreground font-medium">No notes yet</p><p className="text-muted-foreground/60 text-sm mt-1">Create a folder in the sidebar, then add a note</p></>
                )}
              </div>
            )}

            {filteredNotes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    searchQuery={searchQuery}
                    onClick={() => handleOpenNote(note)}
                    onDelete={(e) => { e.stopPropagation(); setDeleteTarget(note); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">"{deleteTarget?.title}" will be permanently deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {notepadOpen && (
        <NoteViewer
          note={activeNote}
          folderId={activeNote?.folderId ?? newNoteFolderId}
          userId={user.uid}
          onSave={handleSaveNote}
          onClose={() => { setNotepadOpen(false); loadNotes(); }}
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

function NoteCard({ note, folderName, searchQuery, onClick, onDelete }) {
  const { theme } = useTheme();
  const snippet = (note.content || "").slice(0, 120) + ((note.content || "").length > 120 ? "..." : "");
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
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 tracking-tight">
          {highlight(note.title, searchQuery)}
        </h3>

        {/* Content preview */}
        {snippet ? (
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
        <button
          onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 opacity-0 group-hover:opacity-100 shrink-0"
        >
          <FiTrash2 size={11} />
        </button>
      </div>
    </div>
  );
}
