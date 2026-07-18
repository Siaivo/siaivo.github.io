import SettingsApi from '../../../interaction/settings/api'
import Settings from '../../../interaction/settings/settings'
import Template from '../../../interaction/template'
import Lang from '../../../core/lang'
import logoSrc from '../logo-icon'

// Глобальна реєстрація розділу "Siaivo" в налаштуваннях
SettingsApi.addComponent({
    component: 'siaivo',
    name: 'Siaivo',
    icon: '<img src="' + logoSrc + '" style="width:100%;height:100%;object-fit:contain" />'
});

// Template for feed settings sub-page (no top-level menu item)
Template.add('settings_feed', '<div></div>')

// Button in Siaivo → opens feed settings
SettingsApi.addParam({
    component: 'siaivo',
    param: { name: 'feed_open', type: 'button' },
    field: { name: '' },
    onRender: function (item) {
        item.find('.settings-param__name').text(Lang.translate('menu_feed'))
    },
    onChange: function () {
        Settings.create('feed')
    }
})

// Feed settings params
SettingsApi.addParam({
    component: 'feed',
    param: {
        name: 'feed_rating',
        type: 'select',
        values: { '5': '5+', '6': '6+', '7': '7+', '8': '8+', '9': '9+' },
        default: '8'
    },
    field: { name: 'Мінімальний рейтинг' }
})

SettingsApi.addParam({
    component: 'feed',
    param: {
        name: 'feed_year',
        type: 'input',
        values: '',
        default: '',
        placeholder: 'напр. 2026 або 2024-2026'
    },
    field: {
        name: 'Рік',
        description: 'Залиште порожнім для всіх років. Введіть число (2026) або діапазон (2024-2026)'
    }
})

// Динамічне позиціонування: якщо 'account' видалено (cub вирізаний),
// вставляємо компонент перед 'interface' замість 'account'
Settings.listener.follow('open', function(e) {
    if (e.name !== 'main') return

    var el = e.body.find('[data-component="siaivo"]')
    if (!el.length) return

    var target = window.lampa_settings && window.lampa_settings.account_use
        ? 'account'
        : 'interface'

    var targetEl = e.body.find('[data-component="' + target + '"]')
    if (targetEl.length && targetEl[0] !== el[0]) {
        targetEl.before(el.detach())
    }
})
