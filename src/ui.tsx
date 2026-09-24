import type { ComponentChildren, VNode } from 'preact'
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { copy } from './copy'
import { Icon } from './icons'
import { indexLabel, nextLine, screenDate, stageLine, THEME_SPECS, useTheme } from './theme'

// The shared components every screen is built from, the same in every theme. What differs by
// theme is in styles.css (tokens and a few scoped rules) and, for progress and formats, in the
// theme's spec: the markup, the order and what each tap opens never change.

/** A tab's head: its name, and the day in the theme's format. */
export function ScreenHead({ title, day, side, level = 1 }: { title: string; day?: string; side?: ComponentChildren; level?: 1 | 2 }) {
  const theme = useTheme()
  const Title = level === 1 ? 'h1' : 'p'
  return (
    <header class="screen-head">
      <Title class="eyebrow screen-title">{title}</Title>
      {day && <p class="date">{screenDate(day, theme)}</p>}
      {side}
    </header>
  )
}

/** A secondary screen's head: the way back, then its name. */
export function SubHead({ title, back, onBack, side }: { title: string; back: string; onBack: () => void; side?: ComponentChildren }) {
  return (
    <header class="screen-head sub-head">
      <button type="button" class="back" onClick={onBack}>
        <Icon name="back" />
        <span>{back}</span>
      </button>
      <div class="sub-head-row">
        <h1 class="eyebrow screen-title">{title}</h1>
        {side}
      </div>
    </header>
  )
}

/** A section's label; in the compact theme it carries its index. */
export function SectionLabel({ children, index, testid }: { children: ComponentChildren; index?: number; testid?: string }) {
  return (
    <h2 class="section" data-testid={testid}>
      {index !== undefined && (
        <span class="idx" aria-hidden="true">
          {indexLabel(index)}
        </span>
      )}
      {children}
    </h2>
  )
}

/**
 * Words folded to two lines, and More when they run past them: the rest is one tap away, never cut.
 * More shows only when something is folded; Less folds it again.
 */
export function ClampText({ text, class: cls = '', testid }: { text: string; class?: string; testid?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [folded, setFolded] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const measure = () => setFolded(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])
  return (
    <>
      <p ref={ref} class={open ? cls : `${cls} clamp2`} data-testid={testid}>
        {text}
      </p>
      {(folded || open) && (
        <button type="button" class="link clamp-more" aria-expanded={open} data-testid={testid ? `${testid}-more` : undefined} onClick={() => setOpen(!open)}>
          {open ? copy.disclose.less : copy.disclose.more}
        </button>
      )}
    </>
  )
}

/**
 * One row that opens what sits behind it. Nothing behind a disclosure is lost: it is one tap away,
 * in the same words. The row says what it holds; open, its panel follows it.
 */
export function Disclosure({
  label,
  sub,
  testid,
  open: controlled,
  onToggle,
  defaultOpen = false,
  children,
  class: cls = '',
}: {
  label: ComponentChildren
  sub?: ComponentChildren
  testid?: string
  open?: boolean
  onToggle?: (open: boolean) => void
  defaultOpen?: boolean
  children: ComponentChildren
  class?: string
}) {
  const [own, setOwn] = useState(defaultOpen)
  const open = controlled ?? own
  const id = useId()
  const toggle = () => (onToggle ? onToggle(!open) : setOwn(!open))
  return (
    <div class={`disclosure${open ? ' is-open' : ''}${cls ? ` ${cls}` : ''}`}>
      <button type="button" class="disclose" aria-expanded={open} aria-controls={id} data-testid={testid} onClick={toggle}>
        <span class="d-main">
          <span class="d-label">{label}</span>
          {sub && <span class="d-sub">{sub}</span>}
        </span>
        <Icon name="chev" class="chev" />
      </button>
      {open && (
        <div class="panel" id={id} data-testid={testid ? `${testid}-panel` : undefined}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Facts joined by a middle dot. Each fact is one unit: a line breaks between facts, never inside one, and never leaves a dot hanging. */
export function Facts({ items, class: cls = '', testid }: { items: readonly (ComponentChildren | null | undefined | false)[]; class?: string; testid?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '')
  if (!shown.length) return null
  // The dot a reader sees is drawn by the stylesheet; the one in the text stays for anything that reads or copies it.
  return (
    <span class={`dots${cls ? ` ${cls}` : ''}`} data-testid={testid}>
      {shown.map((x, i) => (
        <span key={i}>
          {i > 0 && <span class="dot-sep"> · </span>}
          {x}
        </span>
      ))}
    </span>
  )
}

/** The TESTING label on a move: visible, never loud. */
export function Tag({ children }: { children: ComponentChildren }) {
  return <span class="tag">{children}</span>
}

/** Six proofs, or any count of steps, as a row of segments; the theme draws them as bars, dots or blocks. */
export function RungTrack({ n, of, label }: { n: number; of: number; label?: string }) {
  return (
    <span class="track" style={{ '--of': String(of) }} role="img" aria-label={label}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} class={i < n - 1 ? 'tk is-done' : i === n - 1 ? 'tk is-here' : 'tk'} />
      ))}
    </span>
  )
}

/** A ring for the stage, with its count inside: Nocturne's progress beside a path's name. */
function StageRing({ n, of }: { n: number; of: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <svg class="stage-ring" viewBox="0 0 44 44" aria-hidden="true" data-testid="stage-ring">
      <circle class="ring-track" cx="22" cy="22" r={r} />
      <circle class="ring-fill" cx="22" cy="22" r={r} stroke-dasharray={`${(c * n) / of} ${c}`} transform="rotate(-90 22 22)" />
      <text class="ring-text" x="22" y="26.2" text-anchor="middle">
        {n}/{of}
      </text>
    </svg>
  )
}

/**
 * A path's stage and what comes next, drawn the theme's way: segments under the name (Instrument),
 * a ring beside it (Nocturne), or a node track (Signal). The words are the same in all three.
 */
export function StageProgress({ n, of, name, next, testid }: { n: number; of: number; name: ComponentChildren; next: string | null; testid?: string }) {
  const theme = useTheme()
  const kind = THEME_SPECS[theme].stage
  const words = copy.path
  const label = stageLine(n, of, theme, words)
  return (
    <div class={`stage is-${kind}`} data-testid={testid}>
      <div class="stage-top">
        {kind === 'ring' && <StageRing n={n} of={of} />}
        <div class="stage-main" data-testid="path-stage">
          <span class="stage-of" data-testid="stage-of">
            {label}
          </span>
          <span class="rung-sep"> · </span>
          <span class="stage-name">{name}</span>
        </div>
      </div>
      {kind !== 'ring' && <RungTrack n={n} of={of} label={label} />}
      {next && (
        <p class="stage-next" data-testid="stage-next">
          {nextLine(next, theme, words)}
        </p>
      )}
    </div>
  )
}

/** A row that opens another screen, with an optional icon; the theme decides whether icons show. */
export function LinkRow({ label, note, icon, onClick, testid, index }: { label: string; note?: ComponentChildren; icon?: Parameters<typeof Icon>[0]['name']; onClick: () => void; testid?: string; index?: number }): VNode {
  return (
    <li>
      <button type="button" class={icon ? 'row has-ic' : 'row'} data-testid={testid} onClick={onClick}>
        {icon && (
          <span class="row-ic" aria-hidden="true">
            <Icon name={icon} />
          </span>
        )}
        {index !== undefined && (
          <span class="idx row-idx" aria-hidden="true">
            {indexLabel(index)}
          </span>
        )}
        <span class="row-main">
          {label}
          {note && <span class="sub">{note}</span>}
        </span>
        <Icon name="chev" class="chev" />
      </button>
    </li>
  )
}
