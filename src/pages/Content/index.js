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
let debounceReinitTimer = null;

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

// Add this near the top of the file, after the imports
const DanmakuManager = {
    updateSettings: function (update) {
        // debugLog('Direct settings update:', update);

        if (!danmakuInstance || !currentOverlayState) {
            debugLog('No active danmaku instance');
            return;
        }

        try {
            const { type, value } = update;

            // Update current settings
            currentSettings[type] = value;

            // Handle immediate updates
            switch (type) {
                case 'speed':
                    danmakuInstance.speed = value;
                    break;

                case 'opacity':
                    const overlayContainer = document.getElementById(DANMAKU_OVERLAY_ID);
                    if (overlayContainer) {
                        overlayContainer.style.opacity = value;
                    }
                    break;

                case 'fontSize':
                case 'density':
                    // These require full refresh
                    const videoElement = document.querySelector('video');
                    const currentTime = videoElement ? videoElement.currentTime : 0;
                    const wasPaused = videoElement ? videoElement.paused : true;

                    // Clear current comments
                    danmakuInstance.clear();

                    // Update comments with new settings
                    const updatedComments = danmakuList
                        .filter(() => Math.random() <= currentSettings.density)
                        .map(comment => ({
                            text: comment.text,
                            mode: 'rtl',
                            time: typeof comment.time === 'number' ? comment.time : comment.stime,
                            style: {
                                font: `${currentSettings.fontWeight} ${currentSettings.fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
                                fillStyle: '#ffffff',
                                strokeStyle: '#000000',
                                lineWidth: currentSettings.textShadow ? 2 : 0
                            }
                        }));

                    // Recreate danmaku instance
                    const danmakuContainer = document.getElementById(DANMAKU_OVERLAY_ID);
                    if (videoElement && danmakuContainer) {
                        danmakuInstance.destroy();
                        danmakuInstance = new Danmaku({
                            container: danmakuContainer,
                            media: videoElement,
                            comments: updatedComments.map(comment => ({
                                ...comment,
                                time: currentTime + (comment.time - currentTime)
                            })),
                            engine: 'canvas',
                            speed: currentSettings.speed
                        });

                        if (!wasPaused) {
                            danmakuInstance.show();
                        }
                    }
                    break;
            }

            // Save settings
            chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: currentSettings });

        } catch (error) {
            debugError('Error updating settings:', error);
        }
    },
    setDanmakuData: function (data) {
        danmakuList = data;
        renderPopup(true);
    }
};

// Expose the manager to window
window.danmakuManager = DanmakuManager;

// Clean up console logs to only show important information
const CLEAN_LOGS = true; // Set to true to enable clean logging

function cleanLog(...args) {
    if (CLEAN_LOGS) console.log('🍥', ...args);
}

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
        if (!chrome?.storage?.local) {
            debugLog('Chrome storage not available, using default settings');
            currentSettings = { ...defaultSettings };
            return;
        }
        const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
        currentSettings = { ...defaultSettings, ...result[SETTINGS_STORAGE_KEY] };
        debugLog('Loaded settings:', currentSettings);
    } catch (error) {
        debugLog('Error loading settings, using defaults:', error);
        currentSettings = { ...defaultSettings };
    }
}

async function saveSettings(settings) {
    try {
        if (!chrome?.storage?.local) {
            debugLog('Chrome storage not available, settings not saved');
            const previousSettings = { ...currentSettings };
            currentSettings = { ...defaultSettings, ...settings };

            // Apply immediately if active
            if (danmakuInstance && currentOverlayState) {
                const changedSettings = getChangedSettings(previousSettings, currentSettings);
                updateDanmakuWithSettings(changedSettings);
            }
            return;
        }

        const previousSettings = { ...currentSettings };
        const newSettings = { ...defaultSettings, ...settings };

        // Save to storage
        await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: newSettings });
        currentSettings = newSettings;
        debugLog('Saved settings:', newSettings);

        // Immediately apply new settings if danmaku is active
        if (danmakuInstance && currentOverlayState) {
            const changedSettings = getChangedSettings(previousSettings, currentSettings);
            updateDanmakuWithSettings(changedSettings);
        }
    } catch (error) {
        debugLog('Error saving settings:', error);
    }
}

function updateDanmakuWithSettings(changedSettings = null) {
    if (!danmakuInstance) {
        debugLog('No danmaku instance to update');
        return;
    }

    try {
        debugLog('Updating danmaku with settings:', changedSettings);

        // If no specific changes provided, consider all settings changed
        const settingsToUpdate = changedSettings || Object.keys(currentSettings);
        debugLog('Settings to update:', settingsToUpdate);

        let needsFullUpdate = false;

        // Update speed - can be done instantly without reinitialization
        if (settingsToUpdate.includes('speed')) {
            debugLog('Updating speed to:', currentSettings.speed);
            danmakuInstance.speed = currentSettings.speed;
        }

        // Update opacity - can be done without reinitialization
        if (settingsToUpdate.includes('opacity')) {
            const container = document.getElementById(DANMAKU_OVERLAY_ID);
            if (container) {
                debugLog('Updating opacity to:', currentSettings.opacity);
                container.style.opacity = currentSettings.opacity;
            }
        }

        // Check if we need a full update
        needsFullUpdate = [
            'fontSize',
            'fontWeight',
            'textShadow',
            'density'
        ].some(setting => settingsToUpdate.includes(setting));

        if (needsFullUpdate && danmakuList.length > 0) {
            debugLog('Performing full update with new settings');

            // Get current video time and state
            const videoElement = document.querySelector('video');
            const currentTime = videoElement ? videoElement.currentTime : 0;
            const wasPaused = videoElement ? videoElement.paused : true;

            // Clear existing comments
            danmakuInstance.clear();

            // Update existing comments with new styles
            const updatedComments = danmakuList
                .filter(() => Math.random() <= currentSettings.density)
                .map(comment => ({
                    text: comment.text,
                    mode: 'rtl',
                    time: typeof comment.time === 'number' ? comment.time : comment.stime,
                    style: {
                        font: `${currentSettings.fontWeight} ${currentSettings.fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
                        fillStyle: '#ffffff',
                        strokeStyle: '#000000',
                        lineWidth: currentSettings.textShadow ? 2 : 0
                    }
                }));

            // Create new Danmaku instance with updated settings
            const container = document.getElementById(DANMAKU_OVERLAY_ID);
            if (videoElement && container) {
                if (danmakuInstance) {
                    danmakuInstance.destroy();
                }

                danmakuInstance = new Danmaku({
                    container: container,
                    media: videoElement,
                    comments: updatedComments,
                    engine: 'canvas',
                    speed: currentSettings.speed
                });

                // Restore video state
                if (!wasPaused) {
                    danmakuInstance.show();
                    if (currentTime > 0) {
                        danmakuInstance.seek(currentTime);
                    }
                }

                debugLog('Danmaku instance updated with new settings');
            }
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
                onSettingsChange={(newSettings) => {
                    // Save settings and immediately apply
                    saveSettings(newSettings);
                }}
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
    const adOverlay = document.querySelector('.ytp-ad-player-overlay');
    const skipButton = document.querySelector('.ytp-ad-skip-button');
    return !!(adOverlay || skipButton);
}

function cleanupDanmakuOverlay() {
    // Clear any pending debounce timers
    if (debounceReinitTimer) {
        clearTimeout(debounceReinitTimer);
        debounceReinitTimer = null;
    }

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
    if (popupDiv) {
        if (reactRoot) {
            reactRoot.unmount();
            reactRoot = null;
        }
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
        console.log('Video element not found');
        return;
    }

    // Store current ad state
    const currentAdState = isAdvertisement();
    if (currentAdState !== isCurrentlyInAd) {
        isCurrentlyInAd = currentAdState;
        if (isCurrentlyInAd) {
            console.log('Advertisement detected, pausing danmaku');
            cleanupDanmakuOverlay();
            return;
        } else {
            console.log('Advertisement ended, resuming danmaku');
        }
    }

    // Don't proceed if we're in an ad
    if (isCurrentlyInAd) {
        console.log('Currently in advertisement, danmaku paused');
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
                            console.log('Advertisement started, hiding danmaku');
                            cleanupDanmakuOverlay();
                        } else if (currentOverlayState && danmakuList.length > 0) {
                            console.log('Advertisement ended, restoring danmaku');
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
    } else {
        // Update opacity in case it changed
        container.style.opacity = currentSettings.opacity;
    }

    // Apply density to comments list
    const densityAdjustedComments = dList.filter(() => Math.random() <= currentSettings.density);

    // Convert Bilibili comments to Danmaku format
    const comments = densityAdjustedComments.map(comment => {
        const fontSize = currentSettings.fontSize;
        const fontWeight = currentSettings.fontWeight === 'bold' ? 'bold' : 'normal';
        const textShadow = currentSettings.textShadow ? '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000' : 'none';

        return {
            text: comment.text,
            mode: 'rtl',
            time: typeof comment.time === 'number' ? comment.time : comment.stime,
            style: {
                font: `${fontWeight} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`,
                color: '#ffffff',
                textShadow: textShadow,
                fillStyle: '#ffffff',
                strokeStyle: '#000000',
                lineWidth: currentSettings.textShadow ? 2 : 0
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
                // Re-render popup with updated count
                renderPopup(true);
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

    // Add debug logging
    debugLog('Rendering popup with danmaku count:', danmakuList.length);

    isPopupVisible = true;
    reactRoot.render(
        <React.StrictMode>
            <DanmakuMatchPopup
                matchData={matchedBiliData}
                onShowDanmaku={handleShowDanmakuToggle}
                onClosePopup={() => renderPopup(false)}
                initialOverlayActive={currentOverlayState}
                danmakuCount={danmakuList.length}
            />
        </React.StrictMode>
    );
}

async function processVideoMatch(ytData) {
    if (!ytData) {
        console.error('🍥 No YouTube video data to process');
        return null;
    }

    // cleanLog('Processing new video:', ytData.title);

    try {
        // Get Bilibili videos matching the YouTube title
        const biliResults = await searchBili(ytData.fullTitle, ytData.channelName);

        if (!biliResults || biliResults.length === 0) {
            cleanLog('No matching Bilibili videos found');
            return null;
        }

        // cleanLog('Found matching Bilibili videos:', biliResults.length);

        // Find best match
        const bestMatch = findBestMatch(ytData, biliResults);

        if (!bestMatch) {
            cleanLog('No suitable match found among results');
            return null;
        }

        // cleanLog('Found matching Bilibili video:', bestMatch);

        // Get detailed info including CID
        const videoDetails = await getBilibiliVideoDetails(bestMatch.bvid);

        if (!videoDetails || !videoDetails.cid) {
            cleanLog('Could not get Bilibili video details or CID');
            return bestMatch; // Return the match even without CID
        }

        // Update bestMatch with CID
        bestMatch.cid = videoDetails.cid;

        // Fetch danmaku using the CID
        const danmakuList = await fetchDanmaku(videoDetails.cid);

        if (!danmakuList || danmakuList.length === 0) {
            cleanLog('No danmaku found for video');
            return bestMatch; // Return the match even without danmaku
        }

        // Store the danmaku data
        window.danmakuManager.setDanmakuData(danmakuList);

        return bestMatch;
    } catch (error) {
        console.error('🍥 Error in processVideoMatch:', error);
        return null;
    }
}

// Add these new utility functions at the top level
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout after specified duration
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

async function waitForYouTubeInit(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Wait for critical YouTube elements
            await Promise.all([
                waitForElement('video'),
                waitForElement('#movie_player'),
                waitForElement('.ytp-title-link')
            ]);

            // Additional delay to ensure elements are fully initialized
            await new Promise(resolve => setTimeout(resolve, 1000));

            const ytData = extractYouTubeVideoData();
            if (ytData) {
                return ytData;
            }
        } catch (error) {
            debugLog(`Attempt ${i + 1}/${maxRetries} to initialize failed:`, error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error('Failed to initialize YouTube video data after multiple attempts');
}

// Add this function near the top after imports
async function handleVideoChange(newVideoId) {
    debugLog('Video changed, reinitializing with new video ID:', newVideoId);

    // Full cleanup of old state
    cleanupUI(true);

    // Reset critical state variables
    matchedBiliData = null;
    danmakuList = [];
    currentOverlayState = false;
    isCurrentlyInAd = false;
    currentVideoId = newVideoId;

    try {
        // Wait for YouTube elements to be fully loaded
        const ytData = await waitForYouTubeInit();
        if (!ytData) {
            debugLog('Could not extract YouTube video data after waiting');
            return;
        }

        debugLog('Processing new video:', ytData.title);

        // Process video match
        matchedBiliData = await processVideoMatch(ytData);

        if (matchedBiliData) {
            // Pre-fetch danmaku if we have a match
            if (matchedBiliData.cid) {
                const fetchedDanmaku = await fetchDanmaku(matchedBiliData.cid);
                if (fetchedDanmaku) {
                    danmakuList = fetchedDanmaku;
                }
            } else if (matchedBiliData.bvid) {
                // If no CID but have BVID, get details first
                const details = await getBilibiliVideoDetails(matchedBiliData.bvid);
                if (details?.cid) {
                    matchedBiliData.cid = details.cid;
                    const fetchedDanmaku = await fetchDanmaku(details.cid);
                    if (fetchedDanmaku) {
                        danmakuList = fetchedDanmaku;
                    }
                }
            }
        }

        // Show popup with results
        renderPopup();
    } catch (error) {
        debugError('Error handling video change:', error);
    }
}

// Update the observer setup in init()
async function init() {
    debugLog('Initializing content script');
    await loadSettings();
    setupSettingsPanel();

    // Add message listener for settings updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'UPDATE_DANMAKU_SETTINGS') {
            debugLog('Received settings update:', message.settings);

            try {
                // Update settings immediately
                const previousSettings = { ...currentSettings };
                currentSettings = { ...defaultSettings, ...message.settings };

                // Apply settings immediately if danmaku is active
                if (danmakuInstance && currentOverlayState) {
                    // Get list of changed settings
                    const changedSettings = Object.keys(message.settings).filter(
                        key => previousSettings[key] !== message.settings[key]
                    );

                    debugLog('Changed settings:', changedSettings);

                    // Apply updates immediately
                    updateDanmakuWithSettings(changedSettings);
                }

                // Send success response
                sendResponse({ success: true });
            } catch (error) {
                debugError('Error applying settings update:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true; // Keep the message channel open for async response
        }
    });

    // Helper function to determine what settings changed
    function getChangedSettings(oldSettings, newSettings) {
        const changedKeys = [];
        for (const key in newSettings) {
            if (oldSettings[key] !== newSettings[key]) {
                changedKeys.push(key);
            }
        }
        return changedKeys;
    }

    let lastCheckedUrl = window.location.href;
    let lastVideoId = currentVideoId;
    let initializationInProgress = false;

    // Initial run
    const initialVideoId = getYouTubeVideoId();
    if (initialVideoId) {
        await handleVideoChange(initialVideoId);
    }

    // Create a more robust observer for video changes
    const videoChangeObserver = new MutationObserver(async (mutations) => {
        if (initializationInProgress) return;

        try {
            const currentUrl = window.location.href;
            const newVideoId = getYouTubeVideoId();

            // Check if we've actually changed videos
            if (currentUrl !== lastCheckedUrl || newVideoId !== lastVideoId) {
                lastCheckedUrl = currentUrl;

                // Only proceed if we have a valid video ID and it's different
                if (newVideoId && newVideoId !== lastVideoId) {
                    lastVideoId = newVideoId;
                    initializationInProgress = true;

                    await handleVideoChange(newVideoId);
                }
            }
        } catch (error) {
            debugError('Error in video change observer:', error);
        } finally {
            initializationInProgress = false;
        }
    });

    // Observe both body and head for changes
    videoChangeObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href']
    });

    // Also observe the title element
    const titleElement = document.querySelector('title');
    if (titleElement) {
        videoChangeObserver.observe(titleElement, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    // Add URL change detection using History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        checkForVideoChange();
    };

    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        checkForVideoChange();
    };

    window.addEventListener('popstate', checkForVideoChange);

    async function checkForVideoChange() {
        if (initializationInProgress) return;

        const newVideoId = getYouTubeVideoId();
        if (newVideoId && newVideoId !== lastVideoId) {
            lastVideoId = newVideoId;
            initializationInProgress = true;
            try {
                await handleVideoChange(newVideoId);
            } finally {
                initializationInProgress = false;
            }
        }
    }
}

// Run the initialization
init();
