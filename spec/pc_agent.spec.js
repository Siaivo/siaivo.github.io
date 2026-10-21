import pcAgent from '../src/custom/core/pc-agent'

import {expect, suite, test} from 'vitest'

let pc = {
    'Chrome Windows': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Win32'],
    'Safari macOS': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'MacIntel'],
    'Firefox Ubuntu': ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Linux x86_64'],
    'Chrome Linux': ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Linux x86_64'],
    'Chromebook': ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Linux x86_64'],
    'Electron': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Siaivo/1.0 Chrome/128.0.0.0 Electron/32.0.0 Safari/537.36', 'Win32']
}

let tv = {
    'Samsung Tizen': ['Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36', 'Linux armv7l'],
    'LG webOS': ['Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager', 'Linux armv7l'],
    'Hisense VIDAA': ['Mozilla/5.0 (Linux; VIDAA 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0 Safari/537.36', 'Linux aarch64'],
    'Panasonic Viera': ['Mozilla/5.0 (X11; FreeBSD; U; Viera; de-DE) AppleWebKit/537.11 (KHTML, like Gecko) Viera/3.10.0 Chrome/23.0.1271.97 Safari/537.11', 'FreeBSD'],
    'Philips NetTV': ['Mozilla/5.0 (Linux; U; Linux mips) AppleWebKit/537.36 (KHTML, like Gecko) NETTV/7.0', 'Linux mips'],
    'Vewd TV': ['Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36 OPR/49.0.2725.0 OMI/4.13.0.180.Sansa', 'Linux armv7l'],
    'TV без маркерів, X11 на ARM': ['Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0 Safari/537.36', 'Linux armv7l'],
    'TV без маркерів, без X11': ['Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0 Safari/537.36', 'Linux x86_64'],
    'Android TV': ['Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'Linux armv8l'],
    'Fire TV': ['Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 'Linux armv8l'],
    'Android phone': ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 'Linux armv8l'],
    // 'microsoft' містить 'cros' — Chrome OS шукаємо лише як окреме слово
    'Windows Phone': ['Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15063', 'Win32'],
    'iPad': ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'iPad']
}

suite('pcAgent', () => {
    for(let name in pc){
        test('ПК: ' + name, () => {
            expect(pcAgent(pc[name][0], pc[name][1])).toBe(true)
        })
    }

    for(let name in tv){
        test('не ПК: ' + name, () => {
            expect(pcAgent(tv[name][0], tv[name][1])).toBe(false)
        })
    }
})
