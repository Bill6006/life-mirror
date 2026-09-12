import { useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { hasMove, moveById } from './catalogue'
import { NavRow } from './controls'
import { copy } from './copy'
import { db, type HerSkill } from './db'
import { fill, formatDayShort } from './format'
import { HELP_LEVELS, HER_AREAS, HER_RUNGS, HER_SOURCE, herSkillById, herSkillsInArea, momentSummary, skillCounts, type HelpLevel, type HerRung } from './her'
import { addHerSkill, addMoment, allMoments, liveHerSkills, removeHerSkill, setHerRung } from './herFlow'
import { useLive } from './live'

// Aims → Her. Her skills from the CDC checklists, each with plain counts of what she did and how
// much help she needed, on a ladder that moves by your tap alone; and the dated count of moments
// with her. Never a percentage, a bar, a grade or a comparison with other children.

type Open = { skillId: string; mode: 'count' | 'rung' } | null

/** Practice moves done, from the record: a count with its last day, never a rate. */
async function practiceDone(): Promise<{ n: number; last: string | null }> {
  const outcomes = await db.outcomes.filter((x) => x.outcome === 'done').toArray()
  const offers = await db.offers.toArray()
  const byId = new Map(offers.map((o) => [o.id as number, o]))
  let n = 0
  let last: string | null = null
  for (const x of outcomes) {
    const o = byId.get(x.offerId)
    if (!o || !hasMove(o.moveId) || moveById(o.moveId).family !== 'fatherhood') continue
    n++
    if (last === null || o.day > last) last = o.day
  }
  return { n, last }
}

export function HerScreen({ onPick, onClose }: { onPick: () => void; onClose: () => void }) {
  const skills = useLive(liveHerSkills, [])
  const moments = useLive(allMoments, [])
  const practice = useLive(practiceDone, [])
  const [open, setOpen] = useState<Open>(null)
  if (!skills || !moments || !practice) return <section class="screen" />
  const c = copy.her
  const today = blockAt(new Date()).day
  const all = momentSummary(moments)

  function count(skillId: string, help: HelpLevel) {
    void addMoment(today, skillId, help)
    setOpen(null)
  }

  function rung(skillId: string, r: HerRung) {
    void setHerRung(skillId, r)
    setOpen(null)
  }

  return (
    <section class="screen" data-testid="her">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note" data-testid="her-source">
        {fill(c.source, { who: HER_SOURCE.who, what: HER_SOURCE.what, year: String(HER_SOURCE.year) })}
      </p>

      <h2 class="section">{c.moments}</h2>
      <div class="calc" data-testid="her-moments">
        <p class="calc-line ink">
          {all.n === 0
            ? c.momentsNone
            : fill(all.n === 1 ? c.momentsOne : c.momentsLine, { n: String(all.n), first: formatDayShort(all.first as string), last: formatDayShort(all.last as string) })}
        </p>
        <p class="calc-line">{practice.n === 0 ? c.practiceNone : fill(c.practiceDone, { n: String(practice.n), last: formatDayShort(practice.last as string) })}</p>
      </div>
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid="her-moment" onClick={() => void addMoment(today, null, null)}>
          {c.countMoment}
        </button>
      </div>

      <h2 class="section">{c.skills}</h2>
      <div class="card">
        {skills.length === 0 ? (
          <p class="note faint in-card">{c.noSkills}</p>
        ) : (
          <ul class="rows">
            {skills.map((s) => (
              <SkillRow key={s.skillId} skill={s} open={open} setOpen={setOpen} onCount={count} onRung={rung} counts={skillCounts(moments, s.skillId)} />
            ))}
          </ul>
        )}
      </div>
      <div class="card">
        <ul class="rows">
          <NavRow label={c.addSkill} note={c.addNote} onClick={onPick} />
        </ul>
      </div>
      <p class="note faint">{c.rungNote}</p>
      <p class="note faint">{c.note}</p>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

function SkillRow({
  skill,
  counts,
  open,
  setOpen,
  onCount,
  onRung,
}: {
  skill: HerSkill
  counts: ReturnType<typeof skillCounts>
  open: Open
  setOpen: (o: Open) => void
  onCount: (skillId: string, help: HelpLevel) => void
  onRung: (skillId: string, rung: HerRung) => void
}) {
  const c = copy.her
  const def = herSkillById(skill.skillId)
  if (!def) return null
  const mode = open?.skillId === skill.skillId ? open.mode : null
  const line = counts.did === 0 ? c.noCount : fill(c.countsLine, { did: String(counts.did), own: String(counts.own), some: String(counts.some), lots: String(counts.lots) })
  return (
    <li class="skill-row her-row" data-testid="her-skill">
      <span class="row-main">
        {def.name}
        <span class="sub" data-testid="her-rung">
          {c.rungs[HER_RUNGS.indexOf(skill.rung)]}
        </span>
        <span class="sub" data-testid="her-counts">
          {line}
          {counts.last && ` · ${fill(c.lastOn, { day: formatDayShort(counts.last) })}`}
        </span>
      </span>
      <div class="skill-actions">
        <button type="button" class="textbtn" data-testid="her-count" aria-expanded={mode === 'count'} onClick={() => setOpen(mode === 'count' ? null : { skillId: skill.skillId, mode: 'count' })}>
          {c.countOne}
        </button>
        <button type="button" class="textbtn" data-testid="her-rung-open" aria-expanded={mode === 'rung'} onClick={() => setOpen(mode === 'rung' ? null : { skillId: skill.skillId, mode: 'rung' })}>
          {c.rung}
        </button>
        <button type="button" class="textbtn faint" onClick={() => void removeHerSkill(skill.skillId)}>
          {c.remove}
        </button>
      </div>
      {mode === 'count' && (
        <div class="her-pick" data-testid="her-help">
          <p class="note faint in-card">{c.helpQuestion}</p>
          <div class="seg">
            {HELP_LEVELS.map((h) => (
              <button key={h} type="button" class="seg-opt" data-testid={`her-help-${h}`} onClick={() => onCount(skill.skillId, h)}>
                {c.help[h]}
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === 'rung' && (
        <div class="her-pick" data-testid="her-rungs">
          <ul class="rows">
            {HER_RUNGS.map((r, i) => (
              <li key={r}>
                <button type="button" class="row anchor" data-testid={`her-rung-${r}`} aria-pressed={skill.rung === r} onClick={() => onRung(skill.skillId, r)}>
                  <span class="anchor-mark" aria-hidden="true" />
                  <span class="row-main">{c.rungs[i]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

/** The checklists, four areas, each skill marked by the age its list belongs to. Tap one to watch it. */
export function HerPickScreen({ onClose }: { onClose: () => void }) {
  const skills = useLive(liveHerSkills, [])
  if (!skills) return <section class="screen" />
  const c = copy.her
  const on = new Set(skills.map((s) => s.skillId))
  return (
    <section class="screen" data-testid="her-pick">
      <header class="screen-head">
        <p class="eyebrow">{c.pickTitle}</p>
      </header>
      <p class="note">{fill(c.source, { who: HER_SOURCE.who, what: HER_SOURCE.what, year: String(HER_SOURCE.year) })}</p>
      {HER_AREAS.map((area) => (
        <div key={area.id}>
          <h2 class="section">{area.name}</h2>
          <div class="card">
            <ul class="rows">
              {herSkillsInArea(area.id).map((s) => (
                <li key={s.id}>
                  <button type="button" class="row" data-testid={`her-add-${s.id}`} disabled={on.has(s.id)} onClick={() => void addHerSkill(s.id)}>
                    <span class="row-main">
                      {s.name}
                      <span class="sub">
                        {fill(c.by, { age: String(s.age) })}
                        {s.example && ` · ${s.example}`}
                      </span>
                    </span>
                    <span class="row-side">{on.has(s.id) ? c.onList : c.addTap}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
      <p class="note faint">{c.note}</p>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}
