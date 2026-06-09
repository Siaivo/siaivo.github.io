/**
 * Holiday Logo Themes — карта тем для UA публічних свят
 * 
 * Кожна тема визначає:
 *   color     — цільовий колір для hue-rotate фільтру (hex або null для прапора UA)
 *   glow      — колір glow-ефекту (CSS color string)
 *   symbol    — символ (emoji або SVG-рядок), що з'являється поряд з логотипом
 *   animation — тип анімації: 'pulse' | 'float' | 'sparkle' | 'none'
 *   intensity — максимальна інтенсивність ефекту (0.0..1.0)
 *   hueShift  — значення hue-rotate у градусах для filter (null = без зміни кольору)
 *   saturate  — множник насиченості (null = без зміни)
 */

var THEMES = {
    // Новий рік — срібно-мерехтливий
    "New Year's Day": {
        color: '#C0C0C0',
        glow: 'rgba(192, 192, 192, 0.7)',
        symbol: '✨',
        animation: 'sparkle',
        intensity: 0.55,
        hueShift: 190,
        saturate: 0.3
    },

    // Міжнародний жіночий день — рожевий, квітучий
    "International Women's Day": {
        color: '#FF69B4',
        glow: 'rgba(255, 105, 180, 0.6)',
        symbol: '🌸',
        animation: 'float',
        intensity: 0.5,
        hueShift: 300,
        saturate: 1.8
    },

    // Великдень — фіолетово-зелений, урочистий
    "Easter Sunday": {
        color: '#9B59B6',
        glow: 'rgba(155, 89, 182, 0.55)',
        symbol: '🌿',
        animation: 'pulse',
        intensity: 0.5,
        hueShift: 270,
        saturate: 1.5
    },

    // День праці — червоний
    "International Workers' Day": {
        color: '#E74C3C',
        glow: 'rgba(231, 76, 60, 0.6)',
        symbol: '✊',
        animation: 'pulse',
        intensity: 0.5,
        hueShift: 0,
        saturate: 2.0
    },

    // День Перемоги — темно-червоний, зірка
    "Victory day over Nazism in World War II": {
        color: '#DC143C',
        glow: 'rgba(220, 20, 60, 0.65)',
        symbol: '⭐',
        animation: 'pulse',
        intensity: 0.6,
        hueShift: 355,
        saturate: 2.2
    },

    // Трійця / П'ятидесятниця — зелений, духовний
    "Pentecost": {
        color: '#27AE60',
        glow: 'rgba(39, 174, 96, 0.5)',
        symbol: '🕊️',
        animation: 'float',
        intensity: 0.45,
        hueShift: 140,
        saturate: 1.8
    },

    // День Конституції — синій (прапор)
    "Constitution Day": {
        color: '#0057B8',
        glow: 'rgba(0, 87, 184, 0.6)',
        symbol: '⚖️',
        animation: 'pulse',
        intensity: 0.55,
        hueShift: 220,
        saturate: 1.6
    },

    // День Державності — синьо-золотий (прапор UA)
    "Statehood Day": {
        color: '#0057B8',
        glow: 'rgba(255, 215, 0, 0.55)',
        symbol: '🏛️',
        animation: 'float',
        intensity: 0.6,
        hueShift: 215,
        saturate: 1.8
    },

    // День Незалежності — найяскравіший, прапор UA
    "Independence Day": {
        color: '#FFD700',
        glow: 'rgba(255, 215, 0, 0.7)',
        symbol: '🇺🇦',
        animation: 'sparkle',
        intensity: 0.75,
        hueShift: 45,
        saturate: 2.0
    },

    // День захисників — темно-синій, строгий
    "Defender of Ukraine Day": {
        color: '#1A3A6B',
        glow: 'rgba(26, 58, 107, 0.6)',
        symbol: '🛡️',
        animation: 'pulse',
        intensity: 0.55,
        hueShift: 225,
        saturate: 1.4
    },

    // Різдво — золото-червоне
    "Christmas Day": {
        color: '#C0392B',
        glow: 'rgba(255, 215, 0, 0.6)',
        symbol: '⭐',
        animation: 'sparkle',
        intensity: 0.65,
        hueShift: 10,
        saturate: 2.0
    }
}

/**
 * Стани часу для плавних переходів
 * daysDiff: число днів між today і датою свята
 *   daysDiff > 0  → свято ще попереду (наприклад, 2 = за 2 дні)
 *   daysDiff = 0  → сьогодні свято
 *   daysDiff < 0  → свято минуло (наприклад, -1 = учора)
 * → повертає коефіцієнт інтенсивності від 0 до 1
 */
function getIntensityMultiplier(daysDiff) {
    // Нормалізуємо -0 → 0
    var d = daysDiff === 0 ? 0 : daysDiff
    if (d === 0)  return 1.0   // День свята
    if (d === 1)  return 0.6   // За 1 день до свята
    if (d === 2)  return 0.4   // За 2 дні до свята
    if (d === 3)  return 0.2   // За 3 дні до свята (преактивація)
    if (d === -1) return 0.2   // День після свята (затухання)
    return 0                   // Не в діапазоні
}

/**
 * Знайти тему для конкретної дати серед списку свят
 * @param {Array} holidays — список свят з API
 * @param {string} todayStr — поточна дата у форматі YYYY-MM-DD
 * @returns {{ theme: Object, multiplier: number, holiday: Object }|null}
 */
function resolveTheme(holidays, todayStr) {
    var today = new Date(todayStr + 'T00:00:00')
    var bestResult = null

    holidays.forEach(function(h) {
        var hDate = new Date(h.date + 'T00:00:00')
        var diffMs = hDate - today  // позитивне = свято попереду
        // daysDiff > 0  → за скільки днів свято (майбутнє)
        // daysDiff = 0  → сьогодні свято
        // daysDiff < 0  → скільки днів тому було свято (минуле)
        var daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24))

        var multiplier = getIntensityMultiplier(daysDiff)
        if (multiplier <= 0) return

        var theme = THEMES[h.name]
        if (!theme) {
            // Невідоме свято — використати дефолтну тему UA прапора
            theme = {
                color: '#0057B8',
                glow: 'rgba(0, 87, 184, 0.5)',
                symbol: '\uD83C\uDDFA\uD83C\uDDE6',
                animation: 'pulse',
                intensity: 0.4,
                hueShift: 220,
                saturate: 1.5
            }
        }

        // Пріоритет: точний день свята > найближче свято
        var priority = daysDiff === 0 ? 1000 : multiplier
        if (!bestResult || priority > bestResult.priority) {
            bestResult = {
                theme: theme,
                multiplier: multiplier,
                holiday: h,
                priority: priority,
                daysDiff: daysDiff
            }
        }
    })

    return bestResult
}

export default {
    THEMES: THEMES,
    resolveTheme: resolveTheme,
    getIntensityMultiplier: getIntensityMultiplier
}
