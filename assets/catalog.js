// Interactive GWTC event catalogue.
// Loads the bundled snapshot (assets/data/gwtc.json) instantly, then refreshes live from GWOSC.
(function () {
    const root = document.getElementById('gwtc-app');
    if (!root || !window.Chart) return;

    const LIVE_URL = 'https://gwosc.org/eventapi/json/GWTC/';
    const SNAPSHOT = root.dataset.snapshot;

    // ---------- constants ----------
    const RUNS = ['O1', 'O2', 'O3a', 'O3b', 'O4a', 'O4b'];
    const RUN_COLORS = { O1: '#8a6cff', O2: '#3d63dd', O3a: '#12957a', O3b: '#3cc7a2', O4a: '#e38a52', O4b: '#c8642a' };
    const CLASSES = ['BBH', 'NSBH', 'BNS', 'No PE'];
    const CLASS_COLORS = { BBH: '#3d63dd', NSBH: '#12957a', BNS: '#c8642a', 'No PE': '#9aa3b5' };
    const NS_MAX = 3; // M_sun; mass threshold used to label a component as a neutron star

    // GPS start of each run's successor (a GPS time below the value belongs to the run)
    const runOf = gps => gps < 1.14e9 ? 'O1' : gps < 1.19e9 ? 'O2' : gps < 1.2545e9 ? 'O3a'
        : gps < 1.27e9 ? 'O3b' : gps < 1.39e9 ? 'O4a' : 'O4b';
    const yearOf = gps => 1980 + 0.0137 + (gps - 18) / (365.25 * 86400); // GPS epoch 1980-01-06, minus leap seconds

    const PARAMS = {
        m1:  { label: 'Primary mass m₁ (M☉)', short: 'm₁', log: true },
        m2:  { label: 'Secondary mass m₂ (M☉)', short: 'm₂', log: true },
        mc:  { label: 'Chirp mass 𝓜 (M☉)', short: '𝓜', log: true },
        mt:  { label: 'Total mass M (M☉)', short: 'M', log: true },
        mf:  { label: 'Final mass M_f (M☉)', short: 'M_f', log: true },
        q:   { label: 'Mass ratio q = m₂/m₁', short: 'q', log: false },
        chi: { label: 'Effective spin χ_eff', short: 'χ_eff', log: false },
        dl:  { label: 'Luminosity distance d_L (Mpc)', short: 'd_L', log: true },
        z:   { label: 'Redshift z', short: 'z', log: false },
        snr: { label: 'Network SNR', short: 'SNR', log: true },
        pa:  { label: 'p_astro', short: 'p_astro', log: false },
        year:{ label: 'Detection date (year)', short: 'Year', log: false },
    };

    // ---------- state ----------
    const state = {
        events: [],
        runs: new Set(RUNS),
        classes: new Set(CLASSES),
        minSnr: 0,
        minPa: 0,
        search: '',
        tab: 'overview',
        sx: 'm1', sy: 'm2', sc: 'run', slogx: true, slogy: true,
        sortKey: 'gps', sortDir: -1, page: 0,
    };
    const charts = {};

    // ---------- data ----------
    function enrich(e) {
        e.run = runOf(e.gps);
        e.year = yearOf(e.gps);
        e.q = (e.m1 && e.m2) ? e.m2 / e.m1 : null;
        if (e.m1 == null || e.m2 == null) e.cls = 'No PE';
        else if (e.m1 < NS_MAX && e.m2 < NS_MAX) e.cls = 'BNS';
        else if (e.m2 < NS_MAX) e.cls = 'NSBH';
        else e.cls = 'BBH';
        return e;
    }
    function fromGwosc(json) {
        const map = { m1: 'mass_1_source', m2: 'mass_2_source', mc: 'chirp_mass_source', mt: 'total_mass_source',
            mf: 'final_mass_source', chi: 'chi_eff', dl: 'luminosity_distance', z: 'redshift' };
        return Object.values(json.events).map(v => {
            const e = { n: v.commonName, gps: v.GPS, cat: v['catalog.shortName'],
                url: v.jsonurl.replace('/eventapi/json/', '/eventapi/html/'),
                snr: v.network_matched_filter_snr, far: v.far, pa: v.p_astro };
            for (const k in map) {
                e[k] = v[map[k]];
                if (e[k] != null) { e[k + '_lo'] = v[map[k] + '_lower']; e[k + '_hi'] = v[map[k] + '_upper']; }
            }
            return e;
        });
    }
    function setEvents(list, sourceLabel) {
        state.events = list.map(enrich).sort((a, b) => a.gps - b.gps);
        root.querySelector('[data-source]').innerHTML = sourceLabel;
        buildFilterCounts();
        render();
    }
    const filtered = () => state.events.filter(e =>
        state.runs.has(e.run) && state.classes.has(e.cls) &&
        (e.snr ?? 0) >= state.minSnr && (state.minPa === 0 || (e.pa ?? 0) >= state.minPa) &&
        (!state.search || e.n.toLowerCase().includes(state.search)));
    const withPE = list => list.filter(e => e.m1 != null);

    // ---------- theme ----------
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    function theme() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            text: css('--muted') || '#5a6072', strong: css('--heading') || '#0a0f24',
            grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(10,15,36,.07)',
            bg: css('--card') || '#fff', font: "'Inter', system-ui, sans-serif",
        };
    }
    function baseOptions(t, extra = {}) {
        return Object.assign({
            responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
            plugins: {
                legend: { labels: { color: t.text, boxWidth: 12, boxHeight: 12, font: { family: t.font, size: 12 } } },
                tooltip: { backgroundColor: 'rgba(10,15,36,.92)', titleFont: { family: t.font, weight: '600' },
                    bodyFont: { family: t.font }, padding: 10, cornerRadius: 8 },
            },
        }, extra);
    }
    function axis(t, title, type = 'linear', extra = {}) {
        return Object.assign({
            type, title: { display: !!title, text: title, color: t.strong, font: { family: t.font, size: 12, weight: '600' } },
            ticks: { color: t.text, font: { family: t.font, size: 11 }, maxRotation: 0 },
            grid: { color: t.grid }, border: { color: t.grid },
        }, extra);
    }
    // Paint the card colour behind every chart so PNG exports are not transparent
    const bgPlugin = { id: 'bg', beforeDraw(c) { const x = c.ctx; x.save(); x.fillStyle = theme().bg;
        x.fillRect(0, 0, c.width, c.height); x.restore(); } };

    function makeChart(id, config) {
        if (charts[id]) charts[id].destroy();
        const canvas = root.querySelector(`canvas[data-chart="${id}"]`);
        if (!canvas) return;
        config.plugins = [bgPlugin, ...(config.plugins || [])];
        charts[id] = new Chart(canvas, config);
    }

    // ---------- helpers ----------
    const fmt = (v, d = 2) => v == null ? '–' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (+v).toFixed(d));
    function withErr(e, k, d = 1) {
        if (e[k] == null) return '–';
        const lo = e[k + '_lo'], hi = e[k + '_hi'];
        if (lo == null || hi == null) return fmt(e[k], d);
        return `${fmt(e[k], d)}<span class="err"><sup>+${fmt(hi, d)}</sup><sub>${fmt(lo, d)}</sub></span>`;
    }
    function bins(values, n, log) {
        const v = values.filter(x => x != null && (!log || x > 0));
        if (!v.length) return { edges: [], counts: [] };
        let lo = Math.min(...v), hi = Math.max(...v);
        if (log) { lo = Math.log10(lo); hi = Math.log10(hi); }
        if (hi === lo) hi = lo + 1;
        const edges = Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n).map(x => log ? 10 ** x : x);
        return { edges, index: x => {
            const t = log ? (Math.log10(x) - lo) / (hi - lo) : (x - lo) / (hi - lo);
            return Math.min(n - 1, Math.max(0, Math.floor(t * n)));
        } };
    }
    const binLabel = (a, b) => { const f = x => x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2); return `${f(a)}–${f(b)}`; };

    // ---------- filters UI ----------
    function buildFilterCounts() {
        const count = (k, v) => state.events.filter(e => e[k] === v).length;
        root.querySelector('[data-runs]').innerHTML = RUNS.map(r => `
            <label class="chip"><input type="checkbox" value="${r}" ${state.runs.has(r) ? 'checked' : ''}>
            <i style="background:${RUN_COLORS[r]}"></i>${r}<small>${count('run', r)}</small></label>`).join('');
        root.querySelector('[data-classes]').innerHTML = CLASSES.map(c => `
            <label class="chip"><input type="checkbox" value="${c}" ${state.classes.has(c) ? 'checked' : ''}>
            <i style="background:${CLASS_COLORS[c]}"></i>${c}<small>${count('cls', c)}</small></label>`).join('');
    }
    root.querySelector('[data-runs]').addEventListener('change', e => {
        e.target.checked ? state.runs.add(e.target.value) : state.runs.delete(e.target.value); state.page = 0; render(); });
    root.querySelector('[data-classes]').addEventListener('change', e => {
        e.target.checked ? state.classes.add(e.target.value) : state.classes.delete(e.target.value); state.page = 0; render(); });
    const snrIn = root.querySelector('[data-minsnr]'), paIn = root.querySelector('[data-minpa]');
    snrIn.addEventListener('input', () => { state.minSnr = +snrIn.value; root.querySelector('[data-minsnr-val]').textContent = snrIn.value; state.page = 0; render(); });
    paIn.addEventListener('input', () => { state.minPa = +paIn.value; root.querySelector('[data-minpa-val]').textContent = (+paIn.value).toFixed(2); state.page = 0; render(); });
    root.querySelector('[data-search]').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); state.page = 0; render(); });
    root.querySelector('[data-reset]').addEventListener('click', () => {
        state.runs = new Set(RUNS); state.classes = new Set(CLASSES); state.minSnr = 0; state.minPa = 0; state.search = ''; state.page = 0;
        snrIn.value = 0; paIn.value = 0; root.querySelector('[data-minsnr-val]').textContent = '0';
        root.querySelector('[data-minpa-val]').textContent = '0.00'; root.querySelector('[data-search]').value = '';
        buildFilterCounts(); render();
    });

    // tabs
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        root.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
        root.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== state.tab; });
        render();
    }));

    // explorer controls
    const selOpts = Object.entries(PARAMS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
    ['sx', 'sy'].forEach(k => { const s = root.querySelector(`[data-${k}]`); s.innerHTML = selOpts; s.value = state[k];
        s.addEventListener('change', () => { state[k] = s.value; state['slog' + k[1]] = PARAMS[s.value].log;
            root.querySelector(`[data-slog${k[1]}]`).checked = state['slog' + k[1]]; render(); }); });
    root.querySelector('[data-sc]').addEventListener('change', e => { state.sc = e.target.value; render(); });
    ['x', 'y'].forEach(a => { const c = root.querySelector(`[data-slog${a}]`); c.checked = state['slog' + a];
        c.addEventListener('change', () => { state['slog' + a] = c.checked; render(); }); });

    // PNG export
    root.addEventListener('click', e => {
        const b = e.target.closest('[data-png]'); if (!b) return;
        const c = charts[b.dataset.png]; if (!c) return;
        const a = document.createElement('a'); a.href = c.toBase64Image('image/png', 1);
        a.download = `gwtc_${b.dataset.png}.png`; a.click();
    });

    // table sorting + paging
    root.querySelector('[data-table-head]').addEventListener('click', e => {
        const th = e.target.closest('[data-sort]'); if (!th) return;
        const k = th.dataset.sort; state.sortDir = state.sortKey === k ? -state.sortDir : (k === 'n' ? 1 : -1);
        state.sortKey = k; state.page = 0; renderTable(filtered());
    });
    root.querySelector('[data-pager]').addEventListener('click', e => {
        const b = e.target.closest('[data-page]'); if (!b) return;
        state.page = +b.dataset.page; renderTable(filtered());
    });

    // ---------- render ----------
    function render() {
        const list = filtered();
        renderStats(list);
        if (state.tab === 'overview') renderOverview(list);
        if (state.tab === 'dists') renderDists(list);
        if (state.tab === 'explorer') renderExplorer(list);
        if (state.tab === 'population') renderPopulation(list);
        if (state.tab === 'table') renderTable(list);
    }

    function renderStats(list) {
        const pe = withPE(list);
        const maxBy = (arr, k) => arr.reduce((b, e) => (e[k] != null && (!b || e[k] > b[k])) ? e : b, null);
        const loud = maxBy(list, 'snr'), far = maxBy(pe, 'dl'), heavy = maxBy(pe, 'mt');
        const n = c => list.filter(e => e.cls === c).length;
        const tiles = [
            ['Events shown', list.length, `of ${state.events.length} in GWTC`],
            ['Binary black holes', n('BBH'), 'both masses above 3 M☉'],
            ['Neutron star mergers', n('NSBH') + n('BNS'), `${n('NSBH')} NSBH · ${n('BNS')} BNS`],
            ['Loudest', loud ? fmt(loud.snr, 1) : '–', loud ? `network SNR · ${loud.n}` : ''],
            ['Farthest', far ? (far.dl / 1000).toFixed(1) + ' Gpc' : '–', far ? far.n : ''],
            ['Heaviest', heavy ? Math.round(heavy.mt) + ' M☉' : '–', heavy ? `total mass · ${heavy.n}` : ''],
        ];
        root.querySelector('[data-stats]').innerHTML = tiles.map(([l, v, s]) =>
            `<div class="cat-stat"><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join('');
        root.querySelector('[data-count]').textContent = `${list.length} of ${state.events.length} events`;
    }

    function renderOverview(list) {
        const t = theme();
        // cumulative detections vs time, one line per run so gaps between runs are visible
        const sorted = [...list].sort((a, b) => a.gps - b.gps);
        const pts = sorted.map((e, i) => ({ x: e.year, y: i + 1, e }));
        makeChart('cumulative', {
            type: 'scatter',
            data: { datasets: RUNS.filter(r => state.runs.has(r)).map(r => ({
                label: r, data: pts.filter(p => p.e.run === r), showLine: true, borderColor: RUN_COLORS[r],
                backgroundColor: RUN_COLORS[r], pointRadius: 2.2, borderWidth: 2, stepped: true })) },
            options: baseOptions(t, {
                scales: { x: axis(t, 'Year', 'linear', { ticks: { color: t.text, callback: v => Math.round(v) === v ? v : '' } }),
                          y: axis(t, 'Cumulative detections') },
                plugins: Object.assign(baseOptions(t).plugins, { tooltip: Object.assign(baseOptions(t).plugins.tooltip, {
                    callbacks: { label: c => `${c.raw.e.n}  (#${c.raw.y})` } }) }),
            }),
        });
        // events per run, stacked by class
        makeChart('perrun', {
            type: 'bar',
            data: { labels: RUNS, datasets: CLASSES.map(c => ({ label: c, backgroundColor: CLASS_COLORS[c], borderRadius: 4,
                data: RUNS.map(r => list.filter(e => e.run === r && e.cls === c).length) })) },
            options: baseOptions(t, { scales: { x: axis(t, 'Observing run', 'category', { stacked: true, grid: { display: false } }),
                y: axis(t, 'Events', 'linear', { stacked: true }) } }),
        });
        // class breakdown
        makeChart('classes', {
            type: 'doughnut',
            data: { labels: CLASSES, datasets: [{ data: CLASSES.map(c => list.filter(e => e.cls === c).length),
                backgroundColor: CLASSES.map(c => CLASS_COLORS[c]), borderColor: t.bg, borderWidth: 3 }] },
            options: baseOptions(t, { cutout: '62%', plugins: Object.assign(baseOptions(t).plugins, {
                legend: { position: 'bottom', labels: { color: t.text, boxWidth: 12, font: { family: t.font } } } }) }),
        });
    }

    function histogram(id, key, list, n = 18) {
        const t = theme(), p = PARAMS[key];
        const vals = list.map(e => e[key]).filter(v => v != null);
        const b = bins(vals, n, p.log);
        const labels = b.edges.slice(0, -1).map((a, i) => binLabel(a, b.edges[i + 1]));
        makeChart(id, {
            type: 'bar',
            data: { labels, datasets: RUNS.filter(r => state.runs.has(r)).map(r => ({
                label: r, backgroundColor: RUN_COLORS[r], borderWidth: 0, barPercentage: 1, categoryPercentage: .92,
                data: labels.map((_, i) => list.filter(e => e.run === r && e[key] != null && b.index(e[key]) === i).length) })) },
            options: baseOptions(t, {
                plugins: Object.assign(baseOptions(t).plugins, { legend: { display: false } }),
                scales: { x: axis(t, p.label + (p.log ? '  (log bins)' : ''), 'category', { stacked: true, grid: { display: false },
                    ticks: { color: t.text, font: { size: 10 }, autoSkip: true, maxTicksLimit: 6, maxRotation: 0 } }),
                    y: axis(t, 'Events', 'linear', { stacked: true }) },
            }),
        });
    }
    function renderDists(list) {
        const pe = withPE(list);
        ['m1', 'm2', 'mc', 'mt', 'q', 'chi', 'dl', 'z', 'snr'].forEach(k => histogram('h_' + k, k, k === 'snr' ? list : pe));
    }

    function scatter(id, list, xk, yk, colorBy, logx, logy, extra = {}) {
        const t = theme();
        const groups = colorBy === 'class' ? CLASSES.filter(c => state.classes.has(c)) : RUNS.filter(r => state.runs.has(r));
        const colors = colorBy === 'class' ? CLASS_COLORS : RUN_COLORS;
        const valid = list.filter(e => e[xk] != null && e[yk] != null && (!logx || e[xk] > 0) && (!logy || e[yk] > 0));
        makeChart(id, {
            type: 'scatter',
            data: { datasets: groups.map(g => ({ label: g, backgroundColor: colors[g] + 'cc', borderColor: colors[g],
                pointRadius: 4, pointHoverRadius: 7, borderWidth: 1,
                data: valid.filter(e => (colorBy === 'class' ? e.cls : e.run) === g).map(e => ({ x: e[xk], y: e[yk], e })) })) },
            options: baseOptions(t, Object.assign({
                onClick: (ev, els) => { if (els[0]) { const e = els[0].element.$context.raw.e; window.open(e.url, '_blank', 'noopener'); } },
                scales: { x: axis(t, PARAMS[xk].label, logx ? 'logarithmic' : 'linear'),
                          y: axis(t, PARAMS[yk].label, logy ? 'logarithmic' : 'linear') },
                plugins: Object.assign(baseOptions(t).plugins, { tooltip: Object.assign(baseOptions(t).plugins.tooltip, {
                    callbacks: { title: c => c[0].raw.e.n, label: c => {
                        const e = c.raw.e; return [`${PARAMS[xk].short}: ${fmt(e[xk], 2)}`, `${PARAMS[yk].short}: ${fmt(e[yk], 2)}`,
                            `${e.run} · ${e.cls}`]; } } }) }),
            }, extra)),
        });
    }
    function renderExplorer(list) {
        scatter('explorer', list, state.sx, state.sy, state.sc, state.slogx, state.slogy);
        const n = list.filter(e => e[state.sx] != null && e[state.sy] != null).length;
        root.querySelector('[data-explorer-n]').textContent = `${n} events with both parameters · click a point to open it on GWOSC`;
    }

    function renderPopulation(list) {
        const pe = withPE(list);
        scatter('p_m1m2', pe, 'm1', 'm2', 'class', true, true);
        scatter('p_mcchi', pe, 'mc', 'chi', 'run', true, false);
        scatter('p_dlmt', pe, 'dl', 'mt', 'run', true, true);
        scatter('p_timem1', pe, 'year', 'm1', 'class', false, true);
    }

    const COLS = [
        ['n', 'Event'], ['run', 'Run'], ['cls', 'Type'], ['m1', 'm₁ (M☉)'], ['m2', 'm₂ (M☉)'], ['mc', '𝓜 (M☉)'],
        ['chi', 'χ_eff'], ['dl', 'd_L (Mpc)'], ['z', 'z'], ['snr', 'SNR'], ['pa', 'p_astro'], ['far', 'FAR (/yr)'],
    ];
    function renderTable(list) {
        const head = root.querySelector('[data-table-head]');
        head.innerHTML = '<tr>' + COLS.map(([k, l]) => `<th data-sort="${k}" class="${state.sortKey === k ? (state.sortDir > 0 ? 'asc' : 'desc') : ''}">${l}</th>`).join('') + '</tr>';
        const k = state.sortKey === 'n' ? 'n' : state.sortKey;
        const rows = [...list].sort((a, b) => {
            const va = k === 'n' ? a.gps : a[k], vb = k === 'n' ? b.gps : b[k];
            if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
            return (va > vb ? 1 : va < vb ? -1 : 0) * state.sortDir;
        });
        const per = 25, pages = Math.max(1, Math.ceil(rows.length / per));
        state.page = Math.min(state.page, pages - 1);
        const slice = rows.slice(state.page * per, state.page * per + per);
        root.querySelector('[data-table-body]').innerHTML = slice.map(e => `<tr>
            <td><a href="${e.url}" target="_blank" rel="noopener">${e.n}</a></td>
            <td><span class="dot" style="background:${RUN_COLORS[e.run]}"></span>${e.run}</td>
            <td><span class="dot" style="background:${CLASS_COLORS[e.cls]}"></span>${e.cls}</td>
            <td>${withErr(e, 'm1')}</td><td>${withErr(e, 'm2')}</td><td>${withErr(e, 'mc')}</td>
            <td>${withErr(e, 'chi', 2)}</td><td>${withErr(e, 'dl', 0)}</td><td>${withErr(e, 'z', 2)}</td>
            <td>${fmt(e.snr, 1)}</td><td>${fmt(e.pa, 2)}</td><td>${e.far == null ? '–' : (e.far < 0.01 ? e.far.toExponential(1) : fmt(e.far, 2))}</td>
        </tr>`).join('') || `<tr><td colspan="${COLS.length}" class="empty">No events match these filters.</td></tr>`;
        const pager = root.querySelector('[data-pager]');
        const btn = (p, label, dis) => `<button data-page="${p}" ${dis ? 'disabled' : ''}>${label}</button>`;
        pager.innerHTML = `${btn(state.page - 1, '← Prev', state.page === 0)}
            <span>Page ${state.page + 1} of ${pages} · ${rows.length} events</span>
            ${btn(state.page + 1, 'Next →', state.page >= pages - 1)}`;
    }

    // re-render charts when the light/dark theme changes
    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---------- boot: snapshot first, then live ----------
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    fetch(SNAPSHOT).then(r => r.json()).then(d => {
        setEvents(d.events, `<i class="off"></i>Snapshot of GWOSC GWTC · ${d.fetched}`);
        return fetch(LIVE_URL).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
            setEvents(fromGwosc(j), `<i class="on"></i>Live from GWOSC · updated ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`);
        });
    }).catch(() => { /* keep whatever loaded; the snapshot label stays */ });
})();
