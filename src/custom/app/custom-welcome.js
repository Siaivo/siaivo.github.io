/**
 * Boot splash for Lampa — the Siaivo logo assembles from its own parts
 *
 * The logo is: a thin outer ring, a big disc with a dark crescent cut
 * (it merges into the ring at the bottom), a four-point star cut out of
 * the disc, and a dot in the star's centre. The splash plays them in
 * order: the ring closes in, the disc rises out of it (solid white), the
 * star twists open in the disc, the dot pops in; while the app is still
 * loading the dot softly pulses.
 *
 * The star is a cut-out, so it is drawn as a layer of the background
 * colour over a solid disc — that is why the background is flat.
 *
 * Performance (old / weak TVs): every part is its own HTML layer with
 * its SVG painted once; the motion is CSS opacity/transform only, so it
 * runs on the compositor — no repaint, no JS per frame, and it stays
 * smooth while the main thread is busy booting app.min.js. Hidden
 * .welcome (core fadeOut → display:none) stops the animations by itself.
 * Logo is inlined from a single source of truth (interaction/logo-icon.js).
 */

import { logoSvg } from '../interaction/logo-icon'

(function initSplash() {
    'use strict'

    var BG = '#08080e'

    // Geometry in the 110×104 viewBox, taken from the logo path.
    var D = logoSvg.match(/ d="([^"]+)"/)[1]
    // Disc without the star cut and the dot: the star's curves become straight
    // lines along x=55 and the dot sub-path is dropped (they get their own layers).
    // Tied to the exact numbers in logo-icon.js — redo if the logo path changes.
    var BODY_D = D
        .replace('C 55.07612 34.538049 56.425038 52 77.142578 52 C 55.747135 52 55.008327 70.623839 55 91.638672', 'L 55 91.638672')
        .replace('C 54.991673 70.623839 54.252859 52 32.857422 52 C 53.574961 52 54.923879 34.538049 54.996094 14.351562', 'L 54.996094 14.351562')
        .replace(/ M 55 48\.21875.*$/, '')
    var STAR = 'M55 14.3516C55.0761 34.538 56.425 52 77.1426 52C55.7471 52 55.0083 70.6238 55 91.6387'
        + 'C54.9917 70.6238 54.2529 52 32.8574 52C53.575 52 54.9239 34.538 54.9961 14.3516Z'
    // Circle between the ring and the disc (it cuts through where they merge at
    // the bottom); ring and body overlap by 1 unit there to hide the AA seam.
    var SEP = { cx: 55, cy: 55, r: 47 }

    function circle(cx, cy, r) {
        return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0z'
    }

    function layer(name, inner) {
        return '<div class="siaivo-splash__part siaivo-splash__' + name + '">'
            + '<svg viewBox="0 0 110 104" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg></div>'
    }

    var RING = layer('ring',
        '<defs><clipPath id="siaivo-clip-ring"><path clip-rule="evenodd" d="'
        + circle(55, 52, 60) + circle(SEP.cx, SEP.cy, SEP.r - 0.5) + '"/></clipPath></defs>'
        + '<path fill="#fff" clip-path="url(#siaivo-clip-ring)" d="' + D + '"/>')

    var BODY = layer('body',
        '<defs><clipPath id="siaivo-clip-body"><path d="' + circle(SEP.cx, SEP.cy, SEP.r + 0.5) + '"/></clipPath></defs>'
        + '<path fill="#fff" clip-path="url(#siaivo-clip-body)" d="' + BODY_D + '"/>')

    var CUT = layer('star', '<path fill="' + BG + '" d="' + STAR + '"/>')
    // Drawn at the pulse peak (×1.5 of the logo's r=3.78) and shown at ×0.667 at
    // rest: the layer is rasterised once, so scaling down keeps the edge crisp.
    var DOT = layer('dot', '<circle fill="#fff" cx="55" cy="52" r="5.67"/>')

    var SPLASH_HTML = '<div class="siaivo-splash">'
        + '<div class="siaivo-splash__logo" role="img" aria-label="Сяйво">' + RING + BODY + CUT + DOT + '</div>'
        + '</div>'

    // ───────────────────────── CSS ─────────────────────────

    function anim(v) { return '-webkit-animation:' + v + ';animation:' + v + ';' }
    function origin(v) { return '-webkit-transform-origin:' + v + ';transform-origin:' + v + ';' }
    function kf(name, frames) {
        return '@-webkit-keyframes ' + name + '{' + frames.replace(/transform:/g, '-webkit-transform:') + '}'
            + '@keyframes ' + name + '{' + frames + '}'
    }

    var BACK = 'cubic-bezier(.34,1.56,.64,1)'     // ease-out with a small overshoot

    // Timeline, s: ring 0.2 → disc 0.45 → star 0.95 → dot 1.35; dot pulse from 2.4.
    var CSS = ''
        + '.welcome{background:' + BG + ' !important;background-size:auto !important;cursor:default}'
        + '.siaivo-splash{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;background:' + BG + '}'
        // 20vmin wide (28vmin in portrait), centred; px first for WebKit without vmin (Android 4.0–4.3)
        + '.siaivo-splash__logo{position:absolute;left:50%;top:50%;'
        +   'width:144px;height:136px;margin:-68px 0 0 -72px;'
        +   'width:20vmin;height:18.91vmin;margin:-9.45vmin 0 0 -10vmin;'
        +   'pointer-events:none;-webkit-user-select:none;user-select:none}'
        + '@media (orientation:portrait){.siaivo-splash__logo{width:28vmin;height:26.47vmin;margin:-13.24vmin 0 0 -14vmin}}'
        + '.siaivo-splash__part{position:absolute;top:0;left:0;width:100%;height:100%}'
        + '.siaivo-splash__part svg{display:block;width:100%;height:100%;overflow:visible}'
        // origins = each part's centre in the viewBox: ring/star/dot (55,52), disc (55,58.8)
        + '.siaivo-splash__ring{' + origin('50% 50%') + anim('siaivo-ring .7s cubic-bezier(.22,1,.36,1) .2s both') + '}'
        + '.siaivo-splash__body{' + origin('50% 56.6%') + anim('siaivo-fade .3s linear .45s both, siaivo-rise .6s ' + BACK + ' .45s both') + '}'
        + '.siaivo-splash__star{' + origin('50% 50%') + anim('siaivo-open .55s ' + BACK + ' .95s both') + '}'
        + '.siaivo-splash__dot{' + origin('50% 50%') + '-webkit-transform:scale(.667);transform:scale(.667);'
        +   anim('siaivo-pop .35s ' + BACK + ' 1.35s both, siaivo-pulse 3.2s ease-in-out 2.4s infinite') + '}'
        + kf('siaivo-ring', 'from{opacity:0;transform:scale(1.25)}to{opacity:1;transform:scale(1)}')
        + kf('siaivo-fade', 'from{opacity:0}to{opacity:1}')
        + kf('siaivo-rise', 'from{transform:scale(.5)}to{transform:scale(1)}')
        // scale(.01), not 0: a non-invertible matrix glitches on some old WebKits
        + kf('siaivo-open', 'from{transform:rotate(-90deg) scale(.01)}to{transform:rotate(0) scale(1)}')
        + kf('siaivo-pop', 'from{transform:scale(.01)}to{transform:scale(.667)}')
        + kf('siaivo-pulse', '0%,100%{transform:scale(.667)}50%{transform:scale(1)}')
        + '@media (prefers-reduced-motion:reduce){.siaivo-splash__part{-webkit-animation:none !important;animation:none !important}}'

    // ───────────────────────── boot ─────────────────────────

    function injectHTML() {
        var w = document.querySelector('.welcome')
        if (!w) { setTimeout(injectHTML, 30); return }

        w.innerHTML = SPLASH_HTML
    }

    function boot() {
        var style = document.createElement('style')
        style.id = 'siaivo-splash-css'
        style.textContent = CSS
        document.head.appendChild(style)

        injectHTML()
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', boot)
        : boot()
})()
