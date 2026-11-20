import { copy } from './copy'
import type { Forecast } from './db'
import { conditionCategory } from './forecastConditions'
import { fill } from './format'

// The forecast follow-ups, item 3 (2026-11-20, at the owner's word): a forecast the challenger moved says so where it is
// shown, in the approved contract's words: on its check-in under "Usually", and after today's forecast on the Brain's
// sheet, which the Brain card's Why shows. "Adjusted about 6 lower, for a late or heavy dinner last night." Never "because".

const NIGHT = copy.brief.lastNightEvents as Readonly<Record<string, string>>
const BANDS = copy.bands as Readonly<Record<string, string>>

/** Things joined as a list is said: "a and b", "a, b and c". */
function listed(things: readonly string[]): string {
  return things.length < 3 ? things.join(' and ') : `${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}`
}

/** One thing that moved a forecast, in the line's words; null for an id the forecast does not know, which is read nowhere. */
function thingWords(id: string, privateName: (itemId: string) => string | null, band: string | null): string | null {
  if (conditionCategory(id) === null) return null
  const c = copy.summary
  if (id === 'sleep.short') return c.adjustedShortNight
  if (id === 'evening.band') return band !== null && typeof BANDS[band] === 'string' ? fill(c.adjustedBand, { band: BANDS[band] }) : c.adjustedBandUnread
  if (id.startsWith('night.')) return fill(c.adjustedNight, { thing: NIGHT[id.slice('night.'.length)] })
  if (id.startsWith('private.')) return fill(c.adjustedPrivate, { name: privateName(id.slice('private.'.length)) ?? c.adjustedPrivateUnnamed })
  return c.adjustedNoticed
}

/**
 * A moved forecast in words, or null where it was not moved. `privateName` gives a private item's name where it may be
 * shown, else null, and the item is "a private item"; `band` is the band the evening before the forecast's day read in,
 * by the forecast's own rule (challengerRecord's bandBefore), else null. Under one point it is "less than a point".
 */
export function adjustedWords(f: Pick<Forecast, 'adj' | 'adjBy'>, privateName: (itemId: string) => string | null, band: string | null): string | null {
  if (typeof f.adj !== 'number' || f.adj === 0) return null
  const c = copy.summary
  const size = Math.abs(f.adj) < 1 ? c.adjustedUnder : fill(c.adjustedAbout, { n: String(Math.round(Math.abs(f.adj))) })
  const way = f.adj < 0 ? c.adjustedLower : c.adjustedHigher
  const things = (f.adjBy ?? []).flatMap((id) => {
    const w = thingWords(id, privateName, band)
    return w === null ? [] : [w]
  })
  return things.length ? fill(c.adjusted, { size, way, things: listed(things) }) : fill(c.adjustedBare, { size, way })
}

/** The Brain switches a moved forecast's words are read under: each condition's, once, in the order they moved it. None where it was not moved. */
export function adjustedKinds(f: Pick<Forecast, 'adj' | 'adjBy'>): string[] {
  if (typeof f.adj !== 'number' || f.adj === 0) return []
  return [
    ...new Set(
      (f.adjBy ?? []).flatMap((id) => {
        const k = conditionCategory(id)
        return k === null ? [] : [k]
      }),
    ),
  ]
}
