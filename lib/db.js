import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
    writeBatch,
    getDoc,
    setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, auth } from "./firebase";
import { encrypt, decrypt } from "./crypto";

function isGuest() {
    return auth.currentUser?.isAnonymous === true;
}

function getLocalFolders() {
    if (typeof window === "undefined") return [];
    try {
        const data = localStorage.getItem("guest_folders");
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

function setLocalFolders(folders) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem("guest_folders", JSON.stringify(folders));
    } catch (e) {
        console.error(e);
    }
}

function getLocalNotes() {
    if (typeof window === "undefined") return [];
    try {
        const data = localStorage.getItem("guest_notes");
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

function setLocalNotes(notes) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem("guest_notes", JSON.stringify(notes));
    } catch (e) {
        console.error(e);
    }
}

const inflightReads = new Map();

async function dedupeRead(key, loader) {
    if (inflightReads.has(key)) return inflightReads.get(key);

    const promise = loader().finally(() => {
        inflightReads.delete(key);
    });

    inflightReads.set(key, promise);
    return promise;
}

// ─── Folders ────────────────────────────────────────────────────────────────

export async function getFolders(userId) {
    if (isGuest()) {
        return getLocalFolders().filter(f => f.userId === userId);
    }
    return dedupeRead(`folders:${userId}`, async () => {
        const q = query(
            collection(db, "folders"),
            where("userId", "==", userId)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => {
            const data = d.data();
            let name = data.name;
            if (name) {
                const dec = decrypt(name, userId);
                if (dec) name = dec;
            }
            return { id: d.id, ...data, name };
        });
        return docs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    });
}

export async function createFolder(userId, name) {
    if (isGuest()) {
        const folders = getLocalFolders();
        const newFolder = {
            id: "folder_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            userId,
            name,
            createdAt: { seconds: Math.floor(Date.now() / 1000) },
        };
        folders.push(newFolder);
        setLocalFolders(folders);
        return newFolder.id;
    }
    const encryptedName = encrypt(name, userId);
    const docRef = await addDoc(collection(db, "folders"), {
        userId,
        name: encryptedName,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateFolder(userId, folderId, name) {
    if (isGuest()) {
        const folders = getLocalFolders();
        const updated = folders.map(f => f.id === folderId ? { ...f, name } : f);
        setLocalFolders(updated);
        return;
    }
    const encryptedName = encrypt(name, userId);
    await updateDoc(doc(db, "folders", folderId), { name: encryptedName });
}

export async function deleteFolder(folderId) {
    if (isGuest()) {
        const folders = getLocalFolders();
        setLocalFolders(folders.filter(f => f.id !== folderId));
        const notes = getLocalNotes();
        setLocalNotes(notes.filter(n => n.folderId !== folderId));
        return;
    }
    await deleteDoc(doc(db, "folders", folderId));
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function getNotes(userId, folderId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        return notes.filter(n => n.userId === userId && n.folderId === folderId)
                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    return dedupeRead(`notes:${userId}:${folderId}`, async () => {
        const q = query(
            collection(db, "notes"),
            where("userId", "==", userId),
            where("folderId", "==", folderId)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    });
}

export async function getAllNotes(userId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        return notes.filter(n => n.userId === userId)
                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    return dedupeRead(`notes:${userId}:all`, async () => {
        const q = query(
            collection(db, "notes"),
            where("userId", "==", userId)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    });
}

export async function createNote(userId, folderId, title, encryptedContent, predefinedId = null) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const newNote = {
            id: predefinedId || "note_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            userId,
            folderId,
            title,
            content: encryptedContent,
            images: [],
            isPinned: false,
            createdAt: { seconds: Math.floor(Date.now() / 1000) },
            updatedAt: { seconds: Math.floor(Date.now() / 1000) },
        };
        notes.push(newNote);
        setLocalNotes(notes);
        return newNote.id;
    }
    const newId = predefinedId || doc(collection(db, "notes")).id;
    const docRef = doc(db, "notes", newId);
    await setDoc(docRef, {
        userId,
        folderId,
        title,
        content: encryptedContent,
        images: [],
        isPinned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newId;
}

export async function updateNote(noteId, title, encryptedContent, images) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const updated = notes.map(n => {
            if (n.id === noteId) {
                const data = {
                    ...n,
                    title,
                    content: encryptedContent,
                    updatedAt: { seconds: Math.floor(Date.now() / 1000) },
                };
                if (images !== undefined) data.images = images;
                return data;
            }
            return n;
        });
        setLocalNotes(updated);
        return;
    }
    const data = {
        title,
        content: encryptedContent,
        updatedAt: serverTimestamp(),
    };
    if (images !== undefined) data.images = images;
    await updateDoc(doc(db, "notes", noteId), data);
}

export async function deleteNote(noteId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const updated = notes.map(n => n.id === noteId ? { ...n, inBin: true, deletedAt: { seconds: Math.floor(Date.now() / 1000) } } : n);
        setLocalNotes(updated);
        return;
    }
    await updateDoc(doc(db, "notes", noteId), { inBin: true, deletedAt: serverTimestamp() });
}

export async function deleteNotePermanently(noteId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        setLocalNotes(notes.filter(n => n.id !== noteId));
        return;
    }
    await deleteDoc(doc(db, "notes", noteId));
}

export async function restoreNote(noteId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const updated = notes.map(n => n.id === noteId ? { ...n, inBin: false, deletedAt: null } : n);
        setLocalNotes(updated);
        return;
    }
    await updateDoc(doc(db, "notes", noteId), { inBin: false, deletedAt: null });
}

export async function clearBin(userId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        setLocalNotes(notes.filter(n => !(n.userId === userId && n.inBin)));
        return;
    }
    const q = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        where("inBin", "==", true)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
        batch.delete(d.ref);
    });
    await batch.commit();
}

// ─── Images ─────────────────────────────────────────────────────────────────

export async function uploadImage(userId, noteId, file) {
    if (isGuest()) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve({ url: reader.result, path: "local_" + Date.now() });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    const ext = file.name.split(".").pop();
    const path = `images/${userId}/${noteId}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { url, path };
}

export async function deleteImage(imagePath) {
    if (isGuest()) {
        return;
    }
    const storageRef = ref(storage, imagePath);
    await deleteObject(storageRef);
}

// ─── PIN Management ──────────────────────────────────────────────────────────

export async function updateNotePin(noteId, pinHash) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const updated = notes.map(n => n.id === noteId ? { ...n, pinHash, updatedAt: { seconds: Math.floor(Date.now() / 1000) } } : n);
        setLocalNotes(updated);
        return;
    }
    await updateDoc(doc(db, "notes", noteId), {
        pinHash,
        updatedAt: serverTimestamp(),
    });
}

export async function updateNotePinState(noteId, isPinned) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const updated = notes.map(n => n.id === noteId ? { ...n, isPinned, updatedAt: { seconds: Math.floor(Date.now() / 1000) } } : n);
        setLocalNotes(updated);
        return;
    }
    await updateDoc(doc(db, "notes", noteId), {
        isPinned,
        updatedAt: serverTimestamp(),
    });
}

export async function updateFolderPin(folderId, pinHash) {
    if (isGuest()) {
        const folders = getLocalFolders();
        const updated = folders.map(f => f.id === folderId ? { ...f, pinHash } : f);
        setLocalFolders(updated);
        return;
    }
    await updateDoc(doc(db, "folders", folderId), {
        pinHash,
    });
}

export async function getUserPinHash(userId) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const config = notes.find(n => n.userId === userId && n.isPinConfig);
        return config ? config.pinHash : null;
    }
    const q = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        where("isPinConfig", "==", true)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        return snap.docs[0].data().pinHash || null;
    }
    return null;
}

export async function setUserPinHash(userId, pinHash) {
    if (isGuest()) {
        const notes = getLocalNotes();
        const index = notes.findIndex(n => n.userId === userId && n.isPinConfig);
        if (index !== -1) {
            notes[index].pinHash = pinHash;
        } else {
            notes.push({
                id: "pin_config_" + userId,
                userId,
                title: "PIN Config",
                content: "",
                isPinConfig: true,
                pinHash,
                createdAt: { seconds: Math.floor(Date.now() / 1000) },
            });
        }
        setLocalNotes(notes);
        return;
    }
    const q = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        where("isPinConfig", "==", true)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        const docRef = doc(db, "notes", snap.docs[0].id);
        await updateDoc(docRef, { pinHash });
    } else {
        await addDoc(collection(db, "notes"), {
            userId,
            title: "PIN Config",
            content: "",
            isPinConfig: true,
            pinHash,
            createdAt: serverTimestamp(),
        });
    }
}

export async function deleteUserAccountData(userId) {
    if (isGuest()) {
        if (typeof window !== "undefined") {
            try {
                localStorage.removeItem("guest_folders");
                localStorage.removeItem("guest_notes");
            } catch (e) {
                console.error("Failed to clean guest storage", e);
            }
        }
        return;
    }

    // 1. Delete notes (including pin config)
    const notesQuery = query(collection(db, "notes"), where("userId", "==", userId));
    const notesSnap = await getDocs(notesQuery);
    const notesBatch = writeBatch(db);
    notesSnap.docs.forEach((d) => {
        notesBatch.delete(d.ref);
    });
    await notesBatch.commit();

    // 2. Delete folders
    const foldersQuery = query(collection(db, "folders"), where("userId", "==", userId));
    const foldersSnap = await getDocs(foldersQuery);
    const foldersBatch = writeBatch(db);
    foldersSnap.docs.forEach((d) => {
        foldersBatch.delete(d.ref);
    });
    await foldersBatch.commit();

    // 3. Clear local storage caches
    if (typeof window !== "undefined") {
        try {
            localStorage.removeItem(`user_folders_${userId}`);
            localStorage.removeItem(`user_pin_hash_${userId}`);
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`user_notes_${userId}_`)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (e) {
            console.error("Failed to clean user local storage", e);
        }
    }
}

