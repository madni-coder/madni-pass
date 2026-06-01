"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getFolders, getAllNotes, getNotes, deleteNote } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import NoteViewer from "@/components/NoteViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FiSearch, FiPlus, FiFileText, FiTrash2, FiLoader, FiLogOut } from "react-icons/fi";
import { notify } from "@/lib/notify";

export default function Home() {
  const { user, loading: authLoading, logOut } = useAuth();
  const router = useRouter();

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [notepadOpen, setNotepadOpen] = useState(false);
  const [activeNote, setActiveNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  // Load folders once user is known
  useEffect(() => {
    if (!user) return;
    getFolders(user.uid).then(setFolders).catch(() => { }).finally(() => setLoading(false));
  }, [user]);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    try {
      const raw = selectedFolder
        ? await getNotes(user.uid, selectedFolder.id)
        : await getAllNotes(user.uid);
      setNotes(raw);
    } catch { /* ignore */ }
  }, [user, selectedFolder]);

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
      if (exists) return prev.map(n => n.id === savedNote.id ? { ...n, ...savedNote } : n);
      return [savedNote, ...prev];
    });
    setActiveNote(savedNote);
  };

  const handleDeleteNote = async () => {
    await deleteNote(deleteTarget.id);
    loadNotes();
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
          onSelectFolder={(folder) => { setSelectedFolder(folder); setSearchQuery(""); }} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b border-border bg-card/50">
            <div className="w-9 lg:hidden shrink-0" />
            <div className="relative flex-1 max-w-xl">
              <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder='Search notes... e.g. "instagram" or "gmail"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
              )}
            </div>
            <Button onClick={() => handleNewNote(selectedFolder?.id ?? null)} className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
              <FiPlus size={16} className="mr-1.5" />
              <span className="hidden sm:inline">{selectedFolder ? `Add Note` : "New Note"}</span>
              <span className="sm:hidden">New</span>
            </Button>
            <button onClick={async () => { await logOut(); router.replace("/auth"); }} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0" title="Sign out">
              <FiLogOut size={16} />
            </button>
          </div>

          {/* Notes area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {searchQuery ? `Search: "${searchQuery}"` : selectedFolder ? selectedFolder.name : "All Notes"}
              </h2>
              <p className="text-sm text-muted-foreground">{filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}{searchQuery && " found"}</p>
            </div>

            {filteredNotes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <FiFileText size={32} className="text-muted-foreground/50" />
                </div>
                {searchQuery ? (
                  <><p className="text-muted-foreground font-medium">No results found</p><p className="text-muted-foreground/60 text-sm mt-1">Nothing matched "{searchQuery}"</p></>
                ) : selectedFolder ? (
                  <><p className="text-muted-foreground font-medium">No notes in this folder</p><p className="text-muted-foreground/60 text-sm mt-1">Press + to create a new note</p></>
                ) : (
                  <><p className="text-muted-foreground font-medium">No notes yet</p><p className="text-muted-foreground/60 text-sm mt-1">Create a folder in the sidebar, then add a note</p></>
                )}
              </div>
            )}

            {filteredNotes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    folderName={!selectedFolder ? getFolderName(note.folderId) : null}
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
  const snippet = (note.content || "").slice(0, 120) + ((note.content || "").length > 120 ? "..." : "");
  return (
    <div onClick={onClick} className="group bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all">
      <h3 className="font-medium text-foreground text-sm leading-snug mb-2 line-clamp-2">{highlight(note.title, searchQuery)}</h3>
      <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3 whitespace-pre-wrap">{highlight(snippet, searchQuery)}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {folderName && <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground border-border">{folderName}</Badge>}
          {note.images?.length > 0 && <span className="text-xs text-muted-foreground/50">{note.images.length} img</span>}
        </div>
        <button
          onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-muted transition-colors"
        >
          <FiTrash2 size={13} />
        </button>
      </div>
    </div>
  );
}
