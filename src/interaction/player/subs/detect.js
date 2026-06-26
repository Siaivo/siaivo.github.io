/**
 * Pseudo-VTT: ASS-данные в WebVTT с тегами {=N}
 * @param {string} data
 * @returns {boolean}
 */
function isPseudoVtt(data){
    if(typeof data !== 'string' || !/^[\s\r\n]*WEBVTT/m.test(data)) return false

    return /\{=\d+\}/.test(data)
}

/**
 * @param {string} data
 * @returns {'pseudo-vtt'|'vtt'|'srt'|'ass'|'unknown'}
 */
function detectFormat(data){
    if(typeof data !== 'string') return 'unknown'

    if(/^\[Script Info\]/m.test(data) || /^\[V4\+ Styles\]/m.test(data)) return 'ass'

    if(isPseudoVtt(data)) return 'pseudo-vtt'

    if(/^[\s\r\n]*WEBVTT/m.test(data)) return 'vtt'

    if(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(data)) return 'srt'

    return 'unknown'
}

export default {
    isPseudoVtt,
    detectFormat
}
