import React from 'react';
import ReactDOM from 'react-dom/client';
import Danmaku from 'danmaku';
import { extractYouTubeVideoData } from './modules/youtube';
import { searchBili, getBilibiliVideoDetails, fetchDanmaku } from './modules/bilibili';
import { findBestMatch } from './modules/match';
import DanmakuMatchPopup from '../../containers/DanmakuMatchPopup/DanmakuMatchPopup';
import DanmakuSettings from '../../containers/DanmakuSettings/DanmakuSettings';

const DEBUG = true;
const EXTENSION_ROOT_ID = 'youtube-danmaku-overlay-root';
const BILIBILI_POPUP_ID = 'bili-danmaku-popup-container';
const DANMAKU_OVERLAY_ID = 'bili-danmaku-overlay-container';
const DANMAKU_SETTINGS_ID = 'bili-danmaku-settings-container';
const STORAGE_KEY_PREFIX = 'youtubeDanmakuToggleState_';
const SETTINGS_STORAGE_KEY = 'youtubeDanmakuSettings';

// Global state
let reactRoot = null;
let settingsRoot = null;
let currentVideoId = null;
let matchedBiliData = null;
let isPopupVisible = false;
let danmakuInstance = null;
let danmakuList = [];
let currentOverlayState = false;
let isCurrentlyInAd = false;

// Default settings
const defaultSettings = {
    fontSize: 24,
    speed: 48,
    opacity: 1,
    fontWeight: 'bold',
    textShadow: true,
    density: 1
};

// Current settings
let currentSettings = { ...defaultSettings };

function debugLog(...args) {
    if (DEBUG) console.log('🍥', ...args);
}

function debugWarn(...args) {
    if (DEBUG) console.warn('🍥', ...args);
}

function debugError(...args) {
    if (DEBUG) console.error('🍥', ...args);
}

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
        currentSettings = { ...defaultSettings, ...result[SETTINGS_STORAGE_KEY] };
        debugLog('Loaded settings:', currentSettings);
    } catch (error) {
        debugError('Error loading settings:', error);
        currentSettings = { ...defaultSettings };
    }
}

async function saveSettings(settings) {
    try {
        const newSettings = { ...defaultSettings, ...settings };
        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: newSettings });
        currentSettings = newSettings;
        debugLog('Saved settings:', newSettings);

        // Immediately apply new settings if danmaku is active
        if (danmakuInstance && currentOverlayState && danmakuList.length > 0) {
            updateDanmakuWithSettings();
        }
    } catch (error) {
        debugError('Error saving settings:', error);
    }
}

function updateDanmakuWithSettings() {
    if (!danmakuInstance) return;

    try {
        // Update speed
        danmakuInstance.speed = currentSettings.speed;

        // Update opacity
        const container = document.getElementById(DANMAKU_OVERLAY_ID);
        if (container) {
            container.style.opacity = currentSettings.opacity;
        }

        // Clear and reinitialize with new settings
        danmakuInstance.clear();
        if (currentOverlayState && danmakuList.length > 0) {
            setupDanmakuOverlay(danmakuList);
        }
    } catch (error) {
        debugError('Error updating danmaku settings:', error);
    }
}

function setupSettingsPanel() {
    let container = document.getElementById(DANMAKU_SETTINGS_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = DANMAKU_SETTINGS_ID;
        document.body.appendChild(container);
    }

    if (!settingsRoot) {
        settingsRoot = ReactDOM.createRoot(container);
    }

    settingsRoot.render(
        <React.StrictMode>
            <DanmakuSettings
                initialSettings={currentSettings}
                onSettingsChange={saveSettings}
            />
        </React.StrictMode>
    );
}

function cleanupSettingsPanel() {
    if (settingsRoot) {
        settingsRoot.unmount();
        settingsRoot = null;
    }
    const container = document.getElementById(DANMAKU_SETTINGS_ID);
    if (container) {
        container.remove();
    }
}

function getStorageKey() {
    return currentVideoId ? `${STORAGE_KEY_PREFIX}${currentVideoId}` : null;
}

function getYouTubeVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function isAdvertisement() {
    // More specific ad detection
    const adOverlay = document.querySelector('.ytp-ad-player-overlay');
    const skipButton = document.querySelector('.ytp-ad-skip-button-container');
    const adText = document.querySelector('.ytp-ad-text');
    const playerElement = document.querySelector('.html5-video-player');

    // Check if any of these specific ad indicators are present
    return Boolean(
        adOverlay ||
        skipButton ||
        adText ||
        playerElement?.classList.contains('ad-showing') ||
        playerElement?.classList.contains('ad-interrupting')
    );
}

function cleanupDanmakuOverlay() {
    if (danmakuInstance) {
        danmakuInstance.destroy();
        danmakuInstance = null;
    }

    const overlayDiv = document.getElementById(DANMAKU_OVERLAY_ID);
    if (overlayDiv) {
        // Cleanup ad observer if it exists
        if (overlayDiv.dataset.adObserver) {
            const playerElement = document.querySelector('.html5-video-player');
            if (playerElement) {
                delete playerElement.dataset.adObserverAttached;
                // Disconnect any existing observers
                const observers = playerElement.adObservers || [];
                observers.forEach(observer => observer.disconnect());
                playerElement.adObservers = [];
            }
        }
        overlayDiv.remove();
    }
}

function cleanupUI(fullReset = true) {
    cleanupDanmakuOverlay();
    cleanupSettingsPanel();

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

    // Store current ad state
    const currentAdState = isAdvertisement();
    if (currentAdState !== isCurrentlyInAd) {
        isCurrentlyInAd = currentAdState;
        if (isCurrentlyInAd) {
            debugLog('Advertisement detected, not showing danmaku');
            cleanupDanmakuOverlay();
            return;
        } else {
            debugLog('Advertisement ended, attempting to restore danmaku');
        }
    }

    // Don't proceed if we're in an ad
    if (isCurrentlyInAd) {
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
            opacity: ${currentSettings.opacity};
            transition: opacity 0.3s ease;
        `;

        const playerElement = document.querySelector('.html5-video-player');
        if (playerElement) {
            if (getComputedStyle(playerElement).position === 'static') {
                playerElement.style.position = 'relative';
            }
            playerElement.appendChild(container);

            // Set up the ad observer only once
            if (!playerElement.dataset.adObserverAttached) {
                const adObserver = new MutationObserver((mutations) => {
                    const newAdState = isAdvertisement();
                    if (newAdState !== isCurrentlyInAd) {
                        isCurrentlyInAd = newAdState;
                        if (isCurrentlyInAd) {
                            debugLog('Advertisement started, hiding danmaku');
                            cleanupDanmakuOverlay();
                        } else if (currentOverlayState && danmakuList.length > 0) {
                            debugLog('Advertisement ended, restoring danmaku');
                            setupDanmakuOverlay(danmakuList);
                        }
                    }
                });

                adObserver.observe(playerElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class']
                });

                playerElement.dataset.adObserverAttached = 'true';
                container.dataset.adObserver = 'true';
            }
        } else {
            videoElement.parentElement.appendChild(container);
        }
    }

    // Apply density to comments list
    const densityAdjustedComments = dList.filter(() => Math.random() <= currentSettings.density);

    // Convert Bilibili comments to Danmaku format
    const comments = densityAdjustedComments.map(comment => {
        const fontSize = currentSettings.fontSize;

        return {
            text: comment.text,
            mode: 'rtl',
            time: typeof comment.time === 'number' ? comment.time : comment.stime,
            style: {
                fontSize: `${fontSize}px`,
                color: '#ffffff',
                textShadow: currentSettings.textShadow ? '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000' : 'none',
                font: `${currentSettings.fontWeight} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
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

        danmakuInstance = new Danmaku({
            container: container,
            media: videoElement,
            comments: comments,
            engine: 'canvas',
            speed: currentSettings.speed,
            opacity: currentSettings.opacity,
            defaultFontSize: currentSettings.fontSize
        });

        // Handle video events
        videoElement.addEventListener('play', () => {
            if (danmakuInstance) {
                danmakuInstance.show();
            }
        });

        videoElement.addEventListener('pause', () => {
            if (danmakuInstance) {
                danmakuInstance.show();
            }
        });

        videoElement.addEventListener('seeking', () => {
            if (danmakuInstance) {
                danmakuInstance.clear();
                if (!videoElement.paused) {
                    danmakuInstance.show();
                }
            }
        });

        const resizeObserver = new ResizeObserver(() => {
            if (danmakuInstance) {
                danmakuInstance.resize();
            }
        });
        resizeObserver.observe(videoElement);

        debugLog('Danmaku initialized with', comments.length, 'comments');
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

async function init() {
    await loadSettings();
    main();

    // Handle YouTube SPA navigation
    const navigationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
                const newVideoId = getYouTubeVideoId();
                if (newVideoId && newVideoId !== currentVideoId) {
                    debugLog('Video change detected:', newVideoId);
                    setTimeout(() => {
                        cleanupDanmakuOverlay();
                        main();
                    }, 500); // Small delay to ensure YouTube UI is ready
                    break;
                }
            }
        }
    });

    // Observe both URL changes and player changes
    navigationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href']
    });

    // Also keep the yt-navigate-finish event listener as a fallback
    document.body.addEventListener('yt-navigate-finish', () => {
        debugLog('YouTube navigation event detected');
        const newVideoId = getYouTubeVideoId();
        if (newVideoId && newVideoId !== currentVideoId) {
            cleanupDanmakuOverlay();
            setTimeout(main, 500);
        }
    });

    // Handle history changes (back/forward navigation)
    window.addEventListener('popstate', () => {
        debugLog('History navigation detected');
        const newVideoId = getYouTubeVideoId();
        if (newVideoId && newVideoId !== currentVideoId) {
            cleanupDanmakuOverlay();
            setTimeout(main, 500);
        }
    });
}

// Run the initialization
init();
