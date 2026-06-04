"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createNote, updateNoteData } from "@/lib/storage";
import { encrypt } from "@/lib/crypto";
import { storeImage, getImageSrc } from "@/lib/imageStore";
import { notify } from "@/lib/notify";
import { Save, X, ImagePlus, Loader2 } from "lucide-react";

export default function NoteEditor({ note, folderId, onSave, onClose }) {
    const isNew = !note?.id;
    const [title, setTitle] = useState(note?.title || "");
    const [content, setContent] = useState(note?.content || "");
    const [images, setImages] = useState(note?.images || []);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    const handleSave = async () => {
        if (!title.trim()) { notify("Please enter a note title", "error"); return; }
        if (!folderId && isNew) { notify("Please select a folder first", "error"); return; }
        setSaving(true);
        try {
            // Use client-side encryption for local store as well — only retrieve any existing master password
            let master = null;
            try { master = sessionStorage.getItem("masterPassword"); } catch { }
            const encTitle = encrypt(title.trim(), master);
            const encContent = encrypt(content, master);

            if (isNew) {
                const saved = createNote(folderId, encTitle, encContent);
                onSave({ ...saved });
                notify("Note saved successfully!");
            } else {
                updateNoteData(note.id, encTitle, encContent, images);
                onSave({ ...note, title: title.trim(), content, images });
                notify("Note updated successfully!");
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
        if (file.size > 10 * 1024 * 1024) { notify("Image size must be smaller than 10MB", "error"); return; }
        if (isNew) { notify("Please save the note first before attaching an image", "error"); return; }
        setUploading(true);
        try {
            let master = null;
            try { master = sessionStorage.getItem("masterPassword"); } catch { }
            const imgData = await storeImage(file, master);
            const newImages = [...images, imgData];
            setImages(newImages);
            updateNoteData(note.id, title, content, newImages);
            notify("Image attached successfully!");
        } catch (err) {
            notify("Failed to upload image: " + (err?.message || err), "error");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const displayImages = useMemo(() => {
        let master = null;
        try { master = sessionStorage.getItem("masterPassword"); } catch { }
        return images.map(img => ({ ...img, displaySrc: getImageSrc(img, master) }));
    }, [images]);

    const handleDeleteImage = async (img, idx) => {
        const newImages = images.filter((_, i) => i !== idx);
        setImages(newImages);
        updateNoteData(note.id, title, content, newImages);
        notify("Image deleted successfully!");
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-800">
                    <DialogTitle>{isNew ? "New Note" : "Edit Note"}</DialogTitle>
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
                                    {displayImages.map((img, idx) => (
                                        <div key={idx} className="relative group">
                                            {img.displaySrc ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={img.displaySrc} alt={img.name} className="w-24 h-24 object-cover rounded-lg border border-gray-700" />
                                            ) : (
                                                <div className="w-24 h-24 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                                                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                                                </div>
                                            )}
                                            <button onClick={() => handleDeleteImage(img, idx)} className="absolute top-1 right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                        {isNew && <p className="text-xs text-gray-600">💡 You can attach images after saving the note</p>}
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-4 border-t border-gray-800">
                    <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
