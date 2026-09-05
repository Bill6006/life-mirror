// Writes ANCHORS.md from src/readings.json so the document and the app can never disagree.
// `node scripts/anchors-md.mjs` writes it; `--check` fails if the file is out of date.
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/readings.json', import.meta.url), 'utf8'))
const name = (id) => data.readings.find((r) => r.id === id).name

let md = '# Life Mirror — wording\n\n'
md += 'The readings and their phrases, least to most, exactly as the app shows them. '
md += 'Generated from `src/readings.json` by `scripts/anchors-md.mjs`; edit the JSON, not this file.\n\n'
md += `Morning asks all ${data.blocks.morning.length}: ${data.blocks.morning.map(name).join(', ')}.\n\n`
md += `Afternoon and evening ask ${data.blocks.afternoon.length}: ${data.blocks.afternoon.map(name).join(', ')}.\n\n`
for (const r of data.readings) {
  md += `## ${r.name}\n\n_${r.prompt}_\n\n`
  for (const a of r.anchors) md += `- ${a}\n`
  md += '\n'
}

const target = new URL('../ANCHORS.md', import.meta.url)
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    current = ''
  }
  if (current !== md) {
    console.error('ANCHORS.md is out of date with src/readings.json. Run: npm run anchors')
    process.exit(1)
  }
  console.log('ANCHORS.md is in sync')
} else {
  writeFileSync(target, md)
  console.log('ANCHORS.md written')
}
