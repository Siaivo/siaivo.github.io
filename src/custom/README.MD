# Custom Overrides Guide

`src/custom` is the safe place for project-specific behavior.
Base app code stays in `src/*`, and custom code is attached from `src/custom/index.js`.

The app loads `src/custom/index.js` from `src/app.js`, so custom files can patch existing modules without editing core sources.

## Core Rules

1. Do not edit `src/*` directly for local business logic.
2. Put all custom behavior into `src/custom/*`.
3. Register every custom file in `src/custom/index.js`.
4. Use the smallest override type that solves your task.

## Type 1: Simple Override (Settings Only)

Use this when you only need to change `window.lampa_settings` flags.

Example in this repo:
- `src/custom/app/config.js`
- `src/custom/app/config-apply.js`

```js
// src/custom/app/config.js
export default {
    feed: false,
    services: false,
    mirrors: false,
    disable_features: {
        dmca: true,
        lgbt: true
    }
}
```

```js
// src/custom/app/config-apply.js
import Config from './config'

window.lampa_settings = window.lampa_settings || {}
Object.assign(window.lampa_settings, Config)

window.lampa_settings.disable_features = Object.assign(
    {},
    window.lampa_settings.disable_features || {},
    Config.disable_features || {}
)
```

Why this is good:
- no component rewrite
- low risk
- easy to maintain after upstream updates

## Type 2: Partial Logic Override (Patch One Part)

Use this when you want to keep original component behavior but tweak one part only.

Example in this repo:
- `src/custom/interaction/settings/params.js`
- it wraps original `Params.init`, runs original logic first, then applies small patch

```js
import Params from '../../../interaction/settings/params'

let init = Params.init.bind(Params)

Params.init = function() {
    init() // keep everything from original
    // apply only your custom patch here
}
```

Current real patch in the repo removes `cub` from some settings lists and fixes defaults/storage values.

Why this is good:
- minimal code changes
- keeps upstream behavior
- smaller chance of regressions

## Type 3: Full Clone + Full Redefinition of Existing Component

Use this when partial patch is not enough and you must replace the whole component logic.

Example in this repo:
- `src/custom/interaction/person/module/about.js`
- it fully redefines `Map.About`

```js
import Map from '../../../../interaction/person/module/map'

Map.About = {
    onCreate: function() {
        // full custom logic
    }
    // include other handlers you need
}
```

This pattern replaces the source component completely.

Important:
- keep component contract compatible (events, handlers, expected fields)
- when upstream changes original module, your clone will not auto-update
- periodically compare with `src/interaction/...` source

## Type 4: Add a Completely New Component (No Source Equivalent)

Use this when the feature does not exist in `src` at all.

1. Create a new file in `src/custom`, for example:
   - `src/custom/interaction/my-feature.js`
2. Initialize your logic there.
3. Import it in `src/custom/index.js`.

```js
// src/custom/interaction/my-feature.js
import Noty from '../../interaction/noty'

function initMyFeature() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(initMyFeature, 0)
        return
    }

    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') {
            Noty.show('My custom feature is active')
        }
    })
}

initMyFeature()
```

```js
// src/custom/index.js
import './interaction/my-feature'
```

Why this is good:
- no dependency on existing source component
- isolated feature ownership in custom layer
- clear enable/disable point in one import

## Quick Decision Flow

1. Only flags/config? Use Type 1.
2. Small tweak in existing flow? Use Type 2.
3. Need different full behavior of existing component? Use Type 3.
4. Need brand-new functionality? Use Type 4.
