"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FiFolder, FiPlus, FiMoreHorizontal, FiEdit2, FiTrash2, FiLock, FiMenu, FiX } from "react-icons/fi";
import { BiFolderOpen } from "react-icons/bi";
import { createFolder, updateFolderName, removeFolder } from "@/lib/storage";
import { notify } from "@/lib/notify";

export default function Sidebar({ folders, setFolders, selectedFolder, onSelectFolder }) {
    const [newFolderName, setNewFolderName] = useState("");
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameName, setRenameName] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleCreate = () => {
        if (!newFolderName.trim()) return;
        const folder = createFolder(newFolderName.trim());
        setFolders((prev) => [...prev, folder]);
        setNewFolderName("");
        setShowNewFolder(false);
        notify("Folder created!");
    };

    const handleRename = () => {
        if (!renameName.trim()) return;
        updateFolderName(renameTarget.id, renameName.trim());
        setFolders((prev) =>
            prev.map((f) => (f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f))
        );
        setRenameTarget(null);
        notify("Folder renamed");
    };

    const handleDelete = () => {
        removeFolder(deleteTarget.id);
        setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
        if (selectedFolder?.id === deleteTarget.id) onSelectFolder(null);
        setDeleteTarget(null);
        notify("Folder deleted");
    };

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            <div className="px-4 py-5 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                        <FiLock size={16} className="text-primary-foreground" />
                    </div>
                    <span className="font-bold text-foreground text-lg">Madni Notes</span>
                </div>
            </div>

            <div className="px-3 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folders</span>
                <button
                    onClick={() => setShowNewFolder(true)}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                >
                    <FiPlus size={16} />
                </button>
            </div>

            <ScrollArea className="flex-1 px-2">
                <button
                    onClick={() => { onSelectFolder(null); setMobileOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${!selectedFolder ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                >
                    <BiFolderOpen size={16} className="shrink-0" />
                    <span className="truncate">All Notes</span>
                </button>

                {folders.map((folder) => (
                    <div
                        key={folder.id}
                        className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${selectedFolder?.id === folder.id
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                    >
                        <button
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                            onClick={() => { onSelectFolder(folder); setMobileOpen(false); }}
                        >
                            {selectedFolder?.id === folder.id ? (
                                <BiFolderOpen size={16} className="shrink-0" />
                            ) : (
                                <FiFolder size={16} className="shrink-0" />
                            )}
                            <span className="truncate">{folder.name}</span>
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                className={`w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity ${selectedFolder?.id === folder.id ? "opacity-100" : ""} hover:bg-white/10`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <FiMoreHorizontal size={14} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border">
                                <DropdownMenuItem
                                    className="text-foreground hover:text-foreground focus:text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                    onClick={() => { setRenameTarget(folder); setRenameName(folder.name); }}
                                >
                                    <FiEdit2 size={14} className="mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-destructive hover:text-destructive focus:text-destructive hover:bg-muted focus:bg-muted cursor-pointer"
                                    onClick={() => setDeleteTarget(folder)}
                                >
                                    <FiTrash2 size={14} className="mr-2" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ))}

                {folders.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 text-center py-6">
                        No folders yet.<br />Press + to create one
                    </p>
                )}
            </ScrollArea>

            {showNewFolder && (
                <div className="px-3 py-3 border-t border-border">
                    <Input
                        autoFocus
                        placeholder="Folder name..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreate();
                            if (e.key === "Escape") setShowNewFolder(false);
                        }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-sm mb-2"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleCreate} className="flex-1 bg-primary hover:bg-primary/90 text-xs">
                            Create
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)} className="text-muted-foreground text-xs">
                            Cancel
                        </Button>
                    </div>
                </div>
            )}


        </div>
    );

    return (
        <>
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-30 w-9 h-9 bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground"
            >
                <FiMenu size={20} />
            </button>

            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-40 flex">
                    <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
                    <div className="relative w-64 bg-card border-r border-border h-full flex flex-col z-50">
                        <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 text-muted-foreground hover:text-foreground">
                            <FiX size={20} />
                        </button>
                        <SidebarContent />
                    </div>
                </div>
            )}

            <div className="hidden lg:flex flex-col w-64 bg-card border-r border-border h-screen shrink-0">
                <SidebarContent />
            </div>

            <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
                    <Input
                        autoFocus
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename()}
                        className="bg-muted border-border text-foreground"
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRenameTarget(null)} className="text-muted-foreground">Cancel</Button>
                        <Button onClick={handleRename} className="bg-primary hover:bg-primary/90">Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete folder?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            "{deleteTarget?.name}" will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
