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
import { FiFolder, FiPlus, FiMoreHorizontal, FiEdit2, FiTrash2, FiLock, FiUnlock, FiMenu, FiX, FiSun, FiMoon } from "react-icons/fi";
import { BiFolderOpen } from "react-icons/bi";
import { FaPowerOff } from "react-icons/fa";
import { createFolder, updateFolder, deleteFolder, updateFolderPin, setUserPinHash } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { notify } from "@/lib/notify";
import { useTheme } from "next-themes";
import PinLockScreen from "./PinLockScreen";
import CryptoJS from "crypto-js";

export default function Sidebar({ folders, setFolders, selectedFolder, onSelectFolder, userId, onLogout, mobileOpen, setMobileOpen, viewingBin, onSelectBin, unlockedFolders = [], onUnlockFolder, globalPinHash, setGlobalPinHash }) {
    const { theme, setTheme } = useTheme();
    const logoSrc = (theme === "light") ? "/lightLogo.png" : "/lazyNoteIcon.png";
    const { user } = useAuth();
    const rawFirst = user?.displayName ? user.displayName.split(" ")[0] : (user?.email ? user.email.split("@")[0] : "");
    const firstName = rawFirst ? (rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1)) : "";
    const [newFolderName, setNewFolderName] = useState("");
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameName, setRenameName] = useState("");
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [pinAction, setPinAction] = useState(null); // null | { folder, mode: 'set' | 'remove' | 'verify' }
    const [pendingAction, setPendingAction] = useState(null); // null | { folder, type: 'rename' | 'delete' }

    const handleLockFolderClick = async (folder) => {
        if (globalPinHash) {
            try {
                await updateFolderPin(folder.id, true);
                setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, pinHash: true } : f));
                if (selectedFolder?.id === folder.id) {
                    onSelectFolder({ ...selectedFolder, pinHash: true });
                }
                notify("Folder locked using your global PIN!");
            } catch (err) {
                notify("Failed to lock folder: " + err.message, "error");
            }
        } else {
            setPinAction({ folder, mode: "set" });
        }
    };

    const handleRenameClick = (folder) => {
        const isLocked = folder.pinHash && !unlockedFolders.includes(folder.id);
        if (isLocked) {
            setPendingAction({ folder, type: "rename" });
            setPinAction({ folder, mode: "verify" });
        } else {
            setRenameTarget(folder);
            setRenameName(folder.name);
        }
    };

    const handleDeleteClick = (folder) => {
        const isLocked = folder.pinHash && !unlockedFolders.includes(folder.id);
        if (isLocked) {
            setPendingAction({ folder, type: "delete" });
            setPinAction({ folder, mode: "verify" });
        } else {
            handleDeleteFolder(folder);
        }
    };

    const handleCreate = async () => {
        if (!newFolderName.trim()) return;
        const id = await createFolder(userId, newFolderName.trim());
        const folder = { id, name: newFolderName.trim(), createdAt: Date.now() };
        setFolders((prev) => [...prev, folder]);
        setNewFolderName("");
        setShowNewFolder(false);
        notify("Folder created!");
    };

    const handleRename = async () => {
        if (!renameName.trim()) return;
        await updateFolder(renameTarget.id, renameName.trim());
        setFolders((prev) =>
            prev.map((f) => (f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f))
        );
        setRenameTarget(null);
        notify("Folder renamed");
    };

    const handleDeleteFolder = async (folderToDelete) => {
        if (!folderToDelete) return;
        try {
            await deleteFolder(folderToDelete.id);
            setFolders((prev) => prev.filter((f) => f.id !== folderToDelete.id));
            if (selectedFolder?.id === folderToDelete.id) onSelectFolder(null);
            notify("Folder deleted");
        } catch (err) {
            notify("Failed to delete folder: " + err.message, "error");
        }
    };

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            <div className="px-4 py-5 border-b border-border">
                <div className="flex items-center gap-4">
                    <img
                        src={logoSrc}
                        alt="Lazy Notes"
                        className="w-14 h-14 rounded-xl object-contain shrink-0"
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/lazyNoteIcon.png'; }}
                    />
                    <div>
                        <span className="font-bold text-foreground text-lg">Lazy <span className="text-primary">Notes</span></span>
                        <p className="text-base text-foreground font-medium mt-1">{`Hello${firstName ? ' ! ' + firstName : ''}`}</p>
                    </div>
                </div>
            </div>

            <div className="px-3 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Folders</span>
                <button
                    onClick={() => setShowNewFolder(true)}
                    className="w-6 h-6 rounded flex items-center justify-center text-foreground hover:text-primary hover:bg-muted transition-colors"
                >
                    <FiPlus size={16} />
                </button>
            </div>

            <ScrollArea className="flex-1 px-2">
                <button
                    onClick={() => { onSelectFolder(null); setMobileOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${!selectedFolder && !viewingBin ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-muted"
                        }`}
                >
                    <BiFolderOpen size={16} className="shrink-0" />
                    <span className="truncate">All Notes</span>
                </button>

                {folders.map((folder) => {
                    const isFolderLocked = folder.pinHash && !unlockedFolders.includes(folder.id);
                    return (
                        <div
                            key={folder.id}
                            className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${selectedFolder?.id === folder.id && !viewingBin
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-foreground hover:bg-muted"
                                }`}
                        >
                            <button
                                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                onClick={() => { onSelectFolder(folder); setMobileOpen(false); }}
                            >
                                {isFolderLocked ? (
                                    <FiLock size={16} className="shrink-0 text-muted-foreground" />
                                ) : selectedFolder?.id === folder.id ? (
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
                                        onClick={() => handleRenameClick(folder)}
                                    >
                                        <FiEdit2 size={14} className="mr-2" /> Rename
                                    </DropdownMenuItem>
                                    {folder.pinHash ? (
                                        <DropdownMenuItem
                                            className="text-foreground hover:text-foreground focus:text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                            onClick={() => { setPinAction({ folder, mode: "remove" }); }}
                                        >
                                            <FiUnlock size={14} className="mr-2" /> Remove Lock
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem
                                            className="text-foreground hover:text-foreground focus:text-foreground hover:bg-muted focus:bg-muted cursor-pointer"
                                            onClick={() => handleLockFolderClick(folder)}
                                        >
                                            <FiLock size={14} className="mr-2" /> Lock Folder
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        className="text-destructive hover:text-destructive focus:text-destructive hover:bg-muted focus:bg-muted cursor-pointer"
                                        onClick={() => handleDeleteClick(folder)}
                                    >
                                        <FiTrash2 size={14} className="mr-2" /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                })}

                {showNewFolder && (
                    <div className="px-1 pt-1 pb-2">
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

                {folders.length === 0 && !showNewFolder && (
                    <p className="text-xs text-muted-foreground/60 text-center py-6">
                        No folders yet.<br />Press + to create one
                    </p>
                )}
            </ScrollArea>

            <div className="px-2 py-1.5 border-t border-border/40 shrink-0">
                <button
                    onClick={() => {
                        onSelectBin();
                        setMobileOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        viewingBin
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-foreground hover:bg-muted"
                    }`}
                >
                    <FiTrash2 size={16} className="shrink-0" />
                    <span className="truncate">Bin</span>
                </button>
            </div>

            <div className="border-t border-border px-3 py-3 flex items-center justify-between shrink-0">
                <button
                    onClick={() => setTheme((theme ?? "dark") === "dark" ? "light" : "dark")}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={(theme ?? "dark") === "dark" ? "Light mode" : "Dark mode"}
                >
                    {(theme ?? "dark") === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
                </button>
                <button
                    onClick={() => setLogoutConfirm(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-xs font-medium"
                    title="Sign out"
                >
                    <FaPowerOff size={13} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );

    return (
        <>
            <div className={`lg:hidden fixed inset-0 z-40 flex ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                <div
                    className={`fixed inset-0 bg-black/60 transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    onClick={() => setMobileOpen(false)}
                />

                <div className={`relative w-64 bg-card border-r border-border h-full flex flex-col z-50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'}`}>
                    <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 text-muted-foreground hover:text-foreground">
                        <FiX size={20} />
                    </button>
                    <SidebarContent />
                </div>
            </div>

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

            <AlertDialog open={logoutConfirm} onOpenChange={setLogoutConfirm}>
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Logout?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            Kya aap sach mein logout karna chahte hain?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-muted/80">No</AlertDialogCancel>
                        <AlertDialogAction onClick={onLogout} className="bg-destructive hover:bg-destructive/90 flex items-center gap-1.5">
                            <FaPowerOff size={12} /> Yes, Logout
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {pinAction && (
                <PinLockScreen
                    mode={pinAction.mode === "set" ? "set" : "unlock"}
                    title={pinAction.mode === "set" ? "Lock Folder" : pinAction.mode === "remove" ? "Remove Folder Lock" : "Unlock Folder"}
                    description={pinAction.mode === "set" ? `Set a 4-digit PIN to lock folder "${pinAction.folder.name}".` : `Enter the 4-digit PIN for folder "${pinAction.folder.name}".`}
                    correctPinHash={globalPinHash}
                    onSuccess={async (pin) => {
                        const pinHash = CryptoJS.SHA256(pin).toString();
                        try {
                            if (pinAction.mode === "set") {
                                await setUserPinHash(userId, pinHash);
                                setGlobalPinHash(pinHash);
                                await updateFolderPin(pinAction.folder.id, true);
                                setFolders(prev => prev.map(f => f.id === pinAction.folder.id ? { ...f, pinHash: true } : f));
                                if (selectedFolder?.id === pinAction.folder.id) {
                                    onSelectFolder({ ...selectedFolder, pinHash: true });
                                }
                                notify("Global PIN set and folder locked!");
                            } else if (pinAction.mode === "remove") {
                                await updateFolderPin(pinAction.folder.id, null);
                                setFolders(prev => prev.map(f => f.id === pinAction.folder.id ? { ...f, pinHash: null } : f));
                                if (selectedFolder?.id === pinAction.folder.id) {
                                    onSelectFolder({ ...selectedFolder, pinHash: null });
                                }
                                notify("Folder lock removed!");
                            } else if (pinAction.mode === "verify") {
                                if (onUnlockFolder) onUnlockFolder(pinAction.folder.id);
                                if (pendingAction) {
                                    if (pendingAction.type === "rename") {
                                        setRenameTarget(pendingAction.folder);
                                        setRenameName(pendingAction.folder.name);
                                    } else if (pendingAction.type === "delete") {
                                        await handleDeleteFolder(pendingAction.folder);
                                    }
                                }
                            }
                        } catch (err) {
                            notify("Action failed: " + err.message, "error");
                        }
                        setPinAction(null);
                        setPendingAction(null);
                    }}
                    onCancel={() => {
                        setPinAction(null);
                        setPendingAction(null);
                    }}
                />
            )}
        </>
    );
}
