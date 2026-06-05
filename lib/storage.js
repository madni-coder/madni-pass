// localStorage helpers — stores all folders and notes data

function getStore() {
    if (typeof window === "undefined") return { folders: [], notes: [] };
    try {
        return JSON.parse(localStorage.getItem("madnipass") || '{"folders":[],"notes":[]}');
    } catch {
        return { folders: [], notes: [] };
    }
}

function saveStore(store) {
    localStorage.setItem("madnipass", JSON.stringify(store));
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Folders ────────────────────────────────────────────────────────────────

export function getFolders() {
    return getStore().folders;
}

export function createFolder(name) {
    const store = getStore();
    const folder = { id: uid(), name, createdAt: Date.now() };
    store.folders.push(folder);
    saveStore(store);
    return folder;
}

export function updateFolderName(id, name) {
    const store = getStore();
    const f = store.folders.find((f) => f.id === id);
    if (f) f.name = name;
    saveStore(store);
}

export function removeFolder(id) {
    const store = getStore();
    store.folders = store.folders.filter((f) => f.id !== id);
    saveStore(store);
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export function getAllNotes() {
    return [...getStore().notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getNotesByFolder(folderId) {
    return getStore()
        .notes.filter((n) => n.folderId === folderId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createNote(folderId, title, content) {
    const store = getStore();
    const note = {
        id: uid(),
        folderId,
        title,
        content,
        images: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    store.notes.unshift(note);
    saveStore(store);
    return note;
}

export function updateNoteData(id, title, content, images) {
    const store = getStore();
    const note = store.notes.find((n) => n.id === id);
    if (note) {
        note.title = title;
        note.content = content;
        if (images !== undefined) note.images = images;
        note.updatedAt = Date.now();
    }
    saveStore(store);
}

export function removeNote(id) {
    const store = getStore();
    store.notes = store.notes.filter((n) => n.id !== id);
    saveStore(store);
}


