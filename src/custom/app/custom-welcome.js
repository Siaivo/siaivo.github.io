/**
 * Netflix-style intro for Lampa — ULTRA optimized for TV hardware
 *
 * Every animated property is GPU-compositor-only (transform + opacity).
 * Zero: filter:blur(), text-shadow, box-shadow animation.
 *
 * Platform-aware — graceful degradation on older TV hardware:
 *   Orsay/Netcast → skip entirely (CSS animations unreliable)
 *   TV platforms  → LITE mode (1 beam, no CA, shorter duration)
 *   Others        → FULL mode (3 beams, chromatic aberration)
 */

(function initNetflixStyleIntro() {
    'use strict'

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 1 — Early guards (sync, zero DOM, zero Lampa)
    // ═══════════════════════════════════════════════════════════════

    // 1a. System prefers reduced motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return

    // 1b. Legacy TV platforms where CSS animations are unreliable
    var _ua = navigator.userAgent.toLowerCase()
    if (/orsay|maple|netcast/i.test(_ua)) return

    // 1c. User opted out via existing Lampa settings
    try {
        var _ls = window.localStorage
        if (_ls && (_ls.getItem('light_version') === 'true' ||
                     _ls.getItem('animation') === 'false'))
            return
    } catch (_e) {}

    // 1d. CSS animation support detection (with -webkit- prefix for older WebKit)
    var _probe = document.createElement('div')
    _probe.style.animationName = 'x'
    if (_probe.style.animationName !== 'x') {
        _probe.style.webkitAnimationName = 'x'
        if (_probe.style.webkitAnimationName !== 'x') return
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 2 — State & config
    // ═══════════════════════════════════════════════════════════════

    var LITE_MODE = false
    var TOTAL_DURATION = 3800
    var introDone = false

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 3 — CSS (FULL + LITE overrides at the end)
    // ═══════════════════════════════════════════════════════════════

    var CSS = /* css */`
/* ================================================================
   Netflix Intro — Ultra GPU-optimized
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
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-transform: translate3d(0,0,0);
    transform: translate3d(0,0,0);
    animation: niOut 0.4s ease-in forwards;
    animation-delay: 3.2s;
}

/* ── Vignette (static) ────────────────────────────────────────── */
.netflix-intro__vig {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0; /* inset:0 compat */
    z-index: 0;
    pointer-events: none;
    background: -webkit-radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%);
    background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%);
}

/* ── Beams ────────────────────────────────────────────────────── */
.netflix-intro__beams {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0; /* inset:0 compat */
    z-index: 1;
    pointer-events: none;
}

.ni-b {
    position: absolute;
    top: 0;
    height: 100%;
    width: 4px;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-transform: translate3d(0,0,0) scaleY(0);
    transform: translate3d(0,0,0) scaleY(0);
    animation: niBIn 0.9s cubic-bezier(0.16,1,0.3,1) forwards;
    opacity: 0;
}
.ni-b--l { left: 30%;
    background: -webkit-linear-gradient(to bottom, transparent, rgba(229,9,20,0.85) 30%, rgba(229,9,20,0.95) 50%, rgba(229,9,20,0.3) 80%, transparent);
    background: linear-gradient(to bottom, transparent, rgba(229,9,20,0.85) 30%, rgba(229,9,20,0.95) 50%, rgba(229,9,20,0.3) 80%, transparent);
    animation-delay: 0.3s; }
.ni-b--c { left: 50%; width: 3px;
    -webkit-transform: translate3d(0,0,0) rotate(-16deg) scaleY(0);
    transform: translate3d(0,0,0) rotate(-16deg) scaleY(0);
    background: -webkit-linear-gradient(to bottom, transparent, rgba(245,166,35,0.7) 25%, rgba(255,255,255,0.6) 50%, rgba(245,166,35,0.6) 75%, transparent);
    background: linear-gradient(to bottom, transparent, rgba(245,166,35,0.7) 25%, rgba(255,255,255,0.6) 50%, rgba(245,166,35,0.6) 75%, transparent);
    animation-delay: 0.55s; }
.ni-b--r { left: 66%;
    background: -webkit-linear-gradient(to bottom, transparent, rgba(229,9,20,0.8) 25%, rgba(229,9,20,0.95) 50%, rgba(229,9,20,0.25) 75%, transparent);
    background: linear-gradient(to bottom, transparent, rgba(229,9,20,0.8) 25%, rgba(229,9,20,0.95) 50%, rgba(229,9,20,0.25) 75%, transparent);
    animation-delay: 0.4s; }

@keyframes niBIn {
    0%   { opacity: 0;   -webkit-transform: translate3d(0,0,0) scaleY(0); transform: translate3d(0,0,0) scaleY(0); }
    40%  { opacity: 0.7; }
    100% { opacity: 0.9; -webkit-transform: translate3d(0,0,0) scaleY(1); transform: translate3d(0,0,0) scaleY(1); }
}

/* Override rotation for center beam */
.ni-b--c {
    animation-name: niBInC;
}
@keyframes niBInC {
    0%   { opacity: 0;   -webkit-transform: translate3d(0,0,0) rotate(-16deg) scaleY(0); transform: translate3d(0,0,0) rotate(-16deg) scaleY(0); }
    40%  { opacity: 0.7; }
    100% { opacity: 0.85; -webkit-transform: translate3d(0,0,0) rotate(-16deg) scaleY(1); transform: translate3d(0,0,0) rotate(-16deg) scaleY(1); }
}

/* ── Title wrapper ────────────────────────────────────────────── */
.netflix-intro__tw {
    position: relative;
    z-index: 2;
    display: inline-block;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-transform: translate3d(0,0,0) scale(0.8);
    transform: translate3d(0,0,0) scale(0.8);
    animation: niTwIn 1.2s cubic-bezier(0.16,1,0.3,1) forwards;
    animation-delay: 1.0s;
    opacity: 0;
}

/* Title text — no text-shadow, just color */
.netflix-intro__title {
    font-family: 'Helvetica Neue','Arial Black',sans-serif;
    font-size: 100px; /* px fallback for vw-unsupported browsers */
    font-size: 12vw;
    font-weight: 900;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #e50914;
    text-align: center;
    pointer-events: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

/* Chromatic aberration via layered spans (cheap — just text, no shadow) */
.netflix-intro__ca {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0; /* inset:0 compat */
    pointer-events: none;
    font: inherit;
    font-size: inherit;
    font-weight: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    text-align: inherit;
    color: transparent;
    -webkit-text-stroke: 2px #00d4aa;
    -webkit-transform: translate(3px, 3px);
    transform: translate(3px, 3px);
    opacity: 0.5;
}
.netflix-intro__ca2 {
    -webkit-transform: translate(-3px, -3px);
    transform: translate(-3px, -3px);
    -webkit-text-stroke: 2px #ff5e3a;
    opacity: 0.4;
}

@keyframes niTwIn {
    0%   { opacity: 0; -webkit-transform: translate3d(0,0,0) scale(0.7); transform: translate3d(0,0,0) scale(0.7); }
    40%  { opacity: 0.8; }
    65%  { opacity: 1; -webkit-transform: translate3d(0,0,0) scale(1); transform: translate3d(0,0,0) scale(1); }
    100% { opacity: 1; -webkit-transform: translate3d(0,0,0) scale(1.04); transform: translate3d(0,0,0) scale(1.04); }
}

/* ── Zoom-out (modest scale — avoids huge GPU texture) ────────── */
@keyframes niOut {
    0%   { opacity: 1; -webkit-transform: translate3d(0,0,0) scale(1); transform: translate3d(0,0,0) scale(1); }
    100% { opacity: 0; -webkit-transform: translate3d(0,0,0) scale(1.25); transform: translate3d(0,0,0) scale(1.25); }
}

/* ── Responsive cap ───────────────────────────────────────────── */
@media (min-width: 1000px) {
    .netflix-intro__title { font-size: 100px; }
}

/* ── LITE MODE OVERRIDES ──────────────────────────────────────── */
/* Applied via .netflix-intro--lite on the container.
   Hides side beams + chromatic aberration spans,
   shortens all delays and durations for ~2.5s total. */

.netflix-intro--lite .ni-b--l,
.netflix-intro--lite .ni-b--r,
.netflix-intro--lite .netflix-intro__ca {
    display: none !important;
}

.netflix-intro--lite .ni-b--c {
    animation-delay: 0.15s;
}

.netflix-intro--lite .netflix-intro__tw {
    animation-delay: 0.4s;
    animation-duration: 0.8s;
}

.netflix-intro--lite.netflix-intro {
    animation-name: niOutLite;
    animation-delay: 2.0s;
    animation-duration: 0.3s;
}

@keyframes niOutLite {
    0%   { opacity: 1; -webkit-transform: translate3d(0,0,0) scale(1); transform: translate3d(0,0,0) scale(1); }
    100% { opacity: 0; -webkit-transform: translate3d(0,0,0) scale(1.1); transform: translate3d(0,0,0) scale(1.1); }
}
`

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 4 — HTML templates
    // ═══════════════════════════════════════════════════════════════

    var FULL_HTML = `
<div class="netflix-intro">
    <div class="netflix-intro__vig"></div>
    <div class="netflix-intro__beams">
        <div class="ni-b ni-b--l"></div>
        <div class="ni-b ni-b--c"></div>
        <div class="ni-b ni-b--r"></div>
    </div>
    <div class="netflix-intro__tw">
        <h1 class="netflix-intro__title">Сяйво</h1>
    </div>
</div>`

    var LITE_HTML = `
<div class="netflix-intro netflix-intro--lite">
    <div class="netflix-intro__vig"></div>
    <div class="netflix-intro__beams">
        <div class="ni-b ni-b--c"></div>
    </div>
    <div class="netflix-intro__tw">
        <h1 class="netflix-intro__title">Сяйво</h1>
    </div>
</div>`

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 5 — injectHTML
    // ═══════════════════════════════════════════════════════════════

    function injectHTML() {
        var w = document.querySelector('.welcome')
        if (!w) { setTimeout(injectHTML, 30); return }

        w.innerHTML = LITE_MODE ? LITE_HTML : FULL_HTML
        w.setAttribute('data-intro', 'active')

        var intro = w.querySelector('.netflix-intro')
        if (intro) {
            var _animEnd = 'animationend'
            if (!('animationend' in document.createElement('div')))
                _animEnd = 'webkitAnimationEnd'
            intro.addEventListener(_animEnd, function h(e) {
                if (e.animationName === 'niOut' || e.animationName === 'niOutLite') {
                    introDone = true
                    w.setAttribute('data-intro', 'done')
                    w.style.opacity = '0'
                    w.style.pointerEvents = 'none'
                    setTimeout(function () {
                        if (w.parentNode) w.style.display = 'none'
                    }, 500)
                }
            })
        }

        setTimeout(function () {
            if (!introDone) {
                introDone = true
                w.setAttribute('data-intro', 'done')
                w.style.opacity = '0'
                w.style.pointerEvents = 'none'
                setTimeout(function () {
                    if (w.parentNode) w.style.display = 'none'
                }, 500)
            }
        }, TOTAL_DURATION + 500)
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 6 — Boot: insert CSS, check Lampa, then inject HTML
    // ═══════════════════════════════════════════════════════════════

    function boot() {
        var style = document.createElement('style')
        style.id = 'netflix-intro-css'
        style.textContent = CSS
        document.head.appendChild(style)

        // Async Lampa check — detect TV platform for LITE mode
        // Injects HTML immediately once Lampa is available (or timeout)
        function checkThenInject(remaining) {
            if (window.Lampa && Lampa.Platform && Lampa.Storage) {
                if (Lampa.Platform.tv()) {
                    LITE_MODE = true
                    TOTAL_DURATION = 2500
                }
                try {
                    if (Lampa.Storage.field('light_version') ||
                        Lampa.Storage.field('animation') === false)
                        return  /* user opted out — skip animation entirely */
                } catch (_e) {}
                injectHTML()
            } else if (remaining > 0) {
                setTimeout(function () { checkThenInject(remaining - 1) }, 80)
            } else {
                injectHTML()  /* timeout — proceed without Lampa info */
            }
        }

        checkThenInject(25)  /* ~2s max wait (25 × 80ms) */
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL 7 — Start
    // ═══════════════════════════════════════════════════════════════

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', boot)
        : boot()
})()
