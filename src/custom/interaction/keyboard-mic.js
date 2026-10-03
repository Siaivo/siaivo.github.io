import Lang from '../../core/lang'
import Storage from '../../core/storage/storage'
import Platform from '../../core/platform'
import Android from '../../core/android'
import Controller from '../../core/controller'
import Noty from '../../interaction/noty'
import Search from '../../interaction/search/global'
import SettingsApi from '../../interaction/settings/api'

// Ядро показує мікрофон у простій клавіатурі лише при Platform.screen('tv')
// (interaction/keyboard/keyboard.js:190), тож на сенсорних пристроях його немає.
// Додаємо його через публічну подію пошуку 'open' — нічого з ядра не підміняємо.
// Розмітка й класи ті самі, що в ядрі, тож вигляд рідний.

Lang.add({
    keyboard_mic_force: {
        uk: 'Голосовий пошук на всіх пристроях',
        en: 'Voice search on all devices',
        be: 'Галасавы пошук на ўсіх прыладах',
        zh: '在所有设备上启用语音搜索',
        pt: 'Pesquisa por voz em todos os dispositivos',
        bg: 'Гласово търсене на всички устройства',
        he: 'חיפוש קולי בכל המכשירים',
        cs: 'Hlasové vyhledávání na všech zařízeních',
        ro: 'Căutare vocală pe toate dispozitivele',
        fr: 'Recherche vocale sur tous les appareils',
        pl: 'Wyszukiwanie głosowe na wszystkich urządzeniach',
        ru: 'Голосовой поиск на всех устройствах'
    },
    keyboard_mic_force_descr: {
        uk: 'Показувати мікрофон і там, де його типово немає (сенсорні пристрої)',
        en: 'Show the microphone where it is hidden by default (touch devices)',
        be: 'Паказваць мікрафон і там, дзе яго звычайна няма (сэнсарныя прылады)',
        zh: '在默认不显示麦克风的设备上也显示（触摸设备）',
        pt: 'Mostrar o microfone onde está oculto por padrão (dispositivos táteis)',
        bg: 'Показване на микрофона и там, където по подразбиране го няма (сензорни устройства)',
        he: 'הצגת המיקרופון גם היכן שהוא מוסתר כברירת מחדל (מכשירי מגע)',
        cs: 'Zobrazit mikrofon i tam, kde ve výchozím stavu chybí (dotyková zařízení)',
        ro: 'Afișează microfonul și acolo unde implicit lipsește (dispozitive tactile)',
        fr: 'Afficher le micro là où il est masqué par défaut (appareils tactiles)',
        pl: 'Pokazuj mikrofon także tam, gdzie domyślnie go nie ma (urządzenia dotykowe)',
        ru: 'Показывать микрофон и там, где его обычно нет (сенсорные устройства)'
    }
})

SettingsApi.addParam({
    component: 'more',
    param: {
        name: 'keyboard_mic_force',
        type: 'trigger',
        default: false
    },
    // назву/опис ставимо в onRender: addParams() вставляє їх у DOM без перекладу
    field: {name: '', description: ' '},
    onRender: function(item){
        item.find('.settings-param__name').text(Lang.translate('keyboard_mic_force'))
        item.find('.settings-param__descr').text(Lang.translate('keyboard_mic_force_descr'))
    }
})

// Те саме SVG, що в ядрі: назовні воно не виставлене.
const MIC_SVG = `<svg viewBox="0 0 24 31" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" width="14" height="23" rx="7" fill="currentColor"/>
    <path d="M3.39272 18.4429C3.08504 17.6737 2.21209 17.2996 1.44291 17.6073C0.673739 17.915 0.299615 18.7879 0.607285 19.5571L3.39272 18.4429ZM23.3927 19.5571C23.7004 18.7879 23.3263 17.915 22.5571 17.6073C21.7879 17.2996 20.915 17.6737 20.6073 18.4429L23.3927 19.5571ZM0.607285 19.5571C2.85606 25.179 7.44515 27.5 12 27.5V24.5C8.55485 24.5 5.14394 22.821 3.39272 18.4429L0.607285 19.5571ZM12 27.5C16.5549 27.5 21.1439 25.179 23.3927 19.5571L20.6073 18.4429C18.8561 22.821 15.4451 24.5 12 24.5V27.5Z" fill="currentColor"/>
    <rect x="10" y="25" width="4" height="6" rx="2" fill="currentColor"/>
</svg>`

const LANG_CODES = {uk: 'uk-UA', ru: 'ru-RU', be: 'be-BY', en: 'en-US'}

// Той самий порядок, що в ядрі: на Android — нативний ввід застосунку, інакше Web Speech.
function listen(mic, put){
    if(Platform.is('android')){
        Android.voiceStart()

        window.voiceResult = put

        return
    }

    let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if(!SpeechRecognition) return Noty.show(Lang.translate('keyboard_nomic'))

    let lang = Storage.get('language', 'uk')
    let recognition = new SpeechRecognition()

    recognition.lang     = LANG_CODES[lang] || lang
    recognition.onstart  = () => { mic.addClass('record'); Noty.show(Lang.translate('keyboard_listen')) }
    recognition.onend    = () => mic.removeClass('record')
    recognition.onresult = (e) => put(e.results[e.resultIndex][0].transcript)
    recognition.onerror  = (e) => { if(e.error == 'not-allowed') Noty.show(Lang.translate('keyboard_nomic')) }

    recognition.start()
}

// До 'open' клавіатура пошуку вже створена й зібрана в колекцію (search/global.js:open).
Search.listener.follow('open', () => {
    let keyboard = document.querySelector('.search__keypad .simple-keyboard')
    let input    = keyboard && keyboard.querySelector('.simple-keyboard-input')

    // Без простої клавіатури (у lampa є своя клавіша {MIC}) або коли ядро вже поставило мікрофон.
    if(!Storage.field('keyboard_mic_force') || !input || keyboard.querySelector('.simple-keyboard-mic')) return

    let mic = $('<div class="selector simple-keyboard-mic">' + MIC_SVG + '</div>')

    // Подія input піднімає рідний обробник клавіатури (keyboard.js:103) -> 'change' -> пошук.
    let put = (text) => {
        input.value = text
        input.dispatchEvent(new Event('input'))
    }

    mic.on('hover:enter', () => listen(mic, put))

    keyboard.classList.add('simple-keyboard--with-mic')
    keyboard.insertBefore(mic[0], input)

    Controller.collectionAppend(mic)
})
