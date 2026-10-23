import Select from '../../interaction/select'
import Lang from '../../core/lang'

// Список джерел на картці: ядро на Android додає в кінець «Додати джерело», що веде в штатні
// Розширення, і заради нього показує список навіть з одним джерелом (buttons.js:56). Пункт
// прибираємо, а одне джерело, що лишилось, запускаємо одразу - як ядро без плагінів.
let select_show = Select.show

Select.show = function(params){
    let is_sources = params && params.title === Lang.translate('settings_rest_source') && Array.isArray(params.items)

    if (is_sources) {
        params.items = params.items.filter(item => !item.add_source)

        if (params.items.length == 1 && params.items[0].btn) {
            params.items[0].btn.trigger('hover:enter')

            return
        }
    }

    return select_show.apply(this, arguments)
}
