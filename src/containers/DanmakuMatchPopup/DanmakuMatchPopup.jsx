import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import DanmakuSettings from '../DanmakuSettings/DanmakuSettings';

// Add Font Awesome CSS
const fontAwesomeLink = document.createElement('link');
fontAwesomeLink.rel = 'stylesheet';
fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
document.head.appendChild(fontAwesomeLink);

// Static styles that don't depend on state
const baseStyles = {
    authorImageStyles: {
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: '1px solid #666',
        objectFit: 'cover',
        marginRight: '2px',
    },
    authorNameStyles: {
        fontWeight: 'normal',
        fontSize: '11px',
        color: '#ccc',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '120px',
        display: 'inline-block'
    },
    contentStyles: {
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        margin: 0,
        padding: '0 0px 0 0',
        position: 'relative',
    },
    thumbnailStyles: {
        width: '110px',
        aspectRatio: '16 / 9',
        objectFit: 'cover',
        borderRadius: '4px',
        border: '1px solid #555',
        flexShrink: 0,
    },
    closeButtonStyles: {
        position: 'absolute',
        top: '2px',
        right: '4px',
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
        transition: 'all 0.2s ease',
    },
    closeButtonHoverStyles: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
    },
    controlsRowStyles: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0px',
        margin: 0,
        borderRadius: '6px',
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'transparent'
    },
    settingsButtonContainer: {
        backgroundColor: '#383838',
        padding: '3px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        height: '28px',
        margin: 0,
        order: -1
    },
    settingsButtonStyles: {
        width: '28px',
        height: '28px',
        borderRadius: '4px',
        backgroundColor: '#444',
        border: 'none',
        color: '#aaa',
        fontSize: '14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        padding: 0,
        margin: 0,
        position: 'relative',
        overflow: 'hidden'
    },
    settingsButtonHoverStyles: {
        backgroundColor: '#555',
        color: '#fff',
    },
    toggleContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#383838',
        borderRadius: '6px',
        padding: '3px 8px',
        cursor: 'pointer',
        flexGrow: 1,
        height: '28px',
        margin: 0,
        justifyContent: 'space-between'
    }
};

const videoInfoStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px', // Increased gap slightly
    flexGrow: 1,
    minWidth: 0, // Important for text overflow in flex children
};

const titleStyles = {
    fontWeight: '500',
    fontSize: '14px',
    color: '#f1f1f1',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '1.4',
    maxHeight: 'calc(1.4em * 2)',
    paddingRight: '16px',
    cursor: 'pointer',
    transition: 'color 0.2s ease',
    textDecoration: 'none'
};

const titleHoverStyles = {
    ...titleStyles,
    color: '#3498db'
};

const authorNameStyles = {
    fontWeight: 'normal',
    fontSize: '11px',
    color: '#ccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '120px',
    display: 'inline-block',
    cursor: 'pointer',
    transition: 'color 0.2s ease'
};

const authorNameHoverStyles = {
    ...authorNameStyles,
    color: '#3498db'
};

const metadataContainerStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px', // Gap between metadata lines if they wrap (though aiming for one line)
    marginTop: 'auto', // Push metadata down slightly if space allows
};

const metadataLineStyles = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    flexWrap: 'wrap',
    fontSize: '11px',
    color: '#aaa',
    lineHeight: '1.2',
};

const danmakuCountStyles = {
    fontSize: '11px',
    color: '#aaa',
    display: 'inline-flex',
    alignItems: 'center',
    marginRight: '8px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: '400'
};

const metadataSeparator = {
    margin: '0 2px',
};

// --- Toggle Switch Styles --- (New)
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

// Add icon transition styles
const iconStyles = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    transition: 'all 0.3s ease',
};

const settingsIconStyle = (showSettings) => ({
    ...iconStyles,
    opacity: showSettings ? 0 : 1,
    transform: `translate(-50%, -50%) ${showSettings ? 'rotate(90deg)' : 'rotate(0deg)'}`,
});

const listIconStyle = (showSettings) => ({
    ...iconStyles,
    opacity: showSettings ? 1 : 0,
    transform: `translate(-50%, -50%) ${showSettings ? 'rotate(0deg)' : 'rotate(-90deg)'}`,
});

const thumbnailContainerStyles = {
    position: 'relative',
    flexShrink: 0,
    cursor: 'pointer',
    width: '110px',
    height: '62px',
    borderRadius: '4px',
    overflow: 'hidden'
};

const thumbnailOverlayStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.2s ease',
};

const bilibiliIconStyles = {
    fontSize: '24px',
    color: '#fff',
    textShadow: '0 0 10px rgba(0,0,0,0.5)'
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

// Add number formatting function
function formatCount(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 10000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
}

const DanmakuMatchPopup = ({ matchData, onShowDanmaku, onClosePopup, initialOverlayActive, danmakuCount = 0 }) => {
    const [isActive, setIsActive] = useState(initialOverlayActive);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCloseHovered, setIsCloseHovered] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isSettingsHovered, setIsSettingsHovered] = useState(false);
    const [isTitleHovered, setIsTitleHovered] = useState(false);
    const [isAuthorHovered, setIsAuthorHovered] = useState(false);
    const [settings, setSettings] = useState({
        fontSize: 24,
        speed: 48,
        opacity: 1,
        fontWeight: 'bold',
        textShadow: true,
        density: 1
    });

    // Load settings from storage on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const result = await chrome.storage.local.get('youtubeDanmakuSettings');
                if (result.youtubeDanmakuSettings) {
                    setSettings(result.youtubeDanmakuSettings);
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        };
        loadSettings();
    }, []);

    // Load toggle state from storage on mount
    useEffect(() => {
        const loadToggleState = async () => {
            try {
                const result = await chrome.storage.local.get('youtubeDanmakuOverlayActive');
                if (result.youtubeDanmakuOverlayActive !== undefined) {
                    setIsActive(result.youtubeDanmakuOverlayActive);
                    if (onShowDanmaku) {
                        onShowDanmaku(result.youtubeDanmakuOverlayActive, matchData.cid || matchData.aid);
                    }
                }
            } catch (error) {
                console.error('Error loading toggle state:', error);
            }
        };
        loadToggleState();
    }, []);

    // Dynamic styles that depend on state
    const dynamicStyles = {
        popupContainer: {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: '#282828',
            color: '#e0e0e0',
            padding: '10px 10px 6px 10px',
            borderRadius: '8px',
            zIndex: '2147483647',
            boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
            fontFamily: 'Roboto, Arial, "Noto Sans SC", sans-serif',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            border: '1px solid #444',
            width: '380px',
            transition: 'all 0.3s ease-in-out',
            maxHeight: showSettings ? '600px' : '200px',
            overflow: 'hidden',
            margin: 0
        },
        settingsPanel: {
            backgroundColor: '#383838',
            borderRadius: '6px',
            marginTop: '2px',
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            opacity: showSettings ? 1 : 0,
            maxHeight: showSettings ? '500px' : '0',
            transform: showSettings ? 'translateY(0)' : 'translateY(-10px)',
            margin: 0,
            padding: 0
        }
    };

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

    const handleToggle = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const newState = !isActive;
        setIsActive(newState);

        // Save to local storage
        chrome.storage.local.set({ youtubeDanmakuOverlayActive: newState });

        if (onShowDanmaku) {
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

    const handleSettingsChange = (newSettings) => {
        setSettings(newSettings);
        // Save settings to storage and update danmaku
        chrome.runtime.sendMessage({
            type: 'SAVE_SETTINGS',
            settings: newSettings
        });
    };

    const handleTitleClick = () => {
        if (matchData.bvid) {
            window.open(`https://www.bilibili.com/video/${matchData.bvid}`, '_blank');
        }
    };

    const handleAuthorClick = () => {
        if (matchData.owner?.mid) {
            window.open(`https://space.bilibili.com/${matchData.owner.mid}`, '_blank');
        }
    };

    if (!matchData || isFullscreen) return null;

    return (
        <div style={dynamicStyles.popupContainer}>
            <button
                style={{
                    ...baseStyles.closeButtonStyles,
                    ...(isCloseHovered ? baseStyles.closeButtonHoverStyles : {}),
                    backgroundColor: isCloseHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
                }}
                onClick={handleClose}
                onMouseEnter={() => setIsCloseHovered(true)}
                onMouseLeave={() => setIsCloseHovered(false)}
                title="Close Popup"
            >
                &times;
            </button>

            <div style={baseStyles.contentStyles}>
                {videoThumbnail && (
                    <div
                        style={thumbnailContainerStyles}
                        onClick={handleTitleClick}
                        onMouseEnter={(e) => {
                            e.currentTarget.querySelector('.thumbnail-overlay').style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.querySelector('.thumbnail-overlay').style.opacity = '0';
                        }}
                    >
                        <img
                            src={videoThumbnail}
                            alt="Video thumbnail"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                border: '1px solid #555',
                            }}
                            referrerPolicy="no-referrer"
                        />
                        <div className="thumbnail-overlay" style={thumbnailOverlayStyles}>
                            <i className="fa-brands fa-bilibili" style={bilibiliIconStyles}></i>
                        </div>
                    </div>
                )}
                <div style={videoInfoStyles}>
                    <div
                        style={isTitleHovered ? titleHoverStyles : titleStyles}
                        title={matchData.title}
                        onClick={handleTitleClick}
                        onMouseEnter={() => setIsTitleHovered(true)}
                        onMouseLeave={() => setIsTitleHovered(false)}
                    >
                        {matchData.title}
                    </div>
                    <div style={metadataContainerStyles}>
                        <div style={metadataLineStyles}>
                            {authorFace && (
                                <img
                                    src={authorFace}
                                    alt={authorName}
                                    style={{ ...baseStyles.authorImageStyles, cursor: 'pointer' }}
                                    referrerPolicy="no-referrer"
                                    onClick={handleAuthorClick}
                                />
                            )}
                            {authorFace && (
                                <span
                                    style={isAuthorHovered ? authorNameHoverStyles : authorNameStyles}
                                    title={authorName}
                                    onClick={handleAuthorClick}
                                    onMouseEnter={() => setIsAuthorHovered(true)}
                                    onMouseLeave={() => setIsAuthorHovered(false)}
                                >
                                    {authorName}
                                </span>
                            )}
                            {authorFace && <span style={metadataSeparator}>•</span>}
                            <span>{matchData.view_count ? `${formatCount(matchData.view_count)} views` : 'N/A'}</span>
                            <span style={metadataSeparator}>•</span>
                            <span>{publicationDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style={baseStyles.controlsRowStyles}>
                <div style={baseStyles.settingsButtonContainer}>
                    <button
                        style={{
                            ...baseStyles.settingsButtonStyles,
                            ...(isSettingsHovered ? baseStyles.settingsButtonHoverStyles : {})
                        }}
                        onClick={() => setShowSettings(!showSettings)}
                        onMouseEnter={() => setIsSettingsHovered(true)}
                        onMouseLeave={() => setIsSettingsHovered(false)}
                        title={showSettings ? "Hide Settings" : "Show Settings"}
                    >
                        <i
                            className="fas fa-cog"
                            style={settingsIconStyle(showSettings)}
                        />
                        <i
                            className="fas fa-chevron-down"
                            style={listIconStyle(showSettings)}
                        />
                    </button>
                </div>

                <div style={baseStyles.toggleContainer}>
                    <span style={toggleLabelStyles}>Danmaku Overlay</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {danmakuCount > 0 && (
                            <span style={danmakuCountStyles}>
                                {formatCount(danmakuCount)} 弹幕
                            </span>
                        )}
                        <label style={switchStyles}>
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={handleToggle}
                                style={switchInputStyles}
                            />
                            <span style={{ ...sliderStyles, ...(isActive ? checkedSliderStyles : {}) }}>
                                <span style={{ ...sliderBeforeStyles, ...(isActive ? checkedSliderBeforeStyles : {}) }}></span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            <div style={dynamicStyles.settingsPanel}>
                <DanmakuSettings
                    initialSettings={settings}
                    onSettingsChange={handleSettingsChange}
                />
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
        pic: PropTypes.string,
        duration: PropTypes.string,
        author: PropTypes.string,
        owner: PropTypes.shape({
            name: PropTypes.string,
            face: PropTypes.string,
        }),
        pubdate: PropTypes.number,
    }),
    onShowDanmaku: PropTypes.func.isRequired,
    onClosePopup: PropTypes.func.isRequired,
    initialOverlayActive: PropTypes.bool.isRequired,
    danmakuCount: PropTypes.number,
};

export default DanmakuMatchPopup; 