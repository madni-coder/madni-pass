import CryptoJS from "crypto-js";

/**
 * Encrypt text using AES-256 with user's master password.
 * Data is encrypted client-side before going to Firebase.
 */
export function encrypt(text, masterPassword) {
    if (!text || !masterPassword) return text;
    return CryptoJS.AES.encrypt(text, masterPassword).toString();
}

/**
 * Decrypt AES-256 encrypted text.
 * Returns null if decryption fails (wrong password).
 */
export function decrypt(cipherText, masterPassword) {
    if (!cipherText || !masterPassword) return cipherText;
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, masterPassword);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        return decrypted || null;
    } catch {
        return null;
    }
}

/**
 * Search through decrypted note content.
 * Returns true if query is found in the note title or content.
 */
export function searchNote(note, query, masterPassword) {
    if (!query) return true;
    const q = query.toLowerCase();
    const title = (note.title || "").toLowerCase();
    const content = decrypt(note.content, masterPassword) || "";
    return title.includes(q) || content.toLowerCase().includes(q);
}
