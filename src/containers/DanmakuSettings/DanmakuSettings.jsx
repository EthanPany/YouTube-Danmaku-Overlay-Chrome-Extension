import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './DanmakuSettings.css';

const DanmakuSettings = ({ initialSettings, onSettingsChange }) => {
    const [settings, setSettings] = useState(initialSettings);

    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);

    const handleChange = (key, value) => {
        const newSettings = {
            ...settings,
            [key]: value
        };

        // Special handling for text shadow and bold text
        if (key === 'textShadow') {
            newSettings.style = {
                ...newSettings.style,
                textShadow: value ? '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000' : 'none',
                lineWidth: value ? 2 : 0
            };
        }

        if (key === 'fontWeight') {
            const weight = value ? 'bold' : 'normal';
            newSettings.fontWeight = weight;
            newSettings.style = {
                ...newSettings.style,
                font: `${weight} ${newSettings.fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`
            };
        }

        setSettings(newSettings);
        if (onSettingsChange) {
            onSettingsChange(newSettings);
        }
    };

    return (
        <div className="danmaku-settings">
            <div className="settings-group">
                <label>
                    <span>Font Size</span>
                    <input
                        type="range"
                        min="12"
                        max="48"
                        value={settings.fontSize}
                        onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
                    />
                    <span className="value">{settings.fontSize}px</span>
                </label>
            </div>

            <div className="settings-group">
                <label>
                    <span>Speed</span>
                    <input
                        type="range"
                        min="24"
                        max="300"
                        value={settings.speed}
                        onChange={(e) => handleChange('speed', parseInt(e.target.value))}
                    />
                    <span className="value">{settings.speed}</span>
                </label>
            </div>

            <div className="settings-group">
                <label>
                    <span>Opacity</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.opacity * 100}
                        onChange={(e) => handleChange('opacity', e.target.value / 100)}
                    />
                    <span className="value">{Math.round(settings.opacity * 100)}%</span>
                </label>
            </div>

            <div className="settings-group">
                <label>
                    <span>Density</span>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        value={settings.density * 100}
                        onChange={(e) => handleChange('density', e.target.value / 100)}
                    />
                    <span className="value">{Math.round(settings.density * 100)}%</span>
                </label>
            </div>
            {/* 
            <div className="settings-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={settings.textShadow}
                        onChange={(e) => handleChange('textShadow', e.target.checked)}
                    />
                    <span>Text Shadow</span>
                </label>
            </div>

            <div className="settings-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={settings.fontWeight === 'bold'}
                        onChange={(e) => handleChange('fontWeight', e.target.checked)}
                    />
                    <span>Bold Text</span>
                </label>
            </div> */}
        </div>
    );
};

DanmakuSettings.propTypes = {
    initialSettings: PropTypes.shape({
        fontSize: PropTypes.number,
        speed: PropTypes.number,
        opacity: PropTypes.number,
        fontWeight: PropTypes.string,
        textShadow: PropTypes.bool,
        density: PropTypes.number
    }).isRequired,
    onSettingsChange: PropTypes.func.isRequired
};

export default DanmakuSettings; 