// src/custom/lang/overrides.js
//
// Наші значення для рядків ядра. Lang.add при імпорті тут не допоможе: усі мови, крім ru/en,
// приходять під час роботи з lang/<code>.js через Lang.AddTranslation (app.js:869) і затирають
// ключі ядра. Тож накладаємо поверх одразу після кожного такого завантаження.
import Lang from '../../core/lang'

const overrides = {
    // логи йдуть не розробникам, а в публічний dpaste з QR (custom/interaction/logs.js)
    console_send: {
        uk: 'Поділитися логами',
        en: 'Share logs',
        be: 'Падзяліцца логамі',
        zh: '分享日志',
        pt: 'Partilhar registos',
        bg: 'Сподели логовете',
        he: 'שיתוף יומנים',
        cs: 'Sdílet logy',
        ro: 'Partajează jurnalele',
        fr: 'Partager les journaux',
        pl: 'Udostępnij logi',
        ru: 'Поделиться логами'
    },
    settings_rest_tmdb_posters: {
        uk: 'Роздільна здатність постерів TMDB'
    },
    settings_rest_tmdb_prox: {
        uk: 'Проксіювати TMDB'
    }
}

function apply(code){
    let data = {}

    for (let name in overrides) {
        if (overrides[name][code]) {
            data[name] = overrides[name][code]
        }
    }

    add_translation.call(Lang, code, data)
}

let add_translation = Lang.AddTranslation

Lang.AddTranslation = function(code, data){
    add_translation.apply(this, arguments)

    apply(code)
}

// ru і en вбудовані й уже в пам'яті
Lang.add(overrides)
