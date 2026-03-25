import Vpn from '../../core/vpn'
import Storage from '../../core/storage/storage'
import TMDBProxy from '../../core/tmdb/proxy'

const DEFAULT_REGION_CODE = 'ua'
const GEO_SERVICE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const REGION_TTL = 1000 * 60 * 60 * 24

let responseCode = DEFAULT_REGION_CODE

function normalizeCountry(code){
    if(typeof code !== 'string') return DEFAULT_REGION_CODE

    code = code.trim().toLowerCase()

    return code.length <= 2 ? code || DEFAULT_REGION_CODE : DEFAULT_REGION_CODE
}

function saveRegion(code){
    code = normalizeCountry(code)

    Storage.set('region', {
        code: code,
        time: Date.now()
    })

    responseCode = code
}

function installProxy(country){
    if((country == 'ru' || country == 'by' || country == '') && !window.lampa_settings.disable_features.install_proxy){
        TMDBProxy.init()
    }
}

function extract(call, error){
    $.ajax({
        url: GEO_SERVICE_URL,
        type: 'GET',
        dataType: 'json',
        timeout: 8000,
        success: function(response){
            call(response && response.countryCode)
        },
        error: error
    })
}

Vpn.region = function(call){
    if(!window.lampa_settings.geo) return call && call(responseCode)

    let reg = Storage.get('region', '{}')
    reg = reg || {}

    if(reg.code && reg.time && reg.time + REGION_TTL >= Date.now()){
        responseCode = normalizeCountry(reg.code)

        if(call) call(responseCode)
        return
    }

    extract((countryCode)=>{
        let code = normalizeCountry(countryCode || Storage.field('language') || DEFAULT_REGION_CODE)

        saveRegion(code)

        if(call) call(code)
    }, ()=>{
        let code = normalizeCountry(Storage.field('language') || DEFAULT_REGION_CODE)

        saveRegion(code)

        if(call) call(code)
    })
}

Vpn.task = function(call){
    if(!window.lampa_settings.geo) return call && call()

    extract((countryCode)=>{
        let code = normalizeCountry(countryCode || Storage.field('language') || DEFAULT_REGION_CODE)

        saveRegion(code)
        installProxy(code)

        if(call) call()
    }, ()=>{
        let code = normalizeCountry(Storage.field('language') || DEFAULT_REGION_CODE)

        saveRegion(code)
        installProxy(code)

        if(call) call()
    })
}

Vpn.code = function(){
    return responseCode
}

export default Vpn