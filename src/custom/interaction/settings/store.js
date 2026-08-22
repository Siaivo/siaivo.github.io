import SettingsApi from '../../../interaction/settings/api'
import Settings from '../../../interaction/settings/settings'
import Template from '../../../interaction/template'
import HubOverlay from '../../store/overlay'

/**
 * Реєстрація компонента «Hub» (магазин плагінів) в налаштуваннях Lampa.
 *
 * Створює data-component="hub" з кнопкою відкриття overlay.
 * Позиціонується після [data-component="plugins"].
 */

// --- HTML-шаблони (atham-шлях — не потребує змін у src/templates/) ---

Template.add('hub', `<div class="hub">
    <div class="hub__body"></div>
</div>`)

Template.add('hub_item', `<div class="hub__item selector layer--visible layer--render">
    <div class="hub__item-author"></div>
    <div class="hub__item-category"></div>
    <div class="hub__item-name"></div>
    <div class="hub__item-descr"></div>
    <div class="hub__item-footer">
        <div class="hub__item-included hide"></div>
        <div class="hub__item-proto hide">
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
        </div>
        <div class="hub__item-disabled hide">#{player_disabled}</div>
    </div>
</div>`)

// --- Реєстрація компонента ---

SettingsApi.addComponent({
    component: 'hub',
    name: 'Hub',
    icon: '<svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="33" height="33" rx="4" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/><circle cx="25" cy="12" r="3" fill="white"/><circle cx="12" cy="25" r="3" fill="white"/><circle cx="25" cy="25" r="3" fill="white"/><line x1="15" y1="12" x2="22" y2="12" stroke="white" stroke-width="2"/><line x1="12" y1="15" x2="12" y2="22" stroke="white" stroke-width="2"/><line x1="25" y1="15" x2="25" y2="22" stroke="white" stroke-width="2"/><line x1="15" y1="25" x2="22" y2="25" stroke="white" stroke-width="2"/></svg>'
})

SettingsApi.addParam({
    component: 'hub',
    param: { name: 'hub_open', type: 'button' },
    field: { name: '' },
    onRender: function (item) {
        item.find('.settings-param__name').text('Відкрити Hub')
    },
    onChange: function () {
        HubOverlay.show()
    }
})

// Позиціонуємо «Hub» одразу після «Плагіни»
Settings.listener.follow('open', function (e) {
    if (e.name !== 'main') return

    let el = e.body.find('[data-component="hub"]')
    if (!el.length) return

    let plugins = e.body.find('[data-component="plugins"]')
    if (plugins.length) {
        plugins.after(el.detach())
    }
})
