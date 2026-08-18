import Settings from '../../interaction/settings/api'
import Logs from '../../interaction/logs'
import Console from '../../interaction/console'
import Modal from '../../interaction/modal'
import Noty from '../../interaction/noty'
import Controller from '../../core/controller'
import Lang from '../../core/lang'
import Utils from '../../utils/utils'

// termbin.com слухає лише сирий TCP (nc termbin.com 9999) — з WebView недоступний,
// тому беремо найближчий HTTP-пастбін з CORS і коротким посиланням під QR.
const PASTE_URL   = 'https://dpaste.com/api/v2/'
const EXPIRY_DAYS = 30
const MAX_CHARS   = 200000

let loader
let waite

Lang.add({
    logs_export_qr_hint: {
        uk: 'Відскануйте QR-код або відкрийте посилання',
        en: 'Scan the QR code or open the link',
        be: 'Адсканіруйце QR-код або адкрыйце пасылку',
        zh: '扫描二维码或打开链接',
        pt: 'Escaneie o código QR ou abra o link',
        bg: 'Сканирайте QR кода или отворете връзката',
        he: 'סרקו את קוד ה-QR או פתחו את הקישור',
        cs: 'Naskenujte QR kód nebo otevřete odkaz',
        ro: 'Scanați codul QR sau deschideți linkul',
        fr: 'Scannez le QR code ou ouvrez le lien',
        pl: 'Zeskanuj kod QR lub otwórz link',
        ru: 'Отсканируйте QR-код или откройте ссылку'
    },
    logs_export_empty: {
        uk: 'Логи порожні',
        en: 'Logs are empty',
        be: 'Логі пустыя',
        zh: '日志为空',
        pt: 'Os logs estão vazios',
        bg: 'Логовете са празни',
        he: 'הלוגים ריקים',
        cs: 'Logy jsou prázdné',
        ro: 'Jurnalele sunt goale',
        fr: 'Les journaux sont vides',
        pl: 'Logi są puste',
        ru: 'Логи пустые'
    }
})

/**
 * Зліпити буфери консолі в один текст: старіші рядки вгорі, дублі прибрані
 * @param {{name:[{time:number, message:string|[]}]}} data
 * @returns {string}
 */
function buildText(data){
    let seen  = {}
    let lines = []

    for(let name in data){
        data[name].forEach(item=>{
            let message = [].concat(item.message).join(' ')
            let key     = item.time + '|' + message

            if(seen[key]) return

            seen[key] = true

            lines.push({
                time: item.time,
                text: new Date(item.time).toISOString().replace('T',' ').substr(0,23) + ' [' + name + '] ' + message
            })
        })
    }

    lines.sort((a,b)=> a.time - b.time)

    // хвіст важливіший за початок — ріжемо зверху
    return lines.map(line=> line.text).join('\n').slice(-MAX_CHARS)
}

function push(content){
    return $.ajax({
        url: PASTE_URL,
        type: 'POST',
        dataType: 'text',
        timeout: 20000,
        data: {
            content,
            syntax: 'text',
            title: 'lampa logs',
            expiry_days: EXPIRY_DAYS
        }
    })
}

function closeModal(){
    Modal.close()

    Controller.toggle('settings_component')
}

function showQr(url){
    let html = $('<div class="about" style="text-align: center">'
        + '<div class="logs-qr" style="display: inline-block; background: #fff; padding: 0.6em; border-radius: 0.6em; line-height: 0"></div>'
        + '<div style="margin-top: 1em; opacity: 0.7">' + Lang.translate('logs_export_qr_hint') + '</div>'
        + '<div style="margin-top: 0.5em; word-break: break-all">' + url + '</div>'
        + '</div>')

    Utils.qrcode(url, html.find('.logs-qr'), ()=> html.find('.logs-qr').remove())

    html.find('.logs-qr svg').css({width: '14em', height: '14em'})

    Modal.open({
        title: '',
        size: 'small',
        html,
        buttons: [
            {
                name: Lang.translate('copy_link_buffer'),
                onSelect: ()=> Utils.copyTextToClipboard(url, ()=> Noty.show(Lang.translate('copy_secuses')))
            }
        ],
        onBack: closeModal
    })
}

function open(){
    if(waite) return

    let content = buildText(Console.export())

    if(!content) return Noty.show(Lang.translate('logs_export_empty'))

    waite = true

    if(loader) loader.removeClass('hide')

    push(content).then((response)=>{
        let url = (response || '').trim()

        if(url.indexOf('http') !== 0) return Noty.show(Lang.translate('account_export_fail'))

        showQr(url)
    }, ()=>{
        Noty.show(Lang.translate('account_export_fail'))
    }).always(()=>{
        waite = false

        if(loader) loader.addClass('hide')
    })
}

function patch(){
    let params = Settings.allParams()['more'] || []
    let item   = params.filter(param=> param.param && param.param.name == 'export')[0]

    // кнопка "Термінал" (віддалений eval через сокет) нам не потрібна
    let terminal = params.filter(param=> param.param && param.param.name == 'terminal')[0]

    if(terminal) params.splice(params.indexOf(terminal), 1)

    if(!item) return console.warn('CustomLogs','export param not found')

    item.onChange = open
    item.onRender = (elem)=>{
        loader = $('<div class="broadcast__scan hide" style="margin: 1em 0 0 0"><div></div></div>')

        elem.append(loader)
    }
}

let logs_init = Logs.init

Logs.init = function(){
    logs_init.apply(this, arguments)

    patch()
}

export {buildText}
