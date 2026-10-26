// Simple event-based notification — no context, no toast library
const _listeners = [];
let _id = 0;

/**
 * Sends a notification.
 * If running in a Tauri environment, it will also attempt to send a system notification.
 */
export async function notify(message, type = "success", action = null) {
    // 1. Trigger in-app toast listeners
    const n = { id: _id++, message, type, action };
    _listeners.forEach((l) => l(n));

    // 2. Handle System Notifications if in Tauri
    if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
        try {
            const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");

            let permission = await isPermissionGranted();
            if (!permission) {
                permission = await requestPermission() === 'granted';
            }

            if (permission) {
                sendNotification({
                    title: type === "error" ? "Error" : "Madni Pass",
                    body: message,
                });
            }
        } catch (err) {
            console.error("Failed to send system notification:", err);
        }
    }
}

export function _subscribe(fn) {
    _listeners.push(fn);
    return () => {
        const i = _listeners.indexOf(fn);
        if (i !== -1) _listeners.splice(i, 1);
    };
}
