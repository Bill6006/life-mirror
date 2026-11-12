// The chance itself, read on a results folder of the counted foundation's simulation: among the comparisons tested with
// nothing there, how many in 100 gave a chance at or under 0.05, 0.01 and 0.005 (an honest check gives 5, 1 and 0.5),
// each with its distance from that in standard errors, and how many were also large enough to be said.
//
// node stress/counted-calib.mjs <folder> [world,world,...]
import { readFileSync, existsSync } from 'node:fs'
const folder = process.argv[2]
const worlds = (process.argv[3] ?? 'independent-10,independent-30,independent-50,runs,weekly-rhythm,missing-on-state,follows-band,runs-persistent,season').split(',')
const groupsOf = { 'A-day': { weekday: [0, 7], short: [7, 8], low: [8, 9] }, 'A-checkin': { weekday: [0, 7], block: [7, 10], short: [10, 11], low: [11, 12] }, B: { things: [0, 12] } }
const T = [0.05, 0.01, 0.005]
console.log('world              family     look  group    tested   p<=.05 (z)      p<=.01 (z)      p<=.005 (z)   big&p<=.05')
for (const w of worlds) {
  const f = `${folder}/${w}.json`
  if (!existsSync(f)) continue
  const run = JSON.parse(readFileSync(f, 'utf8'))
  for (const fam of Object.keys(groupsOf)) for (const look of ['60', '180', '365']) for (const [g, [a, b]] of Object.entries(groupsOf[fam])) {
    let n = 0; const hit = T.map(() => 0); let big = 0
    for (const p of run.results) {
      const rows = p.looks[look].families[fam]?.rows
      if (!rows) continue
      for (let i = a; i < b; i++) { const r = rows[i]; if (r[3] === null) continue; n++; T.forEach((t, k) => { if (r[3] <= t) hit[k]++ }); if (r[3] <= 0.05 && r[4] >= 2) big++ }
    }
    if (!n) continue
    const cell = (k) => { const share = hit[k] / n; const z = (share - T[k]) / Math.sqrt(T[k] * (1 - T[k]) / n); return `${(100 * share).toFixed(2).padStart(5)} (${z >= 0 ? '+' : ''}${z.toFixed(1)})`.padEnd(15) }
    console.log(`${w.padEnd(18)} ${fam.padEnd(10)} ${look.padStart(4)}  ${g.padEnd(7)} ${String(n).padStart(7)}   ${cell(0)} ${cell(1)} ${cell(2)} ${(100 * big / n).toFixed(2)}`)
  }
}
