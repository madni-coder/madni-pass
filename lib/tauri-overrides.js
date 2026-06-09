if (typeof window !== "undefined") {
    const isTauriOrMobile = 
        !!window.__TAURI_INTERNALS__ ||
        window.location.protocol === "tauri:" ||
        window.location.hostname === "tauri.localhost" ||
        /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isTauriOrMobile) {
        // Mock window.gapi to prevent TypeError: undefined is not an object (evaluating 'gapi.iframes.getContext')
        if (!window.gapi) {
            window.gapi = {};
        }
        if (!window.gapi.iframes) {
            window.gapi.iframes = {
                getContext: function () {
                    console.log("[Firebase Bypass] Mocked gapi.iframes.getContext called.");
                    return {
                        iframe: {},
                        openChild: function () {
                            return {
                                register: function () {},
                                reposition: function () {},
                                close: function () {}
                            };
                        }
                    };
                }
            };
        }

        const blockGapi = (element) => {
            if (element && element.tagName === "SCRIPT" && typeof element.src === "string" && element.src.includes("apis.google.com")) {
                console.log("[Firebase Bypass] Blocking GAPI script injection on Tauri/Mobile to prevent CORS crash:", element.src);
                setTimeout(() => {
                    if (typeof element.onerror === "function") {
                        element.onerror(new Error("GAPI blocked on Tauri/Mobile to prevent CORS crash."));
                    }
                }, 0);
                return true;
            }
            return false;
        };

        const originalAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (element) {
            if (blockGapi(element)) return element;
            return originalAppendChild.apply(this, arguments);
        };

        const originalInsertBefore = Node.prototype.insertBefore;
        Node.prototype.insertBefore = function (newElement, referenceElement) {
            if (blockGapi(newElement)) return newElement;
            return originalInsertBefore.apply(this, arguments);
        };

        // Intercept WebSocket connection for Webpack HMR in development to point to correct dev server port (3000)
        const OriginalWebSocket = window.WebSocket;
        if (OriginalWebSocket) {
            const ProxyWebSocket = function (url, protocols) {
                if (typeof url === "string" && url.includes("webpack-hmr")) {
                    console.log("[Tauri HMR Bypass] Intercepting HMR WebSocket URL:", url);
                    const newUrl = url
                        .replace(/^wss:\/\//i, "ws://")
                        .replace(/localhost\b/i, "localhost:3000");
                    console.log("[Tauri HMR Bypass] Redirected to:", newUrl);
                    return new OriginalWebSocket(newUrl, protocols);
                }
                if (protocols) {
                    return new OriginalWebSocket(url, protocols);
                }
                return new OriginalWebSocket(url);
            };

            ProxyWebSocket.prototype = OriginalWebSocket.prototype;
            ProxyWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
            ProxyWebSocket.OPEN = OriginalWebSocket.OPEN;
            ProxyWebSocket.CLOSING = OriginalWebSocket.CLOSING;
            ProxyWebSocket.CLOSED = OriginalWebSocket.CLOSED;

            window.WebSocket = ProxyWebSocket;
        }
    }
}

