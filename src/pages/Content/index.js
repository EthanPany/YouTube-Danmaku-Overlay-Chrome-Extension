import React from 'react';
import ReactDOM from 'react-dom/client';
import { extractYouTubeVideoData } from './modules/youtube';
import { searchBili, getBilibiliVideoDetails, fetchDanmaku } from './modules/bilibili';
import { findBestMatch } from './modules/match';
import DanmakuMatchPopup from '../../containers/DanmakuMatchPopup/DanmakuMatchPopup';

// Attempt to import the distributed file directly to execute it
// This might make CommentManager globally available in the content script scope
import 'comment-core-library/dist/CommentCoreLibrary.js';

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
                // Do not revert toggle state here. User explicitly turned it on.
                // The popup will still reflect the 'on' state.
                // An error message could be displayed to the user if desired.
                return;
            }
        }

        if (!cid) {
            console.error('🍥 Cannot show danmaku without CID.');
            // Do not revert toggle state here.
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
                // Do not revert toggle state here.
                // An error message could be displayed to the user.
            }
        }
    } else { // Hide Overlay
        console.log('🍥 Hiding danmaku...');
        const overlay = document.getElementById(DANMAKU_OVERLAY_ID);
        if (overlay) {
            if (commentManager) {
                commentManager.clear();
                commentManager.stop();
            }
            overlay.remove();
        }
    }
}

function setupDanmakuOverlay(dList) {
    let overlayDiv = document.getElementById(DANMAKU_OVERLAY_ID);
    if (!overlayDiv) {
        overlayDiv = document.createElement('div');
        overlayDiv.id = DANMAKU_OVERLAY_ID;
        overlayDiv.style.position = 'absolute';
        overlayDiv.style.top = '0';
        overlayDiv.style.left = '0';
        overlayDiv.style.width = '100%';
        overlayDiv.style.height = '100%';
        overlayDiv.style.zIndex = '2000'; // Below popup but above video controls if possible
        overlayDiv.style.pointerEvents = 'none'; // Allow clicks through to video player

        const playerElement = document.querySelector('.html5-video-player'); // YouTube's player container
        if (playerElement) {
            playerElement.appendChild(overlayDiv);
        } else {
            console.warn("🍥 Could not find YouTube player element to attach overlay.");
            // Fallback to body or #movie_player, though this might not be ideal for sizing
            (document.getElementById('movie_player') || document.body).appendChild(overlayDiv);
        }
    }

    // Remove the previous require logic
    // let CCL;
    // try {
    //     CCL = require('comment-core-library');
    //     console.log('🍥 Successfully required "comment-core-library":', CCL);
    // } catch (err) {
    //     console.error('🍥 Failed to require "comment-core-library":', err);
    //     return; // Cannot proceed
    // }

    if (!commentManager) {
        // Check if CommentManager is now globally available (likely on window or self)
        let GlobalCommentManager = window.CommentManager || self.CommentManager;

        if (typeof GlobalCommentManager === 'function') {
            console.log('🍥 Using Global CommentManager found on window/self.');
            commentManager = new GlobalCommentManager(overlayDiv);
            commentManager.init();
        } else {
            // Final fallback: Check if it exists directly in the scope without window/self prefix
            // This is less likely but possible depending on how the script executes.
            try {
                if (typeof CommentManager === 'function') {
                    console.log('🍥 Using CommentManager found directly in scope (fallback).');
                    commentManager = new CommentManager(overlayDiv);
                    commentManager.init();
                } else {
                    console.error('🍥 Critical: CommentManager constructor not found globally or directly in scope after importing dist file. GlobalCommentManager:', GlobalCommentManager);
                    return; // Stop execution
                }
            } catch (e) {
                console.error('🍥 Critical: Error accessing CommentManager directly. It might not be defined. Error:', e);
                return; // Stop execution
            }
        }

        // Optional: Configure CommentManager (e.g., speed, opacity, font)
        // commentManager.options.scroll.duration = 8000; // 8 seconds to cross screen
        // commentManager.options.global.opacity = 0.8;
    }

    commentManager.clear(); // Clear any previous danmaku
    commentManager.load(dList.map(c => ({
        text: c.text,
        mode: c.mode === 1 ? 1 : 1, // Ensure mode 1 for scrolling. CCL modes: 1 (scroll), 4 (bottom), 5 (top)
        stime: c.time * 1000, // CCL expects milliseconds
        // color: c.color, // Can add if parsed and desired
        // size: c.size,   // Can add if parsed and desired
    })));

    // Start playback sync (Step 10)
    synchronizeDanmakuWithVideo();
    commentManager.start();
    console.log('🍥 Danmaku overlay setup and CM started.');
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
        chrome.storage.local.get([storageKey], (result) => {
            currentOverlayState = result[storageKey] || false; // Update state assumption
            renderPopup(true); // Re-render popup with current state
            if (currentOverlayState && danmakuList.length > 0) {
                // If state is active and we have danmaku, ensure overlay is shown
                setupDanmakuOverlay(danmakuList);
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
