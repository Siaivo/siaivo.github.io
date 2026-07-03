export default {
    onCreate: function(){
        if(!this.data.icon) return

        this.html.addClass('register--icon')

        this.html.find('.register__name').prepend($(this.data.icon))
    }
}