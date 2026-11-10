import Manifest from '../../core/manifest'

const manifestData = {
    author: 'Siaivo',
    storeUrl: 'https://raw.githubusercontent.com/Siaivo/Hub/refs/heads/main/data/base.json',
    github: 'https://github.com/Siaivo/siaivo.github.io',
    patch_version: 42,
    cub_site: 'cub.red',
    apk_link_download: 'https://github.com/lampa-app/LAMPA/releases/download/v1.12.3/app-lite-release.apk'
}
// NOTE: апстрім перетворив cub_site на getter без setter (залежить від window.vpn_region).
// Пряме присвоєння в getter-only властивість кидає TypeError, тому cub_site перевизначаємо через defineProperty.

const manifestMirrors = ['cub.best', 'cub.red']
const manifestDomain = 'cub.best'

function normalizeMirror(value) {
    if (typeof value !== 'string') return ''

    return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function readMirrorStorage() {
    let mirrors = localStorage.getItem('cub_mirrors') || '[]'

    try {
        mirrors = JSON.parse(mirrors)
    } catch (e) {
        mirrors = []
    }

    return Array.isArray(mirrors) ? mirrors : []
}

function writeMirrorStorage(mirrors) {
    localStorage.setItem('cub_mirrors', JSON.stringify(mirrors))
}

function applyManifestData() {
    Object.keys(manifestData).forEach((key) => {
        if (key === 'cub_site') {
            // Апстрім тримає cub_site як getter без setter — перевизначаємо через defineProperty,
            // інакше пряме присвоєння кине TypeError і обірве весь цикл.
            Object.defineProperty(Manifest, 'cub_site', {
                value: manifestData[key],
                writable: true,
                configurable: true
            })

            return
        }

        Manifest[key] = manifestData[key]
    })

    if (typeof manifestData.patch_version === 'number') {
        const patch = manifestData.patch_version
        Manifest.app_version = Manifest.app_version + '.' + patch
        Manifest.css_version = Manifest.css_version + '.' + patch
    }
}

function applyMirrorOverride(mirrors) {
    let stored = readMirrorStorage()
    let map = {}
    let result = []

    mirrors.concat(stored).forEach((mirror) => {
        mirror = normalizeMirror(mirror)
        if (!mirror || map[mirror]) return

        map[mirror] = true
        result.push(mirror)
    })

    writeMirrorStorage(result)
}

function applyDomainOverride(domain) {
    domain = normalizeMirror(domain)
    if (!domain) return

    let mirrors = readMirrorStorage()

    if (mirrors.indexOf(domain) < 0) {
        mirrors.unshift(domain)
        writeMirrorStorage(mirrors)
    }

    localStorage.setItem('cub_domain', domain)
}

function upstreamDigital(version) {
    return parseInt(String(version).split('.').slice(0, 3).join(''))
}

// Плагіни порівнюють app_digital з числами оригінальної Лампи (>= 300), а патч робить 33841 замість 338.
// В апстрімі app_digital — неконфігуровний getter, тому плагінам віддаємо нащадка Manifest з власними digital.
// window.Lampa створюється в initClass() пізніше за цей модуль — підміняємо Manifest у момент присвоєння.
function applyPluginManifest() {
    const pluginManifest = Object.create(Manifest, {
        app_digital: { get: () => upstreamDigital(Manifest.app_version) },
        css_digital: { get: () => upstreamDigital(Manifest.css_version) }
    })

    let lampa = window.Lampa

    Object.defineProperty(window, 'Lampa', {
        configurable: true,
        enumerable: true,
        get: () => lampa,
        set: (value) => {
            if (value && value.Manifest === Manifest) {
                value.Manifest = pluginManifest
            }

            lampa = value
        }
    })
}

applyManifestData()
applyPluginManifest()
applyMirrorOverride(manifestMirrors)
applyDomainOverride(manifestDomain)

export default Manifest
