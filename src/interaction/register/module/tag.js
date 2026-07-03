export default {
    onCreate: function(){
        this.html.addClass('register--tag')

        if(typeof this.data.count !== 'undefined'){
            this.html.prepend(this.html.find('.register__counter'))
        }
        else{
            this.html.find('.register__counter').remove()
        }
    }
}