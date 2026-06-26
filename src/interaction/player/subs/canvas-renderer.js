import drawPath from './draw-path'
import vttCue from './vtt-cue'

const LAYER_DRAW = {
    4: { fill: '#0d0d0d', stroke: 'none' },
    5: { fill: '#c9a227', stroke: 'none' }
}

const LAYER_TEXT = {
    0: {
        fontSize: 28,
        color: '#ffffff',
        stroke: '#000000',
        strokeWidth: 3,
        x: 0.5,
        y: 0.9,
        align: 'center'
    },
    6: {
        fontSize: 34,
        color: '#e8c547',
        stroke: '#1a1a1a',
        strokeWidth: 2,
        align: 'center'
    }
}

const LAYER6_TEXT_POS = {
    'Начало': { x: 0.28, y: 0.18 },
    'После Конца': { x: 0.72, y: 0.18 }
}

function isPanelVisible(){
    return Boolean(document.querySelector('.player.player--panel-visible'))
}

function bottomTextY(baseY){
    return isPanelVisible() ? Math.max(0.5, baseY - 0.12) : baseY
}

/**
 * Canvas-оверлей для pseudo-VTT / ASS draw
 */
function CanvasSubsOverlay(container){
    let html    = $('<div class="player-video__subs-advanced hide"></div>')
    let canvas  = $('<canvas class="player-video__subs-advanced-canvas"></canvas>')
    let ctx
    let playRes = { width: 640, height: 360 }
    let visible = false
    let videoEl

    html.append(canvas)
    container.append(html)

    canvas = canvas[0]
    ctx    = canvas.getContext('2d')

    /**
     * @param {HTMLVideoElement} video
     */
    this.bindVideo = function(video){
        videoEl = video
    }

    this.setPlayRes = function(res){
        if(!res) return

        playRes = {
            width: res.width || 640,
            height: res.height || 360
        }
    }

    this.syncLayout = function(){
        if(!videoEl) return

        let rect = videoEl.getBoundingClientRect()

        html.css({
            position: 'fixed',
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px'
        })

        let dpr = window.devicePixelRatio || 1

        canvas.width  = Math.round(rect.width * dpr)
        canvas.height = Math.round(rect.height * dpr)
        canvas.style.width  = rect.width + 'px'
        canvas.style.height = rect.height + 'px'

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    this.setVisible = function(status){
        visible = status
        html.toggleClass('hide', !status)

        if(!status) this.clear()
    }

    this.clear = function(){
        if(!canvas.width || !canvas.height) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    /**
     * @param {{parts:object[]} | null} cue
     */
    this.render = function(cue){
        if(!visible || !cue || !cue.parts || !cue.parts.length){
            this.clear()
            return
        }

        this.syncLayout()

        let w = canvas.clientWidth
        let h = canvas.clientHeight

        if(!w || !h) return

        ctx.clearRect(0, 0, w, h)

        let sx = w / playRes.width
        let sy = h / playRes.height

        ctx.save()
        ctx.scale(sx, sy)

        cue.parts.forEach((part)=>{
            if(part.kind === 'draw') this.renderDraw(part)
            else this.renderText(part)
        })

        ctx.restore()
    }

    this.renderDraw = function(part){
        let style = LAYER_DRAW[part.layer] || { fill: '#ffffff', stroke: 'none' }
        let path  = drawPath.buildPath(part.payload, part.layer)

        if(!path) return

        ctx.save()
        ctx.fillStyle   = style.fill
        ctx.strokeStyle = style.stroke || 'none'

        if(style.stroke && style.stroke !== 'none'){
            ctx.lineWidth = style.strokeWidth || 1
            ctx.stroke(path)
        }

        ctx.fill(path)
        ctx.restore()
    }

    this.renderText = function(part){
        let base    = LAYER_TEXT[part.layer] || LAYER_TEXT[0]
        let textPos = part.layer === 6 ? (LAYER6_TEXT_POS[part.payload] || { x: 0.5, y: 0.18 }) : null
        let baseY   = textPos ? textPos.y : (base.y || 0.5)

        if(!textPos && part.layer === 0) baseY = bottomTextY(baseY)

        let label   = vttCue.vttCueToPlainLines(part.payload).replace(/<br>/g, '\n').replace(/\n/g, ' ')
        let allBold = vttCue.isAllBoldCue(part.payload)
        let italic  = vttCue.isAllItalicCue(part.payload)

        if(!label) return

        let x = textPos ? textPos.x * playRes.width : (base.x || 0.5) * playRes.width
        let y = baseY * playRes.height
        let weight = allBold ? '700' : '600'
        let style  = italic ? 'italic ' : ''

        ctx.save()
        ctx.font         = style + weight + ' ' + base.fontSize + 'px Arial, sans-serif'
        ctx.textAlign    = base.align || 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin     = 'round'

        if(base.stroke){
            ctx.lineWidth   = base.strokeWidth || 2
            ctx.strokeStyle = base.stroke
            ctx.strokeText(label, x, y)
        }

        ctx.fillStyle = base.color
        ctx.fillText(label, x, y)
        ctx.restore()
    }

    this.destroy = function(){
        this.clear()
        html.remove()
        videoEl = null
        ctx     = null
    }
}

export default CanvasSubsOverlay
