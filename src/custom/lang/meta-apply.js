// src/custom/lang/meta-apply.js
import Lang from '../../core/lang'
import customMeta from './meta'

const originalCodes = Lang.codes.bind(Lang)
const current = originalCodes()
const onlyNew = {}

for (const code in customMeta.languages) {
    if (!current[code]) onlyNew[code] = customMeta.languages[code].name
}

if (Object.keys(onlyNew).length) Lang.addCodes(onlyNew)

for (const code in customMeta.languages) {
    Lang.AddTranslation(code, {
        lang_choice_title: customMeta.languages[code].lang_choice_title,
        lang_choice_subtitle: customMeta.languages[code].lang_choice_subtitle
    })
}

Lang.codes = function() {
    const actual = originalCodes()
    const ordered = {}

    for (const code in customMeta.languages) {
        if (actual[code] || customMeta.languages[code].name) {
            ordered[code] = customMeta.languages[code].name || actual[code]
        }
    }

    for (const code in actual) {
        if (!ordered[code]) ordered[code] = actual[code]
    }

    return ordered
}
