import Preroll from '../../../interaction/advert/preroll';

// Plugin prerolls (vast_url in player data) bypass Manager.init: skip them, start the video right away.
Preroll.show = function(data, call) {
    call()
}
