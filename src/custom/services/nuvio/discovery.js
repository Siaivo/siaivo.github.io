function discover(url){
    url = (url + '').replace(/\/$/, '')
    return new Promise(function(resolve, reject){
        $.ajax({
            url: url + '/.well-known/nuvio',
            method: 'GET',
            success: resolve,
            error: function(xhr){ reject(xhr) }
        })
    })
}

export default {discover: discover}
