// Standalone version of contentScript.js that will be directly accessible to the page
// Keep track of whether we've already injected scripts to avoid duplicating
let libraryInjected = false;
let lastRequestId = 0;
const pendingRequests = new Map();
let extensionPath = ''; // Will be set from outside

// Function to inject a script into the page
function injectScript(src, onload = null) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');

        if (src.startsWith('http') || src.startsWith('/') || src.startsWith('chrome-extension://')) {
            // External file or absolute path
            script.src = src;
            script.onload = () => {
                console.log(`🍥 Successfully loaded external script: ${src}`);
                resolve();
                if (onload) onload();
            };
            script.onerror = (error) => {
                console.error(`🍥 Failed to load script: ${src}`, error);
                reject(error);
            };
        } else {
            // Inline script content
            script.textContent = src;
            // Inline scripts execute immediately after being added to the DOM
            setTimeout(resolve, 0);
        }

        (document.head || document.documentElement).appendChild(script);
        if (!src.startsWith('http') && !src.startsWith('/') && !src.startsWith('chrome-extension://')) {
            // Remove inline scripts after they're injected to avoid cluttering the DOM
            // But leave external scripts which need to stay to continue loading
            script.parentNode.removeChild(script);
        }
    });
}

// Function to inject CSS into the page
function injectCSS(cssText) {
    const style = document.createElement('style');
    style.id = 'youtube-danmaku-styles';
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
    console.log('🍥 Injected CSS styles for CommentCoreLibrary');
}

// Function to send commands to the page script and get responses
function sendCommandToPage(command, data = {}) {
    return new Promise((resolve, reject) => {
        const requestId = ++lastRequestId;

        // Set up listener for this specific request's response
        const responseHandler = (event) => {
            if (
                event.source !== window ||
                !event.data ||
                event.data.type !== 'YOUTUBE_DANMAKU_RESPONSE' ||
                event.data.requestId !== requestId
            ) {
                return;
            }

            // Clean up the listener
            window.removeEventListener('message', responseHandler);
            pendingRequests.delete(requestId);

            if (event.data.success) {
                resolve(event.data.result);
            } else {
                reject(new Error(event.data.error || 'Unknown error'));
            }
        };

        // Store the request and add the listener
        pendingRequests.set(requestId, responseHandler);
        window.addEventListener('message', responseHandler);

        // Send the command to the page
        window.postMessage({
            type: 'YOUTUBE_DANMAKU_COMMAND',
            command,
            data,
            requestId
        }, '*');

        // Set a timeout to prevent hanging promises
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                window.removeEventListener('message', responseHandler);
                pendingRequests.delete(requestId);
                reject(new Error(`Command ${command} timed out after 5000ms`));
            }
        }, 5000);
    });
}

// The main function to inject the library and supporting files
async function injectCommentCoreLibrary() {
    if (libraryInjected) {
        console.log('🍥 CommentCoreLibrary already injected');
        return;
    }

    console.log('🍥 Injecting CommentCoreLibrary into page...');

    try {
        // First, inject the CSS
        const cclCSS = `
      /* Core styles needed for CommentCoreLibrary */
      .abp {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
        z-index: 9999;
      }
      .container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
      }
      .cmt {
        position: absolute;
        color: #fff;
        text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        white-space: nowrap;
        font-family: SimHei, SimSun, Helvetica, sans-serif;
        font-weight: bold;
        cursor: default;
        -webkit-font-smoothing: antialiased;
        pointer-events: none;
      }
    `;
        injectCSS(cclCSS);

        // Then inject the main library (use the bundled version instead of CDN)
        if (!extensionPath) {
            console.error('🍥 Extension path not set, cannot load CommentCoreLibrary');
            throw new Error('Extension path not set');
        }

        // Load from extension's vendor directory
        const cclUrl = extensionPath + 'vendor/CommentCoreLibrary.min.js';
        console.log('🍥 Loading CommentCoreLibrary from:', cclUrl);
        await injectScript(cclUrl);

        // Finally, inject our page script
        const pageScriptUrl = extensionPath + 'pageScript.bundle.js';
        console.log('🍥 Loading page script from:', pageScriptUrl);
        await injectScript(pageScriptUrl);

        libraryInjected = true;
        console.log('🍥 CommentCoreLibrary successfully injected into page');

        // Create a container for the danmaku overlay
        const videoContainer = document.querySelector('div#movie_player');
        if (!videoContainer) {
            throw new Error('Could not find YouTube video container');
        }

        const containerId = 'youtube-danmaku-container-wrapper';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'absolute';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.pointerEvents = 'none';
            videoContainer.appendChild(container);
        }

        // Initialize the danmaku system in the page context
        const initialized = await sendCommandToPage('initialize', { containerId });
        if (!initialized) {
            throw new Error('Failed to initialize CommentManager in page context');
        }

        return true;
    } catch (error) {
        console.error('🍥 Error injecting CommentCoreLibrary:', error);
        libraryInjected = false;
        return false;
    }
}

// Function to load and display danmaku
async function showDanmaku(danmakuData) {
    try {
        // Make sure the library is injected
        if (!libraryInjected) {
            await injectCommentCoreLibrary();
        }

        // Transform the data to the format expected by CommentCoreLibrary
        // The typical format needs: { "mode": 1, "text": "text", "stime": timeInMs, "size": 25, "color": 0xffffff }
        const transformedData = danmakuData.map(comment => ({
            mode: comment.mode || 1, // Default to scrolling
            text: comment.text,
            stime: comment.time * 1000, // Convert to milliseconds
            size: comment.size || 25,
            color: comment.color || 0xffffff
        }));

        // Send the data to the page script
        const result = await sendCommandToPage('loadDanmaku', { danmakuArray: transformedData });
        if (!result) {
            throw new Error('Failed to load danmaku data');
        }

        console.log(`🍥 Successfully loaded ${transformedData.length} danmaku comments`);
        return true;
    } catch (error) {
        console.error('🍥 Error showing danmaku:', error);
        return false;
    }
}

// Function to hide/remove danmaku
async function hideDanmaku() {
    try {
        if (!libraryInjected) {
            // Nothing to hide if not injected
            return true;
        }

        const result = await sendCommandToPage('cleanup');
        return result;
    } catch (error) {
        console.error('🍥 Error hiding danmaku:', error);
        return false;
    }
}

// Add a method to set the extension path from outside
function setExtensionPath(path) {
    extensionPath = path;
    console.log('🍥 Extension path set to:', extensionPath);
}

// Export functions to be used by the rest of the content script
window.danmakuManager = {
    show: showDanmaku,
    hide: hideDanmaku,
    injectLibrary: injectCommentCoreLibrary,
    setExtensionPath: setExtensionPath
};

console.log('🍥 Standalone content script danmaku manager initialized'); 