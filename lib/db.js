import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

// ─── Folders ────────────────────────────────────────────────────────────────

export async function getFolders(userId) {
    const q = query(
        collection(db, "folders"),
        where("userId", "==", userId),
        orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    const q = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        where("folderId", "==", folderId),
        orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllNotes(userId) {
    const q = query(
        collection(db, "notes"),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    await deleteDoc(doc(db, "notes", noteId));
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
