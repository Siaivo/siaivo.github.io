# Nuvio — інтеграція трекінгу у Lampa ME (custom layer)

Джерело: Notion `Nuvio — інтеграція трекінгу у Lampa ME (410cb5bd39c68009a822ce577ef17006)`, статус на 16.11.2026: Phase 0–3 завершено, Phase 4 активна. Гілка `rework`.

## Мета
Двобічна синхронізація переглядів і прогресу між Lampa ME і Nuvio (cloud або self-host). Один акаунт Nuvio на дім, до 6 профілів, кожен Lampa-профіль мапиться на свій Nuvio-профіль. Весь код — лише в `src/custom`, ядро `src/*` не чіпаємо.

## Як читати
- Людина: цей хаб → `architecture.md` → `decisions-risks.md` → за потреби решта.
- ШІ-виконавець: одразу `agent-brief.md`, далі за посиланнями звідти.

## Скоуп (Phase 4)
В скоупі: підключення public/self-host (discovery), логін email+пароль; профілі Nuvio (до 6), PIN лише перевірка; push і pull watched та прогресу, delta-poll; outbox, антицикл, статус синхрону.
Поза скоупом: синхронізація addons/plugins Nuvio; Library/списки (заглушка, див. D6); Trakt-адаптер; робота під час активного Cub-sync (Nuvio на паузі).

## Ключові рішення
1. Nuvio — sync-адаптер поверх локального режиму (`Account.Permit.sync = false`).
2. Джерело правди — Favorite/Timeline Lampa; Nuvio — віддалена копія.
3. Push через outbox; антицикл і конфлікти (`max(watched_at)`) вирішує клієнт.
4. Прогрес з Timeline; watched із прогресу створює сервер (≥90%).
5. Addons/plugins не синхронізуємо: `sync_push_addons` видаляє чужі аддони.

## Карта
`agent-brief.md` → `architecture.md` → `api.md` → `lampa-integration.md` → `sync-rules.md` → `ux.md` → `selfhost.md` → `plan.md` → `decisions-risks.md`

## Межі (коротко, повні — в agent-brief)
- Always: лише `src/custom`; `content_id` = `tmdb:ID`; `p_profile_id` явно; `$.ajax`, ES5; пакети ≤500.
- Ask first: зміни ядра, нові залежності, формат ключів `nuvio_*`, нові пишуть-RPC.
- Never: service-role ключ, пароль у Storage, RPC з повною заміною стану, подія `added` → push, `tt…` у Nuvio.

## Критерії успіху
1. Після логіну сервіс піднімається після `app ready` без блокування UI; статус видно в налаштуваннях.
2. Перегляд у локальному режимі потрапляє в Nuvio за один flush-цикл.
3. Прогрес у мс; у Timeline секунди; подвійної конвертації немає.
4. Повторне відкриття картки — без дублікатів і без зниження `watched_at`.
5. Запис з іншого клієнта з'являється на наступному delta-poll; delete застосовується; зациклення немає.
6. Nuvio недоступний: події в outbox, Lampa працює; після відновлення черга доганяє без дублікатів.
7. Видалення `import './services/nuvio'` повністю вимикає інтеграцію.
8. Працює на Orsay / Android 4.4 без premium Lampa.
9. Cub вмикає sync → статус paused, outbox зберігається.
10. Self-host підключається за одним URL через `/.well-known/nuvio`.

## Відкриті питання
Немає. Блокери — V1–V3 у `plan.md`.
# Агент-бриф (для ШІ-виконавця)

Єдина точка входу. Читай зверху вниз, роби по одному кроку. Якщо щось невідомо або суперечить документу — зупинись і попроси користувача. Нічого не вгадуй.

## Мета
Сервіс `src/custom/services/nuvio` двобічно синхронізує перегляди й прогрес з Nuvio (Supabase-сумісний REST/RPC). Лише `src/custom`, ядро не чіпаємо.

## Порядок роботи
1. Прочитай: `architecture.md` → `api.md` → `lampa-integration.md` → `sync-rules.md` → `ux.md` → `plan.md`.
2. Візьми першу незакриту задачу в `plan.md`. Наступну не починай, поки поточна не закрита.
3. Перед кодом прочитай файли з поля Files задачі, а також `src/custom/services/watched.js`, `src/custom/core/watch-history-local.js`, `src/custom/core/favorite.js`.
4. Напиши код і тести `spec/nuvio_*.spec.js` (vitest).
5. Закрий задачу: `npm test` зелений → ручна перевірка з Verify (`npm run debug`) → чекбокс → рапорт: зроблено / перевірено / далі.
6. Блокер → зупинись і запитай. Не обходь.

## Always
- Уся логіка в `src/custom/services/nuvio`; єдина точка ввімкнення — `import './services/nuvio'` у `src/custom/index.js`.
- `p_profile_id` явно в кожному RPC (= `profile_index`, 1..6).
- `content_id` лише `tmdb:ID`.
- Запити лише через `$.ajax`; код ES5-сумісний.
- Payload лише серіалізований: `JSON.parse(JSON.stringify(payload))`.
- Пакети ≤500 елементів.
- Ініціалізація після `app ready`, без блокування UI.
- Storage: ключі `nuvio_*`, компактні записи, контроль квоти через `custom/core/storage-quota`.
- Обгортання `Favorite` — лише plain assignment (`let orig = Favorite.x; Favorite.x = ...`).

## Never
- Service-role ключ; пароль у Storage.
- Читання таблиці `profiles` напряму (там `pin_hash`) — лише `sync_pull_profiles`.
- RPC з повною заміною стану: `sync_push_addons`, `sync_push_plugins`, `sync_push_library`, `sync_push_profiles`.
- Подія `added` → push; `tt…` у watch history; записи про персон.
- Accessor-обгортки `Favorite` (цикл до RangeError).
- Зміни в `src/*` поза `src/custom`.
- Блокувати UI подіями синхрону.

## Ask first
- Зміна ядра; нові залежності.
- Зміна формату ключів `nuvio_*` у Storage.
- RPC, що пише в Nuvio і не описаний в `api.md`.
- Видалення/перейменування сторінок документації.

## Зразок коду
```javascript
// push: джерела — Favorite.listener (viewed) і Timeline.listener (progress)
Favorite.listener.follow('add', function (e) {
    if (e.where !== 'viewed') return
    var item = Idmap.fromCard(e.card)      // {content_id: 'tmdb:550', ...} або null (персони)
    if (!item || Dedupe.seen(item)) return // синтетичні add від Favorite.refresh() — no-op
    Outbox.add('watched', item)
})
// payload — лише серіалізовані дані
Api.rpc('sync_push_watched_items', JSON.parse(JSON.stringify(payload)))
```

## Тести
vitest, `spec/nuvio_*.spec.js`. Покривай: idmap (movie/series/персони), dedupe (синтетичні add, не знижувати `watched_at`), outbox (пакети, переживає перезавантаження), конвертація мс↔с, api (401→refresh→retry, 429→backoff), auth (single-flight refresh).
# Архітектура

## Принципи
1. Nuvio — sync-адаптер поверх локального режиму (`Account.Permit.sync = false`). Реєстру провайдерів немає, не створюємо.
2. Джерело правди — Favorite і Timeline Lampa. Nuvio — віддалена копія.
3. Push через чергу (outbox), що переживає перезавантаження.
4. Антицикл і конфлікти вирішує клієнт (сервер цього не робить).
5. Профіль Nuvio завжди передається явно.
6. Мінімум UI: один компонент у налаштуваннях.

## Схема
```txt
Lampa ME (локальний режим, Permit.sync = false)
  Favorite.listener ──┐                          ┌── Favorite / Timeline (pull)
  Timeline.listener ──┤                          │
                      ▼                          │
              idmap → dedupe → outbox        pull (initial + delta)
                      │                          ▲
                      ▼                          │
                 api.js (auth, retry, backoff) ──┴── Nuvio (cloud/self-host)
```

## Модулі
| Модуль | Відповідальність | Залежить від |
|---|---|---|
| `index.js` | init після `app ready`, guard (Permit.sync), підписки | усі |
| `settings.js` | компонент «Nuvio», статус | — |
| `discovery.js` | `/.well-known/nuvio` для self-host | api |
| `api.js` | `$.ajax` клієнт: base URL, headers, retry/backoff, 401/429 | auth |
| `auth.js` | логін, `nuvio_tokens`, single-flight refresh | — |
| `profiles.js` | `sync_pull_profiles`, вибір профілю, PIN, мапінг | api |
| `idmap.js` | картка Lampa → `tmdb:ID`, movie/series, мс↔с | — |
| `dedupe.js` | ключ, кеш `watched_at`, антицикл | idmap |
| `outbox.js` | черга push у Storage, пакети ≤500, throttle | api |
| `watched.js` | push/pull watched, delete | outbox, dedupe |
| `progress.js` | push/pull прогресу | outbox, dedupe |
| `lists.js` | заглушка Library (без логіки) | — |

## Структура файлів
```txt
src/custom/
  index.js → import './services/nuvio'
  services/nuvio/
    index.js settings.js discovery.js api.js auth.js
    profiles.js idmap.js dedupe.js outbox.js
    watched.js progress.js lists.js
  doc/nuvio-integration.md → дублікат (після N8)
spec/nuvio_*.spec.js → unit-тести (vitest)
```

## Чого уникаємо (уроки Cub)
Синхрон по ядру → один сервіс у custom. Full-replace → лише upsert+delta. Змішані id → лише `tmdb:ID`. Тихі фейли → outbox+backoff+статус. UI-захват → один компонент. Блок старту → лінива ініціалізація. `added` → не мапимо. `jQuery.param` → лише серіалізовані дані. Переповнення localStorage → компактні записи, квота.
--- api ---
# Nuvio API (верифікований контракт)

Звірено 16.11.2026 з OpenAPI self-host (`nuvioapi.json`, PostgREST 14.12) і SQL-міграціями `NuvioMedia/self-host`. Cloud (`https://api.nuvio.tv`) і self-host — однаковий контракт. Пункти ❓ — закриваються V1–V3 у `plan.md`.

## Підключення
| Що | Значення |
|---|---|
| Cloud URL | `https://api.nuvio.tv` |
| Publishable key (cloud) | `sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN` (публічний, можна в бандлі) |
| Self-host discovery | `GET BACKEND_URL/.well-known/nuvio` → `{backend_url, publishable_key, self_hosted, capabilities: {email_password_auth, tv_login}}` без авторизації |
| Заголовки | `Authorization: Bearer ACCESS_TOKEN`, `apikey: PUBLISHABLE_KEY`, `Content-Type: application/json` |
| RPC | `POST BACKEND_URL/rest/v1/rpc/NAME` |

## Auth
- Логін: `POST /auth/v1/token?grant_type=password` `{email, password}` → `access_token` (~1 год), `refresh_token` (~180 днів, одноразовий).
- Refresh: `POST /auth/v1/token?grant_type=refresh_token` `{refresh_token}` ❓ (стандартний Supabase Auth; закриває V3).

## Профілі
- `p_profile_id` = `profile_index` (1..6) з `sync_pull_profiles`. Колонки `profile_id` у відповіді немає.
- `pin_enabled = true` → PIN рівно 4 цифри перед використанням.
- `uses_primary_addons` / `uses_primary_plugins` = `true` → списки з профілю 1.

## RPC, які використовуємо
| RPC | Аргументи | Відповідь / примітка |
|---|---|---|
| `sync_pull_profiles` | `{}` | `profile_index, name, avatar_color_hex, avatar_id, avatar_url, pin_enabled, pin_locked_until, uses_primary_addons, uses_primary_plugins` |
| `verify_profile_pin` | `{p_profile_id, p_pin}` | `[{unlocked, retry_after_seconds}]` |
| `set_profile_pin` | `{p_profile_id, p_pin, p_current_pin?}` | — |
| `clear_profile_pin` | `{p_profile_id, p_current_pin?}` | — |
| `clear_profile_pin_with_account_password` | `{p_account_password, p_profile_id}` | — |
| `sync_push_watched_items` | `{p_items, p_profile_id, p_origin_client_id}` | item: `{content_id, content_type, title, season?, episode?, watched_at}` |
| `sync_pull_watched_items` | `{p_profile_id, p_page, p_page_size}` | default `p_page_size` = 100000 — завжди задавай явно |
| `sync_get_watched_items_delta_cursor` | `{p_profile_id}` | формат ✅ V1: формат не документовано, код толерантний (читає `event_id` з подій); уточнити логом при першому pull |
| `sync_pull_watched_items_delta` | `{p_profile_id, p_since_event_id, p_limit}` | `event_id, operation (upsert/delete), content_id, content_type, title, season, episode, watched_at`; default `p_limit` 1000 |
| `sync_delete_watched_items` | `{p_keys, p_profile_id, p_origin_client_id}` | `p_keys = [{content_id, season?, episode?}]`; без `p_profile_id` default = **0** |
| `sync_push_watch_progress` | `{p_entries, p_profile_id, p_origin_client_id}` | entry: `{content_id, content_type, video_id, season?, episode?, position, duration, last_watched, progress_key?}` |
| `sync_pull_watch_progress` | `{p_profile_id, p_since_last_watched, p_limit}` | рядки `watch_progress` |
| `sync_get_watch_progress_delta_cursor` | `{p_profile_id}` | формат ✅ V1: формат не документовано, код толерантний (читає `event_id` з подій); уточнити логом при першому pull |
| `sync_pull_watch_progress_delta` | `{p_profile_id, p_since_event_id, p_limit}` | `event_id, operation, progress_key, content_id, content_type, video_id, season, episode, position, duration, last_watched` |
| `health_ping` | `{}` | індикатор доступності |
| `register_current_device` | `{p_installation_id, p_client_name, p_client_version?, p_device_name?, p_platform?}` | після логіну |

Усі часи/позиції в Nuvio — **мілісекунди**; Timeline Lampa — секунди.

## Майбутнє (не в Phase 4)
- Library: `sync_pull_library {p_profile_id, p_limit, p_offset}`, `sync_get_library_delta_cursor`, `sync_pull_library_delta`, `sync_push_library_items {p_items, p_profile_id, p_origin_client_id?}`, `sync_delete_library_items {p_keys, ...}`. `library_items` — один watchlist, без поняття списку.
- Бекап: `sync_export_account_backup`, `sync_restore_account_backup` (restore = replace).

## Заборонені RPC (повна заміна стану)
`sync_push_addons`, `sync_push_plugins`, `sync_push_library`, `sync_push_profiles`. `sync_push_addons` видаляє всі аддони профілю, яких немає в payload.

## Поведінка сервера
- **Watched upsert:** ключ `(content_id, season, episode, profile)`. `watched_at` перезаписується завжди, навіть меншим. Клієнт тримає максимум.
- **Push прогресу:** сервер ігнорує зміни <15 с, оновлення частіше 1/30 с (watched — 1/60 с).
- **Авто-watched:** `duration ≥ 60 с` і `position ≥ 90%` → `sync_push_watch_progress` сам створює/оновлює `watched_items` (`watched_at` = максимум). Окремий push watched — лише ручна позначка.
- **`p_origin_client_id`:** лише зберігається, нічого не фільтрує. Події `watched_item_events` без origin. Антицикл — тільки клієнт.
- **`progress_key`:** якщо не передати — `content_id_sSeE` (епізоди) або `content_id`.
- **Ліміти:** ≤500 елементів/запит, ~100 rps; 429 → backoff.

## Формати
```json
{"content_id": "tmdb:1396", "content_type": "series", "title": "Breaking Bad", "season": 1, "episode": 1, "watched_at": 1711600000000}
{"content_id": "tmdb:1396", "content_type": "series", "video_id": "tmdb:1396:1:1", "season": 1, "episode": 1, "position": 600000, "duration": 2700000, "last_watched": 1711600000000}
```
V1 ✅ 17.11.2026: `content_type` = `movie`/`series`; `content_id` = голий TMDB id (`84773`); `video_id` реального клієнта = `1-2` (вільне поле), ми пишемо `84773_s1e2`; `progress_key` = `84773_s1e2`. Деталі — `V1-V3-verified.md`.
--- sync ---
# Синхронізація: правила

## Джерела подій (push)
| Джерело | Що пишемо | RPC |
|---|---|---|
| `Timeline.listener update` | прогрес | `sync_push_watch_progress` |
| `Favorite.listener add`, `where = viewed` | ручна позначка | `sync_push_watched_items` |
| `Favorite.listener remove`, `where = viewed` | видалення | `sync_delete_watched_items` |

Не мапимо: `added`, інші категорії, `persons`. Watched з прогресу (≥90%, `duration ≥ 60 с`) робить сервер — клієнтського порогу 90% немає.

## Ланцюжок push
1. Guard: увімкнено, є Nuvio-профіль, `Permit.sync === false`. Інакше ігнор.
2. `idmap`: картка → `{content_id: 'tmdb:ID', content_type, title, season, episode}`; персони → `null`. IMDb конвертується через TMDB Find; `tt…` не йде.
3. `dedupe`: ключ `(profile, content_id, season, episode)`; кеш `watched_at`. Push лише якщо ключа немає або `watched_at` зросла. Ніколи не знижується.
4. `outbox` (`nuvio_queue` у Storage): компактний, переживає рестарт. Flush пакетами ≤500 після події з дебаунсом.
5. Прогрес на ключ — не частіше 1/30 с і лише при зміні ≥15 с. Фінальний (≥90%) — завжди.
6. Помилки: 401 → refresh → retry один раз; 429/мережа → backoff, події лишаються.

## Перший import і delta (pull)
1. Курсори (`sync_get_watched_items_delta_cursor`, `sync_get_watch_progress_delta_cursor`) **перед** повним pull.
2. Повний pull watched: `sync_pull_watched_items` сторінками (`p_page_size = 500`) до короткої сторінки. Прогрес: `sync_pull_watch_progress` з `p_limit`.
3. Застосувати за правилами нижче, зберегти курсори (`nuvio_cursor_PROFILE`, окремо на профіль).
4. Delta-poll: `sync_pull_watched_items_delta` + `sync_pull_watch_progress_delta` з `p_since_event_id` = курсор; порядок `event_id`; курсор після кожної сторінки. Запуски: старт, перемикання профілю, кожні 5 хв.

## Застосування віддалених подій
| Подія | Дія в Lampa |
|---|---|
| watched `upsert` | позначити переглянутим (Favorite `viewed`, Timeline); локальний більший `watched_at` — лишити |
| watched `delete` | `Favorite.remove` для ключа |
| progress `upsert` | `Timeline.update({..., received: true})`, мс → с |
| progress `delete` | скинути прогрес ключа |

## Антицикл
Сервер не позначає автора; наш push (включно з авто-watched) повертається в delta.
- Перед застосуванням: `dedupe` має ключ з `watched_at ≥ event.watched_at` → пропуск.
- Після застосування: оновити кеш `dedupe`, щоб listener не запушив назад.
- Прогрес з pull — з `received: true`.

## Конфлікти
- Перемагає більший `watched_at`.
- Віддалений `delete` — завжди (помітку можна поставити знову).
- Локальне видалення → `sync_delete_watched_items`.

## Епізоди й одиниці
- Епізод: `content_id` = серіал (`tmdb:1396`) + `season` + `episode`; у прогресі + `video_id = tmdb:1396:1:1`.
- `watched_at`, `position`, `duration`, `last_watched` — мс у Nuvio; Timeline `time`/`duration` — с. Конвертація тільки в `idmap`.
- Невизначені `season`/`episode` (online-модулі) push не блокують.
--- verified ---
# V1–V3 — верифіковано 17.11.2026 на реальних даних

## V1 — закрито ✅
Реальні дані з акаунта (profile_id=1):

**watched_items:**
- `content_type`: `movie` / `series` (підтверджено).
- `content_id`: **голий TMDB id без префікса** (`"1423191"`, `"84773"`) — чернетка Notion (`tmdb:ID`) не відповідає реальності. Код пише голий id.
- Епізод: `content_id` = id серіалу + `season` + `episode`.
- `watched_at`: мс (13 цифр).

**watch_progress:**
- `video_id`: `"1-2"` — формат реального клієнта Nuvio, **не** `tmdb:84773:1:2`. Сервер приймає будь-який `video_id` (поле вільне `text`), але для консистентності з іншими клієнтами пишемо у форматі Nuvio.
- `progress_key`: `"84773_s1e2"` — `{content_id}_s{season}e{episode}`. Сервер будує так само, якщо не передати; передаємо явно.
- `position`/`duration`/`last_watched`: мс.

**Формат курсорів:** в спеці не документовано (голий `200 OK`). Код толерантний: `getCursor`/`setCursor` зберігають що повернув сервер; delta-poll читає `event_id` з подій. Уточнити при першому реальному pull: залогувати відповідь `sync_get_*_delta_cursor` і зафіксувати тут.

## V2 — закрито ✅
401 `No API key found in request` на запит без заголовків = сервер відповідає, CORS/mixed-content немає. Мережа до бекенда з пристрою проходить. Self-host за тією ж схемою (`/.well-known/nuvio` без авторизації).

## V3 — закрито ✅
`POST /auth/v1/token?grant_type=refresh_token` повертає стандартний Supabase Auth:
`{access_token, token_type: bearer, expires_in: 3600, expires_at, refresh_token (НОВИЙ), user: {...}}`.
- `refresh_token` ротується: після кожного refresh старий недійсний → single-flight в `auth.js` обов'язковий (вже реалізовано).
- `expires_in: 3600` (~1 год) — авто-refresh за `expires_at` (вже реалізовано).
- `expires_at` — Unix timestamp, можна використовувати напряму.

## Що змінено в коді за результатами V1
- `idmap.fromCard` / `fromRoadCard`: `content_id` = голий id (`'84773'`), не `'tmdb:84773'`.
- `idmap.toVideoId`: фільми → `'84773'`, епізоди → `'84773_s1e2'` (формат реального клієнта).
- Парсинг вхідних: `/^tmdb:/` зрізається для зворотної сумісності.
