import SettingsApi from '../../../interaction/settings/api'
import Settings from '../../../interaction/settings/settings' // eslint-disable-line no-unused-vars
import Lang from '../../../core/lang'
import Storage from '../../../core/storage/storage'
import Noty from '../../../interaction/noty'
import Input from '../../../interaction/settings/input'
import Select from '../../../interaction/select'
import Controller from '../../../core/controller'
import Auth from './auth'
import Head from './head'
import Profiles from './profiles'
import SettingsSync from './settings-sync'

var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 540" width="490" height="540" role="img" aria-label="Play logo"><path fill="currentColor" fill-rule="evenodd" d="M0 60V480A60 60 0 0 0 89.6 532.2L459.6 322.2A60 60 0 0 0 459.6 217.8L89.6 7.8A60 60 0 0 0 0 60ZM118 185V360A32 32 0 0 0 166.2 387.6L316.2 299.6A32 32 0 0 0 316.1 244.3L166.1 157.3A32 32 0 0 0 118 185Z" /></svg>'

Lang.add({
    nuvio_name: {uk: 'Nuvio', en: 'Nuvio', be: 'Nuvio', zh: 'Nuvio', pt: 'Nuvio', bg: 'Nuvio', he: 'Nuvio', cs: 'Nuvio', ro: 'Nuvio', fr: 'Nuvio', pl: 'Nuvio', ru: 'Nuvio'},
    nuvio_enable: {uk: 'Увімкнути', en: 'Enable', be: 'Уключыць', zh: '启用', pt: 'Ativar', bg: 'Включване', he: 'הפעל', cs: 'Zapnout', ro: 'Activează', fr: 'Activer', pl: 'Włącz', ru: 'Включить'},
    nuvio_enable_descr: {uk: 'Синхронізація переглядів з Nuvio', en: 'Sync watch state with Nuvio', be: 'Сінхранізацыя праглядаў з Nuvio', zh: '与 Nuvio 同步观看状态', pt: 'Sincronizar com Nuvio', bg: 'Синхронизиране с Nuvio', he: 'סנכרון עם Nuvio', cs: 'Synchronizovat s Nuvio', ro: 'Sincronizează cu Nuvio', fr: 'Synchroniser avec Nuvio', pl: 'Synchronizuj z Nuvio', ru: 'Синхронизация с Nuvio'},
    nuvio_mode: {uk: 'Режим', en: 'Mode', be: 'Рэжым', zh: '模式', pt: 'Modo', bg: 'Режим', he: 'מצב', cs: 'Režim', ro: 'Mod', fr: 'Mode', pl: 'Tryb', ru: 'Режим'},
    nuvio_mode_cloud: {uk: 'Публічний (Nuvio Cloud)', en: 'Public (Nuvio Cloud)', ru: 'Публичный (Nuvio Cloud)', 'be': 'Публічны (Nuvio Cloud)', 'zh': '公共 (Nuvio Cloud)', 'pt': 'Público (Nuvio Cloud)', 'bg': 'Публичен (Nuvio Cloud)', 'he': 'ציבורי (Nuvio Cloud)', 'cs': 'Veřejný (Nuvio Cloud)', 'ro': 'Public (Nuvio Cloud)', 'fr': 'Public (Nuvio Cloud)', 'pl': 'Publiczny (Nuvio Cloud)'},
    nuvio_mode_selfhost: {uk: 'Власний сервер', en: 'Self-host', ru: 'Собственный сервер', 'be': 'Уласны сервер', 'zh': '自托管', 'pt': 'Servidor próprio', 'bg': 'Собствен сървър', 'he': 'שרת עצמי', 'cs': 'Vlastní server', 'ro': 'Server propriu', 'fr': 'Serveur propre', 'pl': 'Własny serwer'},
    nuvio_url: {uk: 'Адреса сервера', en: 'Server URL', ru: 'Адрес сервера', 'be': 'Адрас сервера', 'zh': '服务器地址', 'pt': 'URL do servidor', 'bg': 'Адрес на сървъра', 'he': 'כתובת שרת', 'cs': 'Adresa serveru', 'ro': 'Adresa serverului', 'fr': 'Adresse du serveur', 'pl': 'Adres serwera'},
    nuvio_url_warn: {uk: 'Не підключайтесь до неофіційних публічних бекендів', en: 'Do not use unofficial public backends', ru: 'Не используйте неофициальные публичные бэкенды', 'be': 'Не падключайцеся да неафіцыйных публічных бэкэндаў', 'zh': '请勿使用非官方公共后端', 'pt': 'Não use backends públicos não oficiais', 'bg': 'Не използвайте неофициални публични бекенди', 'he': 'אין להשתמש בבקאנד ציבורי לא רשמי', 'cs': 'Nepoužívejte neoficiální veřejné backendy', 'ro': 'Nu folosi backenduri publice neoficiale', 'fr': 'Ne pas utiliser de backends publics non officiels', 'pl': 'Nie używaj nieoficjalnych publicznych backendów'},
    nuvio_anon_key: {uk: 'Publishable ключ', en: 'Publishable key', be: 'Publishable ключ', zh: 'Publishable 密钥', pt: 'Chave publishable', bg: 'Publishable ключ', he: 'מפתח publishable', cs: 'Publishable klíč', ro: 'Cheie publishable', fr: 'Clé publishable', pl: 'Klucz publishable', ru: 'Publishable ключ'},
    nuvio_anon_key_descr: {uk: 'З /.well-known/nuvio або адмінки self-host. Cloud підставляється сам.', en: 'From /.well-known/nuvio or self-host admin. Cloud is built-in.', be: 'З /.well-known/nuvio або адмінкі self-host. Cloud падстаўляецца сам.', zh: '来自 /.well-known/nuvio 或 self-host 管理。Cloud 内置。', pt: 'De /.well-known/nuvio ou admin self-host. Cloud embutido.', bg: 'От /.well-known/nuvio или self-host админ. Cloud е вграден.', he: 'מ-/.well-known/nuvio או ניהול self-host. Cloud מובנה.', cs: 'Z /.well-known/nuvio nebo administrace self-host. Cloud je vestavěný.', ro: 'Din /.well-known/nuvio sau admin self-host. Cloud e încorporat.', fr: 'Depuis /.well-known/nuvio ou admin self-host. Cloud intégré.', pl: 'Z /.well-known/nuvio lub panelu self-host. Cloud wbudowany.', ru: 'Из /.well-known/nuvio или админки self-host. Cloud встроен.'},
    nuvio_password: {uk: 'Пароль', en: 'Password', ru: 'Пароль'},
    nuvio_login: {uk: 'Увійти', en: 'Log in', ru: 'Войти', 'be': 'Увайсці', 'zh': '登录', 'pt': 'Entrar', 'bg': 'Вход', 'he': 'התחבר', 'cs': 'Přihlásit', 'ro': 'Autentificare', 'fr': 'Se connecter', 'pl': 'Zaloguj'},
    nuvio_logout: {uk: 'Вийти', en: 'Log out', ru: 'Выйти', 'be': 'Выйсці', 'zh': '退出', 'pt': 'Sair', 'bg': 'Изход', 'he': 'התנתק', 'cs': 'Odhlásit', 'ro': 'Deconectare', 'fr': 'Se déconnecter', 'pl': 'Wyloguj'},
    nuvio_profile: {uk: 'Nuvio-профіль', en: 'Nuvio profile', ru: 'Nuvio-профиль', 'be': 'Профіль Nuvio', 'zh': 'Nuvio 档案', 'pt': 'Perfil Nuvio', 'bg': 'Профил Nuvio', 'he': 'פרופיל Nuvio', 'cs': 'Profil Nuvio', 'fr': 'Profil Nuvio', 'pl': 'Profil Nuvio'},
    nuvio_status: {uk: 'Статус', en: 'Status', ru: 'Статус', 'be': 'Статус', 'zh': '状态', 'pt': 'Estado', 'bg': 'Статус', 'he': 'סטטוס', 'cs': 'Stav', 'ro': 'Stare', 'fr': 'Statut', 'pl': 'Status'},
    nuvio_pin: {uk: 'PIN профілю', en: 'Profile PIN', ru: 'PIN профиля'},
    nuvio_set_sync: {uk: 'Налаштування', en: 'Settings', ru: 'Настройки', 'be': 'Налады', 'zh': '设置', 'pt': 'Configurações', 'bg': 'Настройки', 'he': 'הגדרות', 'cs': 'Nastavení', 'fr': 'Paramètres', 'pl': 'Ustawienia'},
    nuvio_set_sync_export: {uk: 'Експорт налаштувань', en: 'Export settings', ru: 'Экспорт настроек', 'be': 'Экспарт налад', 'zh': '导出设置', 'pt': 'Exportar configurações', 'bg': 'Експорт на настройки', 'he': 'ייצוא הגדרות', 'cs': 'Exportovat nastavení', 'fr': 'Exporter les paramètres', 'pl': 'Eksportuj ustawienia'},
    nuvio_set_sync_import: {uk: 'Імпорт налаштувань', en: 'Import settings', ru: 'Импорт настроек', 'be': 'Імпарт налад', 'zh': '导入设置', 'pt': 'Importar configurações', 'bg': 'Импорт на настройки', 'he': 'ייבוא הגדרות', 'cs': 'Importovat nastavení', 'fr': 'Importer les paramètres', 'pl': 'Importuj ustawienia'},
    nuvio_set_sync_conflict: {uk: 'Налаштування змінено на іншому пристрої — спочатку імпорт', en: 'Settings changed on another device — import first', ru: 'Настройки изменены на другом устройстве — сначала импорт', 'be': 'Налады зменены на іншай прыладзе — спачатку імпарт', 'zh': '设置已在其他设备上更改 — 请先导入', 'pt': 'Configurações alteradas em outro dispositivo — importe primeiro', 'bg': 'Настройките са променени на друго устройство — първо импортирайте', 'he': 'ההגדרות השתנו במכשיר אחר — ייבא תחילה', 'cs': 'Nastavení bylo změněno na jiném zařízení — nejprve importujte', 'fr': 'Paramètres modifiés sur un autre appareil — importez d’abord', 'pl': 'Ustawienia zmieniono na innym urządzeniu — najpierw zaimportuj'}
})

var STATUS = 'off'

function setStatus(s){
    // Settings.update перебудовує відкриті налаштування — лише коли статус справді змінився
    if(STATUS == s){
        return
    }
    STATUS = s
    try { Storage.set('nuvio_status', s, true) } catch(e){}
    if(window.Lampa && Lampa.Settings && Lampa.Settings.update) { try { Lampa.Settings.update() } catch(e){} }
}

function statusText(){
    return STATUS
}

function init(){
    try {
        SettingsApi.addComponent({component: 'nuvio', icon: ICON, name: 'Nuvio', after: 'siaivo'})
    } catch(e){}
    // Пункт має бути другим одразу після Siaivo (патерн з siaivo.js):
    // при кожному відкритті головного меню переставляємо Nuvio за Siaivo
    try {
        Settings.listener.follow('open', function(e){
            if(!e || e.name !== 'main' || !e.body) return
            var el = e.body.find('[data-component="nuvio"]')
            var anchor = e.body.find('[data-component="siaivo"]')
            if(el.length && anchor.length && el.prev()[0] !== anchor[0]) anchor.after(el.detach())
        })
    } catch(e){}

    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_enable', type: 'trigger', default: false}, field: {name: '', description: ''}, onRender: render('nuvio_enable', 'nuvio_enable_descr')})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_mode', type: 'select', values: {'cloud': 'cloud', 'selfhost': 'selfhost'}, default: 'cloud'}, field: {name: '', description: ''}, onRender: renderMode()})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_backend_url', type: 'input', values: '', default: ''}, field: {name: '', description: ''}, onRender: renderSelfhost('nuvio_url', 'nuvio_url_warn')})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_anon_key', type: 'input', values: '', default: ''}, field: {name: '', description: ''}, onRender: renderSelfhost('nuvio_anon_key', 'nuvio_anon_key_descr')})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_email', type: 'input', values: '', default: ''}, field: {name: '', description: ''}, onRender: renderRaw('nuvio_email', '')})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_login_btn', type: 'button'}, field: {name: ''}, onRender: loginBtn()})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_profile_sel', type: 'button'}, field: {name: ''}, onRender: profileBtn()})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_set_sync_btn', type: 'button'}, field: {name: ''}, onRender: settingsSyncBtn()})
    SettingsApi.addParam({component: 'nuvio', param: {name: 'nuvio_status_info', type: 'button'}, field: {name: ''}, onRender: statusBtn()})
}

function render(nameKey, descrKey){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate(nameKey))
            item.find('.settings-param__descr').text(Lang.translate(descrKey))
        } catch(e){}
    }
}

function renderRaw(name, descr){
    return function(item){
        try {
            item.find('.settings-param__name').text(descr ? Lang.translate(descr) : name)
        } catch(e){}
    }
}

// Поля self-host: видимі тільки в режимі selfhost (data-parent на mode, як у tmdb_proxy)
function renderSelfhost(nameKey, descrKey){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate(nameKey))
            item.find('.settings-param__descr').text(Lang.translate(descrKey))
            item.attr('data-parent', 'selfhost')
            item.attr('data-visible-value', 'selfhost')
            toggleSelfhost(item)
        } catch(e){}
    }
}

function toggleSelfhost(item){
    try {
        var mode = 'cloud'
        try { mode = Storage.get('nuvio_mode', 'cloud') + '' } catch(e){}
        var scope = item.parent()
        var trigger = (scope && scope.length ? scope.find('[data-name="nuvio_mode"]') : null)
        if(trigger && trigger.length){
            if(!trigger.attr('data-children')) trigger.attr('data-children', 'selfhost')
        }
        item.toggleClass('hide', mode !== 'selfhost')
    } catch(e){}
}

function renderMode(){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate('nuvio_mode'))
            var v = Storage.get('nuvio_mode', 'cloud')
            item.find('.settings-param__value').text(v == 'selfhost' ? Lang.translate('nuvio_mode_selfhost') : Lang.translate('nuvio_mode_cloud'))
        } catch(e){}
    }
}

function loginBtn(){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate('nuvio_login'))
            item.on('hover:enter', function(){
                var email = Storage.get('nuvio_email', '')
                Input.edit({title: Lang.translate('nuvio_password'), free: true, nosave: true, password: true, value: ''}, function(pass){
                    if(!email || !pass) return
                    setStatus('connecting')
                    Auth.login(email, pass).then(function(){
                        setStatus('ok')
                    }).catch(function(xhr){
                        setStatus('error')
                        Noty.show('Nuvio: ' + (xhr && xhr.status ? xhr.status : 'error'))
                    })
                })
            })
        } catch(e){}
    }
}

// Перемикач у налаштуваннях делегує єдиному механізму Head.select
function profileBtn(){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate('nuvio_profile') + ': ' + (Profiles.resolveActive() || '—'))
            item.on('hover:enter', function(){
                Controller.toggle('settings')
                Head.select(function(){ Controller.toggle('settings') })
            })
        } catch(e){}
    }
}

// Експорт/імпорт налаштувань: Select-меню за зразком Cub backup.js.
// Кнопки активні лише коли canRun (увімкнено + профіль + Cub-sync не активний),
// інакше мовчимо в консоль — як Cub при no access.
function settingsSyncBtn(){
    return function(item){
        try {
            item.find('.settings-param__name').text(Lang.translate('nuvio_set_sync'))
            item.on('hover:enter', function(){
                if(!SettingsSync.canRun()){ try { console.warn('Nuvio settings-sync', 'not available') } catch(e){} return }
                Select.show({
                    title: Lang.translate('nuvio_set_sync'),
                    nomark: true,
                    items: [
                        {title: Lang.translate('nuvio_set_sync_export'), export: true, selected: true},
                        {title: Lang.translate('nuvio_set_sync_import'), import: true},
                        {title: Lang.translate('cancel')}
                    ],
                    onSelect: function(a){
                        if(a.export) doExport()
                        else if(a.import) doImport()
                    },
                    onBack: function(){}
                })
            })
        } catch(e){}
    }
}

function doExport(){
    var profile = Profiles.resolveActive()
    setStatus('syncing')
    SettingsSync.push(profile).then(function(r){
        setStatus('ok')
        if(r == 'conflict') Noty.show(Lang.translate('nuvio_set_sync_conflict'))
        else Noty.show(Lang.translate('account_export_secuses'))
    }).catch(function(xhr){
        setStatus(xhr && xhr.status == 401 ? 'error' : 'offline')
        Noty.show(Lang.translate('account_export_fail_' + ((xhr && xhr.status) || 500)))
    })
}

function doImport(){
    var profile = Profiles.resolveActive()
    setStatus('syncing')
    SettingsSync.pull(profile).then(function(remote){
        if(!remote || !remote.settings_json){ setStatus('ok'); Noty.show(Lang.translate('nodata')); return }
        Select.show({
            title: Lang.translate('sure'),
            nomark: true,
            items: [
                {title: Lang.translate('confirm'), confirm: true, selected: true},
                {title: Lang.translate('cancel')}
            ],
            onSelect: function(a){
                if(!a.confirm){ setStatus('ok'); return }
                SettingsSync.apply(remote.settings_json).then(function(r){
                    Noty.show(Lang.translate('account_import_secuses') + ' (' + r.imported + '/' + r.errors + ') - ' + Lang.translate('account_reload_after'))
                    setStatus('ok')
                    setTimeout(function(){ try { window.location.reload() } catch(e){} }, 5000)
                }).catch(function(){
                    setStatus('offline')
                    Noty.show(Lang.translate('account_import_fail'))
                })
            },
            onBack: function(){ setStatus('ok') }
        })
    }).catch(function(xhr){
        setStatus(xhr && xhr.status == 401 ? 'error' : 'offline')
        Noty.show(Lang.translate('account_import_fail'))
    })
}

function statusBtn(){
    return function(item){
        try { item.find('.settings-param__name').text(Lang.translate('nuvio_status') + ': ' + statusText()) } catch(e){}
    }
}

export default {init: init, setStatus: setStatus, statusText: statusText, STATUS: function(){ return STATUS }}
