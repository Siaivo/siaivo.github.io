import Template from '../../interaction/template'
import about from '../templates/about'

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

Template.add('about', about);

// — Custom logo (Український прапор) base64 data URI —
// Використовуємо base64 замість inline SVG, щоб не ламати jQuery парсинг шаблону
const logoSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMTAiIGhlaWdodD0iMTA0IiB2aWV3Qm94PSIwIDAgMTEwIDEwNCIgZmlsbD0ibm9uZSI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJ1YUZsYWcyIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMTA0IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzAwM2Y4YSIvPjxzdG9wIG9mZnNldD0iNDUlIiBzdG9wLWNvbG9yPSIjMDA1N0I3Ii8+PHN0b3Agb2Zmc2V0PSI1MiUiIHN0b3AtY29sb3I9IiNGRkQ3MDAiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNGRkE1MDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cGF0aCBkPSJNODEuNjc0NCAxMDMuMTFDOTguNTY4MiA5My43MjM0IDExMCA3NS42OTY3IDExMCA1NUMxMTAgMjQuNjI0MyA4NS4zNzU3IDAgNTUgMEMyNC42MjQzIDAgMCAyNC42MjQzIDAgNTVDMCA3NS42OTY3IDExLjQzMTggOTMuNzIzNCAyOC4zMjU1IDEwMy4xMUMxNC44ODY5IDk0LjM3MjQgNiA3OS4yMjQgNiA2MkM2IDM0LjkzOCAyNy45MzggMTMgNTUgMTNDODIuMDYyIDEzIDEwNCAzNC45MzggMTA0IDYyQzEwNCA3OS4yMjQgOTUuMTEzMSA5NC4zNzI1IDgxLjY3NDQgMTAzLjExWiIgZmlsbD0idXJsKCN1YUZsYWcyKSIvPjxwYXRoIGQ9Ik05Mi45NTQ2IDgwLjAwNzZDOTUuNTQ4NSA3NC41NTAxIDk3IDY4LjQ0NDYgOTcgNjJDOTcgMzguODA0IDc4LjE5NiAyMCA1NSAyMEMzMS44MDQgMjAgMTMgMzguODA0IDEzIDYyQzEzIDY4LjQ0NDYgMTQuNDUxNSA3NC41NTAxIDE3LjA0NTQgODAuMDA3NkMxNi4zNjE4IDc3LjExNjEgMTYgNzQuMTAwMyAxNiA3MUMxNiA0OS40NjA5IDMzLjQ2MDkgMzIgNTUgMzJDNzYuNTM5MSAzMiA5NCA0OS40NjA5IDk0IDcxQzk0IDc0LjEwMDMgOTMuNjM4MiA3Ny4xMTYxIDkyLjk1NDYgODAuMDA3NloiIGZpbGw9InVybCgjdWFGbGFnMikiLz48cGF0aCBkPSJNNTUgODlDNjkuMzU5NCA4OSA4MSA3Ny4zNTk0IDgxIDYzQzgxIDU3LjkyOTcgNzkuNTQ4NiA1My4xOTgzIDc3LjAzODcgNDkuMTk4N0M4Mi41NzkgNTQuNzk4OSA4NiA2Mi41IDg2IDcxQzg2IDg4LjEyMDggNzIuMTIwOCAxMDIgNTUgMTAyQzM3Ljg3OTIgMTAyIDI0IDg4LjEyMDggMjQgNzFDMjQgNjIuNSAyNy40MjEgNTQuNzk4OSAzMi45NjEzIDQ5LjE5ODdDMzAuNDUxNCA1My4xOTgzIDI5IDU3LjkyOTcgMjkgNjNDMjkgNzcuMzU5NCA0MC42NDA2IDg5IDU1IDg5WiIgZmlsbD0idXJsKCN1YUZsYWcyKSIvPjxwYXRoIGQ9Ik03MyA2M0M3MyA3Mi45NDExIDY0Ljk0MTEgODEgNTUgODFDNDUuMDU4OSA4MSAzNyA3Mi45NDExIDM3IDYzQzM3IDUzLjA1ODkgNDUuMDU4OSA0NSA1NSA0NUM2NC45NDExIDQ1IDczIDUzLjA1ODkgNzMgNjNaIiBmaWxsPSJ1cmwoI3VhRmxhZzIpIi8+PC9zdmc+'

// Override head template — replace logo img src with custom UA-flag SVG (base64)
let headHtml = Template.string('head')
if (headHtml && headHtml.indexOf('./img/logo-icon.svg') >= 0) {
    Template.add(
        'head',
        headHtml.replace('./img/logo-icon.svg', logoSrc)
    )
}

// Override lang_choice template — same replacement
let langHtml = Template.string('lang_choice')
if (langHtml && langHtml.indexOf('./img/logo-icon.svg') >= 0) {
    Template.add(
        'lang_choice',
        langHtml.replace('./img/logo-icon.svg', logoSrc)
    )
}