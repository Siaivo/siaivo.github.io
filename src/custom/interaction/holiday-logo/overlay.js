/**
 * Holiday Icon Overlay — DOM-маніпуляції та CSS-ін'єкція
 * 
 * Створює окрему динамічну іконку в хедері замість того щоб модифікувати логотип.
 */

import Head from '../../../interaction/head/head'
import Bell from '../../../interaction/bell'

var CSS_ID = 'holiday-icon-css'
var ICON_CLASS = 'head__holiday-icon'
var ACTIVE = false
var currentHoliday = null

function injectBaseCSS() {
    if (document.getElementById(CSS_ID)) return

    var style = document.createElement('style')
    style.id = CSS_ID
    style.textContent = /* css */`
/* Базові стилі нової іконки */
.head__holiday-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    margin-right: 0.5em; /* Lampa Head додає відступи, тому робимо невеликий */
    cursor: pointer;
    transition: all 0.3s ease;
    user-select: none;
    opacity: 1 !important; /* overrides head__action default opacity 0.5 */
}

/* Style 1: Кільце */
.head__holiday-icon.style-1 {
    width: 2.8em;
    height: 2.8em;
    font-size: 1em;
    box-shadow: 0 0 0 2px var(--hc), 0 0 12px 2px var(--hg), 0 0 0 4px var(--hg3);
    animation: holiday-ring-pulse 2.5s ease-in-out infinite;
}
.head__holiday-icon.style-1 .holiday-symbol {
    font-size: 1.4em;
    animation: holiday-sym-bounce 2s ease-in-out infinite;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

/* Style 2: Плашка */
.head__holiday-icon.style-2 {
    width: auto;
    height: 2.8em;
    border-radius: 1.4em;
    padding: 0 1em;
    font-size: 1em;
    background: var(--hg2);
    border: 1px solid var(--hc);
    box-shadow: 0 0 8px var(--hg3);
}
.head__holiday-icon.style-2 .holiday-symbol {
    margin-right: 0.5em;
    font-size: 1.2em;
}
.head__holiday-icon.style-2 .holiday-text {
    color: var(--hc);
    font-weight: 600;
    white-space: nowrap;
}

/* Style 3: Кільце + Частинки */
.head__holiday-icon.style-3 {
    width: 2.8em;
    height: 2.8em;
    font-size: 1em;
    box-shadow: 0 0 0 2px var(--hc), 0 0 16px 3px var(--hg);
    animation: holiday-ring-pulse 2.5s ease-in-out infinite;
    overflow: visible;
}
.head__holiday-icon.style-3 .holiday-symbol {
    font-size: 1.4em;
    animation: holiday-sym-bounce 2s ease-in-out infinite;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

/* Частинки */
.holiday-particle {
    position: absolute;
    pointer-events: none;
    font-size: 0.6em;
    opacity: 0;
    animation: holiday-particle-float linear infinite;
    z-index: 100;
}
@keyframes holiday-particle-float {
    0%   { transform: translateY(0) scale(0.5); opacity: 0; }
    20%  { opacity: 0.9; }
    80%  { opacity: 0.7; }
    100% { transform: translateY(-4em) scale(1.2); opacity: 0; }
}

@keyframes holiday-ring-pulse {
    0%, 100% { box-shadow: 0 0 0 2px var(--hc), 0 0 12px 2px var(--hg), 0 0 0 4px var(--hg3); }
    50% { box-shadow: 0 0 0 2px var(--hc), 0 0 20px 4px var(--hg), 0 0 0 6px var(--hg3); }
}
@keyframes holiday-sym-bounce {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-2px) scale(1.1); }
}

/* Modal Styling (Видалено) */
`
    document.head.appendChild(style)
}

function createIconElement() {
    var el = document.createElement('div')
    el.className = 'head__action head__holiday-icon selector'
    
    if (Head && Head.addElement) {
        Head.addElement($(el), showNotification)
    } else {
        el.addEventListener('click', showNotification)
        el.addEventListener('hover:enter', showNotification)
        
        // Fallback: Insert after head__logo-icon
        var logo = document.querySelector('.head__logo-icon')
        if (logo && logo.nextSibling) {
            logo.parentNode.insertBefore(el, logo.nextSibling)
        } else if (logo) {
            logo.parentNode.appendChild(el)
        }
    }
    return el
}

function getIconElement() {
    var el = document.querySelector('.' + ICON_CLASS)
    if (!el) {
        var logo = document.querySelector('.head__logo-icon')
        if (logo) el = createIconElement()
    }
    return el
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
        ? parseInt(result[1],16) + ',' + parseInt(result[2],16) + ',' + parseInt(result[3],16)
        : '255,215,0'
}

function buildParticles(container, particlesList) {
    container.querySelectorAll('.holiday-particle').forEach(function(p){ p.remove() })
    var list = particlesList && particlesList.length ? particlesList : ['✨','⭐','🌟']
    
    var positions = [
        { top: '-20%', left: '10%', delay: '0s', dur: '2.2s' },
        { top: '-5%',  left: '70%', delay: '0.4s', dur: '2.8s' },
        { top: '40%',  left: '-20%', delay: '0.9s', dur: '2s' },
        { top: '60%',  left: '80%', delay: '0.2s', dur: '2.5s' }
    ]
    positions.forEach(function(pos, i) {
        var el = document.createElement('span')
        el.className = 'holiday-particle'
        el.textContent = list[i % list.length]
        el.style.cssText = 'top:' + pos.top + ';left:' + pos.left + ';animation-delay:' + pos.delay + ';animation-duration:' + pos.dur
        container.appendChild(el)
    })
}

function apply(params) {
    var theme = params.theme
    var holiday = params.holiday
    
    if (!holiday) return false
    currentHoliday = holiday
    currentHoliday.theme = theme
    
    var styleOpt = params && params.style !== undefined ? params.style : '3'
    if (styleOpt == 0) {
        reset()
        return false // Вимкнено
    }
    
    injectBaseCSS()

    var iconEl = getIconElement()
    if (!iconEl) return false

    // Очищаємо попередні класи
    iconEl.className = 'head__action head__holiday-icon selector'
    iconEl.innerHTML = ''
    
    // Встановлюємо CSS змінні
    var cHex = theme.color || '#FFD700'
    var rgb = hexToRgb(cHex)
    iconEl.style.setProperty('--hc', cHex)
    iconEl.style.setProperty('--hg', 'rgba(' + rgb + ',0.55)')
    iconEl.style.setProperty('--hg2', 'rgba(' + rgb + ',0.15)')
    iconEl.style.setProperty('--hg3', 'rgba(' + rgb + ',0.08)')
    
    // Додаємо класи
    iconEl.classList.add('style-' + styleOpt)
    
    // Збірка вмісту
    var symEl = document.createElement('span')
    symEl.className = 'holiday-symbol'
    symEl.textContent = theme.symbol || '✨'
    iconEl.appendChild(symEl)
    
    if (styleOpt == 2) {
        var txtEl = document.createElement('span')
        txtEl.className = 'holiday-text'
        txtEl.textContent = holiday.localName || holiday.name
        iconEl.appendChild(txtEl)
    }
    
    if (styleOpt == 3) {
        buildParticles(iconEl, theme.particles || [theme.symbol, '✨', '⭐'])
    }
    
    ACTIVE = true
    return true
}

function reset() {
    var iconEl = document.querySelector('.' + ICON_CLASS)
    if (iconEl) {
        iconEl.remove()
    }
    ACTIVE = false
    currentHoliday = null
    
    // Очистимо старі стилі на логотипі, якщо вони залишились від минулих версій
    var logoEl = document.querySelector('.head__logo-icon')
    if (logoEl) {
        logoEl.classList.remove('holiday-active', 'holiday-preactive', 'anim-pulse', 'anim-float', 'anim-sparkle', 'glow-visible')
        logoEl.style.boxShadow = ''
        logoEl.style.borderRadius = ''
        var imgEl = logoEl.querySelector('img')
        if (imgEl) imgEl.style.filter = ''
        var oldOverlay = logoEl.querySelector('.holiday-logo-overlay')
        if (oldOverlay) oldOverlay.remove()
    }
}

function showNotification() {
    if (!currentHoliday || !Bell) return
    
    var h = currentHoliday
    
    var symbolHtml = '<span style="font-size: 1.5em; filter: drop-shadow(0 0 5px ' + (h.theme.color || '#FFD700') + '); line-height: 1;">' + (h.theme.symbol || '✨') + '</span>'

    Bell.push({
        from: h.localName || h.name,
        text: h.date,
        icon: symbolHtml,
        time: 5000
    })
}

function isActive() {
    return ACTIVE
}

export default {
    apply: apply,
    reset: reset,
    isActive: isActive,
    injectBaseCSS: injectBaseCSS
}
