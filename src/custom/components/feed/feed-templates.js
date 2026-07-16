import Template from '../../../interaction/template'

Template.add('feed_item', `<div class="feed-item layer--visible">
    <div class="feed-item__head">
        <div class="feed-item__icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 0L11.4308 6.56918L18 9L11.4308 11.4308L9 18L6.56918 11.4308L0 9L6.56918 6.56918L9 0Z" fill="currentColor"/>
            </svg>
        </div>
        <div class="feed-item__label"></div>
    </div>
    <div class="feed-item__right">
        <div class="feed-item__poster-box">
            <img class="feed-item__poster-img" referrerpolicy="no-referrer" />
        </div>
    </div>
    <div class="feed-item__body">
        <div class="feed-item__title"></div>
        <div class="feed-item__info"></div>
        <div class="feed-item__descr"></div>
        <div class="feed-item__tags"></div>
        <div class="feed-item__buttons"></div>
    </div>
</div>`)

Template.add('feed_episode', `<div class="feed-item layer--visible">
    <div class="feed-item__head">
        <div class="feed-item__icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 0L11.4308 6.56918L18 9L11.4308 11.4308L9 18L6.56918 11.4308L0 9L6.56918 6.56918L9 0Z" fill="currentColor"/>
            </svg>
        </div>
        <div class="feed-item__label"></div>
    </div>
    <div class="feed-item__right">
        <div class="feed-item__image-box">
            <img class="feed-item__image-img" referrerpolicy="no-referrer" />
        </div>
        <div class="feed-item__minicard">
            <div>
                <div class="feed-item__title"></div>
                <div class="feed-item__info"></div>
            </div>
            <div class="feed-item__minicard-poster">
                <div class="feed-item__poster-box">
                    <img class="feed-item__poster-img" referrerpolicy="no-referrer" />
                </div>
            </div>
        </div>
    </div>
    <div class="feed-item__body">
        <div class="feed-item__descr"></div>
        <div class="feed-item__tags"></div>
        <div class="feed-item__buttons"></div>
    </div>
</div>`)

Template.add('feed_head', `<div class="feed-head selector layer--visible">
    <div class="feed-head__icon">
        <img src="{mirror}/img/other/lampa_movie.jpg" class="feed-head__img" />
    </div>
    <div class="feed-head__body">
        <div class="feed-head__title"></div>
        <div class="feed-head__info"></div>
    </div>
</div>`)
