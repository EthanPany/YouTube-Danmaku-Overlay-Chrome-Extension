/**
 * Small presentational building blocks shared by the panel tabs, plus
 * formatting helpers and inline SVG icons (no icon font download).
 */
import React from 'react';

export function Slider({ label, value, min, max, step = 1, format = (v) => v, onChange }) {
    return (
        <label className="control">
            <span className="label">
                <span>{label}</span>
                <span className="value">{format(value)}</span>
            </span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
    );
}

export function Switch({ checked, onChange, title }) {
    return (
        <span className="switch" title={title}>
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
            <span onClick={() => onChange(!checked)} />
        </span>
    );
}

export function ToggleRow({ label, hint, checked, onChange }) {
    return (
        <div className="toggle-row">
            <span>
                {label}
                {hint && <div className="hint">{hint}</div>}
            </span>
            <Switch checked={checked} onChange={onChange} />
        </div>
    );
}

export function Segmented({ options, value, onChange }) {
    return (
        <div className="segmented">
            {options.map((o) => (
                <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Section({ title, children, right }) {
    return (
        <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="section-title">{title}</div>
                {right}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        </div>
    );
}

// --------------------------------------------------------------- formatting

export function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '–';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatCount(n) {
    if (!n) return '0';
    if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    return n.toLocaleString();
}

export function formatDate(unixSeconds) {
    if (!unixSeconds) return '';
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function scoreClass(score) {
    if (score >= 0.7) return 'good';
    if (score >= 0.45) return 'mid';
    return 'low';
}

export const https = (url) => (url ? url.replace(/^\/\//, 'https://').replace(/^http:/, 'https:') : '');

// -------------------------------------------------------------------- icons

const svg = (path) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {path}
    </svg>
);

export const Icons = {
    pin: svg(<path d="M12 17v5M9 10.76V6a3 3 0 0 1 6 0v4.76l2.5 3.24h-11z" />),
    collapse: svg(<path d="M9 18l6-6-6-6" />),
    chevron: svg(<path d="M9 18l6-6-6-6" />),
    search: svg(
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
        </>
    ),
    refresh: svg(<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />),
};
