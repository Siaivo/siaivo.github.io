import Controller from '../../core/controller'
import Template from '../../interaction/template'
import Lang from '../../core/lang'
import Scroll from '../../interaction/scroll'
import LangChoice from '../../interaction/lang'

function open(callSelected, callCancel) {
    let html = Template.get('lang_choice', {})
    let scroll = new Scroll({ mask: true, over: true })
    let codes = Lang.codes()

    function selector(code) {
        let item = $('<div class="selector lang__selector-item" data-code="' + code + '">' + codes[code] + '</div>')

        item.on('hover:enter click', () => {
            if (callSelected) callSelected(code)

            html.fadeOut(300, () => {
                scroll.destroy()
                html.remove()

                scroll = null
                html = null
            })
        }).on('hover:focus', (e) => {
            scroll.update($(e.target), true)

            $('.lang__selector-item', html).removeClass('last-focus')

            $(e.target).addClass('last-focus')

            html.find('.lang__title').text(Lang.translate('lang_choice_title', code))
            html.find('.lang__subtitle').text(Lang.translate('lang_choice_subtitle', code))
        })

        scroll.append(item)
    }

    for (let code in codes) selector(code)

    html.find('.lang__selector').append(scroll.render())

    $('body').append(html)

    // Важно: если язык не выбран, фокус и заголовки должны идти от первого
    // элемента в текущем custom-порядке, а не от fallback "ru".
    let firstCode = Object.keys(codes)[0] || 'ru'
    let selectedCode = window.localStorage.getItem('language') || firstCode

    html.find('.lang__title').text(Lang.translate('lang_choice_title', selectedCode))
    html.find('.lang__subtitle').text(Lang.translate('lang_choice_subtitle', selectedCode))

    Controller.add('language', {
        toggle: () => {
            let focus = html.find('[data-code="' + selectedCode + '"]')

            if (!focus.length) {
                focus = html.find('.lang__selector-item:first')
            }

            Controller.collectionSet(scroll.render())
            Controller.collectionFocus(focus[0], scroll.render())
        },
        up: () => {
            Navigator.move('up')
        },
        down: () => {
            Navigator.move('down')
        },
        back: () => {
            if (callCancel) {
                scroll.destroy()
                html.remove()

                scroll = null
                html = null

                callCancel()
            }
        }
    })

    Controller.toggle('language')
}

LangChoice.open = open

export default LangChoice
