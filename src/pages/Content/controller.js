/**
 * Per-video orchestration: metadata -> search -> match -> danmaku ->
 * alignment -> filter -> render. Holds the single source of truth the UI
 * renders from, and exposes the actions the UI can take.
 *
 * Every async step checks `this.generation` so results that arrive after
 * the user navigated to another video are discarded.
 */
import { loadSettings, saveSettings, loadVideoRecord, saveVideoRecord } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import { parseVideoRef } from '../../shared/videoRef';
import { log } from '../../shared/log';
import { getYouTubeMetadata, getPlayerElement, getVideoElement } from './modules/youtube';
import { searchForYouTube, manualSearch, getVideoView, getDanmaku, getSponsorSegments, pickPage, jevRank } from './modules/bilibili';
import { buildJevRequest, applyJevResponse, hybridAutoAccept, preferJevPick } from '../../shared/jev';
import { isConfident, scoreCandidate } from './modules/match';
import { prepareComments } from './modules/danmakuFilter';
import { planAlignment, createTimeMap } from './modules/alignment';
import { DanmakuRenderer, toLibraryComments } from './modules/renderer';

/** Settings that the renderer can apply without rebuilding comments. */
const LIVE_KEYS = new Set(['opacity', 'area', 'scrollSeconds']);
/** Settings that don't affect the overlay at all. */
const EMPTY_MATCH_RECHECK_MS = 24 * 60 * 60 * 1000;
const UI_KEYS = new Set(['autoCollapsePanel', 'panelRight', 'panelBottom', 'enabled', 'jevEnabled', 'jevApiKey']);
const REBUILD_DEBOUNCE_MS = 150;

const initialState = () => ({
    videoId: null,
    status: 'idle', // idle | loading | searching | matched | no-match | error
    message: '',
    yt: null,
    queries: [],
    candidates: [], // ranked automatic results
    candidatesLoaded: false,
    candidatesLoading: false,
    jev: null, // Jev verdict when Jev mode is on
    search: { query: '', loading: false, results: null, error: '' },
    match: null, // { view, page, score, breakdown, manual }
    danmaku: { loading: false, source: '', total: 0, shown: 0 },
    alignment: { source: 'none', delta: 0, biliCuts: [], ytInserts: [] },
    offset: 0,
    videoEnabled: null, // per-video override; null = follow settings.enabled
});

export class Controller {
    constructor() {
        this.state = { ...initialState(), settings: null };
        this.listeners = new Set();
        this.generation = 0;
        this.raw = []; // wire-format comments for the current match
        this.sponsor = null;
        this.prepared = [];
        this.renderer = null;
        this.rebuildTimer = null;
    }

    async init() {
        this.setState({ settings: await loadSettings() });
        // Keep tabs and the toolbar popup in sync.
        chrome.storage?.onChanged?.addListener((changes, area) => {
            if (area !== 'local' || !changes[STORAGE_KEYS.SETTINGS]) return;
            const next = { ...this.state.settings, ...changes[STORAGE_KEYS.SETTINGS].newValue };
            if (JSON.stringify(next) !== JSON.stringify(this.state.settings)) this.applySettings(next, false);
        });
    }

    // ------------------------------------------------------------------ state

    subscribe(fn) {
        this.listeners.add(fn);
        fn(this.state);
        return () => this.listeners.delete(fn);
    }

    setState(patch) {
        this.state = { ...this.state, ...patch };
        for (const fn of this.listeners) fn(this.state);
    }

    get enabled() {
        return this.state.videoEnabled ?? this.state.settings?.enabled ?? true;
    }

    isCurrent(gen) {
        return gen === this.generation;
    }

    // -------------------------------------------------------------- lifecycle

    /** Called on every navigation; null videoId = left the watch page. */
    async loadVideo(videoId) {
        if (videoId === this.state.videoId) return;
        const gen = ++this.generation;
        this.teardownOverlay();
        this.raw = [];
        this.sponsor = null;
        this.setState({ ...initialState(), videoId });
        if (!videoId) return;

        try {
            this.setState({ status: 'loading', message: 'Reading video info…' });
            const [yt, record] = await Promise.all([getYouTubeMetadata(videoId), loadVideoRecord(videoId)]);
            if (!this.isCurrent(gen)) return;
            this.setState({ yt, offset: record?.offset || 0, videoEnabled: record?.enabled ?? null });

            // Fast path: we matched this video before, skip searching entirely.
            if (record?.bvid) {
                const view = await getVideoView({ bvid: record.bvid }).catch(() => null);
                if (!this.isCurrent(gen)) return;
                // An automatic pick with no danmaku is worth re-checking once a day: a copy with comments may exist now.
                const empty = !record.manual && view?.stat?.danmaku === 0 && Date.now() - (record.ts || 0) > EMPTY_MATCH_RECHECK_MS;
                if (view && !empty) {
                    const { score, breakdown } = scoreCandidate(yt, view);
                    await this.useMatch(gen, view, { manual: !!record.manual, score, breakdown, cid: record.cid });
                    return;
                }
                // Cached video was deleted, unavailable or empty: fall through to a fresh search.
            }

            await this.findCandidates(gen);
            if (!this.isCurrent(gen)) return;
            const best = this.state.candidates[0];
            if (best && this.shouldAutoAccept(best)) {
                const view = await getVideoView({ bvid: best.bvid });
                if (!this.isCurrent(gen)) return;
                await this.useMatch(gen, view, { manual: false, score: best.score, breakdown: best.breakdown });
            } else {
                this.setState({
                    status: 'no-match',
                    message: best ? 'No confident match. Pick one below or search.' : 'Nothing found on Bilibili. Try searching.',
                });
            }
        } catch (err) {
            if (!this.isCurrent(gen)) return;
            log.error('Failed to load video', err);
            this.setState({ status: 'error', message: err.message || String(err) });
        }
    }

    async findCandidates(gen = this.generation) {
        const { yt } = this.state;
        if (!yt) return;
        if (!this.state.match) this.setState({ status: 'searching', message: 'Searching Bilibili…' });
        this.setState({ candidatesLoading: true });
        const started = performance.now();
        try {
            const { queries, ranked: heuristic } = await searchForYouTube(yt);
            if (!this.isCurrent(gen)) return;
            const jev = await this.maybeJevVerdict(yt, heuristic);
            if (!this.isCurrent(gen)) return;
            const ranked = preferJevPick(heuristic, jev);
            log.debug(`Search took ${Math.round(performance.now() - started)} ms`, queries, ranked.slice(0, 5), jev);
            this.setState({ queries, candidates: ranked.slice(0, 10), candidatesLoaded: true, jev });
        } finally {
            if (this.isCurrent(gen)) this.setState({ candidatesLoading: false });
        }
    }

    /**
     * Jev mode (off by default): ask TypeSafe Jev about the top candidates.
     * The heuristic ranking is kept, except that Jev can promote a copy with
     * more danmaku (preferJevPick); otherwise the verdict only feeds
     * auto-select (hybridAutoAccept), which scored best in the eval.
     */
    async maybeJevVerdict(yt, ranked) {
        const { jevEnabled, jevApiKey } = this.state.settings;
        if (!jevEnabled || !jevApiKey || ranked.length === 0) return null;
        try {
            const response = await jevRank(buildJevRequest(yt, ranked), jevApiKey);
            return applyJevResponse(ranked, response).jev;
        } catch (err) {
            log.warn('Jev failed, using the heuristic alone', err);
            return null;
        }
    }

    shouldAutoAccept(best) {
        return hybridAutoAccept(isConfident(this.state.candidates), best.bvid, this.state.jev);
    }

    /** Loads danmaku + sponsor segments for a chosen video and renders. */
    async useMatch(gen, view, { manual, score, breakdown, cid }) {
        const { yt } = this.state;
        const page = (cid && view.pages.find((p) => p.cid === cid)) || pickPage(view, yt?.duration);
        this.setState({
            status: 'matched',
            message: '',
            match: { view, page, score, breakdown, manual },
            danmaku: { loading: true, source: '', total: 0, shown: 0 },
        });
        saveVideoRecord(yt.videoId, { bvid: view.bvid, cid: page.cid, manual });

        const [danmaku, sponsor] = await Promise.all([
            getDanmaku(page.cid, view.aid, page.duration),
            getSponsorSegments(yt.videoId, view.bvid, page.cid).catch(() => null),
        ]);
        if (!this.isCurrent(gen)) return;
        this.raw = danmaku.comments;
        this.sponsor = sponsor;
        log.info(`Loaded ${danmaku.comments.length} danmaku (${danmaku.source}) for ${view.bvid} p${page.page}`);
        this.setState({ danmaku: { loading: false, source: danmaku.source, total: danmaku.comments.length, shown: 0 } });
        this.computeAlignment();
        this.rebuild();
    }

    // ---------------------------------------------------------------- pipeline

    computeAlignment() {
        const { yt, match, settings } = this.state;
        if (!match) return;
        const plan = settings.skipSponsorSegments
            ? planAlignment({ ytDuration: yt?.duration, biliDuration: match.page.duration, sponsor: this.sponsor, raw: this.raw })
            : { biliCuts: [], ytInserts: [], source: 'none', delta: (match.page.duration || 0) - (yt?.duration || 0) };
        if (plan.source !== 'none') log.info('Timeline alignment', plan);
        this.setState({ alignment: plan });
    }

    /** Re-filters and re-renders. Cheap enough to run on every filter change. */
    rebuild() {
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = null;
        const { settings, alignment, offset } = this.state;
        if (!this.raw.length) return;

        const { comments, stats } = prepareComments(this.raw, settings);
        this.prepared = comments;
        this.setState({ danmaku: { ...this.state.danmaku, shown: stats.shown } });

        if (!this.enabled) {
            this.teardownOverlay();
            return;
        }
        const player = getPlayerElement();
        const video = getVideoElement();
        if (!player || !video) return;
        if (!this.renderer || this.renderer.player !== player || this.renderer.video !== video) {
            this.teardownOverlay();
            this.renderer = new DanmakuRenderer(player, video);
        }
        const timeMap = createTimeMap({ ...alignment, offset });
        this.renderer.setComments(toLibraryComments(comments, timeMap, settings, this.state.match.page.duration), settings);
    }

    scheduleRebuild() {
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => this.rebuild(), REBUILD_DEBOUNCE_MS);
    }

    teardownOverlay() {
        clearTimeout(this.rebuildTimer);
        this.renderer?.destroy();
        this.renderer = null;
    }

    // ----------------------------------------------------------------- actions

    async selectCandidate(candidate) {
        const gen = this.generation;
        const { yt } = this.state;
        try {
            const view = await getVideoView({ bvid: candidate.bvid });
            if (!this.isCurrent(gen)) return;
            const { score, breakdown } = candidate.breakdown ? candidate : scoreCandidate(yt, view);
            this.teardownOverlay();
            await this.useMatch(gen, view, { manual: true, score, breakdown });
        } catch (err) {
            this.setState({ status: 'error', message: err.message });
        }
    }

    async selectPage(cid) {
        const { match } = this.state;
        if (!match) return;
        this.teardownOverlay();
        await this.useMatch(this.generation, match.view, { ...match, manual: true, cid });
    }

    /** Free-text search, or a pasted BV/av id / URL to use directly. */
    async runSearch(query) {
        const text = query.trim();
        if (!text) return;
        const ref = parseVideoRef(text);
        if (ref) {
            this.setState({ search: { query: text, loading: true, results: null, error: '' } });
            try {
                const view = await getVideoView(ref);
                this.setState({ search: { query: text, loading: false, results: null, error: '' } });
                await this.selectCandidate({ bvid: view.bvid });
            } catch (err) {
                this.setState({ search: { query: text, loading: false, results: null, error: err.message } });
            }
            return;
        }
        this.setState({ search: { query: text, loading: true, results: null, error: '' } });
        try {
            const results = await manualSearch(this.state.yt || { titles: [], videoId: '' }, text);
            this.setState({ search: { query: text, loading: false, results: results.slice(0, 10), error: '' } });
        } catch (err) {
            this.setState({ search: { query: text, loading: false, results: [], error: err.message } });
        }
    }

    /** Loads the candidate list on demand when the match came from cache. */
    async loadCandidates() {
        if (this.state.candidatesLoaded) return;
        try {
            await this.findCandidates();
        } catch (err) {
            this.setState({ candidatesLoaded: true });
            log.warn('Candidate search failed', err);
        }
    }

    setVideoEnabled(enabled) {
        this.setState({ videoEnabled: enabled });
        if (this.state.videoId) saveVideoRecord(this.state.videoId, { enabled });
        if (enabled) this.rebuild();
        else this.teardownOverlay();
    }

    setOffset(offset) {
        const rounded = Math.round(offset * 10) / 10;
        this.setState({ offset: rounded });
        if (this.state.videoId) saveVideoRecord(this.state.videoId, { offset: rounded });
        this.scheduleRebuild();
    }

    updateSettings(patch) {
        this.applySettings({ ...this.state.settings, ...patch }, true);
    }

    applySettings(next, persist) {
        const prev = this.state.settings;
        const changed = Object.keys(next).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
        this.setState({ settings: next });
        if (persist) saveSettings(next);
        if (!changed.length) return;

        if (changed.includes('skipSponsorSegments')) this.computeAlignment();
        if (changed.includes('enabled') && this.state.videoEnabled === null) {
            if (next.enabled) this.rebuild();
            else this.teardownOverlay();
            return;
        }
        if (changed.every((k) => LIVE_KEYS.has(k) || UI_KEYS.has(k))) {
            this.renderer?.applyLiveSettings(next);
        } else {
            this.scheduleRebuild();
        }
    }
}
