// src/custom/lang/meta-apply.js
import Lang from '../../core/lang'
import customMeta from './meta'

const current = Lang.codes()
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
