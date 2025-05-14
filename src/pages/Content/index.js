import React from 'react';
import ReactDOM from 'react-dom/client';
import Danmaku from 'danmaku';
import { extractYouTubeVideoData } from './modules/youtube';
import { searchBili, getBilibiliVideoDetails, fetchDanmaku } from './modules/bilibili';
import { findBestMatch } from './modules/match';
import DanmakuMatchPopup from '../../containers/DanmakuMatchPopup/DanmakuMatchPopup';

const DEBUG = true;
const EXTENSION_ROOT_ID = 'youtube-danmaku-overlay-root';
const BILIBILI_POPUP_ID = 'bili-danmaku-popup-container';
const DANMAKU_OVERLAY_ID = 'bili-danmaku-overlay-container';
const STORAGE_KEY_PREFIX = 'youtubeDanmakuToggleState_';

// Global state
let reactRoot = null;
let currentVideoId = null;
let matchedBiliData = null;
let isPopupVisible = false;
let danmakuInstance = null;
let danmakuList = [];
let currentOverlayState = false;

// Debug utilities
function debugLog(...args) {
    if (DEBUG) console.log('🍥', ...args);
}

function debugWarn(...args) {
    if (DEBUG) console.warn('🍥', ...args);
}

function debugError(...args) {
    if (DEBUG) console.error('🍥', ...args);
}

function getStorageKey() {
    return currentVideoId ? `${STORAGE_KEY_PREFIX}${currentVideoId}` : null;
}

function getYouTubeVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function cleanupDanmakuOverlay() {
    if (danmakuInstance) {
        danmakuInstance.destroy();
        danmakuInstance = null;
    }

    const overlayDiv = document.getElementById(DANMAKU_OVERLAY_ID);
    if (overlayDiv) {
        overlayDiv.remove();
    }
}

function cleanupUI(fullReset = true) {
    cleanupDanmakuOverlay();

    const popupDiv = document.getElementById(BILIBILI_POPUP_ID);
    if (popupDiv && reactRoot) {
        reactRoot.unmount();
        reactRoot = null;
    } else if (popupDiv) {
        popupDiv.remove();
    }

    if (fullReset) {
        currentVideoId = null;
        matchedBiliData = null;
        isPopupVisible = false;
        danmakuList = [];
        currentOverlayState = false;
    }
}

function setupDanmakuOverlay(dList) {
    const videoElement = document.querySelector('video');
    if (!videoElement) {
        debugLog('Video element not found');
        return;
    }

    let container = document.getElementById(DANMAKU_OVERLAY_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = DANMAKU_OVERLAY_ID;
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2000;
        `;

        const playerElement = document.querySelector('.html5-video-player');
        if (playerElement) {
            if (getComputedStyle(playerElement).position === 'static') {
                playerElement.style.position = 'relative';
            }
            playerElement.appendChild(container);
        } else {
            videoElement.parentElement.appendChild(container);
        }
    }

    // Convert Bilibili comments to Danmaku format
    const comments = dList.map(comment => {
        // Calculate font size based on video height
        // Default to 5% of video height if no size specified
        const defaultFontSize = Math.max(24, Math.floor(videoElement.offsetHeight * 0.05));
        const fontSize = comment.size ? comment.size : defaultFontSize;

        return {
            text: comment.text,
            mode: 'rtl', // right-to-left scrolling
            time: typeof comment.time === 'number' ? comment.time : comment.stime,
            style: {
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                textShadow: '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000',
                font: `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
                fillStyle: '#ffffff',
                strokeStyle: '#000000',
                lineWidth: 2
            }
        };
    });

    try {
        if (danmakuInstance) {
            danmakuInstance.destroy();
        }

        // Initialize Danmaku with video element
        danmakuInstance = new Danmaku({
            container: container,
            media: videoElement,
            comments: comments,
            engine: 'canvas', // Use canvas for better performance
            speed: 48, // Even slower speed (1/3 of default)
            opacity: 1,
            defaultFontSize: Math.max(24, Math.floor(videoElement.offsetHeight * 0.05))
        });

        // Handle video events
        videoElement.addEventListener('play', () => {
            if (danmakuInstance) {
                danmakuInstance.show();
            }
        });

        videoElement.addEventListener('pause', () => {
            if (danmakuInstance) {
                // Don't hide or pause, let comments stay visible when paused
                danmakuInstance.show();
            }
        });

        videoElement.addEventListener('seeking', () => {
            if (danmakuInstance) {
                danmakuInstance.clear();
                // Show again after seeking if video is playing
                if (!videoElement.paused) {
                    danmakuInstance.show();
                }
            }
        });

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (danmakuInstance) {
                danmakuInstance.resize();
                // Update font size on resize
                const newDefaultSize = Math.max(24, Math.floor(videoElement.offsetHeight * 0.05));
                danmakuInstance.options.defaultFontSize = newDefaultSize;
            }
        });
        resizeObserver.observe(videoElement);

        debugLog('Danmaku initialized with', comments.length, 'comments');

        // Show immediately regardless of video state
        danmakuInstance.show();

    } catch (error) {
        debugError('Error initializing Danmaku:', error);
        cleanupDanmakuOverlay();
    }
}

async function handleShowDanmakuToggle(newState) {
    if (!currentVideoId || !matchedBiliData) return;

    debugLog(`Toggling Danmaku Overlay: ${newState}`);
    currentOverlayState = newState;

    // Save state
    const storageKey = getStorageKey();
    if (storageKey) {
        chrome.storage.local.set({ [storageKey]: newState });
    }

    if (newState) {
        let cid = matchedBiliData.cid;
        if (!cid && matchedBiliData.bvid) {
            const details = await getBilibiliVideoDetails(matchedBiliData.bvid);
            if (details?.cid) {
                cid = details.cid;
                matchedBiliData.cid = cid;
            }
        }

        if (!cid) {
            debugError('Cannot show danmaku without CID');
            return;
        }

        if (danmakuList.length === 0) {
            const fetchedDanmaku = await fetchDanmaku(cid);
            if (fetchedDanmaku) {
                danmakuList = fetchedDanmaku;
            } else {
                debugError('Failed to fetch danmaku');
                return;
            }
        }

        setupDanmakuOverlay(danmakuList);
    } else {
        cleanupDanmakuOverlay();
    }
}

function renderPopup(show = true) {
    if (!show) {
        if (isPopupVisible && reactRoot) {
            reactRoot.unmount();
            reactRoot = null;
            isPopupVisible = false;
        }
        return;
    }

    if (!matchedBiliData) return;

    let container = document.getElementById(BILIBILI_POPUP_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = BILIBILI_POPUP_ID;
        document.body.appendChild(container);
    }

    if (!reactRoot) {
        reactRoot = ReactDOM.createRoot(container);
    }

    isPopupVisible = true;
    reactRoot.render(
        <React.StrictMode>
            <DanmakuMatchPopup
                matchData={matchedBiliData}
                onShowDanmaku={handleShowDanmakuToggle}
                onClosePopup={() => renderPopup(false)}
                initialOverlayActive={currentOverlayState}
            />
        </React.StrictMode>
    );
}

async function processVideoMatch(ytData) {
    debugLog('Processing video match:', ytData);

    const biliSearchResults = await searchBili(ytData.title);
    if (!biliSearchResults || biliSearchResults.length === 0) {
        debugLog('No Bilibili search results found');
        return false;
    }

    // Use more lenient thresholds for better matching
    const titleSimilarityThreshold = 0.3;  // 30% similarity required
    const durationToleranceSeconds = 300;  // 5 minutes tolerance
    debugLog(`Using thresholds - Title Similarity: ${titleSimilarityThreshold * 100}%, Duration Tolerance: ${durationToleranceSeconds}s`);

    const bestMatch = findBestMatch(ytData, biliSearchResults, titleSimilarityThreshold, durationToleranceSeconds);
    if (!bestMatch) {
        debugLog('No suitable match found');
        return false;
    }

    debugLog('Best Bilibili match found:', bestMatch);

    // Store the initially matched data
    matchedBiliData = { ...bestMatch };

    // Attempt to get full details including CID upfront
    const detailedBiliInfo = await getBilibiliVideoDetails(bestMatch.bvid);
    if (detailedBiliInfo) {
        matchedBiliData = {
            ...detailedBiliInfo,
            cid: detailedBiliInfo.cid,
            aid: detailedBiliInfo.aid
        };
        debugLog('Retrieved detailed Bilibili info:', matchedBiliData);
    }

    // Show the popup with current state
    renderPopup(true);

    // If the overlay was previously active for this video, reactivate it
    if (currentOverlayState) {
        await handleShowDanmakuToggle(true);
    }

    return true;
}

async function main() {
    const videoId = getYouTubeVideoId();
    if (!videoId) {
        debugLog('Not a YouTube watch page');
        cleanupUI(true);
        return;
    }

    if (videoId === currentVideoId && matchedBiliData) {
        debugLog('Video ID unchanged, updating UI');
        const storageKey = getStorageKey();
        if (storageKey) {
            chrome.storage.local.get([storageKey], result => {
                currentOverlayState = result[storageKey] || false;
                renderPopup(true);
                if (currentOverlayState && danmakuList.length > 0) {
                    setupDanmakuOverlay(danmakuList);
                }
            });
        }
        return;
    }

    debugLog('New video detected:', videoId);
    currentVideoId = videoId;
    cleanupUI(false);

    const storageKey = getStorageKey();
    chrome.storage.local.get([storageKey], async result => {
        currentOverlayState = result[storageKey] || false;

        const ytData = extractYouTubeVideoData();
        if (!ytData) {
            debugLog('Could not extract video data');
            return;
        }

        await processVideoMatch(ytData);
    });
}

// Initialize
function init() {
    main();

    // Handle YouTube SPA navigation
    document.body.addEventListener('yt-navigate-finish', () => {
        debugLog('YouTube navigation detected');
        cleanupDanmakuOverlay();
        setTimeout(main, 500);
    });
}

init();
