// Simple event-based notification — no context, no toast library
const _listeners = [];
let _id = 0;

export function notify(message, type = "success") {
    const n = { id: _id++, message, type };
    _listeners.forEach((l) => l(n));
}

export function _subscribe(fn) {
    _listeners.push(fn);
    return () => {
        const i = _listeners.indexOf(fn);
        if (i !== -1) _listeners.splice(i, 1);
    };
}
