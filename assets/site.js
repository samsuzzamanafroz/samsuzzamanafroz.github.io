// Shared behaviour for every page: nav, reveal-on-scroll, lightbox, tabs, TOC,
// and the gravitational-wave background on the home hero.
(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Nav: solid background after scrolling, mobile toggle ----
    const nav = document.querySelector('.site-nav');
    if (nav) {
        const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });

        const toggle = nav.querySelector('.nav-toggle');
        const links = nav.querySelector('.nav-links');
        if (toggle && links) {
            toggle.addEventListener('click', () => links.classList.toggle('open'));
            links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
        }
    }

    // ---- Light / dark theme (light is the default; the choice is remembered per browser) ----
    document.querySelectorAll('.theme-toggle').forEach(btn => btn.addEventListener('click', () => {
        const root = document.documentElement;
        const dark = root.getAttribute('data-theme') !== 'dark';
        if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
        try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
    }));

    // ---- Reveal on scroll ----
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !reduceMotion) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(el => io.observe(el));
    } else {
        revealEls.forEach(el => el.classList.add('in'));
    }

    // ---- Active link highlighting (nav on home page, TOC on research pages) ----
    function spy(linkSelector) {
        const links = [...document.querySelectorAll(linkSelector)].filter(a => a.hash && a.hash.length > 1);
        const targets = links.map(a => document.getElementById(a.hash.slice(1))).filter(Boolean);
        if (!targets.length) return;
        const update = () => {
            let current = null;
            targets.forEach(t => { if (t.getBoundingClientRect().top < 140) current = t.id; });
            links.forEach(a => a.classList.toggle('active', a.hash === '#' + current));
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
    }
    spy('.nav-links a[href^="#"]');
    spy('.toc a');

    // ---- Lightbox for figures ----
    const zoomables = document.querySelectorAll('figure.fig img, .viz-feature img, .viz-full-image, .gallery-item img');
    if (zoomables.length) {
        const box = document.createElement('div');
        box.className = 'lightbox';
        box.innerHTML = '<button class="close" aria-label="Close">&times;</button><img alt=""><div class="cap"></div>';
        document.body.appendChild(box);
        const img = box.querySelector('img');
        const cap = box.querySelector('.cap');
        const close = () => { box.classList.remove('open'); document.body.style.overflow = ''; };
        zoomables.forEach(el => el.addEventListener('click', () => {
            img.src = el.dataset.full || el.src;
            img.alt = el.alt;
            const fc = el.closest('figure')?.querySelector('figcaption');
            cap.textContent = fc ? fc.textContent.trim() : el.alt;
            box.classList.add('open');
            document.body.style.overflow = 'hidden';
        }));
        box.addEventListener('click', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }

    // ---- Copy-to-clipboard buttons ----
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
        const done = () => {
            btn.textContent = 'Copied!'; btn.classList.add('done');
            setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1800);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(btn.dataset.copy).then(done, () => {});
    }));

    // ---- Tabs ----
    document.querySelectorAll('[data-tabs]').forEach(group => {
        const buttons = group.querySelectorAll('.tabs button');
        const panels = group.querySelectorAll('.tab-panel');
        buttons.forEach((btn, i) => btn.addEventListener('click', () => {
            buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
            panels.forEach((p, j) => { p.hidden = i !== j; });
        }));
    });

    // ---- Live citation metrics from INSPIRE-HEP (numbers in the HTML are the fallback) ----
    const metricEls = document.querySelectorAll('[data-inspire]');
    if (metricEls.length && window.fetch) {
        const API = 'https://inspirehep.net/api/literature';
        const BAI = 'Samsuzzaman.Afroz.1';
        const RECID = 2741174;
        const set = (key, val) => {
            if (val === undefined || val === null || isNaN(val)) return;
            document.querySelectorAll(`[data-inspire="${key}"]`).forEach(el => { el.textContent = val; });
        };
        // Papers with 10 or fewer authors, as in the INSPIRE citation summary (leaves out large-collaboration papers)
        const summaryQ = encodeURIComponent(`a ${BAI} and ac 1->10`);
        fetch(`${API}/facets?facet_name=citation-summary&q=${summaryQ}`)
            .then(r => r.json())
            .then(d => {
                const c = d.aggregations.citation_summary;
                set('citations', Math.round(c.citations.buckets.all.citations_count.value));
                set('hindex', c['h-index'].value.all);
            })
            .catch(() => {});
        fetch(`${API}?size=250&fields=first_author.recid&q=${summaryQ}`)
            .then(r => r.json())
            .then(d => set('firstauthor', d.hits.hits.filter(h => h.metadata.first_author && h.metadata.first_author.recid === RECID).length))
            .catch(() => {});
    }

    // ---- Hero: static star field (no animation) ----
    const canvas = document.getElementById('wave-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const stars = Array.from({ length: 140 }, () => ({
            x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.15
        }));
        const draw = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = canvas.clientWidth, h = canvas.clientHeight;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            stars.forEach(st => {
                ctx.fillStyle = `rgba(255,255,255,${st.a})`;
                ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2); ctx.fill();
            });
        };
        draw();
        window.addEventListener('resize', draw);
    }
})();
