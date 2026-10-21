import Platform from '../../core/platform'
import Utils from '../../utils/utils'
import pcAgent from './pc-agent'

// Platform.pc() — поруч із Platform.tv() і Platform.desktop() ядра. Той самий об'єкт,
// що й Lampa.Platform, тож доступно і нам, і плагінам. Кликати після Platform.init.
//
// Усі умови разом: ядро не впізнало тут ТВ чи іншу платформу (Platform.init пише
// 'webos', 'tizen', 'philips', 'android'… — ПК лише 'browser', 'nw', 'electron' або
// невідома ''), рядок схожий на ПК, сенсора немає, основний пристрій вводу — миша.
// ТВ-браузер із пультом останнього не повідомляє.
function pc(){
    let known = Platform.get()

    if(known && !Platform.is('browser') && !Platform.desktop()) {
        return false
    }

    if(Platform.tv() || !pcAgent(navigator.userAgent, navigator.platform) || Utils.isTouchDevice()) {
        return false
    }

    return Boolean(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches)
}

Platform.pc = pc
