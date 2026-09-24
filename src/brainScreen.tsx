import { addDays, blockAt } from './blocks'
import { BRAIN_SWITCHES, WRITER_MODELS, type Lacked, type WriterModel } from './brainShared'
import { getBrainPrefs, setBrainSwitch, setWriterModel } from './brainPrefs'
import { hasMove, moveById } from './catalogue'
import { SwitchRow } from './controls'
import { copy } from './copy'
import { db, getSettings, type BrainBrief, type BrainRead } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import { USE_WINDOW_DAYS } from './useLog'

/**
 * Settings → Brain (Part 30): who writes the day's line, one row of chips starting on Opus; what
 * Claude may read, one switch per category, every one on until turned off (Rule 21 as amended);
 * who wrote the recent lines, with the model asked for and the one that wrote; and what Claude
 * read, by count and size, never content.
 */

const size = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

/** Who wrote a line, as the list says it. */
function writerOf(b: BrainBrief): string {
  const c = copy.brainScreen
  if (b.writer === 'claude') return fill(c.recentClaude, { asked: c.models[b.askedModel as WriterModel] ?? b.askedModel ?? '', model: b.model })
  return fill(b.fallback ? c.recentFallback : c.recentFree, { model: b.model })
}

/** The reads of one day and task, summed per category, in the order they were first read; a test run's reads kept apart and named as one. */
function readGroups(reads: readonly BrainRead[]): { day: string; task: BrainRead['task']; dry: boolean; items: { category: string; count: number; bytes: number }[] }[] {
  const groups = new Map<string, { day: string; task: BrainRead['task']; dry: boolean; items: Map<string, { category: string; count: number; bytes: number }> }>()
  for (const r of [...reads].sort((a, b) => (a.at < b.at ? 1 : -1))) {
    const dry = r.dry === true
    const key = `${r.day}|${r.task}|${dry}`
    const g = groups.get(key) ?? { day: r.day, task: r.task, dry, items: new Map() }
    const item = g.items.get(r.category) ?? { category: r.category, count: 0, bytes: 0 }
    item.count += r.count
    item.bytes += r.bytes
    g.items.set(r.category, item)
    groups.set(key, g)
  }
  return [...groups.values()].slice(0, 14).map((g) => ({ day: g.day, task: g.task, dry: g.dry, items: [...g.items.values()] }))
}

/** What Claude named as lacking over the last four weeks of its lines and reviews, most first (Part 34). */
export async function lackedCounts(today: string): Promise<{ id: Lacked; n: number }[]> {
  const from = addDays(today, -(USE_WINDOW_DAYS - 1))
  const counts = new Map<Lacked, number>()
  for (const b of await db.brainBriefs.where('day').between(from, today, true, true).toArray()) for (const id of b.lacked ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1))
}

export function BrainScreen({ onClose }: { onClose: () => void }) {
  const prefs = useLive(getBrainPrefs, [])
  const settings = useLive(getSettings, [])
  const lines = useLive(() => db.brainBriefs.orderBy('day').reverse().filter((b) => b.kind === 'brief').limit(7).toArray(), [])
  const reads = useLive(() => db.brainReads.orderBy('day').reverse().limit(400).toArray(), [])
  const coached = useLive(() => db.coachPicks.orderBy('day').reverse().limit(1).toArray(), [])
  // Part 34: what Claude said it lacked, counted over four weeks of its lines and reviews.
  const lacked = useLive(() => lackedCounts(blockAt(new Date()).day), [])
  if (!prefs || !settings || !lines || !reads || !coached) return <section class="screen" />
  const c = copy.brainScreen
  const labelOf = (category: string) => (c.switches as Record<string, { label: string }>)[category]?.label ?? category

  return (
    <section class="screen" data-testid="brain-screen">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note" data-testid="brain-intro">
        {c.intro}
      </p>

      <h2 class="section">{c.writer}</h2>
      <div class="card pad">
        <div class="chips" role="group" aria-label={c.writer}>
          {WRITER_MODELS.map((m) => (
            <button key={m} type="button" class={prefs.writerModel === m ? 'when-chip is-on' : 'when-chip'} aria-pressed={prefs.writerModel === m} data-testid={`brain-model-${m}`} onClick={() => void setWriterModel(m)}>
              {c.models[m]}
            </button>
          ))}
        </div>
        <p class="note faint no-gap">{c.writerNote}</p>
      </div>

      <h2 class="section">{c.reads}</h2>
      <p class="note faint">{c.readsNote}</p>
      <div class="card">
        {BRAIN_SWITCHES.map((k) =>
          k === 'faith' && settings.hideFaith ? (
            <div class="switch-row" key={k} data-testid="brain-switch-faith-hidden">
              <span class="row-main">
                {c.switches.faith.label}
                <span class="sub">{c.faithHidden}</span>
              </span>
            </div>
          ) : (
            <SwitchRow key={k} label={c.switches[k].label} note={c.switches[k].note} on={prefs.switches[k] !== false} onChange={(on) => void setBrainSwitch(k, on)} testid={`brain-switch-${k}`} />
          ),
        )}
      </div>

      <h2 class="section">{c.recent}</h2>
      <div class="card pad" data-testid="brain-recent">
        {lines.length === 0 && <p class="note faint no-gap">{c.recentNone}</p>}
        {lines.map((b) => (
          <p key={b.id} class="calc-line" data-testid="brain-recent-line">
            <span class="calc-key">{formatDayShort(b.day)}</span> · {writerOf(b)}
          </p>
        ))}
      </div>

      <h2 class="section">{c.coach}</h2>
      <div class="card pad" data-testid="brain-coach">
        <p class="note faint">{c.coachNote}</p>
        <p class="calc-line no-gap" data-testid="brain-coach-last">
          {coached[0] ? fill(c.coachLast, { day: formatDayShort(coached[0].day), reps: coached[0].ids.map((id) => (hasMove(id) ? moveById(id).name : id)).join(', ') }) : c.coachNone}
        </p>
      </div>

      <h2 class="section">{c.lacked}</h2>
      <div class="card pad" data-testid="brain-lacked">
        <p class="note faint">{c.lackedNote}</p>
        <p class="calc-line no-gap" data-testid="brain-lacked-counts">
          {lacked && lacked.length ? lacked.map((l) => fill(c.lackedItem, { what: c.lackedLabels[l.id], n: String(l.n) })).join(' · ') : c.lackedNone}
        </p>
      </div>

      <h2 class="section">{c.read}</h2>
      <p class="note faint">{c.readNote}</p>
      <div class="card pad" data-testid="brain-reads">
        {reads.length === 0 && <p class="note faint no-gap">{c.readNone}</p>}
        {readGroups(reads).map((g) => (
          <p key={`${g.day}|${g.task}|${g.dry}`} class="calc-line" data-testid="brain-read-group">
            <span class="calc-key">
              {formatDayShort(g.day)} · {g.dry ? fill(c.testRun, { task: c.tasks[g.task] }) : c.tasks[g.task]}
            </span>{' '}
            {g.items.map((i) => fill(c.readItem, { category: labelOf(i.category), count: String(i.count), size: size(i.bytes) })).join('; ')}
          </p>
        ))}
      </div>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {c.done}
        </button>
      </div>
    </section>
  )
}
