/**
 * The in-page panel. Collapsed, it is a small tab docked to the right edge
 * (draggable vertically) showing a status dot; expanded, it shows the
 * Match / Display / Filter / Sync tabs. It tucks itself away when idle
 * unless pinned or `autoCollapsePanel` is off.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import MatchTab from './MatchTab';
import { DisplayTab, FilterTab, SyncTab } from './SettingsTabs';
import { Switch, Icons } from './controls';

const IDLE_COLLAPSE_MS = 5000;
const NO_MATCH_COLLAPSE_MS = 12000;
const TABS = ['Match', 'Display', 'Filter', 'Sync'];

function useControllerState(controller) {
    const [state, setState] = useState(controller.state);
    useEffect(() => controller.subscribe(setState), [controller]);
    return state;
}

function statusDot(state, enabled) {
    if (state.status === 'loading' || state.status === 'searching' || state.danmaku.loading) return 'busy';
    if (state.status === 'error') return 'err';
    if (state.status === 'no-match') return 'warn';
    if (state.status === 'matched') return enabled ? 'ok' : '';
    return '';
}

/** Vertical drag on the side tab; a click without movement expands. */
function useTabDrag(top, onMove, onClick) {
    return useCallback(
        (e) => {
            const startY = e.clientY;
            const startTop = top;
            let moved = false;
            const move = (ev) => {
                const dy = ev.clientY - startY;
                if (Math.abs(dy) > 4) moved = true;
                if (moved) onMove(Math.max(5, Math.min(90, startTop + (dy / window.innerHeight) * 100)), false);
            };
            const up = (ev) => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                if (moved) onMove(Math.max(5, Math.min(90, startTop + ((ev.clientY - startY) / window.innerHeight) * 100)), true);
                else onClick();
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            e.preventDefault();
        },
        [top, onMove, onClick]
    );
}

export default function Panel({ controller }) {
    const state = useControllerState(controller);
    const { settings, status, videoId, match } = state;
    const enabled = state.videoEnabled ?? settings?.enabled ?? true;

    const [expanded, setExpanded] = useState(true);
    const [pinned, setPinned] = useState(false);
    const [tab, setTab] = useState('Match');
    const [dragTop, setDragTop] = useState(null);
    const hovering = useRef(false);
    const timer = useRef(null);

    // Re-open on each new video so the user sees what was matched.
    useEffect(() => {
        setExpanded(true);
        setTab('Match');
    }, [videoId]);

    const scheduleCollapse = useCallback(() => {
        clearTimeout(timer.current);
        if (!settings?.autoCollapsePanel || pinned || hovering.current) return;
        if (status === 'loading' || status === 'searching') return;
        timer.current = setTimeout(() => setExpanded(false), status === 'no-match' ? NO_MATCH_COLLAPSE_MS : IDLE_COLLAPSE_MS);
    }, [settings?.autoCollapsePanel, pinned, status]);

    useEffect(() => {
        if (expanded) scheduleCollapse();
        return () => clearTimeout(timer.current);
    }, [expanded, scheduleCollapse]);

    const onTabMove = useCallback(
        (top, commit) => {
            setDragTop(commit ? null : top);
            if (commit) controller.updateSettings({ panelTop: Math.round(top) });
        },
        [controller]
    );
    const top = dragTop ?? settings?.panelTop ?? 35;
    const onTabMouseDown = useTabDrag(top, onTabMove, () => setExpanded(true));

    if (!settings || !videoId) return null;

    if (!expanded) {
        return (
            <div
                className="tab"
                style={{ top: `${top}%` }}
                onMouseDown={onTabMouseDown}
                title={match ? `B站弹幕: ${match.view.title}` : 'B站弹幕 — click to open, drag to move'}
            >
                <span className="logo">弹</span>
                <span className={`dot ${statusDot(state, enabled)}`} />
            </div>
        );
    }

    return (
        <div
            className="panel"
            style={{ top: `clamp(8px, calc(${top}% - 60px), calc(100vh - 420px))` }}
            onMouseEnter={() => {
                hovering.current = true;
                clearTimeout(timer.current);
            }}
            onMouseLeave={() => {
                hovering.current = false;
                scheduleCollapse();
            }}
        >
            <div className="header">
                <span className="logo">弹</span>
                <div className="title">
                    B站弹幕
                    <span className="sub">
                        {status === 'matched' ? (enabled ? 'On' : 'Off') : status === 'no-match' ? 'No match' : status === 'error' ? 'Error' : '…'}
                    </span>
                </div>
                <Switch checked={enabled} onChange={(v) => controller.setVideoEnabled(v)} title="Show danmaku on this video" />
                <button className={`icon-btn ${pinned ? 'on' : ''}`} title={pinned ? 'Unpin' : 'Keep open'} onClick={() => setPinned(!pinned)}>
                    {Icons.pin}
                </button>
                <button className="icon-btn" title="Tuck away" onClick={() => setExpanded(false)}>
                    {Icons.collapse}
                </button>
            </div>
            <div className="tabs">
                {TABS.map((t) => (
                    <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
                        {t}
                    </button>
                ))}
            </div>
            <div className="body">
                {tab === 'Match' && <MatchTab state={state} controller={controller} />}
                {tab === 'Display' && <DisplayTab settings={settings} update={(p) => controller.updateSettings(p)} />}
                {tab === 'Filter' && <FilterTab settings={settings} danmaku={state.danmaku} update={(p) => controller.updateSettings(p)} />}
                {tab === 'Sync' && <SyncTab state={state} controller={controller} />}
            </div>
        </div>
    );
}
