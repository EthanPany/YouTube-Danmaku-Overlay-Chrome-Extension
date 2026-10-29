/**
 * The in-page panel, docked to the bottom-right corner and draggable
 * anywhere. Collapsed, it is a small round button with a status dot.
 * Expanded, it shows only the matched video; "More" reveals the
 * Match / Display / Filter / Sync tabs.
 *
 * It shrinks back to the button when idle (setting `autoCollapsePanel`),
 * but never once the user has hovered it, and never on mouse-out: after
 * that only the collapse button closes it.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import MatchTab, { MatchSummary } from './MatchTab';
import { DisplayTab, FilterTab, SyncTab } from './SettingsTabs';
import { Switch, Icons } from './controls';

const IDLE_COLLAPSE_MS = 5000;
const NO_MATCH_COLLAPSE_MS = 12000;
const TABS = ['Match', 'Display', 'Filter', 'Sync'];
const FAB_SIZE = 40;
const DRAG_THRESHOLD = 4;

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

/** Keeps the corner position on screen. */
function clampPos({ right, bottom }) {
    const max = (n, limit) => Math.max(0, Math.min(limit, Math.round(n)));
    return { right: max(right, window.innerWidth - FAB_SIZE), bottom: max(bottom, window.innerHeight - FAB_SIZE) };
}

/**
 * Drag by the given handle; the position is the panel's bottom-right corner
 * measured from the viewport's bottom-right. A press without movement is a click.
 */
function useCornerDrag(pos, onMove, onClick) {
    return useCallback(
        (e) => {
            if (e.button !== 0 || e.target.closest('button, input, select, .switch, a')) return;
            const start = { x: e.clientX, y: e.clientY };
            let moved = false;
            const at = (ev) => clampPos({ right: pos.right - (ev.clientX - start.x), bottom: pos.bottom - (ev.clientY - start.y) });
            const move = (ev) => {
                if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD) moved = true;
                if (moved) onMove(at(ev), false);
            };
            const up = (ev) => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                if (moved) onMove(at(ev), true);
                else onClick?.();
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            e.preventDefault();
        },
        [pos, onMove, onClick]
    );
}

export default function Panel({ controller }) {
    const state = useControllerState(controller);
    const { settings, status, videoId, match } = state;
    const enabled = state.videoEnabled ?? settings?.enabled ?? true;

    const [expanded, setExpanded] = useState(true);
    const [more, setMore] = useState(false);
    const [tab, setTab] = useState('Match');
    const [dragPos, setDragPos] = useState(null);
    const touched = useRef(false); // hovered since this video opened: no more auto-collapse
    const timer = useRef(null);

    // Re-open (compact) on each new video so the user sees what was matched.
    useEffect(() => {
        setExpanded(true);
        setMore(false);
        setTab('Match');
        touched.current = false;
    }, [videoId]);

    // Nothing was found: show the candidates and search box right away.
    useEffect(() => {
        if (status === 'no-match') {
            setMore(true);
            setTab('Match');
        }
    }, [status]);

    useEffect(() => {
        clearTimeout(timer.current);
        if (!expanded || !settings?.autoCollapsePanel || touched.current) return undefined;
        if (status === 'loading' || status === 'searching') return undefined;
        timer.current = setTimeout(() => setExpanded(false), status === 'no-match' ? NO_MATCH_COLLAPSE_MS : IDLE_COLLAPSE_MS);
        return () => clearTimeout(timer.current);
    }, [expanded, settings?.autoCollapsePanel, status]);

    const onMove = useCallback(
        (pos, commit) => {
            setDragPos(commit ? null : pos);
            if (commit) controller.updateSettings({ panelRight: pos.right, panelBottom: pos.bottom });
        },
        [controller]
    );
    const pos = dragPos ?? clampPos({ right: settings?.panelRight ?? 24, bottom: settings?.panelBottom ?? 24 });
    const expand = useCallback(() => {
        touched.current = true;
        setExpanded(true);
    }, []);
    const onFabDown = useCornerDrag(pos, onMove, expand);
    const onHeaderDown = useCornerDrag(pos, onMove, null);

    if (!settings || !videoId) return null;

    const dot = <span className={`dot ${statusDot(state, enabled)}`} />;

    if (!expanded) {
        return (
            <div
                className="fab"
                style={{ right: pos.right, bottom: pos.bottom }}
                onMouseDown={onFabDown}
                title={match ? `B站弹幕: ${match.view.title}` : 'B站弹幕 — click to open, drag to move'}
            >
                <span className="logo">弹</span>
                {dot}
            </div>
        );
    }

    return (
        <div
            className="panel"
            style={{ right: pos.right, bottom: pos.bottom, maxHeight: `min(640px, calc(100vh - ${pos.bottom + 16}px))` }}
            onMouseEnter={() => {
                touched.current = true;
                clearTimeout(timer.current);
            }}
        >
            <div className="header" onMouseDown={onHeaderDown} title="Drag to move">
                <span className="logo">弹</span>
                {dot}
                <span className="grow" />
                <Switch checked={enabled} onChange={(v) => controller.setVideoEnabled(v)} title="Show danmaku on this video" />
                <button className="icon-btn" title="Minimize" onClick={() => setExpanded(false)}>
                    {Icons.minimize}
                </button>
            </div>
            <div className="body">
                <MatchSummary state={state} />
                <button className={`disclosure ${more ? 'open' : ''}`} onClick={() => setMore(!more)}>
                    {Icons.chevron}
                    {more ? 'Less' : 'More'}
                </button>
                {more && (
                    <>
                        <div className="tabs">
                            {TABS.map((t) => (
                                <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        {tab === 'Match' && <MatchTab state={state} controller={controller} />}
                        {tab === 'Display' && <DisplayTab settings={settings} update={(p) => controller.updateSettings(p)} />}
                        {tab === 'Filter' && <FilterTab settings={settings} danmaku={state.danmaku} update={(p) => controller.updateSettings(p)} />}
                        {tab === 'Sync' && <SyncTab state={state} controller={controller} />}
                    </>
                )}
            </div>
        </div>
    );
}
