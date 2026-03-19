let html = `<div class="person-start">

    <div class="person-start__body">
        <div class="person-start__right">
            <div class="person-start__poster">
                <img class="person-start__img" />
            </div>
        </div>

        <div class="person-start__left">
            <div class="person-start__tags">
                <div class="person-start__tag">
                    <img src="./img/icons/pulse.svg" /> <div>{birthday}</div>
                </div>
            </div>
            
            <div class="person-start__name">{name}</div>
            <div class="person-start__place">{place}</div>

            <div class="person-start__bottom">
                <div class="full-start__button selector button--info">
                    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512" xml:space="preserve">
                        <path d="M459.027 144.337 319.377 4.687A16 16 0 0 0 308.063 0H99.509C71.265 0 48.287 22.978 48.287 51.222v409.556c0 28.244 22.978 51.222 51.222 51.222H412.49c28.244 0 51.222-22.978 51.222-51.222V155.65a15.995 15.995 0 0 0-4.685-11.313zM324.063 54.628l85.022 85.023h-85.022zM412.491 480H99.509c-10.599 0-19.222-8.623-19.222-19.222V51.222C80.287 40.623 88.91 32 99.509 32h192.554v123.65c0 8.836 7.164 16 16 16h123.65v289.128c0 10.599-8.623 19.222-19.222 19.222zM370.4 265.826c0 8.836-7.164 16-16 16H157.6c-8.836 0-16-7.164-16-16s7.164-16 16-16h196.8c8.837 0 16 7.163 16 16zm0 109.199c0 8.836-7.164 16-16 16H157.6c-8.836 0-16-7.164-16-16s7.164-16 16-16h196.8c8.837 0 16 7.164 16 16z" fill="currentColor"></path>
                    </svg>
                </div>
            </div>
        </div>
    </div>
</div>`

export default html
