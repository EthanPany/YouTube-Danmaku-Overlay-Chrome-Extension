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
                <span>Shrink panel to a corner button when idle</span>
                <input
                    type="checkbox"
                    checked={settings.autoCollapsePanel}
                    onChange={(e) => update({ autoCollapsePanel: e.target.checked })}
                />
            </label>
            <details className="experimental">
                <summary>Experimental: Jev matching</summary>
                <label className="row">
                    <span>Re-rank matches with TypeSafe Jev</span>
                    <input type="checkbox" checked={settings.jevEnabled} onChange={(e) => update({ jevEnabled: e.target.checked })} />
                </label>
                <input
                    className="key"
                    type="password"
                    placeholder="TypeSafe API key"
                    value={settings.jevApiKey}
                    onChange={(e) => update({ jevApiKey: e.target.value.trim() })}
                />
                <p className="hint">Sends the video title, channel and candidate titles to api.typesafe.ai. Off by default.</p>
            </details>
            <p className="hint">
                Open any YouTube video. Matching, filters and timing are in the <b>弹</b> panel at the right edge of the page.
                Per-video on/off overrides this default.
            </p>
        </div>
    );
};

export default Popup;
