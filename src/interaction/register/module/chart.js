import Template from '../../template'

export default {
    onCreate: function(){
        if(!this.data.chart) return

        this.html.addClass('register--with-chart')

        let chart = Template.elem('div', {class: 'register__chart'})

        this.data.chart.bars.forEach((height)=>{
            let bar = Template.elem('div', {class: 'register__chart-bar'})

            bar.style.height = height + '%'

            if(this.data.chart.threshold && height >= this.data.chart.threshold){
                bar.classList.add('register__chart-bar--threshold')

                if(this.data.chart.threshold_color){
                    bar.style.backgroundColor = this.data.chart.threshold_color
                }
            }

            chart.append(bar)
        })

        this.html.prepend(chart)
    }
}