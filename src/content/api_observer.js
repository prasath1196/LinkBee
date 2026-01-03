// src/content/api_observer.js

(function (window) {
    // 0. Console Hijacker (As per user request: "disable all other console logs and see only Linkbee stuff")
    const originalLog = window.console.log;
    const originalWarn = window.console.warn;
    const originalError = window.console.error;
    const originalInfo = window.console.info;
    const originalDebug = window.console.debug;

    const isLinkBee = (args) => {
        const firstArg = String(args[0] || "");
        return firstArg.includes("LinkBee");
    };

    window.console.log = function () { if (isLinkBee(arguments)) originalLog.apply(window.console, arguments); };
    window.console.warn = function () { if (isLinkBee(arguments)) originalWarn.apply(window.console, arguments); };
    window.console.error = function () { if (isLinkBee(arguments)) originalError.apply(window.console, arguments); };
    window.console.info = function () { if (isLinkBee(arguments)) originalInfo.apply(window.console, arguments); };
    window.console.debug = function () { if (isLinkBee(arguments)) originalDebug.apply(window.console, arguments); };

    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest;

    // Target patterns for LinkBee (Messaging & Profile Views)
    const TARGET_PATTERNS = [
        '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerMessages', // Called when opening individual message chat
        '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations' // Called when scrollling through side bar

    ];

    function emitData(url, payload) {
        try {
            const matched = TARGET_PATTERNS.some(pattern => url.includes(pattern));

            if (matched) {
                console.log("LinkBee: [MATCH] Captured relevant data from:", url);

                const event = new CustomEvent('LinkBee_Inbound_API', {
                    detail: {
                        url,
                        response: payload,
                        timestamp: Date.now()
                    }
                });
                window.dispatchEvent(event);
            }
        } catch (err) {
            originalError.apply(window.console, ["LinkBee: API Observer Emission Error", err]);
        }
    }

    console.log("LinkBee: [READY] Console Filter Active & Observer Loaded.");

    window.fetch = new Proxy(originalFetch, {
        apply: async function (target, thisArg, argumentsList) {
            const [resource] = argumentsList;
            let url = "unknown";
            try {
                url = (resource instanceof Request) ? resource.url : resource.toString();
            } catch (e) { }

            try {
                const response = await Reflect.apply(target, thisArg, argumentsList);
                const clone = response.clone();

                clone.json().then(data => {
                    emitData(url, data);
                }).catch(() => {
                    // Ignore non-JSON
                });

                return response;
            } catch (err) {
                // Only log network failures for LinkedIn targets to avoid noise
                if (url.includes("linkedin.com") && (url.includes("messaging") || url.includes("voyager"))) {
                    console.warn("LinkBee: [NETWORK FAIL]", url);
                }
                throw err;
            }
        }
    });


    const XHROpen = originalXHR.prototype.open;
    const XHRSend = originalXHR.prototype.send;

    originalXHR.prototype.open = function (method, url) {
        this._linkbee_url = url; // Store URL for the send callback
        return XHROpen.apply(this, arguments);
    };

    originalXHR.prototype.send = function (body) {
        // Attach load listener to capture response
        this.addEventListener('load', function () {
            if (this._linkbee_url) {
                try {
                    if (this.responseText && (this.responseText.startsWith('{') || this.responseText.startsWith('['))) {
                        const data = JSON.parse(this.responseText);
                        emitData(this._linkbee_url, data);
                    }
                } catch (e) { }
            }
        });
        return XHRSend.apply(this, arguments);
    };

    const nativeString = originalFetch.toString();
    window.fetch.toString = function () {
        return nativeString;
    };

})(window);