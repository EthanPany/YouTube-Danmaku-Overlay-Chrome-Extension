/**
 * Panel CSS, injected into the panel's shadow root so YouTube's styles
 * can't leak in and ours can't leak out.
 */
export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #1f1f1f; --bg2: #2a2a2a; --bg3: #353535; --line: #3d3d3d;
  --text: #f1f1f1; --muted: #aaaaaa; --faint: #777;
  --pink: #fb7299; --blue: #00aeec; --green: #2bb673; --amber: #f5a623; --red: #ff5f56;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif;
  color: var(--text);
}
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }

/* ---- side tab (collapsed) ---- */
.tab {
  position: fixed; right: 0; z-index: 2147483000;
  width: 30px; height: 44px; border-radius: 10px 0 0 10px;
  background: var(--bg); border: 1px solid var(--line); border-right: none;
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3px;
  cursor: pointer; user-select: none; opacity: .72; transition: opacity .15s, width .15s;
}
.tab:hover { opacity: 1; width: 36px; }
.tab .logo { font-weight: 700; font-size: 15px; color: var(--pink); line-height: 1; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
.dot.ok { background: var(--green); }
.dot.warn { background: var(--amber); }
.dot.err { background: var(--red); }
.dot.busy { background: var(--blue); animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: .3; } }

/* ---- panel (expanded) ---- */
.panel {
  position: fixed; right: 12px; z-index: 2147483000; width: 340px; max-height: min(620px, 80vh);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  animation: slidein .16s ease-out;
}
@keyframes slidein { from { transform: translateX(16px); opacity: 0; } }
.header { display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px 12px; }
.header .logo { font-weight: 700; color: var(--pink); font-size: 16px; }
.header .title { font-weight: 600; flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.header .sub { color: var(--muted); font-weight: 400; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  width: 26px; height: 26px; border-radius: 6px; border: none; background: transparent; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center; flex: none;
}
.icon-btn:hover { background: var(--bg3); color: var(--text); }
.icon-btn.on { color: var(--blue); }
.icon-btn svg { width: 16px; height: 16px; }

.tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid var(--line); }
.tabs button {
  flex: 1; background: none; border: none; padding: 7px 0 8px; color: var(--muted); font-weight: 500;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tabs button:hover { color: var(--text); }
.tabs button.active { color: var(--text); border-bottom-color: var(--pink); }
.body { overflow-y: auto; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 12px; }
.body::-webkit-scrollbar { width: 8px; }
.body::-webkit-scrollbar-thumb { background: var(--bg3); border-radius: 4px; }

/* ---- generic ---- */
.status { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.spinner { width: 14px; height: 14px; border: 2px solid var(--bg3); border-top-color: var(--blue); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); font-weight: 600; margin-bottom: 6px; }
.hint { color: var(--faint); font-size: 11px; }
.muted { color: var(--muted); }
.row { display: flex; align-items: center; gap: 8px; }
.grow { flex: 1; min-width: 0; }
.error { color: var(--red); font-size: 12px; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--blue); }

/* ---- match card ---- */
.card { display: flex; gap: 10px; background: var(--bg2); border-radius: 10px; padding: 8px; }
.thumb { width: 112px; aspect-ratio: 16/9; border-radius: 6px; object-fit: cover; background: var(--bg3); flex: none; display: block; }
.card .meta { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card .t { font-weight: 600; font-size: 13px; }
.owner { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12px; min-width: 0; }
.owner img { width: 16px; height: 16px; border-radius: 50%; flex: none; }
.owner span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats { color: var(--faint); font-size: 11px; display: flex; gap: 8px; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 1px 7px; font-size: 11px; font-weight: 600; background: var(--bg3); color: var(--muted); white-space: nowrap; }
.pill.good { background: rgba(43,182,115,.15); color: var(--green); }
.pill.mid { background: rgba(245,166,35,.15); color: var(--amber); }
.pill.low { background: rgba(255,95,86,.15); color: var(--red); }

/* ---- candidate list ---- */
.list { display: flex; flex-direction: column; gap: 2px; }
.item { display: flex; gap: 8px; padding: 6px; border-radius: 8px; background: none; border: none; text-align: left; width: 100%; align-items: flex-start; }
.item:hover { background: var(--bg2); }
.item.current { background: rgba(0,174,236,.10); outline: 1px solid rgba(0,174,236,.35); }
.item img { width: 72px; aspect-ratio: 16/9; border-radius: 4px; object-fit: cover; background: var(--bg3); flex: none; }
.item .t { font-size: 12px; font-weight: 500; }
.item .s { font-size: 11px; color: var(--faint); display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap; }
.bar { height: 3px; width: 40px; background: var(--bg3); border-radius: 2px; overflow: hidden; display: inline-block; }
.bar > i { display: block; height: 100%; background: var(--green); }
.disclosure { background: none; border: none; color: var(--muted); padding: 4px 0; display: flex; align-items: center; gap: 6px; font-size: 12px; }
.disclosure:hover { color: var(--text); }
.disclosure svg { width: 12px; height: 12px; transition: transform .15s; }
.disclosure.open svg { transform: rotate(90deg); }

/* ---- form controls ---- */
.search { display: flex; gap: 6px; }
.search input, textarea, select {
  flex: 1; min-width: 0; background: var(--bg2); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; outline: none;
}
.search input:focus, textarea:focus, select:focus { border-color: var(--blue); }
.btn { background: var(--bg3); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-weight: 500; white-space: nowrap; }
.btn:hover { background: #404040; }
.btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
.btn.small { padding: 3px 8px; font-size: 12px; border-radius: 6px; }
textarea { width: 100%; min-height: 64px; resize: vertical; font-size: 12px; }

.control { display: flex; flex-direction: column; gap: 4px; }
.control .label { display: flex; justify-content: space-between; font-size: 12px; }
.control .value { color: var(--muted); font-variant-numeric: tabular-nums; }
input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; background: var(--bg3); border-radius: 2px; outline: none; margin: 6px 0; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--text); border: none; cursor: pointer; }
input[type=range]:hover::-webkit-slider-thumb { background: var(--blue); }

.switch { position: relative; width: 32px; height: 18px; flex: none; }
.switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.switch span { position: absolute; inset: 0; border-radius: 999px; background: #555; transition: background .15s; cursor: pointer; }
.switch span::before { content: ""; position: absolute; width: 14px; height: 14px; left: 2px; top: 2px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch input:checked + span { background: var(--blue); }
.switch input:checked + span::before { transform: translateX(14px); }
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; padding: 2px 0; }

.segmented { display: flex; background: var(--bg2); border-radius: 8px; padding: 2px; gap: 2px; }
.segmented button { flex: 1; border: none; background: none; border-radius: 6px; padding: 4px 0; color: var(--muted); font-size: 12px; }
.segmented button.active { background: var(--bg3); color: var(--text); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border: 1px solid var(--line); background: none; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--muted); }
.chip.active { border-color: var(--blue); color: var(--text); background: rgba(0,174,236,.12); }

.kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 12px; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; font-variant-numeric: tabular-nums; }
.seg-list { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.seg-list div { background: var(--bg2); border-radius: 6px; padding: 4px 8px; display: flex; justify-content: space-between; }
.footer { border-top: 1px solid var(--line); padding: 6px 12px; font-size: 11px; color: var(--faint); display: flex; justify-content: space-between; }
`;
