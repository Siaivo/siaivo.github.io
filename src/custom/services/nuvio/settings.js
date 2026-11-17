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

var ICON = '<svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18.5" cy="18.5" r="16" stroke="white" stroke-width="2.5"/><circle cx="18.5" cy="18.5" r="4" fill="white"/><path d="M18.5 6v4M18.5 27v4M6 18.5h4M27 18.5h4" stroke="white" stroke-width="2"/></svg>'

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
    nuvio_pin: {uk: 'PIN профілю', en: 'Profile PIN', ru: 'PIN профиля'}
})

var STATUS = 'off'

function setStatus(s){
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

function statusBtn(){
    return function(item){
        try { item.find('.settings-param__name').text(Lang.translate('nuvio_status') + ': ' + statusText()) } catch(e){}
    }
}

export default {init: init, setStatus: setStatus, statusText: statusText, STATUS: function(){ return STATUS }}
