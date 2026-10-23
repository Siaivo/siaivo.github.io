// Сповіщення мають бути над усіма шарами: у ядрі Noty (99) і Bell (100) ховаються під консоллю (100)
// та модалкою над нею (200). Через body — app.css інколи підключається пізніше за цей style
let style = document.createElement('style')

style.textContent = 'body .noty, body .bell{z-index: 300}'

document.head.appendChild(style)
