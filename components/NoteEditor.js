"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createNote, updateNoteData } from "@/lib/storage";
import { encrypt } from "@/lib/crypto";
import { saveImage, removeImage, loadImageUrl } from "@/lib/imageStore";
import { notify } from "@/lib/notify";
import { Save, X, ImagePlus, Loader2 } from "lucide-react";

export default function NoteEditor({ note, folderId, onSave, onClose }) {
    const isNew = !note?.id;
    const [title, setTitle] = useState(note?.title || "");
    const [content, setContent] = useState(note?.content || "");
    const [images, setImages] = useState(note?.images || []);
    const [imgUrls, setImgUrls] = useState({});
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    // Load blob URLs for existing images
    useEffect(() => {
        images.forEach(async (img) => {
            const url = await loadImageUrl(img.id);
            if (url) setImgUrls((prev) => ({ ...prev, [img.id]: url }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        if (!title.trim()) { notify("Note ka title dalo", "error"); return; }
        if (!folderId && isNew) { notify("Pehle ek folder select karo", "error"); return; }
        setSaving(true);
        try {
            // Use client-side encryption for local store as well — get master password from session
            let master = null;
            try { master = sessionStorage.getItem("masterPassword"); } catch { }
            if (!master && typeof window !== "undefined") {
                master = window.prompt("Enter master password to encrypt this note (optional):") || null;
                try { if (master) sessionStorage.setItem("masterPassword", master); } catch { }
            }
            const encTitle = encrypt(title.trim(), master);
            const encContent = encrypt(content, master);

            if (isNew) {
                const saved = createNote(folderId, encTitle, encContent);
                onSave({ ...saved });
                notify("Note save ho gaya!");
            } else {
                updateNoteData(note.id, encTitle, encContent, images);
                onSave({ ...note, title: title.trim(), content, images });
                notify("Note update ho gaya!");
            }
        } catch (err) {
            notify("Failed to save: " + err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) { notify("Image 100MB se badi nahi honi chahiye", "error"); return; }
        if (isNew) { notify("Pehle note save karo, phir image daalo", "error"); return; }
        setUploading(true);
        try {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            await saveImage(id, file);
            const url = URL.createObjectURL(file);
            const newImg = { id, name: file.name };
            const newImages = [...images, newImg];
            setImages(newImages);
            setImgUrls((prev) => ({ ...prev, [id]: url }));
            updateNoteData(note.id, title, content, newImages);
            notify("Image add ho gayi!");
        } catch {
            notify("Image upload nahi hui", "error");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const handleDeleteImage = async (img, idx) => {
        try {
            await removeImage(img.id);
            const newImages = images.filter((_, i) => i !== idx);
            setImages(newImages);
            updateNoteData(note.id, title, content, newImages);
            notify("Image delete ho gayi!");
        } catch {
            notify("Image delete nahi hui", "error");
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-800">
                    <DialogTitle>{isNew ? "Naya Note" : "Note Edit karo"}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6 py-4">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-sm text-gray-400">Title</Label>
                            <Input
                                autoFocus
                                placeholder="Ex: Instagram Credentials"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm text-gray-400">Content</Label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={"Insta id - john@gmail.com\nInsta pass - 123456\n\nGmail id - john@mail.com\nPass - 123453"}
                                rows={12}
                                className="w-full bg-gray-800 border border-gray-700 rounded-md text-white text-sm px-3 py-2 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono"
                            />
                        </div>

                        {!isNew && (
                            <div className="space-y-2">
                                <Label className="text-sm text-gray-400">Images</Label>
                                <div className="flex flex-wrap gap-2">
                                    {images.map((img, idx) => (
                                        <div key={img.id} className="relative group">
                                            {imgUrls[img.id] ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={imgUrls[img.id]} alt={img.name} className="w-24 h-24 object-cover rounded-lg border border-gray-700" />
                                            ) : (
                                                <div className="w-24 h-24 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                                                </div>
                                            )}
                                            <button onClick={() => handleDeleteImage(img, idx)} className="absolute top-1 right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                                        className="w-24 h-24 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-indigo-500 hover:text-indigo-400 transition-colors">
                                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImagePlus className="w-5 h-5" /><span className="text-xs">Add Image</span></>}
                                    </button>
                                </div>
                                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </div>
                        )}
                        {isNew && <p className="text-xs text-gray-600">💡 Save karne ke baad images attach kar sakte ho</p>}
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-4 border-t border-gray-800">
                    <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save karo</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
