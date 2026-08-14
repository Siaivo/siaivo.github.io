// Плагіни викликають Player.play(), а потім Player.subtitles()
// в тому ж такті. Для зовнішнього android-плеєра intent летить синхронно
// всередині play(), тому субтитри до нього не доїжджають — а внутрішнього
// <video> не існує, і Subtitles.custom() падає "Cannot set properties of undefined (setting 'customSubs')".
//
// Затримуємо intent на один такт і складаємо в його data ті субтитри,
// що прийшли після play().

(function() {
    function init() {
        if (!window.Lampa || !Lampa.Player || !Lampa.Android || !Lampa.PlayerVideo) {
            setTimeout(init, 50)
            return
        }

        let pending = null

        const openPlayer = Lampa.Android.openPlayer

        Lampa.Android.openPlayer = function(link, data) {
            pending = data

            setTimeout(() => {
                pending = null

                openPlayer.call(Lampa.Android, link, data)
            }, 0)
        }

        const subtitles = Lampa.Player.subtitles

        Lampa.Player.subtitles = function(subs) {
            if (pending) {
                if (Array.isArray(subs) && subs.length) {
                    pending.subtitles = subs

                    console.log('Custom', 'subtitles passed to android player', subs.length)
                }

                return
            }

            // Плеєр не відкритий (зовнішній плеєр вже запущено або вихід з плеєра)
            if (!Lampa.PlayerVideo.video()) return console.log('Custom', 'subtitles skipped, no inner video')

            return subtitles.apply(Lampa.Player, arguments)
        }
    }

    init()
})()
