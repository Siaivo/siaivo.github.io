// — Ukrainian as the default language BEFORE the user picks one —
//
// The core hardcodes the 'ru' fallback: core/lang.js -> translate() calls
// Storage.get('language','ru'), and every string shown before the language
// is picked (loading progress, LangChoice titles) comes from there.
//
// Writing the key itself is not an option — app.js -> loadApp() treats an
// existing key as "language already chosen" and skips the picker screen.
// So only the fallback is overridden: while the key is absent,
// Storage.get('language', …) returns 'uk'. The picker stays in place.
//
// In the core, langs['uk'] holds only lang_choice_*, so every other string
// still falls back to langs[lang_default] ('ru') until lang/uk.js is fetched
// after the pick — hence lang_default is left alone, otherwise key names
// would be rendered instead of text.

import Storage from '../../core/storage/storage'

var DEFAULT_LANG = 'uk'
var get = Storage.get

Storage.get = function (name, empty) {
    if (name === 'language' && !window.localStorage.getItem('language')) {
        return get(name, DEFAULT_LANG)
    }

    return get(name, empty)
}
