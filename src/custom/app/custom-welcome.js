/**
 * Static splash for Lampa — zero animation, TV-safe
 *
 * Minimal, clean, distraction-free boot screen: flat background +
 * compact centered logo. No keyframes, no transforms, no timers —
 * removal is handled by the core (showApp fadeOut).
 * Logo is inlined from a single source of truth (interaction/logo-icon.js
 * <-> src/custom/logo.svg) — zero extra network requests during boot.
 */

import { logoSvg } from '../interaction/logo-icon'

(function initStaticSplash() {
    'use strict'

    // ═══════════════════════════════════════════════════════════════
    //  Static splash — no guards, no modes, no animation
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 3 — CSS (static, no keyframes)
    // ═══════════════════════════════════════════════════════════════

    var CSS = /* css */`
/* ================================================================
   Static splash — minimal, clean, distraction-free
   ================================================================ */

.welcome {
    background: #08080e !important;
    background-size: auto !important;
    cursor: default;
}

/* ── Container ────────────────────────────────────────────────── */
.netflix-intro {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0; /* inset:0 compat — Chrome <87 */
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    -webkit-box-align: center;
    -webkit-align-items: center;
    align-items: center;
    -webkit-box-pack: center;
    -webkit-justify-content: center;
    justify-content: center;
    overflow: hidden;
    background: #08080e;
    padding-bottom: 10vh;
    box-sizing: border-box;
}

/* ── Vignette (static, flat — no animation) ───────────────────── */
.netflix-intro__vig {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0; /* inset:0 compat */
    z-index: 0;
    pointer-events: none;
    background: -webkit-radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%);
    background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%);
}

/* ── Logo wrapper (static — zero animation) ───────────────────── */
.netflix-intro__tw {
    position: relative;
    z-index: 2;
    display: inline-block;
}

/* Compact centered logo — inline SVG, no extra network request */
.netflix-intro__logo {
    display: block;
    width: 96px; /* px fallback for vw-unsupported browsers */
    width: 12vw;
    max-width: 120px;
    min-width: 72px;
    pointer-events: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}
.netflix-intro__logo svg {
    display: block;
    width: 100%;
    height: auto;
}

/* ── Responsive cap ───────────────────────────────────────────── */
@media (min-width: 1000px) {
    .netflix-intro__logo { width: 120px; }
}
`

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 4 — Static template (single variant, no modes)
    // ═══════════════════════════════════════════════════════════════

    var LOGO_HTML = '<div class="netflix-intro__logo" role="img" aria-label="Сяйво">' + logoSvg + '</div>'

    var SPLASH_HTML = '\n<div class="netflix-intro">\n'
        + '    <div class="netflix-intro__vig"></div>\n'
        + '    <div class="netflix-intro__tw">'
        + LOGO_HTML
        + '</div>\n</div>'

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 5 — injectHTML (no animation tracking, core removes .welcome)
    // ═══════════════════════════════════════════════════════════════

    function injectHTML() {
        var w = document.querySelector('.welcome')
        if (!w) { setTimeout(injectHTML, 30); return }

        w.innerHTML = SPLASH_HTML
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 6 — Boot: insert CSS, inject HTML immediately
    // ═══════════════════════════════════════════════════════════════

    function boot() {
        var style = document.createElement('style')
        style.id = 'netflix-intro-css'
        style.textContent = CSS
        document.head.appendChild(style)

        injectHTML()
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 7 — Start
    // ═══════════════════════════════════════════════════════════════

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', boot)
        : boot()
})()
