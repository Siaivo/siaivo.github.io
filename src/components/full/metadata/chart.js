import Utils from '../../../utils/utils'
import Register from '../../../interaction/register/register'
import RegisterModule from '../../../interaction/register/module/module'
import Line from '../../../interaction/items/line/line'
import LineModule from '../../../interaction/items/line/module/module'
import Lang from '../../../core/lang'


function MetadataChart(data){
    let meter = {
        title: Lang.translate('title_metadata'),
        results: []
    }

    let chart_data = data.metadata.season || data.metadata
    let chart_keys = [{
        name: 'violence',
        threshold: 70,
        threshold_color: '#ff7b7b',
        icon: '<svg style="color: #ff7b7b;"><use xlink:href="#sprite-meta-violence"></use></svg>'
    },
    {
        name: 'fear',
        threshold: 70,
        threshold_color: '#a5a7f5',
        icon: '<svg style="color: #a5a7f5;"><use xlink:href="#sprite-meta-fear"></use></svg>'
    },
    {
        name: 'profanity',
        threshold: 70,
        threshold_color: '#7bd9ff',
        icon: '<svg style="color: #7bd9ff;"><use xlink:href="#sprite-meta-profanity"></use></svg>'
    },
    {
        name: 'sadness',
        threshold: 70,
        threshold_color: '#fdb65a',
        icon: '<svg style="color: #fdb65a;"><use xlink:href="#sprite-meta-sadness"></use></svg>'
    },
    {
        name: 'sex',
        threshold: 60,
        threshold_color: '#f387ff',
        icon: '<svg style="color: #f387ff;"><use xlink:href="#sprite-meta-sex"></use></svg>'
    }]


    chart_keys.forEach((key)=>{
        let chart = {
            bars: [],
            threshold: key.threshold,
            threshold_color: key.threshold_color
        }

        if(data.metadata.episodes){
            data.metadata.episodes.forEach((episode)=>{
                chart.bars.push((episode.metadata[key.name] || 0) / 10 * 100)
            })
        }

        meter.results.push({
            title:  Lang.translate('title_meta_' + key.name),
            count: chart_data[key.name + '_avg'] || chart_data[key.name] || 0,
            limit:   10,
            chart: chart,
            icon: key.icon
        })
    })

    Utils.extendItemsParams(meter.results, {
        module: RegisterModule.toggle(RegisterModule.MASK.base, 'Line', 'Chart', 'Icon'),
        createInstance: (item)=>new Register(item)
    })

    let comp = Utils.createInstance(Line, meter, {
        module: LineModule.only('Items', 'Create')
    })

    return comp
}

export default MetadataChart