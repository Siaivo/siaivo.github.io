// Чи схожий User-Agent на настільний ПК. Лише рядок, без середовища:
// ТВ, приставки, телефони й сенсор відсіює ядро (Platform.init / Platform.tv,
// Utils.isTouchDevice) — це перевіряє той, хто кличе.
//
// Вмикаємо за позитивними ознаками, а не «все, що не ТВ»: невідома ТВ-прошивка
// з 'linux' у рядку інакше пройшла б як ПК. Linux рахуємо лише з десктопною
// сесією X11 на x86 — ТВ і приставки здебільшого ARM/MIPS без X11. Під Wayland
// і Firefox, і Chromium однаково пишуть 'X11'.
export default function pcAgent(agent, platform){
    let ua = (agent || '').toLowerCase()
    let cpu = ua + ' ' + (platform || '').toLowerCase()

    if(ua.indexOf('windows nt') > -1 || ua.indexOf('macintosh') > -1 || /\bcros\b/.test(ua)) {
        return true
    }

    if(ua.indexOf('linux') < 0 || ua.indexOf('x11') < 0) {
        return false
    }

    return /x86_64|x86-64|amd64|i[3-6]86/.test(cpu)
}
