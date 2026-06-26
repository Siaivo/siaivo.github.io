/**
 * ASS drawing scale: \pN — координаты в 2^(N-1) раз точнее пикселя
 * @param {number} mode
 * @returns {number}
 */
function drawScale(mode){
    if(!mode || mode < 1) return 1

    return Math.pow(2, mode - 1)
}

/**
 * Построить Path2D из ASS draw-команды (m, l, b, c)
 * @param {string} pathStr
 * @param {number} mode — значение из {=N}
 * @returns {Path2D|null}
 */
function buildPath(pathStr, mode){
    if(!pathStr) return null

    let scale = drawScale(mode)
    let tokens = pathStr.trim().split(/\s+/)
    let path   = new Path2D()
    let i      = 0

    let px = (v)=> parseFloat(v) / scale
    let py = (v)=> parseFloat(v) / scale

    while(i < tokens.length){
        let cmd = tokens[i++].toLowerCase()

        if(cmd === 'm' && i + 1 < tokens.length){
            path.moveTo(px(tokens[i]), py(tokens[i + 1]))
            i += 2
            continue
        }

        if(cmd === 'l'){
            while(i + 1 < tokens.length && !/^[mlbc]$/.test(tokens[i])){
                path.lineTo(px(tokens[i]), py(tokens[i + 1]))
                i += 2
            }
            continue
        }

        if(cmd === 'b' && i + 5 < tokens.length){
            path.bezierCurveTo(
                px(tokens[i]), py(tokens[i + 1]),
                px(tokens[i + 2]), py(tokens[i + 3]),
                px(tokens[i + 4]), py(tokens[i + 5])
            )
            i += 6
            continue
        }

        if(cmd === 'c'){
            path.closePath()
            continue
        }

        break
    }

    return path
}

export default {
    buildPath,
    drawScale
}
