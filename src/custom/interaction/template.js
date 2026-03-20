import Template from '../../interaction/template'

let personStart = Template.string('person_start')

if (personStart && personStart.indexOf('button--subscribe') >= 0) {
    Template.add(
        'person_start',
        personStart.replace(
            /<div class="full-start__button selector button--subscribe">[\s\S]*?<\/div>/,
            ''
        )
    )
}
