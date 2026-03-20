import Map from '../interaction/person/module/map'
import Template from '../interaction/template'
import TMDB from '../core/api/sources/tmdb'
import Lang from '../core/lang'
import Utils from '../utils/utils'
import Modal from '../interaction/modal'
import Controller from '../core/controller'
import Noty from '../interaction/noty'

Map.About = {
    onCreate: function() {
        this.html = Template.js('person_start', {
            name: this.data.name,
            birthday: this.data.birthday ? Utils.parseTime(this.data.birthday).full : Lang.translate('player_unknown'),
            place: this.data.place_of_birth || Lang.translate('player_unknown')
        })

        this.prefix = Template.prefix(this.html, 'person-start')

        Utils.imgLoad(this.prefix.img, this.data.profile_path ? TMDB.img(this.data.profile_path, 'w500') : this.data.img || 'img/img_broken.svg', (img) => {
            img.addClass('loaded')
        })

        this.html.find('.button--info').on('hover:enter', () => {
            if (this.data.biography) {
                Modal.open({
                    title: this.data.name,
                    size: 'large',
                    html: $('<div class="about">' + this.data.biography.replace(/\n/g, '<br>') + '</div>'),
                    onBack: () => {
                        Modal.close()

                        Controller.toggle('content')
                    }
                })
            }
            else {
                Noty.show(Lang.translate('empty_title_two'))
            }
        }).on('hover:focus hover:enter hover:hover', (e) => {
            this.last = e.target
        })
    }
}
