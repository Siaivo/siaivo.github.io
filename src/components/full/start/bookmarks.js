import Template from "../../../interaction/template"
import Controller from '../../../core/controller'
import Select from '../../../interaction/select'
import Favorite from '../../../core/favorite'
import Lang from '../../../core/lang'

export default {
    onCreate: function(){
        this.html.find('.button--book').on('hover:enter',()=>{
            let status = Favorite.check(this.card)
            let marks  = ['look', 'viewed', 'scheduled', 'continued', 'thrown']

            let label = (a)=>{
                Favorite.toggle(a.type, this.card)

                if(a.collect) Controller.toggle('content')
            }

            let items = ['book', 'like', 'wath', 'history'].map(type=>{
                return {
                    title: Lang.translate('title_' + type),
                    type: type,
                    checkbox: true,
                    checked: status[type]
                }
            })

            if(window.lampa_settings.account_use){
                items.push({
                    title: Lang.translate('settings_cub_status'),
                    separator: true
                })

                marks.forEach(m=>{
                    items.push({
                        title: Lang.translate('title_'+m),
                        type: m,
                        picked: status[m],
                        collect: true
                    })
                })
            }

            Select.show({
                title: Lang.translate('settings_input_links'),
                items: items,
                onCheck: label,
                onSelect: label,
                onBack: ()=>{
                    Controller.toggle('content')
                }
            })
        })

        this.emit('updateFavorite')

        this.listenerFavorite = (e)=>{
            if(e.target == 'favorite'){
                if(e.card){
                    if(e.card.id == this.card.id) this.emit('updateFavorite')
                }
                else this.emit('updateFavorite')
            }
        }

        Lampa.Listener.follow('state:changed', this.listenerFavorite)
    },
    onUpdateFavorite: function(){
        let status = Favorite.check(this.card)
        let any    = Favorite.checkAnyNotHistory(status)

        $('.button--book path', this.html).attr('fill', any ? 'currentColor' : 'transparent')
    },
    onDestroy: function(){
        Lampa.Listener.remove('state:changed', this.listenerFavorite)
    }
}
