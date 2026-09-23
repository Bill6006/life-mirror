import { moveById, type PathId } from './catalogue'
import { copy } from './copy'
import { allCheckIns, db } from './db'
import { fill } from './format'
import { useLive } from './live'
import { repComparisons } from './pathLearning'
import { countsByRep, pathById, pathEntries, pathName } from './pathStage'

// Evidence's Path reps section (Part 25): per rep, drawn, done, partly and no, and your own picks
// as counts. A difference is said only for reps the app drew between two or more with each chance
// kept, once each side has five, and never above Promising: one person's small numbers.

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

export function PathEvidence() {
  const aims = useLive(() => db.aims.toArray(), [])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const checkins = useLive(allCheckIns, [])
  if (!aims || !offers || !outcomes || !checkins) return null
  const pathAims = aims.filter((a) => a.kind === 'path' && a.path)
  const ids = [...new Set(pathAims.map((a) => a.path as PathId))]
  if (!ids.length) return null
  const c = copy.evidence
  return (
    <>
      <h2 class="section">{c.pathsTitle}</h2>
      {ids.map((id) => {
        const path = pathById(id)
        const converted = pathAims.some((a) => a.path === id && a.convertedFrom === 'person')
        const entries = pathEntries(id, offers, outcomes, converted)
        const counts = countsByRep(entries)
        const compared = new Map(repComparisons(entries, checkins).map((r) => [r.moveId, r]))
        return (
          <div key={id} class="card pad" data-testid="path-evidence-reps">
            <p class="calc-line ink">{pathName(path)}</p>
            {counts.length === 0 ? (
              <p class="calc-line">{c.pathNone}</p>
            ) : (
              counts.map((r) => {
                const yours = entries.filter((e) => e.moveId === r.moveId && e.chosenBy === 'you').length
                const cmp = compared.get(r.moveId)
                return (
                  <div key={r.moveId} class="calc" data-testid="path-rep-evidence">
                    <p class="calc-line">
                      {fill(c.pathRepLine, { rep: moveById(r.moveId).name, drawn: String(r.drawn), done: String(r.done), partly: String(r.partly), no: String(r.no) })}
                      {yours > 0 && ` · ${fill(c.pathYours, { n: String(yours) })}`}
                    </p>
                    {cmp && cmp.diff !== null && (
                      <p class="calc-line" data-testid="path-rep-compare">
                        {fill(c.pathCompare, { diff: signed(cmp.diff), n: String(cmp.n), m: String(cmp.m), tier: c.tiers[cmp.tier] })}
                      </p>
                    )}
                  </div>
                )
              })
            )}
            <p class="note faint no-gap">{c.pathNote}</p>
          </div>
        )
      })}
    </>
  )
}
