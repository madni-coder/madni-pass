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
import { db, storage } from "./firebase";

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
    return dedupeRead(`folders:${userId}`, async () => {
        const q = query(
            collection(db, "folders"),
            where("userId", "==", userId)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return docs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    });
}

export async function createFolder(userId, name) {
    const docRef = await addDoc(collection(db, "folders"), {
        userId,
        name,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateFolder(folderId, name) {
    await updateDoc(doc(db, "folders", folderId), { name });
}

export async function deleteFolder(folderId) {
    await deleteDoc(doc(db, "folders", folderId));
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function getNotes(userId, folderId) {
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

export async function createNote(userId, folderId, title, encryptedContent) {
    const docRef = await addDoc(collection(db, "notes"), {
        userId,
        folderId,
        title,
        content: encryptedContent,
        images: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateNote(noteId, title, encryptedContent, images) {
    const data = {
        title,
        content: encryptedContent,
        updatedAt: serverTimestamp(),
    };
    if (images !== undefined) data.images = images;
    await updateDoc(doc(db, "notes", noteId), data);
}

export async function deleteNote(noteId) {
    await updateDoc(doc(db, "notes", noteId), { inBin: true, deletedAt: serverTimestamp() });
}

export async function deleteNotePermanently(noteId) {
    await deleteDoc(doc(db, "notes", noteId));
}

export async function restoreNote(noteId) {
    await updateDoc(doc(db, "notes", noteId), { inBin: false, deletedAt: null });
}

export async function clearBin(userId) {
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
    const ext = file.name.split(".").pop();
    const path = `images/${userId}/${noteId}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { url, path };
}

export async function deleteImage(imagePath) {
    const storageRef = ref(storage, imagePath);
    await deleteObject(storageRef);
}

// ─── PIN Management ──────────────────────────────────────────────────────────

export async function updateNotePin(noteId, pinHash) {
    await updateDoc(doc(db, "notes", noteId), {
        pinHash,
        updatedAt: serverTimestamp(),
    });
}

export async function updateFolderPin(folderId, pinHash) {
    await updateDoc(doc(db, "folders", folderId), {
        pinHash,
    });
}

export async function getUserPinHash(userId) {
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
