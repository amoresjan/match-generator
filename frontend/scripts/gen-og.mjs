import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svg = readFileSync(resolve(root, 'public/og-image.svg'), 'utf8')

const resvg = new Resvg(svg, {
  fitTo: { mode: 'original' },
  font: { loadSystemFonts: true },
})

const png = resvg.render().asPng()
writeFileSync(resolve(root, 'public/og-image.png'), png)
console.log('og-image.png written')
