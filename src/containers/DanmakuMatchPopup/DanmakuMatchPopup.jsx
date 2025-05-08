import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Basic styling, can be moved to a separate CSS file or enhanced with styled-components
const popupStyles = {
    position: 'fixed', // Changed to fixed to avoid being clipped by player parent
    bottom: '20px',
    right: '20px',
    width: '340px', // Increased width
    backgroundColor: '#282828', // Reverted color
    color: '#e0e0e0',
    padding: '12px',
    borderRadius: '8px',
    zIndex: '2147483647',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
    fontFamily: 'Roboto, Arial, "Noto Sans SC", sans-serif',
    fontSize: '13px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    border: '1px solid #444',
    pointerEvents: 'auto', // DEBUG: Ensure pointer events are enabled
    // Removed backdropFilter and RGBA background
};

const authorImageStyles = {
    width: '18px', // Smaller author pic
    height: '18px',
    borderRadius: '50%',
    border: '1px solid #666',
    objectFit: 'cover',
    marginRight: '2px',
};

const authorNameStyles = {
    fontWeight: 'normal',
    fontSize: '11px',
    color: '#ccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '150px', // Increased from 100px
    wordBreak: 'break-all', // Allow breaking at any character
    display: '-webkit-box',
    WebkitLineClamp: 2, // Allow up to 2 lines
    WebkitBoxOrient: 'vertical',
    lineHeight: '1.2',
};

const contentStyles = {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
};

const thumbnailStyles = {
    width: '110px', // Slightly larger thumbnail
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: '4px',
    border: '1px solid #555',
    flexShrink: 0,
};

const videoInfoStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px', // Increased gap slightly
    flexGrow: 1,
    minWidth: 0, // Important for text overflow in flex children
};

const titleStyles = {
    fontWeight: '500', // Medium weight
    fontSize: '14px',
    color: '#f1f1f1',
    display: '-webkit-box',
    WebkitLineClamp: 2, // Show 2 lines
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '1.4',
    maxHeight: 'calc(1.4em * 2)', // Corresponds to WebkitLineClamp * lineHeight
    paddingRight: '12px', // Add padding to prevent overlap with close button
};

const metadataContainerStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px', // Gap between metadata lines if they wrap (though aiming for one line)
    marginTop: 'auto', // Push metadata down slightly if space allows
};

const metadataLineStyles = {
    display: 'flex',
    alignItems: 'flex-start', // Changed from center to allow proper wrapping
    gap: '6px',
    flexWrap: 'wrap', // Allow wrapping if needed
    fontSize: '11px',
    color: '#aaa',
    lineHeight: '1.2',
};

const metadataSeparator = {
    margin: '0 2px',
};

const buttonStyles = {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: '500',
    marginTop: '5px',
    transition: 'background-color 0.2s ease, transform 0.1s ease',
    width: '100%',
};

const closeButtonStyles = {
    position: 'absolute',
    top: '6px',
    right: '8px',
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px',
    lineHeight: '1',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    transition: 'background-color 0.2s ease, color 0.2s ease',
    backgroundColor: 'transparent', // Explicitly set the default background
};

const closeButtonHoverStyles = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
};

// --- Toggle Switch Styles --- (New)
const toggleContainerStyles = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#444',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    marginTop: '5px',
    width: '100%', // Span full width
    boxSizing: 'border-box', // Include padding in width
    transition: 'background-color 0.2s ease',
};

const toggleLabelStyles = {
    fontSize: '13px',
    fontWeight: '500',
    color: '#f1f1f1',
};

const switchStyles = {
    position: 'relative',
    display: 'inline-block',
    width: '34px', // Smaller switch
    height: '20px',
};

const switchInputStyles = {
    opacity: 0,
    width: 0,
    height: 0,
};

const sliderStyles = {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#666', // Off color
    transition: '.4s',
    borderRadius: '20px',
};

const sliderBeforeStyles = {
    position: 'absolute',
    content: '""',
    height: '14px',
    width: '14px',
    left: '3px',
    bottom: '3px',
    backgroundColor: 'white',
    transition: '.4s',
    borderRadius: '50%',
};

const checkedSliderStyles = {
    backgroundColor: '#3498db',
};

const checkedSliderBeforeStyles = {
    transform: 'translateX(14px)',
};

function ensureHttpsUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    if (url.startsWith('http://')) {
        return url.replace(/^http:/, 'https:');
    }
    // Assume it's already https or a relative path (though relative shouldn't happen here)
    return url;
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        // Bilibili pubdate is usually in seconds
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        console.error("Error formatting date:", e);
        return 'N/A';
    }
}

const DanmakuMatchPopup = ({ matchData, onShowDanmaku, onClosePopup, initialOverlayActive }) => {
    const [isActive, setIsActive] = useState(initialOverlayActive);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCloseHovered, setIsCloseHovered] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement !== null);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        // Initial check
        setIsFullscreen(document.fullscreenElement !== null);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    // Update local state if prop changes (e.g., on video navigation reset)
    useEffect(() => {
        console.log('🍥 Popup useEffect: initialOverlayActive changed to', initialOverlayActive, 'Current isActive:', isActive);
        if (isActive !== initialOverlayActive) {
            console.log('🍥 Popup useEffect: Syncing internal isActive state to', initialOverlayActive);
            setIsActive(initialOverlayActive);
        }
    }, [initialOverlayActive]);

    if (!matchData || isFullscreen) return null;

    const handleToggle = (e) => {
        e.stopPropagation(); // Prevent potential interference
        e.preventDefault(); // Prevent default browser action for label/input click
        const newState = !isActive;
        // console.log(`🍥 Popup handleToggle: Called. Current isActive: ${isActive}, Setting internal state to: ${newState}`);
        setIsActive(newState);
        if (onShowDanmaku) {
            // Pass the new state and necessary ID
            // console.log(`🍥 Popup handleToggle: Calling parent onShowDanmaku with state: ${newState}`);
            onShowDanmaku(newState, matchData.cid || matchData.aid);
        }
    };

    const handleClose = (e) => {
        e.stopPropagation();
        if (onClosePopup) {
            onClosePopup();
        }
    };

    // Prioritize owner info, fallback to search author
    const authorName = matchData.owner?.name || matchData.author || 'N/A';
    // Sanitize URLs
    const authorFace = ensureHttpsUrl(matchData.owner?.face);
    const videoThumbnail = ensureHttpsUrl(matchData.pic);
    const publicationDate = formatDate(matchData.pubdate);

    return (
        <div style={popupStyles}>
            <button
                style={{ ...closeButtonStyles, ...(isCloseHovered ? closeButtonHoverStyles : {}) }}
                onClick={handleClose}
                onMouseEnter={() => setIsCloseHovered(true)}
                onMouseLeave={() => setIsCloseHovered(false)}
                title="Close Popup"
            >
                &times;
            </button>

            <div style={contentStyles}>
                {videoThumbnail && <img src={videoThumbnail} alt="Video thumbnail" style={thumbnailStyles} referrerPolicy="no-referrer" />}
                <div style={videoInfoStyles}>
                    <div style={titleStyles} title={matchData.title}>{matchData.title}</div>
                    <div style={metadataContainerStyles}>
                        <div style={metadataLineStyles}>
                            {authorFace && <img src={authorFace} alt={authorName} style={authorImageStyles} referrerPolicy="no-referrer" />}
                            {authorFace && <span style={authorNameStyles} title={authorName}>{authorName}</span>}
                            {authorFace && <span style={metadataSeparator}>•</span>}
                            <span>{matchData.duration || 'N/A'}</span>
                            <span style={metadataSeparator}>•</span>
                            <span>{publicationDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toggle Switch Area */}
            <div style={toggleContainerStyles} onClick={handleToggle} role="button" tabIndex={0}>
                <span style={toggleLabelStyles}>Danmaku Overlay</span>
                <label style={switchStyles}>
                    <input
                        type="checkbox"
                        checked={isActive}
                        style={switchInputStyles}
                    />
                    <span style={{ ...sliderStyles, ...(isActive ? checkedSliderStyles : {}) }}>
                        <span style={{ ...sliderBeforeStyles, ...(isActive ? checkedSliderBeforeStyles : {}) }}></span>
                    </span>
                </label>
            </div>
        </div>
    );
};

DanmakuMatchPopup.propTypes = {
    matchData: PropTypes.shape({
        bvid: PropTypes.string,
        aid: PropTypes.number,
        cid: PropTypes.number,
        title: PropTypes.string,
        pic: PropTypes.string, // Thumbnail URL
        duration: PropTypes.string, // e.g., "MM:SS"
        author: PropTypes.string, // From search results (fallback)
        owner: PropTypes.shape({ // From detailed view API
            name: PropTypes.string,
            face: PropTypes.string, // Author profile picture URL
        }),
        pubdate: PropTypes.number, // Unix timestamp (seconds)
    }),
    onShowDanmaku: PropTypes.func.isRequired,
    onClosePopup: PropTypes.func.isRequired,
    initialOverlayActive: PropTypes.bool.isRequired, // Renamed prop for clarity
};

export default DanmakuMatchPopup; 