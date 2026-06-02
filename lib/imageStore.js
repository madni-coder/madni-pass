// Cloudinary image upload helper — browser se seedha upload karta hai
// Unsigned preset use karta hai, koi server nahi chahiye

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload a file to Cloudinary.
 * Returns { url, publicId, name }
 */
export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Upload failed (${res.status})`);
    }

    const data = await res.json();
    return { url: data.secure_url, publicId: data.public_id, name: file.name };
}
