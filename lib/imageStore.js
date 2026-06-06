// Image storage helper — images are compressed and encrypted client-side
// before being stored in Firestore. No external service required.
// Old Cloudinary URLs (legacy) are also supported for backward compatibility.

import { encrypt, decrypt } from "@/lib/crypto";

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.82;

/** Compress an image file to JPEG using canvas. Returns a base64 data URL. */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let { width, height } = img;
            if (width > MAX_WIDTH) {
                height = Math.round(height * MAX_WIDTH / width);
                width = MAX_WIDTH;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (!blob) { reject(new Error("Image compression failed")); return; }
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                },
                "image/jpeg",
                JPEG_QUALITY
            );
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
        img.src = objectUrl;
    });
}

/**
 * Compress and encrypt an image with the master password.
 * Returns { encryptedData, name } — safe to store in Firestore.
 */
export async function storeImage(file, masterPassword) {
    const dataUrl = await compressImage(file);
    const encryptedData = encrypt(dataUrl, masterPassword);
    const encryptedName = encrypt(file.name, masterPassword);
    return { encryptedData, name: encryptedName };
}

/**
 * Get a displayable src string for an image object.
 * Handles new encrypted format { encryptedData, name }
 * and old Cloudinary format { url, name } for backward compatibility.
 */
export function getImageSrc(img, masterPassword) {
    if (img?.encryptedData) {
        return decrypt(img.encryptedData, masterPassword) ?? "";
    }
    return img?.url ?? "";
}
