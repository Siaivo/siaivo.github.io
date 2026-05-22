# ES5 Backward Compatibility for Custom Code

## Проблема

Код у `src/custom/` пишеться з використанням ES6+ синтаксису та API.
Результатом користуються пристрої різних поколінь: сучасні Smart TV (Tizen 5+, WebOS 4+),
старіші моделі (Tizen 2.x, WebOS 1.x, Orsay), а також Android TV з різними версіями Chrome.

**Синтаксис** (const, let, arrow functions, import/export, destructuring) — вже транспілюється
Babel-ом через `@babel/preset-env` у `gulpfile.js`.

**Runtime API** (Object.values, Array.flat, Promise.allSettled, тощо) — Babel не додає
автоматично. Частина покрита ручними поліфілами в `src/utils/define/define.js`, але при
додаванні нового коду в custom можна випадково використати API без поліфілу.

## Рішення

Підключити **core-js** з автоматичним визначенням потрібних поліфілів через Babel.

### Що змінюється

#### 1. package.json

Додається залежність:

```
"core-js": "^3.x"
```

#### 2. gulpfile.js — Babel конфігурація

Було:

```js
babel({
    babelHelpers: 'bundled',
    presets: ['@babel/preset-env']
})
```

Стає:

```js
babel({
    babelHelpers: 'bundled',
    presets: [
        ['@babel/preset-env', {
            targets: {
                chrome: '38',      // Старі Android TV, Tizen 2.x
                safari: '7',       // Orsay WebKit ~534
                samsung: '4',      // Samsung Internet на старих TV
            },
            useBuiltIns: 'usage',  // Babel сам визначає які поліфіли потрібні
            corejs: 3              // Версія core-js
        }]
    ]
})
```

Аналогічна зміна для функції `bubbleFile()` (збірка плагінів).

#### 3. Існуючі поліфіли (define.js)

**Не видаляються.** Вони працюють як перший рівень захисту для дуже старих рушіїв.
core-js використовує перевірки на наявність фічі (`if (!Array.prototype.flat) ...`),
тому дублювання не буде — core-js пропустить те, що вже визначено.

### Як це працює

```
Код у src/custom/     →  Rollup збирає модулі    →  Babel аналізує код
     (ES6+)                                            ↓
                                              Знаходить використані API
                                              (Array.flat, Object.values, ...)
                                                       ↓
                                              Перевіряє targets:
                                              chrome 38, safari 7, samsung 4
                                                       ↓
                                              Додає ТІЛЬКИ потрібні поліфіли
                                              з core-js автоматично
                                                       ↓
                                              Транспілює синтаксис → ES5
                                                       ↓
                                              dest/app.js — готовий бандл
```

### Що це дає

1. **Пишемо ES6+ у custom** — без обмежень
2. **Babel сам додає поліфіли** — не потрібно вручну стежити
3. **Тільки потрібне** — `useBuiltIns: 'usage'` додає лише ті поліфіли, які реально є в коді
4. **Старі пристрої працюють** — targets гарантують сумісність
5. **Існуючі поліфіли залишаються** — подвійний захист, без конфліктів

### Вплив на бандл

- Додаткові ~50–100 КБ до розміру app.js (залежить від кількості використаних API)
- Для веб-додатку на Smart TV — несуттєво
- Завантажується один раз, далі з кешу

### Перевірка

Після змін:

```bash
# Перевірити що збірка працює
gulp build_github

# Перевірити що фінальний app.js не містить ES6 синтаксису
# (не повинно бути const, let, =>, class у верхньому рівні)
grep -c 'const \|let \|=> ' build/web/app.js
```
