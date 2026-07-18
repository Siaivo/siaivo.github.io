import Template from '../../interaction/template'
import about from '../templates/about'
import logoSrc from './logo-icon'

Template.add('about', about);

// Override head template — replace logo img src with custom UA-flag SVG (base64)
let headHtml = Template.string('head')
if (headHtml && headHtml.indexOf('./img/logo-icon.svg') >= 0) {
    Template.add(
        'head',
        headHtml.replace('./img/logo-icon.svg', logoSrc)
    )
}

// Override lang_choice template — same replacement
let langHtml = Template.string('lang_choice')
if (langHtml && langHtml.indexOf('./img/logo-icon.svg') >= 0) {
    Template.add(
        'lang_choice',
        langHtml.replace('./img/logo-icon.svg', logoSrc)
    )
}

// Override settings_main — replace account icon & name
let settingsMainHtml = Template.string('settings_main')
if (settingsMainHtml) {
    Template.add(
        'settings_main',
        settingsMainHtml
            // Replace icon in data-component="account"
            .replace(
                /(<div class="settings-folder selector" data-component="account">\s*<div class="settings-folder__icon">)([\s\S]*?)(<\/div>\s*<div class="settings-folder__name">)([^<]*)(<\/div>\s*<\/div>)/,
                `$1<svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.1309 6H35.8683L46.9996 24.9021H40.9652L17.0443 11.0914L14.1309 6Z" fill="white"/>
                    <path d="M31.7317 24.9021H24.9479L21.5059 18.887L31.7317 24.9021Z" fill="white"/>
                    <path d="M21.4844 31.3499L24.9479 25.3221H31.7317L21.4844 31.3499Z" fill="white"/>
                    <path d="M16.996 39.1611L40.9658 25.3221H47.0002L35.9739 44.3293H14.0264L16.996 39.1611Z" fill="white"/>
                    <path d="M3 25.1122L13.7112 6L16.7566 11.3294V38.8387L13.6062 44.3294L3 25.1122Z" fill="white"/>
                    <path d="M21.377 19.4153L24.6324 25.1122L21.377 30.7858V19.4153Z" fill="white"/>
                    </svg>$3Cub$5`
            )
    )
}
