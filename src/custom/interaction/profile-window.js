/**
 * Custom Profile Window — Matrix-style pill choice
 *
 * 1. Ховає оригінальний .open--profile (Лампа має надто багато логіки на ньому)
 * 2. Додає власну кнопку в кінець head__actions — ідентичний зовнішній вигляд
 * 3. По кліку — відкриває модалку з profile.jpg та двома прозорими кнопками під ним
 *
 * Lifecycle:
 *   injectStyles() — CSS одразу в head
 *   init() чекає Lampa.Listener → 'app ready'
 *   overrideProfileHandler() — ховає рідне, додає своє
 *   showCustomWindow() — модалка з зображенням + кнопки
 *   Кнопки ведуть до Settings.create('account') / Settings.create('kinobaza_settings')
 */

import Modal from '../../interaction/modal'
import Controller from '../../core/controller'
import Head from '../../interaction/head/head'
import Template from '../../interaction/template'
import Lang from '../../core/lang'
import Bell from '../../interaction/bell'

/* ================================================================
 * CSS injection
 * ================================================================ */
function injectStyles() {
    if (document.getElementById('custom-profile-window-style')) return

    var style = document.createElement('style')
    style.id = 'custom-profile-window-style'
    style.textContent =
        '.custom-profile-window{' +
            'text-align:center;' +
        '}' +
        '.custom-profile-window__image{' +
            'width:100%;' +
            'max-width:28em;' +
            'height:auto;' +
            'border-radius:1em;' +
            'margin:0 auto 2em;' +
            'display:block;' +
        '}' +
        '.custom-profile-window__pills{' +
            'display:flex;' +
            'justify-content:center;' +
            'gap:2.5em;' +
            'flex-wrap:wrap;' +
            'margin-top:0.5em;' +
        '}' +
        '.custom-profile-window__pill{' +
            'display:flex;' +
            'flex-direction:column;' +
            'align-items:center;' +
            'gap:0.8em;' +
            'padding:1.2em 2.5em;' +
            'border-radius:1em;' +
            'cursor:pointer;' +
            'transition:transform .2s,background .2s;' +
            'min-width:10em;' +
            'background:transparent;' +
            'border:none;' +
        '}' +
        '.custom-profile-window__pill:hover,' +
        '.custom-profile-window__pill.focus{' +
            'transform:scale(1.06);' +
            'background:rgba(255,255,255,0.06);' +
        '}' +
        '.custom-profile-window__pill-icon{' +
            'width:3.6em;' +
            'height:3.6em;' +
            'display:flex;' +
            'align-items:center;' +
            'justify-content:center;' +
        '}' +
        '.custom-profile-window__pill-icon svg{' +
            'width:100%;' +
            'height:100%;' +
        '}' +
        '.custom-profile-window__pill-label{' +
            'font-size:1.2em;' +
            'font-weight:600;' +
            'letter-spacing:0.04em;' +
            'color:rgba(255,255,255,0.9);' +
        '}'

    document.head.appendChild(style)
}

/* ================================================================ */

function init() {
    if (!window.Lampa) {
        setTimeout(init, 50)
        return
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            overrideProfileHandler()
        }
    })
}

/**
 * Ховає рідний .open--profile, додає свою кнопку в кінець head__actions.
 */
function overrideProfileHandler() {
    var $original = $('.open--profile')

    if (!$original.length) {
        setTimeout(overrideProfileHandler, 100)
        return
    }

    // 1. Ховаємо рідну кнопку
    $original.addClass('hide')

    // 2. Будуємо свою кнопку: ті самі класи, щоб CSS спрацював (padding, svg 2.4em, border-radius)
    var $btn = Template.elem('div', { class: 'head__action selector open--profile' })
    $btn.append(Template.js('icon_profile'))

    $btn.on('hover:enter', function () {
        if (!Lampa.Account.Permit.token) {
            showCustomWindow()
            return
        }

        // Якщо залогінений — оригінальна поведінка (вибір профілю)
        Lampa.Account.Profile.select(
            Lampa.Controller.toggle.bind(Lampa.Controller, 'head')
        )
    })

    // Додаємо перед .full--screen, як це робить оригінальний profile.js
    Head.render().find('.full--screen').before($btn)
}

/**
 * Показує модалку з profile.jpg та двома кнопками під ним.
 */
function showCustomWindow() {
    var enabled = Controller.enabled().name

    // cache-buster: шоб браузер не тримав стару версію profile.jpg
    var imgSrc = './img/profile.jpg?t=' + Date.now()

    var html = $(
        `<div class="custom-profile-window">
            <img class="custom-profile-window__image" src="${imgSrc}" alt="" />
            <div class="custom-profile-window__pills">
                <div class="custom-profile-window__pill selector" data-action="kinobaza">
                    <span class="custom-profile-window__pill-icon custom-profile-window__pill-icon--kinobaza">
                    <svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="933.333" height="933.333" viewBox="0 0 700 700">    <defs>        <linearGradient id="myGradient" gradientTransform="rotate(90)">            <stop offset="0%" stop-color="#005BBB"/>            <stop offset="50%" stop-color="#005BBB"/>            <stop offset="50%" stop-color="#FFD500"/>            <stop offset="100%" stop-color="#FFD500"/>        </linearGradient>    </defs>    <path fill="url('#myGradient')" d="M53 47.1c-15 1.5-25.4 6.6-37.2 18.1-4.5 4.4-10.5 14.4-13 21.6L.5 93.5v514l2.2 5.9c7.5 19.9 24.6 35 43.8 38.7 4.5.9 83.1 1.2 304 1.2 270.9 0 298.6-.2 304.8-1.7 11.4-2.7 22.3-9.4 30.4-18.6 3-3.5 9.5-13.5 10-15.5.1-.5 1.2-4.2 2.3-8 2-7 2-7.9 1.8-262l-.3-255-2.3-6.2c-7-18.7-22.5-32.9-41.3-37.9-6-1.6-26.2-1.7-301.4-1.8-162.2-.1-297.9.2-301.5.5zm73 48.5c2.5 1.2 5.9 3.7 7.6 5.5 5.8 6.4 6.3 8.9 6.4 37.7 0 16.4-.4 27.7-1.1 30.6-1.4 5.5-6.7 11.9-12.3 14.9-3.9 2.1-5.2 2.2-33.1 2.2-28.5 0-29.1 0-33.5-2.3-5.4-2.9-8.5-6.3-11.3-12.2-1.9-4.2-2-6.3-2-32 0-31 .4-33.1 7.7-40.3 6.1-5.8 8.8-6.2 39.6-6.2 25.8 0 27.8.2 32 2.1zm374 .2c5.4 2.9 8.5 6.3 11.3 12.2 2 4.4 2 5.6 2 102 0 95.4 0 97.6-2 102-2.5 5.8-8.6 11.6-13.7 13.3-3.4 1.1-29.2 1.3-148.6 1.2-132.1-.1-144.8-.3-148-1.8-6.9-3.3-12.4-9.8-13.6-16.2-1-5.2-1.1-187.2-.2-194.8 1.2-9 7.5-16.6 15.7-19 3.6-1.1 32.1-1.3 148.5-1.3l144.1.1 4.5 2.3zm139-.5c5.2 2.5 10.3 7.6 12.4 12.5 1.8 4 2 6.8 1.9 32.5 0 26.8-.1 28.4-2.1 32.4-1.2 2.3-3.8 5.8-5.9 7.8-6 5.8-9.9 6.4-40.8 6.1-25.3-.2-27.3-.3-31-2.3-4.2-2.2-8-5.9-11.1-10.8-1.7-2.6-1.9-5.5-2.2-30-.4-31 .1-35.2 5.4-41.4 7.1-8.2 9.9-8.8 43.4-8.6 22.9 0 27 .3 30 1.8zM126.6 235.8c5.6 2.9 10.9 9.3 12.3 14.8 1.5 6 1.4 54.8-.1 59.8-1.5 4.9-7.1 11.2-12.2 13.8-3.9 2.1-5.5 2.2-31.6 2.4-31 .1-34.4-.4-40.6-6.4-7.4-7.1-7.8-9.2-7.7-40.2 0-25.8.1-27.8 2.1-32.3 2.5-5.5 7.1-10.2 12.6-12.6 3.4-1.5 7.6-1.7 32.5-1.6 27.4.1 28.8.2 32.7 2.3zm512.4-.6c5 2.2 9.9 7.3 12.3 12.7 1.9 4.3 2.1 6.4 2 32.3v27.6l-2.7 5.6c-3 6-8.4 10.6-14.6 12.3-1.9.6-15.9.9-31 .8-25.9-.1-27.7-.2-31.5-2.2-5.5-2.9-10.1-8-11.9-13-1.9-5.4-2.3-53.6-.5-60.7 1.6-6.4 7.6-13 14-15.4 4.5-1.7 7.9-1.8 32.7-1.7 22.8.1 28.3.4 31.2 1.7zM126.5 375.7c4.2 2.2 8 5.9 11.1 10.8 1.7 2.6 1.9 5.5 2.2 30 .3 17.6 0 28.8-.8 32.1-1.3 6.1-6.3 12.5-12.4 15.6-3.9 2.1-5.3 2.2-33.1 2.2-32.1.1-33-.1-39.7-6.8-6.6-6.5-7.1-9.3-7.2-37.6-.1-14 .3-27.5.8-30 1.5-7.9 8.8-15.7 16.7-17.8 1.9-.4 15.8-.8 30.9-.7 25.9.1 27.7.2 31.5 2.2zm372.8-.3c5.2 2.6 9.6 7.2 12 12.6 1.9 4.3 2 7 2.1 98.5.1 51.7-.2 96.6-.6 99.9-1.2 9-7.5 16.5-16.1 19.1-5.4 1.6-285.9 1.9-292.1.3-9.2-2.3-16.1-10.1-17.3-19.4-1.4-10.3-.8-192.4.6-196.5 2.3-7 8.5-13.3 15.6-15.6 1.9-.6 55.8-.9 147.5-.9 139.6.1 144.6.2 148.3 2zm138.7-.6c8.4 3.7 13.7 10.4 14.8 18.8.9 7.4.8 49.5-.2 54.9-.9 4.3-4.7 10.2-9 13.6-5.2 4.1-9.6 4.6-38.6 4.5-26.2-.2-27.7-.3-31.6-2.4-5.1-2.6-10.7-8.9-12.2-13.8-1.5-5-1.6-53.8-.1-59.8 1.2-5 6.6-11.9 11-14.1 1.5-.9 4.5-1.9 6.6-2.3 5.7-1.3 56.3-.7 59.3.6zM126.5 515.7c4.1 2.2 8.8 6.8 11.5 11.3 2 3.3 2.8 56.1 1 62.7-1.5 5.3-6.9 11.7-12.4 14.6-3.9 2.1-5.2 2.2-33.1 2.2-26.5 0-29.3-.2-32.8-1.9-5.2-2.6-9.6-7.2-12-12.6-1.9-4.1-2-6.7-2-31.5 0-29 .4-32.4 5.1-38 3.3-3.9 8.1-7.1 12.3-8.2 1.9-.5 15.8-.9 30.9-.8 26 .1 27.7.2 31.5 2.2zm512.5-.5c5 2.2 9.9 7.3 12.3 12.7 1.9 4.3 2 6.5 2 32.1 0 25.3-.1 27.9-2 32-2.4 5.4-6.8 10-12 12.6-3.4 1.7-6.5 1.9-31.8 2-25.4.1-28.4-.1-32.5-1.8-5.1-2.2-9.2-5.7-12.3-10.8-2.1-3.3-2.2-4.8-2.5-31.5-.2-19.4 0-29.2.8-32.2 2.2-7.5 9.8-14.6 17.5-16.3 1.7-.3 15.2-.6 30-.5 22.1.1 27.6.4 30.5 1.7z"/></svg>
                    </span>
                    <span class="custom-profile-window__pill-label">KinoBaza</span>
                </div>
                <div class="custom-profile-window__pill selector" data-action="cub">
                    <span class="custom-profile-window__pill-icon custom-profile-window__pill-icon--cub">
                    <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.1309 6H35.8683L46.9996 24.9021H40.9652L17.0443 11.0914L14.1309 6Z" fill="white"/>
                    <path d="M31.7317 24.9021H24.9479L21.5059 18.887L31.7317 24.9021Z" fill="white"/>
                    <path d="M21.4844 31.3499L24.9479 25.3221H31.7317L21.4844 31.3499Z" fill="white"/>
                    <path d="M16.996 39.1611L40.9658 25.3221H47.0002L35.9739 44.3293H14.0264L16.996 39.1611Z" fill="white"/>
                    <path d="M3 25.1122L13.7112 6L16.7566 11.3294V38.8387L13.6062 44.3294L3 25.1122Z" fill="white"/>
                    <path d="M21.377 19.4153L24.6324 25.1122L21.377 30.7858V19.4153Z" fill="white"/>
                    </svg>
                    </span>
                    <span class="custom-profile-window__pill-label">Cub</span>
                </div>
            </div>
        </div>`
    )

    Modal.open({
        title: Lang.translate('account_none_title'),
        html: html,
        size: 'medium',
        onBack: function () {
            Modal.close()
            Controller.toggle(enabled)
        },
        onSelect: function (target) {
            var action = target.data('action')
            if (!action) return

            Modal.close()
            Controller.toggle(enabled)

            if (action === 'cub') {
                openCubSettings()
            } else if (action === 'kinobaza') {
                openKinoBazaSettings()
            }
        }
    })
}

/**
 * Відкриває налаштування акаунта (data-component="account").
 */
function openCubSettings() {
    Controller.toggle('settings')
    Lampa.Settings.create('account')
}

/**
 * Відкриває налаштування KinoBaza (data-component="kinobaza_settings").
 * Якщо плагін не встановлений — показує Bell.push.
 */
function openKinoBazaSettings() {
    if (window.plugin_kinobaza_ready === true) {
        Controller.toggle('settings')
        Lampa.Settings.create('kinobaza_settings')
    } else {
        Bell.push({
            text: 'Плагін КіноБаза не встановлений. Спочатку встановіть плагін KinoBaza через меню Розширення.',
            type: 'warning',
            time: 6000
        })
    }
}

// ———— Bootstrap ————
injectStyles()
init()
