/**
 * Match UI. `MatchSummary` is the always-visible part of the panel (the
 * matched video, or the search status); `MatchTab` holds the details behind
 * "More": score, parts, other candidates and a manual search box (free text
 * or a pasted BV id / link).
 */
import React, { useState, useEffect } from 'react';
import { formatClock, formatCount, formatDate, scoreClass, https, Icons } from './controls';

const videoUrl = (bvid, page = 1) => `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`;

/** Thumbnail cropped to the height of the text next to it; hovering shows that a click opens Bilibili. */
function Thumb({ src, href, className = '' }) {
    return (
        <a
            className={`thumb ${className}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            title="Open on Bilibili"
            onClick={(e) => e.stopPropagation()}
        >
            <img src={https(src)} referrerPolicy="no-referrer" alt="" loading="lazy" />
            <span className="thumb-overlay">{Icons.external}</span>
        </a>
    );
}

function ScorePill({ score, breakdown }) {
    if (score === undefined) return null;
    const tip = breakdown
        ? `Title ${Math.round(breakdown.title * 100)}% · Duration ${Math.round(breakdown.duration * 100)}% · Uploader ${Math.round(
              breakdown.author * 100
          )}%${breakdown.linked ? ' · links this YouTube video' : ''}`
        : '';
    return (
        <span className={`pill ${scoreClass(score)}`} title={tip}>
            {Math.round(Math.min(1, score) * 100)}% match
        </span>
    );
}

function CandidateRow({ c, current, ytDuration, onPick }) {
    const diff = ytDuration && c.duration ? Math.round(c.duration - ytDuration) : null;
    return (
        <div className={`item ${current ? 'current' : ''}`} role="button" tabIndex={0} onClick={() => onPick(c)} title={`Use: ${c.title}`}>
            <Thumb src={c.pic} href={videoUrl(c.bvid)} />
            <div className="grow">
                <div className="t clamp2">{c.title}</div>
                <div className="s">
                    <span>{c.author}</span>
                    <span>{formatClock(c.duration)}</span>
                    {diff !== null && Math.abs(diff) > 2 && <span>{diff > 0 ? `+${diff}s` : `${diff}s`}</span>}
                    {c.danmaku > 0 && <span>💬 {formatCount(c.danmaku)}</span>}
                    {c.score !== undefined && (
                        <span className="bar" title={`${Math.round(Math.min(1, c.score) * 100)}%`}>
                            <i style={{ width: `${Math.round(Math.min(1, c.score) * 100)}%`, background: c.score >= 0.55 ? undefined : 'var(--amber)' }} />
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

/** The always-visible part: the matched video card, or what the search is doing. */
export function MatchSummary({ state }) {
    const { status, message, match } = state;
    if (match) {
        const { view, page } = match;
        const url = videoUrl(view.bvid, page.page);
        return (
            <div className="card">
                <Thumb src={view.pic} href={url} className="big" />
                <div className="meta">
                    <a className="t clamp2" href={url} target="_blank" rel="noreferrer" title={view.title}>
                        {view.title}
                    </a>
                    <a className="owner" href={`https://space.bilibili.com/${view.owner.mid}`} target="_blank" rel="noreferrer">
                        {view.owner.face && <img src={https(view.owner.face)} referrerPolicy="no-referrer" alt="" />}
                        <span>{view.owner.name}</span>
                    </a>
                    <div className="stats">
                        <span>▶ {formatCount(view.stat.view)}</span>
                        <span>💬 {formatCount(view.stat.danmaku)}</span>
                        <span>{formatDate(view.pubdate)}</span>
                    </div>
                </div>
            </div>
        );
    }
    if (status === 'loading' || status === 'searching') {
        return (
            <div className="status">
                <div className="spinner" />
                {message}
            </div>
        );
    }
    if (status === 'no-match' || status === 'error') return <div className={status === 'error' ? 'error' : 'status'}>{message}</div>;
    return null;
}

export default function MatchTab({ state, controller }) {
    const { status, match, yt, candidates, candidatesLoaded, candidatesLoading, search, danmaku } = state;
    const [query, setQuery] = useState('');

    // Candidates usually arrive with the automatic match; fetch them if not.
    const needCandidates = !candidatesLoaded && !candidatesLoading && status !== 'loading';
    useEffect(() => {
        if (needCandidates) controller.loadCandidates();
    }, [needCandidates, controller]);

    const currentBvid = match?.view.bvid;
    const others = candidates.filter((c) => c.bvid !== currentBvid);

    return (
        <>
            {match && (
                <div className="details">
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                        <ScorePill score={match.score} breakdown={match.breakdown} />
                        {match.manual && <span className="pill">picked by you</span>}
                        <span className="hint">
                            YouTube {formatClock(yt?.duration)} · Bilibili {formatClock(match.page.duration)}
                        </span>
                    </div>
                    {match.view.pages.length > 1 && (
                        <select value={match.page.cid} onChange={(e) => controller.selectPage(Number(e.target.value))}>
                            {match.view.pages.map((p) => (
                                <option key={p.cid} value={p.cid}>
                                    P{p.page} {p.part} ({formatClock(p.duration)})
                                </option>
                            ))}
                        </select>
                    )}
                    <div className="hint">
                        {danmaku.loading
                            ? 'Loading danmaku…'
                            : `${formatCount(danmaku.shown)} of ${formatCount(danmaku.total)} comments shown${
                                  danmaku.source === 'xml' ? ' (log in to bilibili.com for more)' : ''
                              }`}
                    </div>
                </div>
            )}

            {status !== 'loading' && (
                <div>
                    <div className="section-title">
                        {match ? 'Other matches' : 'Possible matches'}
                        {candidatesLoaded && ` (${others.length})`}
                    </div>
                    <div className="list">
                        {candidatesLoading && (
                            <div className="status">
                                <div className="spinner" /> Searching…
                            </div>
                        )}
                        {candidatesLoaded && others.length === 0 && <div className="hint">No other candidates. Try a search.</div>}
                        {others.slice(0, 6).map((c) => (
                            <CandidateRow key={c.bvid} c={c} ytDuration={yt?.duration} onPick={(x) => controller.selectCandidate(x)} />
                        ))}
                    </div>
                </div>
            )}

            <div>
                <div className="section-title">Search Bilibili</div>
                <form
                    className="search"
                    onSubmit={(e) => {
                        e.preventDefault();
                        controller.runSearch(query);
                    }}
                >
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keywords, BV id or video link" />
                    <button className="btn" type="submit" title="Search">
                        {search.loading ? <div className="spinner" /> : 'Search'}
                    </button>
                </form>
                {search.error && <div className="error" style={{ marginTop: 6 }}>{search.error}</div>}
                {search.results && (
                    <div className="list" style={{ marginTop: 6 }}>
                        {search.results.length === 0 && <div className="hint">No results.</div>}
                        {search.results.map((c) => (
                            <CandidateRow
                                key={c.bvid}
                                c={c}
                                current={c.bvid === currentBvid}
                                ytDuration={yt?.duration}
                                onPick={(x) => controller.selectCandidate(x)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
