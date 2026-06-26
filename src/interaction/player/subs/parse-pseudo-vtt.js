const PLAY_RES = { width: 640, height: 360 }

/**
 * @param {string} val
 * @returns {number}
 */
function timeToMs(val){
    let regex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/
    let parts = regex.exec(val.trim())

    if(!parts) return 0

    let hours   = parseInt(parts[1] || '0', 10)
    let minutes = parseInt(parts[2], 10)
    let seconds = parseInt(parts[3], 10)
    let ms      = parseInt(parts[4], 10)

    return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms
}

/**
 * @param {string} line
 * @returns {{layer:number, kind:'text'|'draw', payload:string}|null}
 */
function parseLine(line){
    let match = /^\{=(\d+)\}([\s\S]*)$/.exec(line.trim())

    if(!match) return null

    let layer   = parseInt(match[1], 10)
    let payload = match[2].trim()

    if(!payload) return null

    let kind = /^m\s/i.test(payload) ? 'draw' : 'text'

    return { layer, kind, payload, tagged: true }
}

/**
 * @param {string} data
 * @returns {{playRes:{width:number,height:number}, cues:object[]}}
 */
function parsePseudoVtt(data){
    data = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    data = data.replace(/(\d{2}):(\d{2})\.(\d{3})[ \t]+-->[ \t]+(\d{2}):(\d{2})\.(\d{3})/g, '00:$1:$2.$3 --> 00:$4:$5.$6')

    let regex = /(\d{2}:\d{2}:\d{2}\.\d{3})[ \t]+-->[ \t]+(\d{2}:\d{2}:\d{2}\.\d{3})\s*\n([\s\S]*?)(?=\n\d{2}:\d{2}:\d{2}\.\d{3}[ \t]+-->|\n*$)/g
    let match
    let map = {}

    while((match = regex.exec(data)) !== null){
        let startMs = timeToMs(match[1])
        let endMs   = timeToMs(match[2])
        let body    = match[3].trim()

        if(!body) continue

        let key = startMs + '-' + endMs

        if(!map[key]){
            map[key] = {
                startMs,
                endMs,
                parts: []
            }
        }

        body.split('\n').forEach((line)=>{
            line = line.trim()

            if(!line) return

            let parsed = parseLine(line)

            if(parsed){
                parsed.tagged = true
                map[key].parts.push(parsed)
                return
            }

            map[key].parts.push({
                layer: 0,
                kind: 'text',
                payload: line,
                tagged: false
            })
        })
    }

    let cues = Object.values(map).sort((a, b)=> a.startMs - b.startMs)

    cues.forEach((cue)=>{
        cue.parts.sort((a, b)=>{
            if(a.layer !== b.layer) return a.layer - b.layer
            if(a.kind !== b.kind) return a.kind === 'draw' ? -1 : 1

            return 0
        })

        cue.pseudo = cue.parts.some((part)=>{
            if(part.kind === 'draw') return true
            if(part.tagged && part.layer >= 4) return true

            return false
        })
    })

    return {
        playRes: Object.assign({}, PLAY_RES),
        cues
    }
}

/**
 * @param {number} timeMs
 * @param {{startMs:number,endMs:number,parts:object[]}[]} cues
 * @returns {{startMs:number,endMs:number,parts:object[]}|null}
 */
function findCue(timeMs, cues){
    for(let i = 0; i < cues.length; i++){
        let cue = cues[i]

        if(timeMs >= cue.startMs && timeMs < cue.endMs) return cue
    }

    return null
}

function isPseudoCue(cue){
    return Boolean(cue && cue.pseudo)
}

export default {
    parsePseudoVtt,
    findCue,
    isPseudoCue,
    PLAY_RES
}
