// This script will be injected directly into the page context
// It will handle the CommentCoreLibrary operations

// Create a global object for our functionality
window.YouTubeDanmakuOverlay = {
    commentManager: null,
    videoElement: null,
    overlayElement: null,
    danmakuData: null,
    timeUpdateInterval: null,

    initialize: function (containerId) {
        // Clear any previous instance
        this.cleanup();

        // Find the container and video elements
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container element not found:', containerId);
            return false;
        }

        // Find the YouTube video element
        this.videoElement = document.querySelector('video');
        if (!this.videoElement) {
            console.error('YouTube video element not found');
            return false;
        }

        // Create the overlay structure required by CommentCoreLibrary
        this.createOverlayElements(container);

        // Initialize CommentManager with our container
        if (typeof CommentManager !== 'function') {
            console.error('CommentManager constructor not found in page context after script injection');
            return false;
        }

        try {
            this.commentManager = new CommentManager(this.overlayElement);
            this.commentManager.init();
            console.log('CommentManager initialized successfully in page context');
            return true;
        } catch (error) {
            console.error('Error initializing CommentManager:', error);
            return false;
        }
    },

    createOverlayElements: function (container) {
        // Create the required DOM structure for CommentCoreLibrary
        const abpWrapper = document.createElement('div');
        abpWrapper.className = 'abp';
        abpWrapper.id = 'youtube-danmaku-abp-wrapper';
        abpWrapper.style.position = 'absolute';
        abpWrapper.style.top = '0';
        abpWrapper.style.left = '0';
        abpWrapper.style.width = '100%';
        abpWrapper.style.height = '100%';
        abpWrapper.style.pointerEvents = 'none';
        abpWrapper.style.zIndex = '10000'; // Ensure it's above the video

        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'container';
        this.overlayElement.id = 'youtube-danmaku-container';
        this.overlayElement.style.width = '100%';
        this.overlayElement.style.height = '100%';

        abpWrapper.appendChild(this.overlayElement);
        container.appendChild(abpWrapper);

        return this.overlayElement;
    },

    loadDanmaku: function (danmakuArray) {
        if (!this.commentManager) {
            console.error('CommentManager not initialized');
            return false;
        }

        this.danmakuData = danmakuArray;

        try {
            // Load the danmaku data
            this.commentManager.load(this.danmakuData);
            this.commentManager.start();

            // Set up video sync
            this.syncWithVideo();

            console.log('Danmaku loaded and synced with video');
            return true;
        } catch (error) {
            console.error('Error loading danmaku:', error);
            return false;
        }
    },

    syncWithVideo: function () {
        if (!this.videoElement || !this.commentManager) return;

        // Clear any existing interval
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }

        // Set initial time
        this.commentManager.time(this.videoElement.currentTime * 1000);

        // Handle play/pause events
        const onPlay = () => {
            this.commentManager.start();
            // Update danmaku time every 50ms while playing for smoother sync
            this.timeUpdateInterval = setInterval(() => {
                this.commentManager.time(this.videoElement.currentTime * 1000);
            }, 50);
        };

        const onPause = () => {
            this.commentManager.stop();
            if (this.timeUpdateInterval) {
                clearInterval(this.timeUpdateInterval);
                this.timeUpdateInterval = null;
            }
        };

        const onSeeking = () => {
            this.commentManager.clear();
        };

        const onSeeked = () => {
            this.commentManager.time(this.videoElement.currentTime * 1000);
            if (!this.videoElement.paused) {
                this.commentManager.start();
            }
        };

        // Add event listeners
        this.videoElement.addEventListener('play', onPlay);
        this.videoElement.addEventListener('pause', onPause);
        this.videoElement.addEventListener('seeking', onSeeking);
        this.videoElement.addEventListener('seeked', onSeeked);

        // Start if already playing
        if (!this.videoElement.paused) {
            onPlay();
        }
    },

    cleanup: function () {
        // Clear sync interval
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        // Stop and clear CommentManager
        if (this.commentManager) {
            this.commentManager.stop();
            this.commentManager.clear();
            this.commentManager = null;
        }

        // Remove overlay elements
        const abpWrapper = document.getElementById('youtube-danmaku-abp-wrapper');
        if (abpWrapper && abpWrapper.parentNode) {
            abpWrapper.parentNode.removeChild(abpWrapper);
        }

        this.overlayElement = null;
        this.danmakuData = null;
    },

    // Method for receiving commands from content script
    processCommand: function (command, data) {
        console.log('Received command in page script:', command, data);

        switch (command) {
            case 'initialize':
                return this.initialize(data.containerId);

            case 'loadDanmaku':
                return this.loadDanmaku(data.danmakuArray);

            case 'stop':
                if (this.commentManager) {
                    this.commentManager.stop();
                }
                return true;

            case 'start':
                if (this.commentManager) {
                    this.commentManager.start();
                }
                return true;

            case 'cleanup':
                this.cleanup();
                return true;

            default:
                console.error('Unknown command:', command);
                return false;
        }
    }
};

// Set up listener for commands from content script
window.addEventListener('message', function (event) {
    // Only accept messages from the same window
    if (event.source !== window) return;

    // Process both formatted command messages and direct content script messages
    if (event.data && event.data.type === 'YOUTUBE_DANMAKU_COMMAND') {
        const { command, data, requestId } = event.data;
        processCommand(command, data, requestId);
    }
    // Handle messages from the updated content script
    else if (event.data && event.data.type === 'FROM_CONTENT_SCRIPT') {
        const { action, data } = event.data;
        processCommand(action, data);
    }

    // Helper function to process commands and send responses if needed
    function processCommand(command, data, requestId) {
        try {
            const result = window.YouTubeDanmakuOverlay.processCommand(command, data);

            // Only send response if we have a requestId (for the older message format)
            if (requestId) {
                window.postMessage({
                    type: 'YOUTUBE_DANMAKU_RESPONSE',
                    requestId: requestId,
                    success: true,
                    result: result
                }, '*');
            }
        } catch (error) {
            console.error('Error processing command:', command, error);
            if (requestId) {
                window.postMessage({
                    type: 'YOUTUBE_DANMAKU_RESPONSE',
                    requestId: requestId,
                    success: false,
                    error: error.message
                }, '*');
            }
        }
    }
});

console.log('🍥 YouTube Danmaku Page Script Loaded 🍥'); 