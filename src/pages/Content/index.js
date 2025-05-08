import React from 'react';
import ReactDOM from 'react-dom/client';
import { extractYouTubeVideoData } from './modules/youtube';
import { searchBili, getBilibiliVideoDetails, fetchDanmaku } from './modules/bilibili';
import { findBestMatch } from './modules/match';
import DanmakuMatchPopup from '../../containers/DanmakuMatchPopup/DanmakuMatchPopup';
import { CommentManager } from './CommentCoreLibrary';

console.log('🍥 YouTube Danmaku Overlay Content Script Loaded 🍥');

const EXTENSION_ROOT_ID = 'youtube-danmaku-overlay-root';
const BILIBILI_POPUP_ID = 'bili-danmaku-popup-container';
const DANMAKU_OVERLAY_ID = 'bili-danmaku-overlay-container';
const STORAGE_KEY_PREFIX = 'youtubeDanmakuToggleState_';

let reactRoot = null;
let currentVideoId = null;
let matchedBiliData = null;
let isPopupVisible = false;
let commentManager = null;
let danmakuList = [];
let currentOverlayState = false;

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

/**
 * Filter danmaku based on density analysis of the entire timeline
 * @param {Array} danmakuList - The original list of danmaku comments
 * @param {number} videoDuration - Total video duration in seconds
 * @param {number} targetMaxDensity - Maximum number of comments per window (default: based on screen)
 * @param {number} windowSizeSeconds - Size of time window to calculate density (default: 5)
 * @returns {Array} Filtered danmaku list
 */
function applyDensityFilter(danmakuList, videoDuration, targetMaxDensity = null, windowSizeSeconds = 5) {
    if (!danmakuList || danmakuList.length === 0) {
        return danmakuList;
    }

    console.log('🍥 Starting density filter analysis for', danmakuList.length, 'comments');

    // Set target density based on screen dimensions if not specified
    if (!targetMaxDensity) {
        const video = document.querySelector('video');
        const height = video ? video.offsetHeight : 450;
        const width = video ? video.offsetWidth : 800;

        // Calculate window size factor (base reference is 715x402)
        const baseWidth = 715;
        const baseHeight = 402;
        const areaFactor = Math.sqrt((width * height) / (baseWidth * baseHeight));
        console.log('🍥 Window size factor:', areaFactor, `(${width}x${height} vs ${baseWidth}x${baseHeight})`);

        // Estimate how many comments can fit vertically with some spacing
        const lineHeight = Math.min(height / 16, 30) * 1.5; // Increased base size from 20 to 16 (larger text)
        const availableLines = Math.floor(height / lineHeight);

        // Target density is number of comments that can fit on screen in the window
        // Scale based on window size relative to base size
        const baseDensity = Math.floor(availableLines * 1.2);
        targetMaxDensity = Math.max(8, Math.floor(baseDensity * areaFactor));

        // Dynamic maximum density based on window size
        const baseMaxDensity = 45;
        const maxAllowedDensity = Math.floor(baseMaxDensity * areaFactor);

        // Apply bounds to prevent extremes
        targetMaxDensity = Math.min(
            Math.max(targetMaxDensity, 8), // Minimum of 8
            Math.min(maxAllowedDensity, 90) // Hard cap at 90 regardless of size
        );

        console.log('🍥 Density calculations:', {
            areaFactor,
            availableLines,
            baseDensity,
            targetMaxDensity,
            maxAllowedDensity
        });
    }

    // Calculate window size in milliseconds
    const windowSize = windowSizeSeconds * 1000;

    // Convert video duration to milliseconds
    const durationMs = videoDuration * 1000;

    // Create array of time windows to analyze
    const timeWindows = [];
    for (let startTime = 0; startTime < durationMs; startTime += windowSize / 2) { // Overlapping windows
        const endTime = Math.min(startTime + windowSize, durationMs);
        timeWindows.push({ start: startTime, end: endTime, count: 0 });
    }

    // Count comments in each window
    const commentsWithTime = danmakuList.map(c => ({
        ...c,
        timeMs: (typeof c.time === 'number' ? c.time : c.stime) * 1000
    }));

    commentsWithTime.forEach(comment => {
        timeWindows.forEach(window => {
            if (comment.timeMs >= window.start && comment.timeMs < window.end) {
                window.count++;
            }
        });
    });

    // Find the maximum density
    const maxDensityWindow = timeWindows.reduce((max, window) =>
        window.count > max.count ? window : max, { count: 0 });

    // Calculate scaling factor - less aggressive scaling
    let scalingFactor = maxDensityWindow.count > targetMaxDensity
        ? targetMaxDensity / maxDensityWindow.count
        : 1.0;

    // Apply a smaller reduction (15% instead of 30%)
    // For larger windows, reduce the scaling reduction to maintain better density
    const video = document.querySelector('video');
    const width = video ? video.offsetWidth : 800;
    const height = video ? video.offsetHeight : 450;
    const areaFactor = Math.sqrt((width * height) / (715 * 402));
    const reductionFactor = Math.max(0.85, Math.min(0.95, 0.85 + (areaFactor - 1) * 0.1));

    scalingFactor = Math.min(scalingFactor * reductionFactor, reductionFactor);

    console.log('🍥 Density analysis:', {
        maxDensity: maxDensityWindow.count,
        targetDensity: targetMaxDensity,
        scalingFactor: scalingFactor,
        reductionFactor,
        maxDensityTimeWindow: `${maxDensityWindow.start / 1000}s-${maxDensityWindow.end / 1000}s`
    });

    // More strict threshold for no filtering - only if very sparse
    if (scalingFactor >= reductionFactor && maxDensityWindow.count < Math.max(10, Math.floor(10 * areaFactor))) {
        console.log('🍥 Density is acceptable, no filtering needed');
        return danmakuList;
    }

    // Apply filter based on calculated factor
    const filteredList = [];

    // Track how many comments we keep for each second of video for more even distribution
    const secondCounts = {};
    const maxPerSecond = Math.ceil(targetMaxDensity / windowSizeSeconds);

    // Analyze each time window separately with different sampling rates
    timeWindows.forEach(window => {
        // Get comments in this window
        const commentsInWindow = commentsWithTime.filter(c =>
            c.timeMs >= window.start && c.timeMs < window.end);

        // Calculate local scaling factor for this window
        const localDensity = commentsInWindow.length;
        let localScalingFactor = localDensity > targetMaxDensity
            ? targetMaxDensity / localDensity
            : 1.0;

        // Apply the global reduction as well
        localScalingFactor = Math.min(localScalingFactor, scalingFactor);

        // Sort comments by importance (prioritize longer comments, special colors)
        const scoredComments = commentsInWindow.map(comment => {
            // Simple scoring - can be adjusted based on preferences
            const textLength = (comment.text || '').length;
            const isSpecialColor = (comment.color || 0xffffff) !== 0xffffff; // Not white
            const score = textLength + (isSpecialColor ? 10 : 0);
            return { ...comment, score };
        });

        // Sort by score (higher first) and then by time for stable sorting
        scoredComments.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeMs - b.timeMs;
        });

        // Take top percentage based on scaling factor
        const numToKeep = Math.max(1, Math.floor(scoredComments.length * localScalingFactor));
        const selectedComments = scoredComments.slice(0, numToKeep);

        // Apply per-second limit for more even distribution
        selectedComments.forEach(comment => {
            const secondKey = Math.floor(comment.timeMs / 1000);
            secondCounts[secondKey] = (secondCounts[secondKey] || 0) + 1;

            // Only add if we haven't exceeded per-second limit
            if (secondCounts[secondKey] <= maxPerSecond) {
                filteredList.push(comment);
            }
        });
    });

    // Remove duplicates that might have been added from overlapping windows
    const uniqueFiltered = Array.from(new Set(filteredList.map(c => JSON.stringify(c))))
        .map(s => JSON.parse(s));

    console.log('🍥 Filtered danmaku list from', danmakuList.length, 'to', uniqueFiltered.length, 'comments');

    return uniqueFiltered;
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
        overlayDiv.style.zIndex = '2000';
        overlayDiv.style.pointerEvents = 'none';
        overlayDiv.style.overflow = 'hidden';
        overlayDiv.style.display = 'block';

        const playerElement = document.querySelector('.html5-video-player');
        if (playerElement) {
            playerElement.appendChild(overlayDiv);
        } else {
            console.warn("🍥 Could not find YouTube player element to attach overlay.");
            (document.getElementById('movie_player') || document.body).appendChild(overlayDiv);
        }
    }

    // Clean up existing manager if any
    if (commentManager) {
        commentManager.clear();
        commentManager.stop();
        commentManager = null;
    }

    try {
        // Create new manager
        commentManager = new CommentManager(overlayDiv);

        // Get video dimensions
        const videoElement = document.querySelector('video');
        const width = videoElement ? videoElement.offsetWidth : 800;
        const height = videoElement ? videoElement.offsetHeight : 450;

        // Add CSS to style the danmaku
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            #${DANMAKU_OVERLAY_ID} .cmt {
                position: absolute;
                color: #fff;
                font-family: Arial, sans-serif;
                font-weight: bold;
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
                will-change: transform;
                white-space: nowrap;
                line-height: 1.2;
                user-select: none;
                -webkit-text-size-adjust: none;
                -webkit-font-smoothing: antialiased;
            }
            #${DANMAKU_OVERLAY_ID} .cmt.css-optimize {
                will-change: transform;
                transform: translateZ(0);
                -webkit-transform: translateZ(0);
            }
            #${DANMAKU_OVERLAY_ID} .cmt.no-shadow {
                text-shadow: none;
            }
            #${DANMAKU_OVERLAY_ID} .cmt.reverse-shadow {
                text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
            }
        `;
        document.head.appendChild(styleElement);

        // Custom CSS to identify comment paths and avoid collisions
        const customAllocatorStyle = document.createElement('style');
        customAllocatorStyle.textContent = `
            #${DANMAKU_OVERLAY_ID} .cmt.lane-even {
                border-top: 1px solid rgba(0,255,0,0.1);
            }
            #${DANMAKU_OVERLAY_ID} .cmt.lane-odd {
                border-top: 1px solid rgba(255,0,0,0.1);
            }
        `;
        document.head.appendChild(customAllocatorStyle);

        // Set global options
        commentManager.options.global.opacity = 0.9; // Slightly transparent
        commentManager.options.scroll.scale = 1.2; // Adjust speed (1.0 = normal, higher = faster)
        commentManager.options.global.scale = 1.0; // Normal timing scale
        commentManager.options.global.className = 'cmt'; // CSS class name
        commentManager.options.limit = 0; // No limit on concurrent comments

        // Initialize with dimensions
        commentManager.init('css'); // Specify 'css' renderer for better performance
        commentManager.setBounds(width, height);

        console.log('🍥 CommentManager initialized with dimensions:', width, 'x', height);

        // Apply density-based filtering
        const filteredComments = applyDensityFilter(dList, videoElement ? videoElement.duration : 0);

        // Format and load comments with improved timing
        const formattedComments = filteredComments.map(c => {
            // Increase base size for all comments
            const baseSize = Math.min(height / 16, 30); // Changed from height/20 to height/16, max 30px
            return {
                text: c.text,
                mode: 1, // Scrolling right to left
                stime: (typeof c.time === 'number' ? c.time : c.stime) * 1000,
                dur: 8000 + Math.round(width / 2),
                color: c.color || 0xffffff,
                size: c.size ? Math.round(c.size * 1.2) : baseSize, // Increase existing sizes by 20%
                border: false,
                shadow: true
            };
        });

        // Sort by time to ensure proper sequencing
        formattedComments.sort((a, b) => a.stime - b.stime);

        // Add more sophisticated lane allocation algorithm
        // This helps with distributing comments randomly across vertical space
        commentManager.options.density = 1.2; // Slightly higher to allow more density in good spots

        // Update the lane height calculation for the allocator
        const tempStyle = document.createElement('div');
        tempStyle.className = 'cmt';
        tempStyle.style.position = 'absolute';
        tempStyle.style.visibility = 'hidden';
        tempStyle.style.fontSize = `${Math.min(height / 16, 30)}px`; // Match the new base size
        tempStyle.textContent = 'Test';
        document.body.appendChild(tempStyle);
        const lineHeight = tempStyle.offsetHeight;
        document.body.removeChild(tempStyle);

        console.log('🍥 Using lane height of', lineHeight, 'pixels');

        // Calculate available lanes
        const availableLanes = Math.floor(height / lineHeight);
        console.log('🍥 Available lanes:', availableLanes);

        // Implement custom lane allocation to make danmaku appear more random
        // Store active lanes to prioritize reuse
        const activeLanes = new Array(availableLanes).fill(0);

        // Override the default comment manager's allocate function
        const originalAllocate = commentManager.allocate;
        commentManager.allocate = function (cmt) {
            // Only override for scrolling comments
            if (cmt.mode !== 1) {
                return originalAllocate.call(this, cmt);
            }

            // Check if this is a new comment being added
            if (cmt._allocated !== true) {
                const result = originalAllocate.call(this, cmt);

                // Record the assigned lane
                if (typeof cmt.y === 'number') {
                    const assignedLane = Math.floor(cmt.y / lineHeight);
                    if (assignedLane >= 0 && assignedLane < availableLanes) {
                        activeLanes[assignedLane] += 1;
                    }

                    // Get list of lanes that already have comments
                    const busyLanes = [];
                    const emptyLanes = [];
                    for (let i = 0; i < availableLanes; i++) {
                        if (activeLanes[i] > 0) {
                            busyLanes.push(i);
                        } else {
                            emptyLanes.push(i);
                        }
                    }

                    // 70% chance to use a busy lane if available (to prevent line-by-line pattern)
                    if (busyLanes.length > 0 && Math.random() < 0.7) {
                        // Select a random busy lane
                        const randomLane = busyLanes[Math.floor(Math.random() * busyLanes.length)];

                        // Assign new vertical position with some random variation
                        cmt.y = (randomLane * lineHeight) + (Math.random() * lineHeight * 0.4);

                        // Update active lane counter
                        activeLanes[randomLane] += 1;
                    }
                    // Otherwise, just add some randomness to the assigned lane
                    else {
                        // Add small random variation to y position
                        cmt.y += (Math.random() - 0.5) * lineHeight * 0.3;
                    }
                }

                // Mark as allocated
                cmt._allocated = true;
                return result;
            }

            return originalAllocate.call(this, cmt);
        };

        // Apply anti-collision system
        // Add the collision prediction filter
        const denseCommentFilter = function (cmt) {
            const currentTime = commentManager.options.currentPositionTime || 0;
            // Only filter comments that are within 3 seconds of the current time
            if (Math.abs(cmt.stime - currentTime) > 3000) return cmt;

            // Randomly vary the size slightly to add visual diversity
            if (Math.random() < 0.3) {
                const sizeFactor = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
                cmt.size = Math.round(cmt.size * sizeFactor);
            }

            return cmt;
        };

        // Add the filter to the CommentManager
        commentManager.filter.addModifier(denseCommentFilter);

        // Debug log
        if (formattedComments.length > 0) {
            console.log('🍥 Sample comment:', formattedComments[0]);
        }

        // Load comments
        commentManager.load(formattedComments);

        // Start if video is playing
        const video = document.querySelector('video');
        if (video && !video.paused) {
            commentManager.start();
            // Set initial time based on current video time
            commentManager.time((video.currentTime) * 1000);
        }

        synchronizeDanmakuWithVideo();
        addResizeObserver();

        console.log('🍥 Loaded', formattedComments.length, 'comments after density filtering');
    } catch (error) {
        console.error('🍥 Error in setupDanmakuOverlay:', error);
    }
}

function synchronizeDanmakuWithVideo() {
    const video = document.querySelector('video');
    if (!video || !commentManager) {
        console.warn('🍥 Video element or CommentManager not found for sync.');
        return;
    }

    // Clean up existing listeners
    if (video._danmakuListeners) {
        Object.entries(video._danmakuListeners).forEach(([event, listener]) => {
            video.removeEventListener(event, listener);
        });
    }

    // Create new listeners
    const listeners = {
        play: () => {
            console.log('🍥 Video play event');
            commentManager.start();
            commentManager.time(video.currentTime * 1000); // Use exact time without offset
        },
        pause: () => {
            console.log('🍥 Video pause event');
            commentManager.stop();
        },
        seeking: () => {
            console.log('🍥 Video seeking event');
            commentManager.stop();
            commentManager.clear(); // Clear all comments when seeking
            // Store the seek target time for use after seeking
            video._seekTargetTime = video.currentTime;
        },
        seeked: () => {
            console.log('🍥 Video seeked event');
            // Reset the comment manager's timeline position to the new time
            commentManager.seek(video.currentTime * 1000);
            commentManager.time(video.currentTime * 1000); // Use exact time without offset

            // Store current time as an option to be used by space allocator
            commentManager.options.currentPositionTime = video.currentTime * 1000;

            if (!video.paused) {
                commentManager.start();
            }
        },
        timeupdate: () => {
            if (!video.paused) {
                commentManager.time(video.currentTime * 1000); // Use exact time without offset
                // Update current position time for comment allocator
                commentManager.options.currentPositionTime = video.currentTime * 1000;
            }
        },
        ended: () => {
            console.log('🍥 Video ended event');
            commentManager.stop();
            commentManager.clear(); // Clear all comments when video ends
        }
    };

    // Attach listeners
    Object.entries(listeners).forEach(([event, listener]) => {
        video.addEventListener(event, listener);
    });

    // Store listeners for cleanup
    video._danmakuListeners = listeners;

    // Initial state sync
    const width = video.offsetWidth;
    const height = video.offsetHeight;
    commentManager.setBounds(width, height);

    // Store initial position time
    commentManager.options.currentPositionTime = video.currentTime * 1000;

    // Start if video is playing
    if (!video.paused) {
        commentManager.start();
        commentManager.time(video.currentTime * 1000); // Use exact time without offset
    }
}

function addResizeObserver() {
    const video = document.querySelector('video');
    if (!video) return;

    // Clean up existing observer
    if (video._resizeObserver) {
        video._resizeObserver.disconnect();
    }

    // Create new observer
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (commentManager) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                console.log('🍥 Video resized to:', width, 'x', height);
                commentManager.setBounds(width, height);
            }
        }
    });

    resizeObserver.observe(video);
    video._resizeObserver = resizeObserver;
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
        // console.log('🍥 Final matchedBiliData for popup:', JSON.stringify(matchedBiliData, null, 2));

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

function getYouTubeVideoData() {
    try {
        const video = document.querySelector('video');
        if (!video) {
            console.warn('🍥 Video element not found');
            return null;
        }

        // Get the actual duration from the video element
        const duration = video.duration;

        // Get the title from the page
        const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim();

        if (!title || !duration) {
            console.warn('🍥 Could not extract complete video data', { title, duration });
            return null;
        }

        return {
            title,
            duration
        };
    } catch (error) {
        console.error('🍥 Error extracting YouTube video data:', error);
        return null;
    }
}
