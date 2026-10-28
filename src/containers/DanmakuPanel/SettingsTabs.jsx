/**
 * Display, Filter and Sync tabs. Each control writes straight to the
 * controller, which persists settings and decides whether the overlay can
 * update live or needs a rebuild.
 */
import React, { useState, useEffect } from 'react';
import { Slider, ToggleRow, Segmented, Section, formatClock, formatCount } from './controls';

export function DisplayTab({ settings, update }) {
    return (
        <>
            <Section title="Text">
                <Slider label="Font size" value={settings.fontSize} min={14} max={40} format={(v) => `${v}px`} onChange={(v) => update({ fontSize: v })} />
                <ToggleRow label="Bold" checked={settings.bold} onChange={(v) => update({ bold: v })} />
                <ToggleRow label="Outline" checked={settings.outline} onChange={(v) => update({ outline: v })} />
                <ToggleRow label="Original colors" hint="Off = all white" checked={settings.useColors} onChange={(v) => update({ useColors: v })} />
                <ToggleRow label="Original sizes" hint="Keep small / large comments" checked={settings.useSizes} onChange={(v) => update({ useSizes: v })} />
            </Section>
            <Section title="Motion & layout">
                <Slider
                    label="Scroll time"
                    value={settings.scrollSeconds}
                    min={4}
                    max={16}
                    step={0.5}
                    format={(v) => `${v}s across`}
                    onChange={(v) => update({ scrollSeconds: v })}
                />
                <Slider
                    label="Opacity"
                    value={Math.round(settings.opacity * 100)}
                    min={10}
                    max={100}
                    step={5}
                    format={(v) => `${v}%`}
                    onChange={(v) => update({ opacity: v / 100 })}
                />
                <div className="control">
                    <span className="label">
                        <span>Display area</span>
                    </span>
                    <Segmented
                        value={settings.area}
                        onChange={(v) => update({ area: v })}
                        options={[
                            { value: 0.25, label: '¼' },
                            { value: 0.5, label: '½' },
                            { value: 0.75, label: '¾' },
                            { value: 1, label: 'Full' },
                        ]}
                    />
                </div>
            </Section>
            <Section title="Panel">
                <ToggleRow
                    label="Tuck into side tab when idle"
                    checked={settings.autoCollapsePanel}
                    onChange={(v) => update({ autoCollapsePanel: v })}
                />
            </Section>
        </>
    );
}

/** Edits the block list as text; commits on blur so typing doesn't rebuild every keystroke. */
function BlockList({ value, onCommit }) {
    const [text, setText] = useState(value.join('\n'));
    useEffect(() => setText(value.join('\n')), [value]);
    return (
        <textarea
            value={text}
            placeholder={'One per line, e.g.\n剧透\n/^前方高能/'}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onCommit(text.split('\n').map((s) => s.trim()).filter(Boolean))}
        />
    );
}

export function FilterTab({ settings, update, danmaku }) {
    const chip = (key, label) => (
        <button className={`chip ${settings[key] ? 'active' : ''}`} onClick={() => update({ [key]: !settings[key] })}>
            {label}
        </button>
    );
    return (
        <>
            <Section title="Types">
                <div className="chips">
                    {chip('showScroll', 'Scrolling')}
                    {chip('showTop', 'Top')}
                    {chip('showBottom', 'Bottom')}
                </div>
            </Section>
            <Section title="Quality">
                <Slider
                    label="Smart-block level"
                    value={settings.minWeight}
                    min={0}
                    max={10}
                    format={(v) => (v === 0 ? 'Off' : `≥ ${v}`)}
                    onChange={(v) => update({ minWeight: v })}
                />
                <div className="hint">
                    Uses Bilibili’s own per-comment quality score (屏蔽等级), which already reflects the sender’s account standing.
                    Higher hides more low-quality comments.
                </div>
                <Slider
                    label="Max per second"
                    value={settings.maxPerSecond}
                    min={0}
                    max={30}
                    format={(v) => (v === 0 ? 'Unlimited' : v)}
                    onChange={(v) => update({ maxPerSecond: v })}
                />
                <div className="hint">When busy, keeps the highest-rated and most repeated comments instead of random ones.</div>
            </Section>
            <Section title="Duplicates">
                <ToggleRow
                    label="Merge repeated comments"
                    hint="“哈哈哈” ×12 instead of twelve lines"
                    checked={settings.mergeDuplicates}
                    onChange={(v) => update({ mergeDuplicates: v })}
                />
                {settings.mergeDuplicates && (
                    <Slider
                        label="Merge window"
                        value={settings.mergeWindow}
                        min={3}
                        max={60}
                        format={(v) => `${v}s`}
                        onChange={(v) => update({ mergeWindow: v })}
                    />
                )}
            </Section>
            <Section title="Blocked words">
                <BlockList value={settings.blockKeywords} onCommit={(list) => update({ blockKeywords: list })} />
            </Section>
            {danmaku.total > 0 && (
                <div className="hint">
                    Showing {formatCount(danmaku.shown)} of {formatCount(danmaku.total)} comments
                </div>
            )}
        </>
    );
}

const SOURCE_LABEL = {
    none: 'No adjustment',
    sponsorblock: 'SponsorBlock segment data',
    'danmaku-skip': 'Viewers’ “空降” jump comments',
    'danmaku-keywords': 'Sponsor-talk comments (恰饭/广告…)',
};

export function SyncTab({ state, controller }) {
    const { settings, alignment, offset, yt, match } = state;
    const nudge = (d) => controller.setOffset(Math.max(-60, Math.min(60, offset + d)));
    const delta = alignment.delta;
    return (
        <>
            <Section title="Lengths">
                <dl className="kv">
                    <dt>YouTube</dt>
                    <dd>{formatClock(yt?.duration)}</dd>
                    <dt>Bilibili</dt>
                    <dd>{formatClock(match?.page.duration)}</dd>
                    <dt>Difference</dt>
                    <dd>{match ? `${delta > 0 ? '+' : ''}${Math.round(delta)}s` : '–'}</dd>
                </dl>
            </Section>
            <Section title="Sponsor sections">
                <ToggleRow
                    label="Auto-align around sponsor sections"
                    hint="Drops comments from a sponsor read that only one upload has, and shifts the rest"
                    checked={settings.skipSponsorSegments}
                    onChange={(v) => controller.updateSettings({ skipSponsorSegments: v })}
                />
                <div className="hint">Detected from: {SOURCE_LABEL[alignment.source] || alignment.source}</div>
                {(alignment.biliCuts.length > 0 || alignment.ytInserts.length > 0) && (
                    <div className="seg-list">
                        {alignment.biliCuts.map((s) => (
                            <div key={`b${s.start}`}>
                                <span>Only on Bilibili</span>
                                <span>
                                    {formatClock(s.start)}–{formatClock(s.end)}
                                </span>
                            </div>
                        ))}
                        {alignment.ytInserts.map((s) => (
                            <div key={`y${s.start}`}>
                                <span>Only on YouTube</span>
                                <span>
                                    {formatClock(s.start)}–{formatClock(s.end)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
            <Section
                title="Manual offset"
                right={
                    offset !== 0 && (
                        <button className="btn small" onClick={() => controller.setOffset(0)}>
                            Reset
                        </button>
                    )
                }
            >
                <Slider
                    label="Shift comments"
                    value={offset}
                    min={-60}
                    max={60}
                    step={0.1}
                    format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}s`}
                    onChange={(v) => controller.setOffset(v)}
                />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                    {[-5, -1, -0.1, 0.1, 1, 5].map((d) => (
                        <button key={d} className="btn small" onClick={() => nudge(d)}>
                            {d > 0 ? `+${d}` : d}
                        </button>
                    ))}
                </div>
                <div className="hint">Positive = comments appear later. Saved for this video.</div>
            </Section>
        </>
    );
}
