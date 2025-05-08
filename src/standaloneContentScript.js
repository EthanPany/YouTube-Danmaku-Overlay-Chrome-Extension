// This script is injected directly into the page context via manifest.json
// It handles initializing CommentManager and making it available to the page script

console.log('🍥 Standalone Content Script loaded - initializing CommentManager');

// Create a global danmakuManager object to handle CommentManager operations
window.danmakuManager = {
    commentManager: null,
    extensionPath: '',

    setExtensionPath: function (path) {
        this.extensionPath = path;
        console.log('🍥 Extension path set:', path);
    },

    injectLibrary: async function () {
        try {
            // First, inject CommentCoreLibrary
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('vendor/CommentCoreLibrary.min.js');

            await new Promise((resolve, reject) => {
                script.onload = () => {
                    console.log('🍥 CommentCoreLibrary loaded successfully');
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('🍥 Failed to load CommentCoreLibrary:', error);
                    reject(error);
                };
                (document.head || document.documentElement).appendChild(script);
            });

            // Wait a bit to ensure CommentManager is defined
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify CommentManager is available
            if (typeof CommentManager !== 'function') {
                console.error('🍥 CommentManager constructor not found after injection');
                return false;
            }

            console.log('🍥 CommentManager constructor found');
            return true;
        } catch (error) {
            console.error('🍥 Error injecting CommentCoreLibrary:', error);
            return false;
        }
    },

    show: async function (danmakuData) {
        try {
            // Transform the data into the format expected by CommentCoreLibrary
            const transformedData = danmakuData.map(comment => ({
                text: comment.text,
                mode: comment.mode === 1 ? 1 : 1, // Default to regular scrolling comments
                stime: comment.time * 1000 // Convert to milliseconds
            }));

            // Post message to page script to handle the actual showing
            window.postMessage({
                type: 'FROM_CONTENT_SCRIPT',
                action: 'loadDanmaku',
                data: { danmakuArray: transformedData }
            }, '*');

            return true;
        } catch (error) {
            console.error('🍥 Error in danmakuManager.show():', error);
            return false;
        }
    },

    hide: async function () {
        try {
            window.postMessage({
                type: 'FROM_CONTENT_SCRIPT',
                action: 'cleanup',
                data: {}
            }, '*');
            return true;
        } catch (error) {
            console.error('🍥 Error in danmakuManager.hide():', error);
            return false;
        }
    }
};

console.log('🍥 danmakuManager initialized and exposed to window'); 