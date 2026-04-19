import Manifest from '../../core/manifest'

const manifestData = {
    author: 'Siaivo',
    github: 'https://github.com/Siaivo/siaivo.github.io',
    patch_version: 27,
    cub_site: 'cub.rip',
    apk_link_download: 'https://github.com/lampa-app/LAMPA/releases/download/v1.12.3/app-lite-release.apk'
}

const manifestMirrors = ['cub.rip', 'durex.monster', 'cubnotrip.top']
const manifestDomain = 'cub.rip'

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
        if (key === 'patch_version') return

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

applyManifestData()
applyMirrorOverride(manifestMirrors)
applyDomainOverride(manifestDomain)

export default Manifest
