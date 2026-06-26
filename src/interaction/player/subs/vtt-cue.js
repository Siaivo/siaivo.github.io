/**
 * WebVTT/HTML-сущности → символы
 * @param {string} text
 * @returns {string}
 */
function decodeVttEntities(text){
    if(!text || text.indexOf('&') === -1) return text

    return text
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
}

/**
 * @param {string} line
 * @param {string} tag
 * @returns {boolean}
 */
function isTaggedLine(line, tag){
    line = line.trim()

    if(!line) return true

    let rx = new RegExp('^<' + tag + '>[\\s\\S]*<\\/' + tag + '>$', 'i')

    return rx.test(line)
}

/**
 * Все непустые строки обёрнуты в один тег (SRT/VTT)
 * @param {string} text
 * @param {string} tag
 * @returns {boolean}
 */
function isAllTaggedCue(text, tag){
    if(!text) return false

    let lines = decodeVttEntities(text).trim().split(/\n/)

    return lines.some((line)=> line.trim()) && lines.every((line)=> isTaggedLine(line, tag))
}

function isAllBoldCue(text){
    return isAllTaggedCue(text, 'b')
}

function isAllItalicCue(text){
    return isAllTaggedCue(text, 'i')
}

function isAllUnderlineCue(text){
    return isAllTaggedCue(text, 'u')
}

/**
 * WebVTT cue markup → HTML для оверлея Lampa
 * @param {string} text
 * @returns {string}
 */
function vttCueToHtml(text){
    if(!text) return ''

    text = decodeVttEntities(text)
    text = text.replace(/\r\n/g, '\n')

    text = text.replace(/<(\d{2}:)?(\d{2}:)?\d{2}\.\d{3}>/g, '')

    text = text.replace(/<v [^>]+>/gi, '').replace(/<\/v>/gi, '')
    text = text.replace(/<c\.[^>]+>/gi, '').replace(/<\/c>/gi, '')
    text = text.replace(/<lang [^>]+>/gi, '').replace(/<\/lang>/gi, '')

    text = text.replace(/<(?!\/?(?:b|i|u|br)\b)[^>]+>/gi, '')

    text = text.replace(/\n/g, '<br>')

    return text.trim()
}

/**
 * Убрать теги, сохранить переносы строк
 * @param {string} text
 * @returns {string}
 */
function vttCueToPlainLines(text){
    if(!text) return ''

    text = decodeVttEntities(text).replace(/\r\n/g, '\n')

    return text
        .split('\n')
        .map((line)=> line.replace(/<[^>]+>/g, '').trim())
        .filter((line)=> line)
        .join('<br>')
}

/**
 * @param {string} text
 * @returns {string}
 */
function vttCueToPlain(text){
    if(!text) return ''

    text = decodeVttEntities(text)

    return text.replace(/<[^>]+>/g, '').replace(/\r\n/g, '\n').replace(/\n/g, ' ').trim()
}

/**
 * @param {string} text
 * @returns {{html:string, style:('bold'|'italic'|'underline'|null)}}
 */
function prepareDomCue(text){
    if(!text) return {html: '', style: null}

    text = decodeVttEntities(text.trim())

    if(isAllBoldCue(text)) return {html: vttCueToPlainLines(text), style: 'bold'}
    if(isAllItalicCue(text)) return {html: vttCueToPlainLines(text), style: 'italic'}
    if(isAllUnderlineCue(text)) return {html: vttCueToPlainLines(text), style: 'underline'}

    return {html: vttCueToHtml(text), style: null}
}

/**
 * @param {string} text
 * @returns {{html:string, allBold:boolean}}
 */
function prepareVttCue(text){
    let dom = prepareDomCue(text)

    return {
        html: dom.html,
        allBold: dom.style === 'bold'
    }
}

/**
 * Формат для DOM: старая логика Lampa + правка b/i/u и сущностей
 * @param {string} text
 * @returns {{text:string, style:('bold'|'italic'|'underline'|null)}}
 */
function formatForDisplay(text){
    if(!text) return {text: '', style: null}

    let prepared = prepareDomCue(text)

    if(prepared.style) return {text: prepared.html, style: prepared.style}

    if(/<\/?(?:b|i|u|br)\b/i.test(text) || /&(?:lt|gt|amp|nbsp);/i.test(text)){
        return {text: prepared.html, style: null}
    }

    return {
        text: decodeVttEntities(text).replace("\n", '<br>').trim(),
        style: null
    }
}

export default {
    vttCueToHtml,
    vttCueToPlain,
    vttCueToPlainLines,
    isAllBoldCue,
    isAllItalicCue,
    isAllUnderlineCue,
    prepareDomCue,
    prepareVttCue,
    formatForDisplay,
    decodeVttEntities
}
