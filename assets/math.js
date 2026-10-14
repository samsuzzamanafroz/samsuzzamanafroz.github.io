// Typeset TeX written in <span class="m"> (inline) and <span class="md"> (display) with KaTeX.
(function () {
    if (!window.katex) return;
    document.querySelectorAll('.m, .md').forEach(el => {
        try {
            katex.render(el.textContent, el, {
                displayMode: el.classList.contains('md'),
                throwOnError: false
            });
        } catch (e) { /* leave the raw TeX visible */ }
    });
})();
