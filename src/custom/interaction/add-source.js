import Select from '../../interaction/select'
import Extensions from '../../interaction/extensions/extensions'
import ParentalControl from '../../interaction/parental_control'
import Controller from '../../core/controller'
import Lang from '../../core/lang'
import Manifest from '../core/manifest'

// Список джерел на картці: ядро додає «Додати джерело» лише на Android і веде у штатні Розширення.
// Показуємо пункт на всіх платформах і відкриваємо наш Hub.
let select_show = Select.show

Select.show = function(params){
    let is_sources = params && params.title === Lang.translate('settings_rest_source') && window.lampa_settings.plugins_use

    if(is_sources) {
        if(!params.items.some(item=> item.add_source)) {
            params.items.push({
                title: Lang.translate('full_add_source'),
                template: 'selectbox_icon',
                icon: '<svg><use xlink:href="#sprite-plus"></use></svg>',
                add_source: true
            })
        }

        let on_select = params.onSelect

        params.onSelect = function(item){
            if(!item.add_source) {
                return on_select.apply(this, arguments)
            }

            Controller.toggle('content')

            ParentalControl.personal('extensions', ()=>{
                Extensions.show({
                    store: Manifest.storeUrl,
                    with_installed: false
                })
            }, false, true)
        }
    }

    return select_show.apply(this, arguments)
}
