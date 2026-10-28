import Lang from '../../core/lang'
import Controller from '../../core/controller'
import Storage from '../../core/storage/storage'
import Api from '../../core/api/api'
import Screensaver from '../../interaction/screensaver'
import CardModule from '../../interaction/card/module/module'

// Пасхалка «Сяйво: Нашестя»: Каталог → «Фантастика» → перший ряд, у самому його
// кінці — картка гри. OK чи тап на ній запускає гру.
//
// Аркада за мотивами Space Invaders і Galaga: прибульці холодних кольорів хвилями
// сходять на пшеничне поле під полярним сяйвом, пікірують зі строю, броньовані
// тримають кілька влучань, кожна п'ята хвиля — матка. Корабель золотий, бункери — снопи.
//
// Під найслабші ТВ (Tizen 2, Orsay WebKit 534, Chrome 38):
// - усе малюється в буфер висотою 180 і шириною за пропорціями екрана (на телефоні
//   вертикально — шириною 192), а на екран його розтягує CSS;
// - небо й поле рендеряться через ImageData раз на розмір екрана і кешуються між
//   запусками; кадр починається з одного drawImage;
// - спрайти й гліфи — бітові маски, зібрані в ImageData один раз при першому запуску;
// - рахунок, рекорд і життя — піксельні цифри та іконки в тому ж буфері: без DOM,
//   без шрифтів і без перекладів; HUD перемальовується в окреме полотно лише при
//   зміні чисел, а в кадр потрапляє одним drawImage;
// - зірки впечені у фон, щокадру гасимо лише сьому їх частину — це і є мерехтіння;
//   бомби — готові спрайти, а не попіксельний fillRect;
// - у кадрі нічого не створюється: списки ущільнюються на місці, частинки — з пулу;
// - поки гра відкрита, інтерфейс Лампи під нею схований (як під плеєром), щоб
//   рушій не перемальовував його щокадру;
// - кнопки сенсора намальовані у фон, натиснуті — готові спрайти поверх;
// - цикл — setTimeout: логіка йде кроками по 33 мс, а малюємо 25 кадрів на секунду
//   (раз на кілька кадрів логіка робить два кроки); на повільному ТВ гра
//   сповільнюється, а не стрибає; на екрані кінця гри й під заставкою кадр майже
//   не малюється;
// - клавіші гри (← → і вогонь) перехоплюємо на window у фазі захоплення: Keypad
//   пропускає повтори частіше ніж раз на 100 мс (keypad.js:53), а гра має бачити
//   утримання. Решта клавіш, зокрема «Назад», іде в Keypad як звичайно.
//
// На Orsay CSS-масштабування може бути згладженим — властивостей вимкнення там немає.

// кадр 25 fps, крок логіки — як при 30 fps, щоб швидкості гри лишились ті самі
const TICK = 40
const STEP = 33

// Фантастика: фільми й «Sci-Fi & Fantasy» серіалів
const GENRES = ['878', '10765']

const KEYS_LEFT = [37, 4]
const KEYS_RIGHT = [39, 5]
const KEYS_FIRE = [13, 29443, 117, 65385, 32, 38, 29460]
const POINTER_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup']

// Смуга кнопок під полем на сенсорі: не нижча за цю; кнопки «відтиснуті» на KEY_DEPTH
const PAD_H = 50
const KEY_DEPTH = 3

const SQUID = [[
    '...xx...',
    '..xxxx..',
    '.xxxxxx.',
    'xx.xx.xx',
    'xxxxxxxx',
    '..x..x..',
    '.x.xx.x.',
    'x.x..x.x'
], [
    '...xx...',
    '..xxxx..',
    '.xxxxxx.',
    'xx.xx.xx',
    'xxxxxxxx',
    '.x.xx.x.',
    'x......x',
    '.x....x.'
]]

const CRAB = [[
    '..x.....x..',
    '...x...x...',
    '..xxxxxxx..',
    '.xx.xxx.xx.',
    'xxxxxxxxxxx',
    'x.xxxxxxx.x',
    'x.x.....x.x',
    '...xx.xx...'
], [
    '..x.....x..',
    'x..x...x..x',
    'x.xxxxxxx.x',
    'xxx.xxx.xxx',
    'xxxxxxxxxxx',
    '.xxxxxxxxx.',
    '..x.....x..',
    '.x.......x.'
]]

const OCTO = [[
    '....xxxx....',
    '.xxxxxxxxxx.',
    'xxxxxxxxxxxx',
    'xxx..xx..xxx',
    'xxxxxxxxxxxx',
    '...xx..xx...',
    '..xx.xx.xx..',
    'xx........xx'
], [
    '....xxxx....',
    '.xxxxxxxxxx.',
    'xxxxxxxxxxxx',
    'xxx..xx..xxx',
    'xxxxxxxxxxxx',
    '..xxx..xxx..',
    '.xx..xx..xx.',
    '..xx....xx..'
]]

const SHIP = [
    '......x......',
    '.....xxx.....',
    '.....xxx.....',
    '.xxxxxxxxxxx.',
    'xxxxxxxxxxxxx',
    'xxxxxxxxxxxxx',
    'xxxxxxxxxxxxx',
    'xxxxxxxxxxxxx'
]

const SHIP_BOOM = [[
    '.....x.......',
    '..x.....x..x.',
    '....x.x......',
    'x..xxxx..x...',
    '..xxxxxx..x..',
    '.xxxxxxxxx...',
    'xxxxxxxxxxxx.',
    'xxxxxxxxxxxxx'
], [
    'x.....x....x.',
    '.....x.......',
    '..x.......x..',
    '...x.xx......',
    'x.xxxxxxx..x.',
    '..xxxxxxxx...',
    '.xxxxxxxxxx.x',
    'xxxxxxxxxxxxx'
]]

const UFO = [
    '.....xxxxxx.....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '.xx.xx.xx.xx.xx.',
    'xxxxxxxxxxxxxxxx',
    '..xxx..xx..xxx..',
    '...x........x...'
]

const BOOM = [
    '....x...x....',
    '.x...x.x...x.',
    '..x.......x..',
    'xx.........xx',
    '..x.......x..',
    '.x...x.x...x.',
    '....x...x....'
]

// Сніп: колосся, перевʼязь, стебла
const SHEAF = [
    '..x..x..x..x..x..x....',
    '.xx.xx.xx.xx.xx.xx.x..',
    'xxxxxxxxxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxxxxxxx..',
    '..xxxxxxxxxxxxxxxxx...',
    '....xxxxxxxxxxxxx.....',
    '......xxxxxxxxx.......',
    '.......xxxxxxx........',
    '.......xxxxxxx........',
    '......xxxxxxxxx.......',
    '.....xxxxxxxxxxx......',
    '....xxxxxxxxxxxxx.....',
    '...xxxxxxxxxxxxxxx....',
    '..xxxxxxxxxxxxxxxxx...',
    '.xxxxxxxxxxxxxxxxxxx..',
    'xxxxxxxxxxxxxxxxxxxxx.'
]

// Матка: малюється вдвічі більшою
const BOSS = [[
    '........xxxxxxxx........',
    '.....xxxxxxxxxxxxxx.....',
    '...xxxxxxxxxxxxxxxxxx...',
    '..xxxxxxxxxxxxxxxxxxxx..',
    '.xxx..xxxx.xx.xxxx..xxx.',
    'xxxx..xxxx.xx.xxxx..xxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx',
    '..xxxx..xxxxxxxx..xxxx..',
    '.xx..xx...xxxx...xx..xx.',
    'xx....xx...xx...xx....xx',
    'x......x........x......x'
], [
    '........xxxxxxxx........',
    '.....xxxxxxxxxxxxxx.....',
    '...xxxxxxxxxxxxxxxxxx...',
    '..xxxxxxxxxxxxxxxxxxxx..',
    '.xxx..xxxx.xx.xxxx..xxx.',
    'xxxx..xxxx.xx.xxxx..xxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxxxxxxxxxx',
    '..xxxx..xxxxxxxx..xxxx..',
    '..xx..xx..xxxx..xx..xx..',
    '.x..xx..x..xx..x..xx..x.',
    'x........x....x........x'
]]

const CROWN = [
    'x..x..x',
    'xx.x.xx',
    'xxxxxxx',
    'xxxxxxx',
    '.xxxxx.'
]

const LIFE = [
    '...x...',
    '..xxx..',
    'xxxxxxx',
    'xxxxxxx'
]

const CROSS = [
    'x.....x',
    '.x...x.',
    '..x.x..',
    '...x...',
    '..x.x..',
    '.x...x.',
    'x.....x'
]

const ICON_LEFT = [
    '...x.....',
    '..xx.....',
    '.xxxxxxxx',
    'xxxxxxxxx',
    '.xxxxxxxx',
    '..xx.....',
    '...x.....'
]

const ICON_RIGHT = ICON_LEFT.map(row => row.split('').reverse().join(''))

// приціл
const ICON_FIRE = [
    '....x....',
    '..xxxxx..',
    '.x..x..x.',
    '.x.....x.',
    'xxx.x.xxx',
    '.x.....x.',
    '.x..x..x.',
    '..xxxxx..',
    '....x....'
]

const DIGITS = {
    0: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'],
    1: ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
    2: ['xxx', '..x', 'xxx', 'x..', 'xxx'],
    3: ['xxx', '..x', '.xx', '..x', 'xxx'],
    4: ['x.x', 'x.x', 'xxx', '..x', '..x'],
    5: ['xxx', 'x..', 'xxx', '..x', 'xxx'],
    6: ['xxx', 'x..', 'xxx', 'x.x', 'xxx'],
    7: ['xxx', '..x', '.x.', '.x.', '.x.'],
    8: ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
    9: ['xxx', 'x.x', 'xxx', '..x', 'xxx'],
    '*': ['...', 'x.x', '.x.', 'x.x', '...']
}

const LETTERS = {
    G: ['.xxx.', 'x...x', 'x....', 'x.xxx', 'x...x', 'x...x', '.xxx.'],
    A: ['.xxx.', 'x...x', 'x...x', 'xxxxx', 'x...x', 'x...x', 'x...x'],
    M: ['x...x', 'xx.xx', 'x.x.x', 'x.x.x', 'x...x', 'x...x', 'x...x'],
    E: ['xxxxx', 'x....', 'x....', 'xxxx.', 'x....', 'x....', 'xxxxx'],
    O: ['.xxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.xxx.'],
    V: ['x...x', 'x...x', 'x...x', 'x...x', 'x...x', '.x.x.', '..x..'],
    R: ['xxxx.', 'x...x', 'x...x', 'xxxx.', 'x.x..', 'x..x.', 'x...x'],
    K: ['x...x', 'x..x.', 'x.x..', 'xx...', 'x.x..', 'x..x.', 'x...x'],
    S: ['.xxxx', 'x....', 'x....', '.xxx.', '....x', '....x', 'xxxx.'],
    I: ['xxx', '.x.', '.x.', '.x.', '.x.', '.x.', 'xxx'],
    W: ['x...x', 'x...x', 'x...x', 'x.x.x', 'x.x.x', 'xx.xx', 'x...x'],
    T: ['xxxxx', '..x..', '..x..', '..x..', '..x..', '..x..', '..x..'],
    P: ['xxxx.', 'x...x', 'x...x', 'xxxx.', 'x....', 'x....', 'x....'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
}

// Три види прибульців; рядки строю згори донизу — який у них вид
const TYPES = [SQUID, CRAB, OCTO]
const TYPE_COLOR = ['#d9b8ff', '#9fd8ff', '#8ff0c4']
const ROW_TYPE = [0, 1, 1, 2, 2]
const ROW_SCORE = [30, 20, 20, 10, 10]
const UFO_SCORE = [50, 100, 150, 300]

// Розміри — з масок, щоб хітбокси не розходились зі спрайтами
const TYPE_W = TYPES.map(frames => frames[0][0].length)
const ALIEN_H = SQUID[0].length
const SHIP_W = SHIP[0].length
const SHIP_H = SHIP.length
const UFO_W = UFO[0].length
const UFO_Y = 16
const BOSS_W = BOSS[0][0].length * 2 + 2
const BOSS_H = BOSS[0].length * 2 + 2
const SHEAF_W = SHEAF[0].length
const SHEAF_H = SHEAF.length
const SHOT_H = 4
const BOMB_H = 5

const OUTLINE = '#050a18'
const GOLD = '#ffd23f'
const PALE_GOLD = '#ffe9a3'
const ORANGE = '#ff9d5c'
const STEEL = '#c9d3ea'
const WHITE = '#ffffff'
const SHOT = '#fff3b0'
const BOMB = '#ff7ab8'
const STAR = '#e8f1ff'
const NIGHT = '#060b1b'

// Небо від зеніту до обрію, два відтінки сяйва, поле
const SKY = [[6, 11, 27], [10, 20, 48], [15, 31, 71], [22, 48, 95], [29, 63, 118]]
const AURORA_DIM = [44, 143, 138]
const AURORA = [122, 240, 200]
const WHEAT = [[255, 210, 63], [227, 169, 44], [168, 116, 28], [94, 63, 18]]
const SOIL = [6, 11, 27]

// 4×4 Байєр для дизерингу
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

// Формації рядових хвиль: хто з сітки 5×11 присутній
const FORMATIONS = [
    (r, c) => true,
    (r, c) => (r + c) % 2 == 0,
    (r, c) => Math.abs(c - 5) <= r + 1,
    (r, c) => c % 3 != 2
]

const PARTICLES = 48

let root = null
let canvas = null
let ctx = null
let timer = 0
let lag = 0
let keys = {left: false, right: false, fire: false}
// натискання вогню, що ще не стало пострілом: короткий тап коротший за кадр, а
// постріл міг бути на перезарядці — тож тримаємо його кілька кроків
let queued = 0
let game = null
let last_touch = false
let sprites = null
let view = null
let backdrop = null
let back_to = 'content'

function dither(x, y, t){
    return t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5
}

function rgb(hex){
    let n = parseInt(hex.slice(1), 16)

    return [n >> 16, (n >> 8) & 255, n & 255]
}

function paint(context, rows, color, left, top, scale){
    context.fillStyle = color

    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            if (rows[y].charAt(x) == 'x') {
                context.fillRect(left + x * scale, top + y * scale, scale, scale)
            }
        }
    }
}

// Спрайт із маски одним putImageData; з контуром він на 1 px більший з кожного боку
function sprite(rows, color, outline, scale){
    scale = scale || 1

    let pad = outline ? 1 : 0
    let mw = rows[0].length * scale
    let mh = rows.length * scale
    let c = document.createElement('canvas')
    let x = c.getContext('2d')

    c.width = mw + pad * 2
    c.height = mh + pad * 2

    let image = x.createImageData(c.width, c.height)
    let data = image.data
    let fill = rgb(color)
    let line = outline ? rgb(outline) : null

    function solid(px, py){
        return px >= 0 && py >= 0 && px < mw && py < mh && rows[(py / scale) | 0].charAt((px / scale) | 0) == 'x'
    }

    for (let py = 0; py < c.height; py++) {
        for (let px = 0; px < c.width; px++) {
            let mx = px - pad
            let my = py - pad
            let color_at = null

            if (solid(mx, my)) {
                color_at = fill
            }
            else if (line) {
                for (let dy = -1; dy <= 1 && !color_at; dy++) {
                    for (let dx = -1; dx <= 1 && !color_at; dx++) {
                        if (solid(mx + dx, my + dy)) {
                            color_at = line
                        }
                    }
                }
            }

            if (color_at) {
                let o = (py * c.width + px) * 4

                data[o] = color_at[0]
                data[o + 1] = color_at[1]
                data[o + 2] = color_at[2]
                data[o + 3] = 255
            }
        }
    }

    x.putImageData(image, 0, 0)

    return c
}

// Набір гліфів шрифту одного кольору й масштабу
function glyphs(font, color, scale){
    let table = {font, scale}

    for (let char in font) {
        table[char] = sprite(font[char], color, null, scale)
    }

    return table
}

function text(context, str, table, x, y){
    for (let i = 0; i < str.length; i++) {
        let char = str.charAt(i)

        context.drawImage(table[char], x, y)

        x += (table.font[char][0].length + 1) * table.scale
    }
}

function textWidth(str, table){
    let width = 0

    for (let i = 0; i < str.length; i++) {
        width += (table.font[str.charAt(i)][0].length + 1) * table.scale
    }

    return width - table.scale
}

function pad5(n){
    let s = String(n)

    while (s.length < 5) {
        s = '0' + s
    }

    return s
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

// Ущільнення списку на місці — без нового масиву щотіку
function compact(list, keep){
    let n = 0

    for (let i = 0; i < list.length; i++) {
        if (keep(list[i])) {
            list[n++] = list[i]
        }
    }

    list.length = n
}

function buildSprites(){
    let frames = color => TYPES.map(type => [sprite(type[0], color, OUTLINE), sprite(type[1], color, OUTLINE)])

    // сніп-еталон: кольори по пікселю, тож малюється fillRect, але один раз
    let sheaf = document.createElement('canvas')
    let sx = sheaf.getContext('2d')
    let grid = []

    sheaf.width = SHEAF_W
    sheaf.height = SHEAF_H

    for (let y = 0; y < SHEAF_H; y++) {
        for (let i = 0; i < SHEAF_W; i++) {
            let solid = SHEAF[y].charAt(i) == 'x'

            grid.push(solid)

            if (solid) {
                sx.fillStyle = y == 7 || y == 8 ? '#7a4a12' : y < 3 ? '#ffe27a' : i % 3 == 0 ? '#b8801f' : GOLD
                sx.fillRect(i, y, 1, 1)
            }
        }
    }

    sprites = {
        aliens: TYPES.map((type, t) => [sprite(type[0], TYPE_COLOR[t], OUTLINE), sprite(type[1], TYPE_COLOR[t], OUTLINE)]),
        // броньовані — сталеві, доки не тріснуть; спалах влучання — білий
        armor: frames(STEEL),
        flash: frames(WHITE),
        boss: [sprite(BOSS[0], BOMB, OUTLINE, 2), sprite(BOSS[1], BOMB, OUTLINE, 2)],
        boss_flash: [sprite(BOSS[0], WHITE, OUTLINE, 2), sprite(BOSS[1], WHITE, OUTLINE, 2)],
        ship: sprite(SHIP, GOLD, OUTLINE),
        ship_boom: [sprite(SHIP_BOOM[0], GOLD, OUTLINE), sprite(SHIP_BOOM[1], GOLD, OUTLINE)],
        ufo: sprite(UFO, ORANGE, OUTLINE),
        boom: sprite(BOOM, SHOT, OUTLINE),
        crown: sprite(CROWN, GOLD),
        life: sprite(LIFE, GOLD),
        cross: sprite(CROSS, PALE_GOLD),
        bomb: [bolt(0), bolt(1)],
        sheaf,
        sheaf_grid: grid,
        font: {
            hud: glyphs(DIGITS, PALE_GOLD, 1),
            accent: glyphs(DIGITS, ORANGE, 1),
            title: glyphs(LETTERS, GOLD, 2),
            number: glyphs(DIGITS, GOLD, 3),
            logo: glyphs(LETTERS, PALE_GOLD, 3),
            small: glyphs(LETTERS, PALE_GOLD, 1)
        }
    }
}

// Бомба-блискавка: зигзаг завширшки 2, кадр z — у який бік перший злам
function bolt(z){
    let c = document.createElement('canvas')
    let x = c.getContext('2d')

    c.width = 2
    c.height = BOMB_H
    x.fillStyle = BOMB

    for (let k = 0; k < BOMB_H; k++) {
        x.fillRect((k & 1) ? 1 - z : z, k, 1, 1)
    }

    return c
}

// Кнопка сенсора: опукла шапка з фаскою на кутах (або кругла) на темному боці
// завглибшки KEY_DEPTH; натиснута — шапка опущена, боку не видно, відблиску немає
function keycap(w, h, round, icon, colors, pressed){
    let c = document.createElement('canvas')
    let x = c.getContext('2d')
    let ch = h - KEY_DEPTH
    let off = pressed ? KEY_DEPTH : 0

    c.width = w
    c.height = h

    let image = x.createImageData(w, h)
    let data = image.data

    function cap(px, py){
        if (px < 0 || py < 0 || px >= w || py >= ch) {
            return false
        }

        if (round) {
            let dx = (px + 0.5 - w / 2) / (w / 2)
            let dy = (py + 0.5 - ch / 2) / (ch / 2)

            return dx * dx + dy * dy <= 1
        }

        return Math.min(px, w - 1 - px) + Math.min(py, ch - 1 - py) >= 3
    }

    function body(px, py){
        for (let k = 0; k <= KEY_DEPTH; k++) {
            if (cap(px, py - k)) {
                return true
            }
        }

        return false
    }

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            let y = py - off
            let color = null

            if (cap(px, y)) {
                if (!cap(px - 1, y) || !cap(px + 1, y) || !cap(px, y - 1) || !cap(px, y + 1)) {
                    color = colors.line
                }
                else {
                    color = !pressed && !cap(px, y - 2) ? colors.rim : colors.face
                }
            }
            else if (!pressed && body(px, py)) {
                color = !body(px - 1, py) || !body(px + 1, py) || !body(px, py + 1) ? colors.line : colors.side
            }

            if (color) {
                let o = (py * w + px) * 4

                data[o] = color[0]
                data[o + 1] = color[1]
                data[o + 2] = color[2]
                data[o + 3] = 255
            }
        }
    }

    x.putImageData(image, 0, 0)

    let scale = ch >= 34 ? 2 : 1

    paint(x, icon, colors.icon, (w - icon[0].length * scale) >> 1, off + ((ch - icon.length * scale) >> 1), scale)

    return c
}

// Небо із сяйвом і поле — попіксельно через ImageData. Синуси хвилі сяйва й
// стебла залежать лише від колонки, а відтінок неба — від рядка: рахуємо їх раз.
function sky(w, h, field, total){
    let c = document.createElement('canvas')
    let x = c.getContext('2d')

    c.width = w
    c.height = total

    let image = x.createImageData(w, total)
    let data = image.data
    let wave = []
    let amp = []
    let stalk = []

    for (let px = 0; px < w; px++) {
        wave.push(field * 0.32 + Math.sin(px / 38) * 14 + Math.sin(px / 13 + 1.7) * 4)
        amp.push(0.55 + 0.45 * Math.sin(px / 21 + 0.6))
        stalk.push(((px * 7 + (px >> 2) * 3) % 5) < 2)
    }

    for (let py = 0; py < total; py++) {
        let t = Math.min(1, py / field) * (SKY.length - 1)
        let base = Math.floor(t)
        let k = Math.min(1, (py - field) / 14)

        for (let px = 0; px < w; px++) {
            let color

            if (py >= h) {
                // земля під полем густішає в ніч
                color = dither(px, py, 1 - (py - h) / 12) ? WHEAT[3] : SOIL
            }
            else if (py >= field) {
                color = dither(px, py, 1 - k) ? WHEAT[stalk[px] ? 0 : 1] : WHEAT[stalk[px] ? 2 : 3]
            }
            else {
                // небо світлішає до обрію, по ньому хвилею йде смуга сяйва
                let glow = Math.max(0, 1 - Math.abs(py - wave[px]) / 22) * amp[px]

                color = SKY[Math.min(SKY.length - 1, base + (dither(px, py, t - base) ? 1 : 0))]

                if (glow > 0.66 && dither(px, py, (glow - 0.66) * 2.9)) {
                    color = AURORA
                }
                else if (glow > 0.3 && dither(px, py, (glow - 0.3) * 2.6)) {
                    color = AURORA_DIM
                }
            }

            let o = (py * w + px) * 4

            data[o] = color[0]
            data[o + 1] = color[1]
            data[o + 2] = color[2]
            data[o + 3] = 255
        }
    }

    x.putImageData(image, 0, 0)

    // колоски над краєм поля
    x.fillStyle = GOLD

    for (let sx = 1; sx < w; sx += 3) {
        let len = 1 + ((sx * 13) % 4)

        x.fillRect(sx, field - len, 1, len)
    }

    return c
}

// Фон для розмірів поля: кешується між запусками, поки розмір той самий
function background(w, h, pad, touch){
    let key = [w, h, pad, touch].join('x')

    if (backdrop && backdrop.key == key) {
        return backdrop
    }

    let field = h - 14
    let bg = sky(w, h, field, h + pad)
    let b = bg.getContext('2d')

    let pads = null

    // кнопки: стрілки — під лівий великий палець, вогонь — під правий
    if (pad) {
        let size = Math.min(pad - 12, 44)
        let fire = size + 8
        let top = h + ((pad - size) >> 1)
        let night = {face: SKY[3], rim: [52, 92, 160], side: SKY[1], line: rgb(OUTLINE), icon: PALE_GOLD}
        let gold = {face: rgb(GOLD), rim: rgb(PALE_GOLD), side: WHEAT[2], line: rgb(OUTLINE), icon: '#7a4a12'}

        pads = [
            {key: 'left', x: 8, y: top, w: size, h: size, icon: ICON_LEFT, colors: night},
            {key: 'right', x: 14 + size, y: top, w: size, h: size, icon: ICON_RIGHT, colors: night},
            {key: 'fire', x: w - 8 - fire, y: h + ((pad - fire) >> 1), w: fire, h: fire, round: true, icon: ICON_FIRE, colors: gold}
        ]

        pads.forEach(p => {
            // натиснута — разом із землею під нею, щоб повністю перекрити відтиснуту
            p.down = document.createElement('canvas')
            p.down.width = p.w
            p.down.height = p.h

            let d = p.down.getContext('2d')

            d.drawImage(bg, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h)
            d.drawImage(keycap(p.w, p.h, p.round, p.icon, p.colors, true), 0, 0)

            b.drawImage(keycap(p.w, p.h, p.round, p.icon, p.colors, false), p.x, p.y)
        })
    }

    // зірки розкидані сталим псевдовипадком, щоб не шикувались у лінії
    let seed = 7
    let stars = []

    for (let i = 0; i < Math.round(w * field / 1100); i++) {
        seed = (seed * 16807) % 2147483647

        let sx = (seed / 2147483647 * w) | 0

        seed = (seed * 16807) % 2147483647

        stars.push({x: sx, y: 12 + ((seed / 2147483647 * (field - 50)) | 0), c: ''})
    }

    // зірки впечені у фон; щоб мерехтіли, щокадру гасимо лише сьому їх частину,
    // зафарбовуючи кольором неба під нею
    let under = b.getImageData(0, 0, w, field).data

    b.fillStyle = STAR

    for (let i = 0; i < stars.length; i++) {
        let o = (stars[i].y * w + stars[i].x) * 4

        stars[i].c = 'rgb(' + under[o] + ',' + under[o + 1] + ',' + under[o + 2] + ')'

        b.fillRect(stars[i].x, stars[i].y, 1, 1)
    }

    backdrop = {key, bg, stars, pads}

    return backdrop
}

// Розмітка поля під пропорції екрана, щоб воно займало його повністю. Горизонтально
// висота 180, ширина за екраном — на ТВ 16:9 рівно 320 і ціле збільшення.
// Вертикально (телефон) ширина 192 — усе вдвічі крупніше; поле не вище 300, решта
// висоти — смуга кнопок.
function layout(){
    let touch = last_touch
    let sw = window.innerWidth
    let sh = window.innerHeight
    let pad = touch ? PAD_H : 0
    let w, h

    if (touch && sh > sw) {
        let full = Math.round(sh * 192 / sw)

        w = 192
        h = Math.max(240, Math.min(300, full - PAD_H))
        pad = Math.max(PAD_H, full - h)
    }
    else {
        h = 180
        w = Math.max(240, Math.min(427, Math.round(sw * (h + pad) / sh)))
    }

    // на вузькому полі строй щільніший, інакше йому нікуди йти вбік
    let pitch = w < 260 ? 14 : 16
    let back = background(w, h, pad, touch)

    view = {
        w,
        h,
        full: h + pad,
        touch,
        field: h - 14,
        ship_y: h - 26,
        bunker_y: h - 46,
        pitch,
        // на високому полі (телефон) постріл летить довше — дозволяємо три й трохи швидші
        shots: h > 180 ? 3 : 2,
        shot_v: h > 180 ? 6 : 5,
        // на високому полі бомби й пікірувальники падають швидше — щоб від строю до корабля
        // вони летіли стільки ж часу, скільки на ТВ (там корабель на висоті 154)
        pace: (h - 26) / 154,
        left: (w - 10 * pitch - 12) >> 1,
        bg: back.bg,
        stars: back.stars,
        pads: back.pads,
        close: {x: w - 11, y: 3},
        bunkers: [],
        // HUD малюється в окреме полотно лише при зміні чисел, у кадр — одним drawImage
        hud: document.createElement('canvas')
    }

    view.hud.width = w
    view.hud.height = 18

    let gap = (w - 4 * SHEAF_W) / 5

    for (let n = 0; n < 4; n++) {
        let c = document.createElement('canvas')

        c.width = SHEAF_W
        c.height = SHEAF_H

        view.bunkers.push({x: Math.round(gap + n * (SHEAF_W + gap)), y: view.bunker_y, c, grid: sprites.sheaf_grid.slice()})
    }
}

// Нові хвилі — з цілими снопами: перемальовуємо з еталона, сітку копіюємо
function resetBunkers(){
    view.bunkers.forEach(b => {
        let x = b.c.getContext('2d')

        x.clearRect(0, 0, SHEAF_W, SHEAF_H)
        x.drawImage(sprites.sheaf, 0, 0)

        for (let i = 0; i < b.grid.length; i++) {
            b.grid[i] = sprites.sheaf_grid[i]
        }
    })
}

function spawn(x, y, n, color, speed){
    let pool = game.particles

    for (let i = 0; i < pool.length && n > 0; i++) {
        let p = pool[i]

        if (p.t <= 0) {
            let angle = Math.random() * Math.PI * 2
            let v = speed * (0.4 + Math.random() * 0.6)

            p.x = x
            p.y = y
            p.vx = Math.cos(angle) * v
            p.vy = Math.sin(angle) * v - 0.6
            p.t = 12 + ((Math.random() * 12) | 0)
            p.c = color

            n--
        }
    }
}

function wave(){
    game.wave++

    let boss = game.wave % 5 == 0
    let order = game.wave - 1 - Math.floor(game.wave / 5)
    let present = FORMATIONS[order % FORMATIONS.length]
    let armored = game.wave >= 7 ? 3 : game.wave >= 4 ? 2 : game.wave >= 2 ? 1 : 0
    let armor_hp = game.wave >= 9 ? 3 : 2
    let top = 34 + Math.min(game.wave - 1, 4) * 4

    game.aliens = []

    if (!boss) {
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 11; c++) {
                if (present(r, c)) {
                    let type = ROW_TYPE[r]
                    let hx = view.left + c * view.pitch + ((12 - TYPE_W[type]) >> 1)
                    let hy = top + r * 12
                    let hp = r < armored ? armor_hp : 1

                    game.aliens.push({row: r, type, col: c, hx, hy, x: hx, y: hy, hp, armored: hp > 1, alive: true, home: true, state: 0, flash: 0, t: 0})
                }
            }
        }
    }

    game.boss = boss ? {x: (view.w - BOSS_W) >> 1, y: 26, hp: 30 + game.wave * 4, max: 30 + game.wave * 4, t: 0, flash: 0, attack: 0, burst: 0} : null
    game.enter = 45
    game.cursor = 0
    game.dir = 1
    game.drop = false
    game.frame = 0
    game.ufo = null
    game.dive_timer = 120
    game.per_step = game.wave >= 6 ? 3 : 2
    game.fall = (2 + Math.min(game.wave, 8) * 0.12) * view.pace
    game.shots.length = 0
    game.bombs.length = 0

    resetBunkers()
}

function reset(){
    let particles = []

    for (let i = 0; i < PARTICLES; i++) {
        particles.push({x: 0, y: 0, vx: 0, vy: 0, t: 0, c: ''})
    }

    game = {
        score: 0,
        best: parseInt(Storage.get('invaders_best', '0'), 10) || 0,
        lives: 3,
        bonus: false,
        wave: 0,
        chain: 0,
        x: (view.w - SHIP_W) >> 1,
        hit: 0,
        cool: 0,
        shots: [],
        bombs: [],
        booms: [],
        popups: [],
        particles,
        live: 0,
        ufo: null,
        ufo_timer: 400,
        over: false,
        over_t: 0,
        t: 0,
        // числа, з якими HUD намальовано востаннє
        hud: {score: -1, best: -1, mult: 0, lives: -1, fill: -1, view: null}
    }

    queued = 0

    wave()
}

function gameOver(){
    if (game.over) {
        return
    }

    game.over = true
    game.over_t = game.t

    if (game.score > game.best) {
        game.best = game.score

        Storage.set('invaders_best', String(game.score))
    }
}

// Новий старт — лише свіжим натисканням і не одразу: утримуваний вогонь
// не має перескочити екран кінця гри
function restart(){
    if (game.t - game.over_t > 20) {
        reset()
    }
}

function multiplier(){
    return Math.min(5, 1 + Math.floor(game.chain / 4))
}

function addScore(points, x, y){
    let total = points * multiplier()

    game.score += total

    if (x !== undefined) {
        game.popups.push({x, y, text: String(total), t: 36})
    }

    // додаткове життя — раз за гру
    if (!game.bonus && game.score >= 5000) {
        game.bonus = true
        game.lives = Math.min(5, game.lives + 1)
    }
}

function killShip(){
    game.hit = 50
    game.lives--
    game.chain = 0

    spawn(game.x + (SHIP_W >> 1), view.ship_y + 4, 16, GOLD, 2.2)
}

// Влучання в сніп: вищерблюємо нерівну ямку
function bunkerHit(px, py, h){
    for (let i = 0; i < view.bunkers.length; i++) {
        let b = view.bunkers[i]

        for (let k = 0; k < h; k++) {
            let bx = (px | 0) - b.x
            let by = (py | 0) + k - b.y

            if (bx >= 0 && bx < SHEAF_W && by >= 0 && by < SHEAF_H && b.grid[by * SHEAF_W + bx]) {
                let bc = b.c.getContext('2d')

                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        let cx = bx + dx
                        let cy = by + dy

                        if (cx >= 0 && cx < SHEAF_W && cy >= 0 && cy < SHEAF_H && (Math.abs(dx) + Math.abs(dy) < 2 || Math.random() < 0.45)) {
                            b.grid[cy * SHEAF_W + cx] = false
                            bc.clearRect(cx, cy, 1, 1)
                        }
                    }
                }

                return true
            }
        }
    }

    return false
}

// Прибулець, що спустився до снопів, стирає їх
function trample(a){
    for (let i = 0; i < view.bunkers.length; i++) {
        let b = view.bunkers[i]
        let x0 = Math.max(0, (a.x | 0) - b.x)
        let x1 = Math.min(SHEAF_W, (a.x | 0) + TYPE_W[a.type] - b.x)
        let y0 = Math.max(0, (a.y | 0) - b.y)
        let y1 = Math.min(SHEAF_H, (a.y | 0) + ALIEN_H - b.y)

        if (x0 < x1 && y0 < y1) {
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    b.grid[y * SHEAF_W + x] = false
                }
            }

            b.c.getContext('2d').clearRect(x0, y0, x1 - x0, y1 - y0)
        }
    }
}

// Кінець обходу строю: змінюємо кадр і вирішуємо, чи спускатись біля краю.
// Мусить спрацьовувати щоразу, коли курсор проходить кінець списку, — інакше,
// коли останні в списку вже збиті, строй не бачить краю й відлітає за екран.
function endCycle(){
    game.frame = 1 - game.frame

    if (game.drop) {
        game.drop = false
        game.dir = -game.dir

        return
    }

    for (let i = 0; i < game.aliens.length; i++) {
        let q = game.aliens[i]

        if (q.alive && q.home && (q.hx + game.dir * 2 < 4 || q.hx + TYPE_W[q.type] + game.dir * 2 > view.w - 4)) {
            game.drop = true
        }
    }
}

// Наступний живий зі строю; проходячи кінець списку, завершує обхід.
// Без строю (хвиля матки) обходу немає взагалі.
function nextAlien(){
    let list = game.aliens
    let any = false

    for (let i = 0; i < list.length && !any; i++) {
        any = list[i].alive && list[i].home
    }

    if (!any) {
        return null
    }

    for (let tries = 0; tries <= list.length; tries++) {
        if (game.cursor >= list.length) {
            game.cursor = 0

            endCycle()
        }

        let a = list[game.cursor]

        if (a.alive && a.home) {
            return a
        }

        game.cursor++
    }

    return null
}

// Як в оригіналі: за тік рушить кілька прибульців, тож рядами біжить хвиля,
// а що менше їх лишилось, то швидше рух. Рухаємо «гніздо» в строю — навіть
// у того, хто пікірує, щоб він мав куди повернутись.
function stepAliens(){
    for (let step = 0; step < game.per_step; step++) {
        let a = nextAlien()

        if (!a) {
            return
        }

        if (game.drop) {
            a.hy += 6
        }
        else {
            a.hx += game.dir * 2
        }

        if (a.state == 0) {
            a.x = a.hx
            a.y = a.hy

            if (a.y + ALIEN_H > view.bunker_y) {
                trample(a)
            }

            if (a.y + ALIEN_H >= view.ship_y) {
                gameOver()

                return
            }
        }

        game.cursor++
    }
}

// Бомба в корабель: бічна швидкість під справжню швидкість падіння
function aimedBomb(x, y){
    let frames = Math.max(10, (view.ship_y - y) / game.fall)
    let vx = (game.x + (SHIP_W >> 1) - x) / frames

    game.bombs.push({x, y, vx: Math.max(-1.2, Math.min(1.2, vx)), k: 0})
}

// Пікірування як у Galaga: дуга вбік, потім униз до корабля з пострілами.
// Свій — після нижнього краю заходить згори назад у стрій; посланий маткою — зникає.
function startDive(a){
    a.state = 1
    a.t = 0
    a.sx = a.x
    a.sy = a.y
    a.side = a.x < view.w / 2 ? -1 : 1
}

function updateDivers(){
    let fall = Math.min(3, 2 + game.wave * 0.1) * view.pace
    let flying = 0
    let ready = 0

    for (let i = 0; i < game.aliens.length; i++) {
        let a = game.aliens[i]

        if (!a.alive) {
            continue
        }

        if (a.state == 0) {
            ready++

            continue
        }

        flying++
        a.t++

        if (a.state == 1) {
            if (a.t < 24) {
                let arc = Math.sin(a.t / 24 * Math.PI)

                a.x = a.sx + a.side * arc * 14
                a.y = a.sy - arc * 10 + a.t * 0.3
            }
            else {
                let pull = (game.x + 1 - a.x) * 0.05

                a.x += Math.max(-1.5, Math.min(1.5, pull)) + Math.sin(a.t / 6) * 0.6
                a.y += fall
            }

            if ((a.t == 30 || a.t == 52) && a.y < view.ship_y - 30) {
                aimedBomb(a.x + (TYPE_W[a.type] >> 1), a.y + ALIEN_H)
            }

            if (!game.hit && overlap(a.x, a.y, TYPE_W[a.type], ALIEN_H, game.x, view.ship_y, SHIP_W, SHIP_H)) {
                a.alive = false

                spawn(a.x + 5, a.y + 4, 8, TYPE_COLOR[a.type], 1.8)
                killShip()

                continue
            }

            if (a.y > view.field) {
                if (a.home) {
                    a.state = 2
                    a.x = a.hx
                    a.y = -12
                }
                else {
                    a.alive = false
                }
            }
        }
        else {
            let dx = a.hx - a.x
            let dy = a.hy - a.y
            let dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < 3) {
                a.state = 0
                a.x = a.hx
                a.y = a.hy
            }
            else {
                a.x += dx / dist * 2.5
                a.y += dy / dist * 2.5
            }
        }
    }

    // хто наступний пікірує: випадковий зі строю
    if (--game.dive_timer <= 0) {
        if (ready && flying < Math.min(3, 1 + Math.floor(game.wave / 3))) {
            let pick = (Math.random() * ready) | 0

            for (let i = 0; i < game.aliens.length; i++) {
                let a = game.aliens[i]

                if (a.alive && a.state == 0 && pick-- == 0) {
                    startDive(a)

                    break
                }
            }
        }

        game.dive_timer = Math.max(40, 150 - game.wave * 12) + ((Math.random() * 60) | 0)
    }
}

// Матка: гойдається над строєм, по черзі віялом, прицільною чергою і викликом пікірувальників
function updateBoss(){
    let b = game.boss

    b.t++

    b.x = ((view.w - BOSS_W) >> 1) + Math.sin(b.t / 60) * ((view.w >> 1) - 34)
    b.y = 26 + Math.sin(b.t / 23) * 3

    if (b.flash) {
        b.flash--
    }

    let cx = b.x + (BOSS_W >> 1)
    let cy = b.y + BOSS_H - 2

    if (b.burst && b.t % 6 == 0) {
        b.burst--

        aimedBomb(cx, cy)
    }

    if (b.t % Math.max(40, 70 - game.wave * 2) == 0) {
        let kind = b.attack++ % 3

        if (kind == 0) {
            for (let i = -2; i <= 2; i++) {
                game.bombs.push({x: cx, y: cy, vx: i * 0.5, k: 0})
            }
        }
        else if (kind == 1) {
            b.burst = 3
        }
        else {
            for (let s = -1; s <= 1; s += 2) {
                let a = {row: 1, type: 1, col: 0, hx: 0, hy: 0, x: cx + s * 18, y: cy - 6, hp: 1, armored: false, alive: true, home: false, state: 0, flash: 0, t: 0}

                game.aliens.push(a)
                startDive(a)
            }
        }
    }
}

function hitAlien(a){
    a.hp--

    if (a.hp > 0) {
        a.flash = 4

        spawn(a.x + 5, a.y + 4, 3, STEEL, 1.2)

        return
    }

    a.alive = false
    game.chain++

    // броньований — удвічі, збитий у пікіруванні — ще вдвічі й з цифрою
    addScore(ROW_SCORE[a.row] * (a.armored ? 2 : 1) * (a.state ? 2 : 1), a.state ? a.x : undefined, a.y)

    spawn(a.x + 5, a.y + 4, 8, TYPE_COLOR[a.type], 1.6)

    game.booms.push({x: (a.x | 0) - 1, y: a.y | 0, t: 6})
}

// Постріл гравця за тік; false — постріл зник
function moveShot(shot){
    shot.y -= view.shot_v

    let list = game.aliens

    for (let i = 0; i < list.length; i++) {
        let a = list[i]

        if (a.alive && overlap(shot.x, shot.y, 1, SHOT_H, a.x, a.y, TYPE_W[a.type], ALIEN_H)) {
            hitAlien(a)

            return false
        }
    }

    let b = game.boss

    if (b && overlap(shot.x, shot.y, 1, SHOT_H, b.x, b.y, BOSS_W, BOSS_H)) {
        b.hp--
        b.flash = 3
        game.chain++

        addScore(10)
        spawn(shot.x, shot.y, 3, BOMB, 1.2)

        if (b.hp <= 0) {
            game.boss = null

            addScore(1000 * (game.wave / 5), b.x + 14, b.y + 10)
            spawn(b.x + (BOSS_W >> 1), b.y + 12, 24, BOMB, 3)
            spawn(b.x + (BOSS_W >> 1), b.y + 12, 16, GOLD, 2.4)
        }

        return false
    }

    if (game.ufo && overlap(shot.x, shot.y, 1, SHOT_H, game.ufo.x, UFO_Y, UFO_W, UFO.length)) {
        game.chain++

        addScore(UFO_SCORE[(Math.random() * UFO_SCORE.length) | 0], game.ufo.x + 2, UFO_Y + 1)
        spawn(game.ufo.x + (UFO_W >> 1), UFO_Y + 3, 10, ORANGE, 1.8)

        game.ufo = null

        return false
    }

    if (bunkerHit(shot.x, shot.y, SHOT_H)) {
        return false
    }

    // промах збиває серію
    if (shot.y < 12) {
        game.chain = 0

        return false
    }

    return true
}

// Бомба за тік; false — бомба зникла
function moveBomb(b){
    b.y += game.fall
    b.x += b.vx
    b.k++

    if (bunkerHit(b.x, b.y, BOMB_H)) {
        return false
    }

    if (!game.hit && overlap(b.x, b.y, 2, BOMB_H, game.x, view.ship_y, SHIP_W, SHIP_H)) {
        killShip()

        return false
    }

    return b.y < view.field && b.x > 0 && b.x < view.w
}

function timed(item){
    return --item.t > 0
}

// Найнижчий у строю в колонці — він кидає бомбу
function lowest(col){
    let low = null

    for (let i = 0; i < game.aliens.length; i++) {
        let a = game.aliens[i]

        if (a.alive && a.state == 0 && a.home && a.col == col && (!low || a.y > low.y)) {
            low = a
        }
    }

    return low
}

function update(){
    game.t++

    game.live = 0

    for (let i = 0; i < PARTICLES; i++) {
        let p = game.particles[i]

        if (p.t > 0) {
            p.t--
            p.x += p.vx
            p.y += p.vy
            p.vy += 0.08

            game.live++
        }
    }

    compact(game.booms, timed)
    compact(game.popups, timed)

    if (game.over) {
        return
    }

    if (game.hit) {
        if (--game.hit == 0 && game.lives <= 0) {
            gameOver()

            return
        }
    }
    else {
        if (keys.left) {
            game.x = Math.max(4, game.x - 2)
        }

        if (keys.right) {
            game.x = Math.min(view.w - SHIP_W - 4, game.x + 2)
        }
    }

    // строй злітається згори, поки на екрані номер хвилі
    if (game.enter) {
        game.enter--
        queued = 0

        return
    }

    if (game.cool) {
        game.cool--
    }

    if (!game.hit && (keys.fire || queued) && !game.cool && game.shots.length < view.shots) {
        game.shots.push({x: game.x + (SHIP_W >> 1), y: view.ship_y - SHOT_H})
        game.cool = 10
        queued = 0
    }

    if (queued) {
        queued--
    }

    compact(game.shots, moveShot)

    if (game.boss) {
        updateBoss()
    }

    updateDivers()

    let alive = 0

    for (let i = 0; i < game.aliens.length; i++) {
        if (game.aliens[i].alive) {
            alive++
        }
    }

    if (!alive && !game.boss) {
        wave()

        return
    }

    // бомби строю: найнижчий у випадковій колонці
    if (game.bombs.length < 4 && Math.random() < 0.03 + Math.min(game.wave, 8) * 0.006) {
        let low = lowest((Math.random() * 11) | 0)

        if (low) {
            game.bombs.push({x: low.x + (TYPE_W[low.type] >> 1), y: low.y + ALIEN_H, vx: 0, k: 0})
        }
    }

    compact(game.bombs, moveBomb)

    if (!game.boss && !game.ufo && --game.ufo_timer <= 0) {
        let dir = Math.random() < 0.5 ? 1 : -1

        game.ufo = {x: dir > 0 ? -UFO_W : view.w, dir}
        game.ufo_timer = 500 + ((Math.random() * 300) | 0)
    }

    if (game.ufo) {
        game.ufo.x += game.ufo.dir

        if (game.ufo.x < -UFO_W || game.ufo.x > view.w) {
            game.ufo = null
        }
    }

    stepAliens()

    for (let i = 0; i < game.aliens.length; i++) {
        if (game.aliens[i].flash) {
            game.aliens[i].flash--
        }
    }
}

function drawHud(){
    let font = sprites.font
    let hud = game.hud
    let best = Math.max(game.best, game.score)
    let mult = multiplier()
    let lives = Math.max(0, game.lives)
    let bar = Math.min(120, view.w - 80)
    let fill = game.boss ? Math.ceil(bar * game.boss.hp / game.boss.max) : -1

    if (hud.score != game.score || hud.mult != mult || hud.best != best || hud.lives != lives || hud.fill != fill || hud.view != view) {
        let c = view.hud.getContext('2d')
        let mult_text = mult > 1 ? '*' + mult : ''
        let score_text = pad5(game.score)
        let best_text = pad5(best)
        let best_x = (view.w - textWidth(best_text, font.hud)) >> 1
        let right = view.touch ? view.w - 22 : view.w - 4

        hud.score = game.score
        hud.mult = mult
        hud.best = best
        hud.lives = lives
        hud.fill = fill
        hud.view = view

        c.clearRect(0, 0, view.w, 18)

        text(c, score_text, font.hud, 6, 4)

        // множник серії поруч із рахунком
        if (mult_text) {
            text(c, mult_text, font.accent, 8 + textWidth(score_text, font.hud), 4)
        }

        c.drawImage(sprites.crown, best_x - 11, 4)

        text(c, best_text, font.hud, best_x, 4)

        for (let i = 0; i < lives; i++) {
            c.drawImage(sprites.life, right - 8 - i * 10, 4)
        }

        if (view.touch) {
            c.drawImage(sprites.cross, view.close.x, view.close.y)
        }

        // здоровʼя матки
        if (fill >= 0) {
            let x = (view.w - bar) >> 1

            c.fillStyle = OUTLINE
            c.fillRect(x - 1, 12, bar + 2, 4)
            c.fillStyle = BOMB
            c.fillRect(x, 13, fill, 2)
        }
    }

    ctx.drawImage(view.hud, 0, 0)
}

// Номер хвилі по центру, поки строй злітається; на старті гри над ним — назва
function drawBanner(){
    let font = sprites.font
    let number = String(game.wave)
    let tw = textWidth('WAVE', font.title)
    let nw = textWidth(number, font.number)
    let x = (view.w - tw - 8 - nw) >> 1
    let y = (view.h >> 1) - 12

    if (game.wave == 1) {
        text(ctx, 'SIAIVO', font.logo, (view.w - textWidth('SIAIVO', font.logo)) >> 1, y - 32)
    }

    text(ctx, 'WAVE', font.title, x, y)
    text(ctx, number, font.number, x + tw + 8, y - 1)
}

function drawOver(){
    let font = sprites.font
    let cy = (view.h >> 1) - 30

    ctx.fillStyle = 'rgba(6,11,27,0.82)'
    ctx.fillRect(0, cy, view.w, 66)

    text(ctx, 'GAME OVER', font.title, (view.w - textWidth('GAME OVER', font.title)) >> 1, cy + 10)

    // підказка, як почати знову: OK на пульті чи дотик на сенсорі; блимає
    if (((game.t - game.over_t) >> 4) & 1) {
        let hint = view.touch ? 'TAP' : 'OK'
        let iw = textWidth(hint, font.small)
        let bx = (view.w - iw - 10) >> 1
        let by = cy + 40

        ctx.fillStyle = PALE_GOLD
        ctx.fillRect(bx, by, iw + 10, 1)
        ctx.fillRect(bx, by + 12, iw + 10, 1)
        ctx.fillRect(bx - 1, by + 1, 1, 11)
        ctx.fillRect(bx + iw + 10, by + 1, 1, 11)

        text(ctx, hint, font.small, bx + 5, by + 3)
    }
}

function draw(){
    ctx.drawImage(view.bg, 0, 0)

    // згасла група зірок змінюється раз на 8 кроків
    for (let i = (7 - (game.t >> 3) % 7) % 7; i < view.stars.length; i += 7) {
        ctx.fillStyle = view.stars[i].c
        ctx.fillRect(view.stars[i].x, view.stars[i].y, 1, 1)
    }

    for (let i = 0; i < view.bunkers.length; i++) {
        ctx.drawImage(view.bunkers[i].c, view.bunkers[i].x, view.bunkers[i].y)
    }

    let lift = game.enter * 3

    for (let i = 0; i < game.aliens.length; i++) {
        let a = game.aliens[i]

        if (a.alive) {
            let set = a.flash ? sprites.flash : a.hp > 1 ? sprites.armor : sprites.aliens
            // посланці матки не в строю — махають крилами за часом
            let frame = a.home ? game.frame : (game.t >> 3) & 1

            ctx.drawImage(set[a.type][frame], (a.x | 0) - 1, (a.y | 0) - 1 - (a.state == 0 ? lift : 0))
        }
    }

    if (game.boss) {
        let b = game.boss
        let frames = b.flash ? sprites.boss_flash : sprites.boss

        ctx.drawImage(frames[(b.t >> 4) & 1], b.x | 0, (b.y | 0) - lift)
    }

    if (game.ufo) {
        ctx.drawImage(sprites.ufo, game.ufo.x - 1, UFO_Y - 1)
    }

    for (let i = 0; i < game.booms.length; i++) {
        ctx.drawImage(sprites.boom, game.booms[i].x - 1, game.booms[i].y - 1)
    }

    let color = ''

    for (let i = 0; i < PARTICLES; i++) {
        let p = game.particles[i]

        if (p.t > 0) {
            if (p.c != color) {
                color = p.c
                ctx.fillStyle = color
            }

            ctx.fillRect(p.x | 0, p.y | 0, 1, 1)
        }
    }

    if (game.hit) {
        if (game.hit > 30) {
            ctx.drawImage(sprites.ship_boom[(game.hit >> 2) & 1], game.x - 1, view.ship_y - 1)
        }
        // після вибуху корабель повертається блимаючи
        else if (!game.over && game.lives > 0 && (game.hit >> 2) & 1) {
            ctx.drawImage(sprites.ship, game.x - 1, view.ship_y - 1)
        }
    }
    else if (!game.over) {
        ctx.drawImage(sprites.ship, game.x - 1, view.ship_y - 1)
    }

    ctx.fillStyle = SHOT

    for (let i = 0; i < game.shots.length; i++) {
        ctx.fillRect(game.shots[i].x, game.shots[i].y, 1, SHOT_H)
    }

    for (let i = 0; i < game.bombs.length; i++) {
        let b = game.bombs[i]

        ctx.drawImage(sprites.bomb[(b.k >> 2) & 1], b.x | 0, b.y | 0)
    }

    for (let i = 0; i < game.popups.length; i++) {
        let p = game.popups[i]

        text(ctx, p.text, sprites.font.accent, p.x | 0, (p.y | 0) - ((36 - p.t) >> 2))
    }

    // натиснуті кнопки — поверх відтиснутих у фоні
    if (view.pads) {
        for (let i = 0; i < view.pads.length; i++) {
            let p = view.pads[i]

            if (keys[p.key]) {
                ctx.drawImage(p.down, p.x, p.y)
            }
        }
    }

    drawHud()

    if (game.enter && !game.over) {
        drawBanner()
    }

    if (game.over) {
        drawOver()
    }
}

function tick(){
    if (!root) {
        return
    }

    // під заставкою гра стоїть і не малюється
    if (!Screensaver.isWorked()) {
        let from = game.t

        lag += TICK

        while (lag >= STEP) {
            lag -= STEP
            update()
        }

        // на екрані кінця гри без ефектів змінюється лише блимання — раз на 8 кроків
        let idle = game.over && !game.live && !game.booms.length && !game.popups.length && (from >> 3) == (game.t >> 3)

        if (!idle) {
            draw()
        }
    }

    timer = setTimeout(tick, TICK)
}

function code(e){
    return e.keyCode || e.which
}

function gameKey(k){
    return KEYS_LEFT.indexOf(k) > -1 || KEYS_RIGHT.indexOf(k) > -1 || KEYS_FIRE.indexOf(k) > -1
}

function swallow(e){
    e.preventDefault()
    e.stopPropagation()
}

function onKeydown(e){
    let k = code(e)

    // заставка поверх гри: будь-яка клавіша лише знімає її
    if (Screensaver.isWorked()) {
        Screensaver.stop()
        swallow(e)

        return
    }

    if (!gameKey(k)) {
        return
    }

    swallow(e)

    // Keypad цих клавіш не бачить, тож заставку відкладаємо самі
    Screensaver.resetTimer()

    if (KEYS_LEFT.indexOf(k) > -1) {
        keys.left = true
    }
    else if (KEYS_RIGHT.indexOf(k) > -1) {
        keys.right = true
    }
    else {
        // автоповтор утримуваного вогню не перезапускає гру
        if (game.over && !keys.fire) {
            restart()
        }

        if (!keys.fire) {
            queued = 12
        }

        keys.fire = true
    }
}

function onKeyup(e){
    let k = code(e)

    if (!gameKey(k)) {
        return
    }

    swallow(e)

    if (KEYS_LEFT.indexOf(k) > -1) {
        keys.left = false
    }
    else if (KEYS_RIGHT.indexOf(k) > -1) {
        keys.right = false
    }
    else {
        keys.fire = false
    }
}

// Вогонь, утримуваний у мить закриття: його keyup не має дійти до Keypad,
// інакше Controller.enter «натисне» картку гри й відкриє її знову
function swallowFireUp(e){
    if (KEYS_FIRE.indexOf(code(e)) > -1) {
        swallow(e)

        window.removeEventListener('keyup', swallowFireUp, true)
    }
}

// Втрата фокуса (alt-tab, перемикання застосунку) — keyup може не прийти
function releaseKeys(){
    keys.left = false
    keys.right = false
    keys.fire = false
}

function onVisibility(){
    if (document.hidden) {
        releaseKeys()
    }
}

// Яку клавішу тисне точка x буфера: з кнопками — за межами між ними по всій висоті
// екрана (промах повз кнопку не карається), без кнопок — за третинами
function zone(x){
    let p = view.pads

    if (p) {
        return x < p[1].x - 3 ? 'left' : x < (p[1].x + p[1].w + p[2].x) / 2 ? 'right' : 'fire'
    }

    return x < view.w / 3 ? 'left' : x > view.w * 2 / 3 ? 'right' : 'fire'
}

// Дотики й миша. На сенсорі кожна подія перераховує клавіші за всіма пальцями на
// склі — так одночасно працюють стрілка під лівим і вогонь під правим.
function onPointer(e){
    // хвіст дотику, що почався до закриття, приходить уже на відʼєднаний елемент
    if (!root) {
        return
    }

    // мишею — лише ліва кнопка
    if (e.type == 'mousedown' && e.button) {
        return
    }

    e.preventDefault()

    Screensaver.resetTimer()

    let start = e.type == 'touchstart' || e.type == 'mousedown'
    let rect = canvas.getBoundingClientRect()
    let scale = rect.width / view.w

    // хрестик — лише першим пальцем, щоб другий випадково не закрив гру
    if (start && view.touch && (!e.touches || e.touches.length == 1)) {
        let p = e.changedTouches ? e.changedTouches[0] : e
        let bx = (p.clientX - rect.left) / scale
        let by = (p.clientY - rect.top) / scale

        if (bx >= view.close.x - 8 && bx <= view.w && by >= 0 && by <= view.close.y + 15) {
            close()

            return
        }
    }

    if (start && game.over) {
        restart()

        return
    }

    let fired = keys.fire
    let points = e.touches || (e.type == 'mousedown' ? [e] : [])

    releaseKeys()

    for (let i = 0; i < points.length; i++) {
        keys[zone((points[i].clientX - rect.left) / scale)] = true
    }

    if (keys.fire && !fired) {
        queued = 12
    }
}

// Поле вже в пропорціях екрана, тож заповнює його; після повороту — вписуємо
function fit(){
    let scale = Math.min(window.innerWidth / view.w, window.innerHeight / view.full)
    let w = Math.floor(view.w * scale)
    let h = Math.floor(view.full * scale)

    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = ((window.innerWidth - w) >> 1) + 'px'
    canvas.style.top = ((window.innerHeight - h) >> 1) + 'px'
}

function app(visible){
    let el = document.getElementById('app')

    if (el) {
        el.style.visibility = visible ? '' : 'hidden'
    }
}

function open(){
    if (root) {
        return
    }

    if (!sprites) {
        buildSprites()
    }

    layout()

    back_to = Controller.enabled().name || 'content'

    root = document.createElement('div')
    root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999;background:' + NIGHT + ';'
        + '-webkit-user-select:none;user-select:none;touch-action:none'

    canvas = document.createElement('canvas')
    canvas.width = view.w
    canvas.height = view.full
    canvas.style.cssText = 'position:absolute;image-rendering:-webkit-optimize-contrast;image-rendering:-moz-crisp-edges;image-rendering:pixelated'

    ctx = canvas.getContext('2d')

    root.appendChild(canvas)
    document.body.appendChild(root)

    // інтерфейс під грою не потрібен — хай рушій його не перемальовує
    app(false)

    fit()
    releaseKeys()

    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('keyup', onKeyup, true)
    window.addEventListener('resize', fit)
    window.addEventListener('blur', releaseKeys)
    document.addEventListener('visibilitychange', onVisibility)

    POINTER_EVENTS.forEach(name => root.addEventListener(name, onPointer))

    // «Назад» приходить через Keypad → Controller; решту клавіш гра забирає сама
    Controller.add('invaders', {
        toggle: () => {},
        up: () => {},
        down: () => {},
        left: () => {},
        right: () => {},
        enter: () => {},
        back: close
    })

    Controller.toggle('invaders')

    reset()
    tick()
}

function close(){
    if (!root) {
        return
    }

    clearTimeout(timer)

    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('keyup', onKeyup, true)
    window.removeEventListener('resize', fit)
    window.removeEventListener('blur', releaseKeys)
    document.removeEventListener('visibilitychange', onVisibility)

    POINTER_EVENTS.forEach(name => root.removeEventListener(name, onPointer))

    // якщо keyup так і не прийде (втрата фокуса), не ковтаємо чужий OK згодом
    if (keys.fire) {
        window.addEventListener('keyup', swallowFireUp, true)

        setTimeout(() => window.removeEventListener('keyup', swallowFireUp, true), 3000)
    }

    releaseKeys()

    root.parentNode.removeChild(root)

    app(true)

    root = canvas = ctx = game = view = null

    Controller.toggle(back_to)
}

Lang.add({
    invaders_title: {
        uk: 'Сяйво: Нашестя',
        en: 'Siaivo: Invasion',
        be: 'Сяйва: Нашэсце',
        zh: 'Siaivo：入侵',
        pt: 'Siaivo: Invasão',
        bg: 'Сяйво: Нашествие',
        he: 'סיאיבו: פלישה',
        cs: 'Siaivo: Invaze',
        ro: 'Siaivo: Invazia',
        fr: 'Siaivo : Invasion',
        pl: 'Siaivo: Inwazja',
        ru: 'Сяйво: Нашествие'
    }
})

// Картка гри. Постер — готовий файл (public/img), тож каталог нічого не малює.
// Натискання підміняємо штатно (onlyEnter), а з модулів лишаємо тільки сам вигляд
// і рік: без закладок, меню й плагінів картку не збережеш як фільм.
function invadersCard(){
    return {
        id: 'siaivo_invasion',
        title: Lang.translate('invaders_title'),
        original_title: 'Siaivo: Invasion',
        release_date: '2026-10-26',
        img: './img/siaivo-invasion.png',
        params: {
            module: CardModule.only('Card', 'Release', 'Callback'),
            emit: {
                onlyEnter: open
            }
        }
    }
}

// Перша порція рядів «Фантастики» — дописуємо картку гри в кінець першого ряду.
// Копіюємо, а не мутуємо: reguest тримає відповіді в кеші.
let category = Api.category

Api.category = function(params, oncomplite, onerror){
    if (!params || GENRES.indexOf(String(params.genres)) == -1) {
        return category.apply(this, arguments)
    }

    return category.call(this, params, rows => {
        if (Array.isArray(rows) && rows[0] && Array.isArray(rows[0].results)) {
            rows = rows.slice()
            rows[0] = Object.assign({}, rows[0], {results: rows[0].results.concat([invadersCard()])})
        }

        oncomplite(rows)
    }, onerror)
}

// Розкладка під сенсор чи пульт — за тим, чим людина користувалась останнім
window.addEventListener('touchstart', () => {
    last_touch = true
}, true)

window.addEventListener('keydown', () => {
    last_touch = false
}, true)
