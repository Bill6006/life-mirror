import { useEffect, useState } from 'preact/hooks'
import { parseDay } from './blocks'
import { formatDayLong } from './format'

// The three themes (Rule 15, as revised 2026-09-24). One app, one set of screens and components:
// a theme changes presentation only, through the design tokens in styles.css and the few
// presentation choices below (how progress is drawn, how a date or a stage is written). Nothing
// here reaches logic, data, eligibility, evidence or navigation. The choice is this phone's, kept
// in localStorage so it applies before the first paint (index.html reads the same key), and it
// travels with no record, export or sync.

export const THEMES = ['nocturne', 'instrument', 'signal'] as const
export type ThemeId = (typeof THEMES)[number]

/** New installs, and any install that never chose, open in Nocturne. */
export const DEFAULT_THEME: ThemeId = 'nocturne'
export const THEME_KEY = 'life-mirror.theme'

export interface ThemeSpec {
  /** Each theme's ground: the browser's own colour, so the phone's status bar matches. */
  ground: string
  /** How a path's stage progress is drawn: segments, a ring beside the name, or a node track. */
  stage: 'bar' | 'ring' | 'nodes'
  /** Dates and stages in the compact technical form (Signal): "Wed · 23 Sep", "Stage 01 / 07", "Next → Dating". */
  compact: boolean
}

export const THEME_SPECS: Record<ThemeId, ThemeSpec> = {
  instrument: { ground: '#14171f', stage: 'bar', compact: false },
  nocturne: { ground: '#0d111d', stage: 'ring', compact: false },
  signal: { ground: '#0a0c0f', stage: 'nodes', compact: true },
}

/** Anything stored that is not one of the three reads as the default; a bad value is never an error. */
export function parseTheme(value: unknown): ThemeId {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value) ? (value as ThemeId) : DEFAULT_THEME
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The stored choice; the default when there is none, when storage is blocked, or when the value is unknown. */
export function readTheme(store: Store | null = storage()): ThemeId {
  try {
    return parseTheme(store?.getItem(THEME_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

interface Doc {
  documentElement: { dataset: DOMStringMap }
  querySelector: (s: string) => { setAttribute: (k: string, v: string) => void } | null
}

/** Puts a theme on the page: its tokens through data-theme on <html>, and its ground as the browser colour. */
export function applyTheme(theme: ThemeId, doc: Doc | null = typeof document === 'undefined' ? null : document): void {
  if (!doc) return
  doc.documentElement.dataset.theme = theme
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_SPECS[theme].ground)
}

let current: ThemeId | null = null
const listeners = new Set<(t: ThemeId) => void>()

export function currentTheme(): ThemeId {
  if (current === null) current = readTheme()
  return current
}

/** Chooses a theme: kept on this phone, applied at once, every screen told. No reload, no state lost. */
export function setTheme(theme: ThemeId, store: Store | null = storage(), doc?: Doc | null): void {
  current = theme
  try {
    store?.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: the choice still holds for this session.
  }
  applyTheme(theme, doc === undefined ? (typeof document === 'undefined' ? null : document) : doc)
  for (const l of listeners) l(theme)
}

/** For tests: forget the cached choice. */
export function resetThemeCache(): void {
  current = null
}

export function onTheme(listener: (t: ThemeId) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The theme on show, for the few components that draw differently by theme. */
export function useTheme(): ThemeId {
  const [theme, set] = useState<ThemeId>(currentTheme)
  useEffect(() => onTheme(set), [])
  return theme
}

/** Another window of the app changed the theme: follow it. */
export function followOtherWindows(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const on = (e: StorageEvent) => {
    if (e.key === THEME_KEY) setTheme(parseTheme(e.newValue), null)
  }
  window.addEventListener('storage', on)
  return () => window.removeEventListener('storage', on)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A screen's date: "Wednesday, September 23", or in the compact form "Wed · 23 Sep". */
export function screenDate(day: string, theme: ThemeId): string {
  if (!THEME_SPECS[theme].compact) return formatDayLong(day)
  const d = parseDay(day)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`
}

/** "Stage 1 of 7", or "Stage 01 / 07". */
export function stageLine(n: number, of: number, theme: ThemeId, words: { stageOf: string; stageOfCompact: string }): string {
  return THEME_SPECS[theme].compact ? words.stageOfCompact.replace('{n}', pad2(n)).replace('{of}', pad2(of)) : words.stageOf.replace('{n}', String(n)).replace('{of}', String(of))
}

/** "Next: Dating", or "Next → Dating". */
export function nextLine(stage: string, theme: ThemeId, words: { next: string; nextCompact: string }): string {
  return (THEME_SPECS[theme].compact ? words.nextCompact : words.next).replace('{stage}', stage)
}

/** A row's or a section's index: "01". Drawn by Signal alone; the others hide it. */
export function indexLabel(i: number): string {
  return pad2(i + 1)
}
