/**
 * Toolbar popup: global on/off and panel behaviour. Everything else is
 * configured from the in-page panel next to the video.
 */
import React, { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../../shared/storage';
import './Popup.css';

const Popup = () => {
    const [settings, setSettings] = useState(null);

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    const update = (patch) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        saveSettings(next);
    };

    if (!settings) return null;
    return (
        <div className="popup">
            <h1>
                <span className="logo">弹</span> YouTube → B站弹幕
            </h1>
            <label className="row">
                <span>Show danmaku automatically</span>
                <input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
            </label>
            <label className="row">
                <span>Tuck panel into side tab when idle</span>
                <input
                    type="checkbox"
                    checked={settings.autoCollapsePanel}
                    onChange={(e) => update({ autoCollapsePanel: e.target.checked })}
                />
            </label>
            <p className="hint">
                Open any YouTube video. Matching, filters and timing are in the <b>弹</b> panel at the right edge of the page.
                Per-video on/off overrides this default.
            </p>
        </div>
    );
};

export default Popup;
