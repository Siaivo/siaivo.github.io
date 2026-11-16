// The Android app hands out the device advertising id (IFA) through the bridge, and the core
// puts it into ad requests (advert/ima.js getGuid). Return nothing: the core falls back to its random guid.
function noId() {
    return ''
}

if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.getAdvertisingId === 'function') {
    try {
        AndroidJS.getAdvertisingId = noId
    }
    catch (e) {}

    // A Java bridge object may ignore plain assignment.
    if (AndroidJS.getAdvertisingId !== noId) {
        try {
            Object.defineProperty(AndroidJS, 'getAdvertisingId', {value: noId, writable: true, configurable: true})
        }
        catch (e) {}
    }
}
