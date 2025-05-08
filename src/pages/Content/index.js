import React from 'react';
import ReactDOM from 'react-dom/client';
import { extractYouTubeVideoData } from './modules/youtube';
import { searchBili, getBilibiliVideoDetails, fetchDanmaku } from './modules/bilibili';
import { findBestMatch } from './modules/match';
import DanmakuMatchPopup from '../../containers/DanmakuMatchPopup/DanmakuMatchPopup';

console.log('🍥 YouTube Danmaku Overlay Content Script Loaded 🍥');

const EXTENSION_ROOT_ID = 'youtube-danmaku-overlay-root';
const BILIBILI_POPUP_ID = 'bili-danmaku-popup-container';
const DANMAKU_OVERLAY_ID = 'bili-danmaku-overlay-container';
const STORAGE_KEY_PREFIX = 'youtubeDanmakuToggleState_'; // Prefix for storing state per video

let reactRoot = null;
let currentVideoId = null;
let matchedBiliData = null;
let isPopupVisible = false;
let commentManager = null;
let danmakuList = []; // Store for fetched danmaku
let currentOverlayState = false; // Keep track of the state we *think* should be active based on storage

// We need to inject the library before using it
async function ensureLibraryInjected() {
    // standaloneContentScript.bundle.js is now injected via manifest at document_start
    // We just need to wait for window.danmakuManager to be available
    if (!window.danmakuManager) {
        console.log('🍥 Waiting for danmakuManager to be initialized by standaloneContentScript...');
        let danmakuManagerLoaded = await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (window.danmakuManager) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 100);

            // Timeout after 5 seconds (should be faster now)
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.danmakuManager) { // Check one last time
                    console.error('🍥 Timed out waiting for danmakuManager to load. It should have been injected by the manifest.');
                    resolve(false);
                } else {
                    resolve(true);
                }
            }, 5000);
        });

        if (!danmakuManagerLoaded) {
            return false; // Early exit if it's still not there
        }
    }

    // Set the extension URL
    const extensionUrl = chrome.runtime.getURL('');
    console.log('🍥 Extension URL:', extensionUrl);

    // Now that we have the danmakuManager, set the extension path
    if (window.danmakuManager && window.danmakuManager.setExtensionPath) {
        window.danmakuManager.setExtensionPath(extensionUrl);
        console.log('🍥 danmakuManager found and extension path set successfully');

        // Initialize the library
        if (window.danmakuManager.injectLibrary) {
            try {
                await window.danmakuManager.injectLibrary(); // This injects CCL and pageScript from extension
                console.log('🍥 CommentCoreLibrary and pageScript should be injected by danmakuManager successfully');
            } catch (error) {
                console.error('🍥 Error calling danmakuManager.injectLibrary():', error);
                // No explicit fallback to injectCommentCoreFallback here,
                // as injectLibrary itself handles loading from extension files.
                // If injectLibrary fails, something is fundamentally wrong with resource access.
                return false;
            }
        } else {
            console.error('🍥 danmakuManager loaded but injectLibrary method not found');
            return false;
        }
    } else {
        console.error('🍥 danmakuManager loaded but setExtensionPath method not found, or danmakuManager is missing.');
        return false;
    }

    return !!window.danmakuManager;
}

// Fallback direct injection of CommentCoreLibrary if danmakuManager fails
// This function is now less likely to be called if ensureLibraryInjected works as expected
// with manifest injection. It's kept as a deep fallback.
async function injectCommentCoreFallback() {
    console.warn('🍥 Attempting deep fallback: injectCommentCoreFallback(). This should ideally not be reached.');

    try {
        // Insert the CommentCoreLibrary directly from extension
        const cclUrl = chrome.runtime.getURL('vendor/CommentCoreLibrary.min.js');
        console.log('🍥 Fallback: Loading CommentCoreLibrary directly from:', cclUrl);

        const ccl = document.createElement('script');
        ccl.src = cclUrl;
        let cclLoaded = false;
        ccl.onload = () => {
            console.log('🍥 Fallback: CommentCoreLibrary loaded successfully');
            cclLoaded = true;
        };
        ccl.onerror = (err) => {
            console.error('🍥 Fallback: Failed to load CommentCoreLibrary from extension:', err);
        };
        document.head.appendChild(ccl);

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit for script to load/error

        if (!cclLoaded && typeof CommentManager === 'undefined') { // Check if CCL loaded and defined CommentManager
            console.error('🍥 Fallback: CommentCoreLibrary failed to load or define CommentManager.');
            // Try to create a dummy CommentManager to prevent further errors if CCL is missing
            if (typeof CommentManager === 'undefined') {
                console.warn("🍥 Fallback: CCL not loaded, attempting to define a dummy CommentManager for basic messaging.");
                window.CommentManager = function () {
                    this.init = function () { };
                    this.load = function () { };
                    this.start = function () { };
                    this.stop = function () { };
                    this.clear = function () { };
                    this.time = function () { };
                    console.warn("🍥 Dummy CommentManager created. Danmaku will not display.");
                };
            }
        }


        // Insert the pageScript directly
        const pageScriptUrl = chrome.runtime.getURL('pageScript.bundle.js');
        console.log('🍥 Fallback: Loading pageScript from:', pageScriptUrl);

        const pageScript = document.createElement('script');
        pageScript.src = pageScriptUrl;
        let pageScriptLoaded = false;
        pageScript.onload = () => {
            console.log('🍥 Fallback: pageScript loaded successfully');
            pageScriptLoaded = true;
        };
        pageScript.onerror = (err) => {
            console.error('🍥 Fallback: Failed to load pageScript:', err);
        };
        document.head.appendChild(pageScript);

        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for pageScript to potentially initialize

        if (!pageScriptLoaded) {
            console.error('🍥 Fallback: pageScript.bundle.js failed to load.');
        }

        console.log('🍥 Fallback: CommentCoreLibrary and pageScript injection attempt finished.');

        // Re-create a simple danmakuManager for basic message passing if the main one failed
        // This fallback manager will attempt to directly postMessage to the pageScript
        if (!window.danmakuManager) {
            console.warn("🍥 Fallback: window.danmakuManager still not available. Creating a simple postMessage-based fallback manager.");
            window.danmakuManager = {
                show: async (danmakuData) => {
                    try {
                        const transformedData = danmakuData.map(comment => ({
                            text: comment.text,
                            mode: comment.mode === 1 ? 1 : 1,
                            stime: comment.time * 1000
                        }));
                        window.postMessage({
                            type: 'FROM_CONTENT_SCRIPT', // Use the same type pageScript listens for
                            action: 'loadDanmaku',
                            data: { danmakuArray: transformedData }
                        }, '*');
                        console.log("🍥 Fallback manager: show() message posted.");
                        return true;
                    } catch (e) {
                        console.error('🍥 Error in fallback manager show():', e);
                        return false;
                    }
                },
                hide: async () => {
                    try {
                        window.postMessage({
                            type: 'FROM_CONTENT_SCRIPT',
                            action: 'cleanup',
                            data: {}
                        }, '*');
                        console.log("🍥 Fallback manager: hide() message posted.");
                        return true;
                    } catch (e) {
                        console.error('🍥 Error in fallback manager hide():', e);
                        return false;
                    }
                },
                // No injectLibrary or setExtensionPath in this very basic fallback
            };
            return true; // Fallback manager created
        }
        return false; // Fallback manager was not needed or failed to create
    } catch (error) {
        console.error('🍥 Deep Fallback injection failed catastrophically:', error);
        return false;
    }
}

function getStorageKey() {
    return currentVideoId ? `${STORAGE_KEY_PREFIX}${currentVideoId}` : null;
}

function getYouTubeVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function cleanupUI(fullReset = true) {
    const existingPopupRoot = document.getElementById(BILIBILI_POPUP_ID);
    if (existingPopupRoot && reactRoot) {
        reactRoot.unmount();
        existingPopupRoot.remove();
        reactRoot = null;
    }
    const existingOverlay = document.getElementById(DANMAKU_OVERLAY_ID);
    if (existingOverlay) {
        if (commentManager) {
            commentManager.clear();
            commentManager.stop(); // Ensure CM is stopped
            commentManager = null;
        }
        existingOverlay.remove();
    }
    isPopupVisible = false;
    if (fullReset) {
        matchedBiliData = null;
        danmakuList = [];
        currentVideoId = null; // Clear video ID on full cleanup
        currentOverlayState = false; // Reset state assumption
    }
}

function renderPopup(show = true) {
    if (!show) {
        if (isPopupVisible) {
            // Only unmount if it's just the popup being hidden, not a full cleanup
            const popupContainer = document.getElementById(BILIBILI_POPUP_ID);
            if (popupContainer && reactRoot) {
                reactRoot.unmount();
                popupContainer.remove();
                reactRoot = null;
            }
        }
        isPopupVisible = false;
        return;
    }

    if (!matchedBiliData) return;

    let popupContainer = document.getElementById(BILIBILI_POPUP_ID);
    if (!popupContainer) {
        popupContainer = document.createElement('div');
        popupContainer.id = BILIBILI_POPUP_ID;
        // Append directly to body for fixed positioning context
        document.body.appendChild(popupContainer);
    }

    if (!reactRoot) {
        reactRoot = ReactDOM.createRoot(popupContainer);
    }

    isPopupVisible = true;
    reactRoot.render(
        <React.StrictMode>
            <DanmakuMatchPopup
                matchData={matchedBiliData}
                onShowDanmaku={handleShowDanmakuToggle}
                onClosePopup={handleClosePopup}
                initialOverlayActive={currentOverlayState}
            />
        </React.StrictMode>
    );
}

async function handleShowDanmakuToggle(newState, biliId) {
    if (!currentVideoId || !matchedBiliData) return;

    console.log(`🍥 Toggling Danmaku Overlay to: ${newState}`);
    currentOverlayState = newState; // Update our tracked state

    // Save the new state to storage
    const storageKey = getStorageKey();
    if (storageKey) {
        chrome.storage.local.set({ [storageKey]: newState }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving toggle state:', chrome.runtime.lastError);
            } else {
                console.log(`🍥 Toggle state (${newState}) saved for ${storageKey}`);
            }
        });
    }

    // Show/Hide logic based on the new state
    if (newState) { // Show Overlay
        console.log('🍥 Attempting to show danmaku...');
        let cid = matchedBiliData.cid;
        // Fetch CID if needed (ensure matchedBiliData has bvid)
        if (!cid && matchedBiliData.bvid) {
            console.warn("🍥 Matched Bilibili data doesn't have CID, fetching...");
            const details = await getBilibiliVideoDetails(matchedBiliData.bvid);
            if (details && details.cid) {
                cid = details.cid;
                matchedBiliData.cid = cid; // Update stored data
            } else {
                console.error('🍥 Failed to get CID for matched video. Cannot load danmaku.');
                return;
            }
        }

        if (!cid) {
            console.error('🍥 Cannot show danmaku without CID.');
            return;
        }

        // Fetch or use cached Danmaku
        if (danmakuList && danmakuList.length > 0) {
            console.log('🍥 Using cached danmaku list.');
            setupDanmakuOverlay(danmakuList);
        } else {
            const fetchedDanmaku = await fetchDanmaku(cid);
            if (fetchedDanmaku) {
                danmakuList = fetchedDanmaku;
                setupDanmakuOverlay(danmakuList);
            } else {
                console.error('🍥 Failed to fetch danmaku.');
            }
        }
    } else { // Hide Overlay
        console.log('🍥 Hiding danmaku...');

        // Use the danmakuManager when available
        await ensureLibraryInjected();
        if (window.danmakuManager) {
            window.danmakuManager.hide()
                .then(() => console.log('🍥 Danmaku overlay hidden successfully.'))
                .catch(err => console.error('🍥 Error hiding danmaku overlay:', err));
        } else {
            // Fallback to direct manipulation if no danmakuManager
            const overlay = document.getElementById(DANMAKU_OVERLAY_ID);
            if (overlay) {
                if (commentManager) {
                    commentManager.clear();
                    commentManager.stop();
                }
                overlay.remove();
            }

            // Also try to send a message to page script as a last resort
            try {
                window.postMessage({
                    type: 'FROM_CONTENT_SCRIPT',
                    action: 'cleanup',
                    data: {}
                }, '*');
            } catch (e) {
                console.error('🍥 Error sending cleanup message:', e);
            }
        }
    }
}

function setupDanmakuOverlay(dList) {
    // Use the danmakuManager from contentScript.js to handle danmaku
    ensureLibraryInjected().then(success => {
        if (success && window.danmakuManager && window.danmakuManager.show) { // Check for .show
            // Transform data to match expected format
            const transformedData = dList.map(c => ({
                text: c.text,
                mode: c.mode === 1 ? 1 : 1, // Ensure mode 1 for scrolling
                time: c.time, // contentScript will convert to milliseconds
                // color: c.color, // Can add if parsed and desired
                // size: c.size,   // Can add if parsed and desired
            }));

            window.danmakuManager.show(transformedData)
                .then(() => console.log('🍥 Danmaku overlay setup completed successfully via danmakuManager.'))
                .catch(err => {
                    console.error('🍥 Error setting up danmaku overlay via danmakuManager:', err);
                    // Attempt direct postMessage as a last resort if danmakuManager.show failed
                    tryToPostMessageDanmaku(dList);
                });
        } else {
            console.error('🍥 danmakuManager not available or lacks show method after ensureLibraryInjected. Attempting direct postMessage.');
            tryToPostMessageDanmaku(dList);
        }
    }).catch(err => {
        console.error('🍥 Error in ensureLibraryInjected during setupDanmakuOverlay:', err);
        tryToPostMessageDanmaku(dList);
    });
}

// Helper function for the ultimate fallback: direct postMessage
function tryToPostMessageDanmaku(dList) {
    console.warn('🍥 Using ultimate fallback: tryToPostMessageDanmaku.');
    // This assumes pageScript.bundle.js might have loaded and set up its listener,
    // even if CommentCoreLibrary or the main danmakuManager failed.
    try {
        window.postMessage({
            type: 'FROM_CONTENT_SCRIPT', // pageScript should listen for this type
            action: 'loadDanmaku',
            data: {
                danmakuArray: dList.map(c => ({
                    text: c.text,
                    mode: c.mode === 1 ? 1 : 1,
                    stime: c.time * 1000,
                }))
            }
        }, '*');
        console.log('🍥 Ultimate fallback: Danmaku overlay message posted directly to page script.');
    } catch (e) {
        console.error('🍥 Ultimate fallback (postMessage) failed:', e);
        // At this point, all methods to show danmaku have failed.
    }
}

function synchronizeDanmakuWithVideo() {
    const video = document.querySelector('video');
    if (!video || !commentManager) {
        console.warn('🍥 Video element or CommentManager not found for sync.');
        return;
    }

    // Ensure existing listeners are removed before adding new ones to prevent duplicates
    // This requires storing the listener functions if they are anonymous.
    // For simplicity in this example, we're not meticulously managing listener removal on re-sync,
    // which could lead to multiple listeners if this function is called repeatedly without cleanup.
    // Proper handler management is crucial for a robust solution.

    const onPlay = () => commentManager.start();
    const onPause = () => commentManager.pause();
    const onSeeked = () => commentManager.time(video.currentTime * 1000);
    const onTimeUpdate = () => {
        if (video.currentTime && commentManager) { // Check if CM exists
            commentManager.time(video.currentTime * 1000);
        }
    };
    const onSeeking = () => commentManager.pause(); // Pause during seek


    // A more robust way to handle listeners:
    if (video._danmakuListeners) {
        video.removeEventListener('play', video._danmakuListeners.onPlay);
        video.removeEventListener('pause', video._danmakuListeners.onPause);
        video.removeEventListener('seeking', video._danmakuListeners.onSeeking);
        video.removeEventListener('seeked', video._danmakuListeners.onSeeked);
        video.removeEventListener('timeupdate', video._danmakuListeners.onTimeUpdate);
    }

    video._danmakuListeners = { onPlay, onPause, onSeeking, onSeeked, onTimeUpdate };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeking', onSeeking); // Pause when seeking starts
    video.addEventListener('seeked', onSeeked);   // Adjust time when seeking ends
    video.addEventListener('timeupdate', onTimeUpdate);

    // Initial sync if video is already playing
    if (!video.paused) {
        commentManager.start();
        commentManager.time(video.currentTime * 1000);
    }
    console.log('🍥 Danmaku playback synchronized with video events.');
}


function handleClosePopup() {
    // Hide overlay if popup is explicitly closed?
    // Maybe only hide popup, keep overlay if active? User preference?
    // For now: Close popup, potentially hide overlay, keep state as is.
    const popupContainer = document.getElementById(BILIBILI_POPUP_ID);
    if (popupContainer && reactRoot) {
        reactRoot.unmount();
        popupContainer.remove();
        reactRoot = null;
    }
    isPopupVisible = false;
    // Decide if closing popup should also turn off overlay & save state
    // If not, the overlay remains based on saved state.
}

async function main() {
    const videoId = getYouTubeVideoId(); // Get ID first
    if (!videoId) {
        console.log('🍥 Not a YouTube watch page or video ID not found.');
        cleanupUI(true); // Cleanup if we navigated away
        return;
    }

    // Only run full main logic if video ID changes
    if (videoId === currentVideoId && matchedBiliData) {
        console.log('🍥 Video ID unchanged, potentially re-rendering UI.');
        // Ensure popup is rendered if needed, based on current state
        // Read state just in case?
        const storageKey = getStorageKey();
        chrome.storage.local.get([storageKey], async (result) => { // Made async
            currentOverlayState = result[storageKey] || false; // Update state assumption
            renderPopup(true); // Re-render popup with current state
            if (currentOverlayState && danmakuList.length > 0) {
                // If state is active and we have danmaku, ensure overlay is shown
                // Also ensure library is ready before trying to show
                const libReady = await ensureLibraryInjected();
                if (libReady) {
                    setupDanmakuOverlay(danmakuList);
                } else {
                    console.error("🍥 Library not ready, cannot re-show danmaku on ID unchanged.");
                }
            }
        });
        return;
    }

    console.log('🍥 New video detected or first load, running main function for:', videoId);
    currentVideoId = videoId; // Set current video ID
    cleanupUI(false); // Clean up UI elements but keep video ID

    const storageKey = getStorageKey();
    chrome.storage.local.get([storageKey], async (result) => {
        currentOverlayState = result[storageKey] || false; // Default to false
        console.log(`🍥 Initial overlay state for ${storageKey}: ${currentOverlayState}`);

        // Now proceed with fetching data
        const ytData = extractYouTubeVideoData();
        if (!ytData) {
            console.log('🍥 Could not extract YouTube video data.');
            return;
        }
        console.log('🍥 YouTube Data:', ytData);

        const biliSearchResults = await searchBili(ytData.title);
        if (!biliSearchResults || biliSearchResults.length === 0) {
            console.log('🍥 No Bilibili search results.');
            return;
        }
        console.log('🍥 Bilibili Search Results:', biliSearchResults);

        // Temporarily lower thresholds for testing popup display
        const titleSimilarityThreshold = 0.1; // Lowered from default 0.7
        const durationToleranceSeconds = 300; // Increased from default 10s (now 5 minutes)
        console.log(`🍥 Using test thresholds - Title Sim: ${titleSimilarityThreshold}, Duration Tol: ${durationToleranceSeconds}s`);

        const bestMatch = findBestMatch(ytData, biliSearchResults, titleSimilarityThreshold, durationToleranceSeconds);
        if (!bestMatch) {
            console.log('🍥 No suitable Bilibili match found.');
            return;
        }
        console.log('🍥 Best Bilibili Match:', bestMatch);

        // Store the initially matched data. CID might be fetched later if needed.
        matchedBiliData = { ...bestMatch };

        // Attempt to get full details including CID upfront
        const detailedBiliInfo = await getBilibiliVideoDetails(bestMatch.bvid);
        if (detailedBiliInfo && detailedBiliInfo.cid) {
            matchedBiliData = { ...detailedBiliInfo, ...bestMatch }; // Merge, ensuring CID is present
            console.log('🍥 Fetched detailed Bilibili info with CID:', matchedBiliData);
        } else {
            console.warn('🍥 Could not fetch detailed Bili info with CID immediately. Will try on demand.');
            // matchedBiliData already contains basic info from search.
        }

        // Log the final data being sent to the popup
        console.log('🍥 Final matchedBiliData for popup:', JSON.stringify(matchedBiliData, null, 2));

        renderPopup(true);

        // If initial state is active, fetch and show danmaku immediately
        if (currentOverlayState) {
            console.log('🍥 Initial state is active, attempting to show danmaku on load.');
            // Call the toggle handler logic directly to show danmaku
            // ensureLibraryInjected will be called within handleShowDanmakuToggle -> setupDanmakuOverlay
            handleShowDanmakuToggle(true, matchedBiliData.cid || matchedBiliData.aid);
        }
    });
}

function init() {
    // Initial load check
    main();

    // Handle SPA navigation
    document.body.addEventListener('yt-navigate-finish', () => {
        console.log('🍥 YouTube navigation detected (yt-navigate-finish).');
        // Delay slightly to ensure new page elements/URL are ready
        setTimeout(main, 500);
    });
}

// Run the initialization
init();
