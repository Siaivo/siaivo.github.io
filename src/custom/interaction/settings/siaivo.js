import SettingsApi from '../../../interaction/settings/api'
import Settings from '../../../interaction/settings/settings'
import Template from '../../../interaction/template'
import Lang from '../../../core/lang'

// Глобальна реєстрація розділу "Siaivo" в налаштуваннях
SettingsApi.addComponent({
    component: 'siaivo',
    name: 'Siaivo',
    icon: '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMTAiIGhlaWdodD0iMTA0IiB2aWV3Qm94PSIwIDAgMTEwIDEwNCIgZmlsbD0ibm9uZSI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJ1YUZsYWcyIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMTA0IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzAwM2Y4YSIvPjxzdG9wIG9mZnNldD0iNDUlIiBzdG9wLWNvbG9yPSIjMDA1N0I3Ii8+PHN0b3Agb2Zmc2V0PSI1MiUiIHN0b3AtY29sb3I9IiNGRkQ3MDAiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNGRkE1MDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cGF0aCBkPSJNODEuNjc0NCAxMDMuMTFDOTguNTY4MiA5My43MjM0IDExMCA3NS42OTY3IDExMCA1NUMxMTAgMjQuNjI0MyA4NS4zNzU3IDAgNTUgMEMyNC42MjQzIDAgMCAyNC42MjQzIDAgNTVDMCA3NS42OTY3IDExLjQzMTggOTMuNzIzNCAyOC4zMjU1IDEwMy4xMUMxNC44ODY5IDk0LjM3MjQgNiA3OS4yMjQgNiA2MkM2IDM0LjkzOCAyNy45MzggMTMgNTUgMTNDODIuMDYyIDEzIDEwNCAzNC45MzggMTA0IDYyQzEwNCA3OS4yMjQgOTUuMTEzMSA5NC4zNzI1IDgxLjY3NDQgMTAzLjExWiIgZmlsbD0idXJsKCN1YUZsYWcyKSIvPjxwYXRoIGQ9Ik05Mi45NTQ2IDgwLjAwNzZDOTUuNTQ4NSA3NC41NTAxIDk3IDY4LjQ0NDYgOTcgNjJDOTcgMzguODA0IDc4LjE5NiAyMCA1NSAyMEMzMS44MDQgMjAgMTMgMzguODA0IDEzIDYyQzEzIDY4LjQ0NDYgMTQuNDUxNSA3NC41NTAxIDE3LjA0NTQgODAuMDA3NkMxNi4zNjE4IDc3LjExNjEgMTYgNzQuMTAwMyAxNiA3MUMxNiA0OS40NjA5IDMzLjQ2MDkgMzIgNTUgMzJDNzYuNTM5MSAzMiA5NCA0OS40NjA5IDk0IDcxQzk0IDc0LjEwMDMgOTMuNjM4MiA3Ny4xMTYxIDkyLjk1NDYgODAuMDA3NloiIGZpbGw9InVybCgjdWFGbGFnMikiLz48cGF0aCBkPSJNNTUgODlDNjkuMzU5NCA4OSA4MSA3Ny4zNTk0IDgxIDYzQzgxIDU3LjkyOTcgNzkuNTQ4NiA1My4xOTgzIDc3LjAzODcgNDkuMTk4N0M4Mi41NzkgNTQuNzk4OSA4NiA2Mi41IDg2IDcxQzg2IDg4LjEyMDggNzIuMTIwOCAxMDIgNTUgMTAyQzM3Ljg3OTIgMTAyIDI0IDg4LjEyMDggMjQgNzFDMjQgNjIuNSAyNy40MjEgNTQuNzk4OSAzMi45NjEzIDQ5LjE5ODdDMzAuNDUxNCA1My4xOTgzIDI5IDU3LjkyOTcgMjkgNjNDMjkgNzcuMzU5NCA0MC42NDA2IDg5IDU1IDg5WiIgZmlsbD0idXJsKCN1YUZsYWcyKSIvPjxwYXRoIGQ9Ik03MyA2M0M3MyA3Mi45NDExIDY0Ljk0MTEgODEgNTUgODFDNDUuMDU4OSA4MSAzNyA3Mi45NDExIDM3IDYzQzM3IDUzLjA1ODkgNDUuMDU4OSA0NSA1NSA0NUM2NC45NDExIDQ1IDczIDUzLjA1ODkgNzMgNjNaIiBmaWxsPSJ1cmwoI3VhRmxhZzIpIi8+PC9zdmc+" style="width:100%;height:100%;object-fit:contain" />'
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
