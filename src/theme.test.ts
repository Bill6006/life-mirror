import { beforeEach, describe, expect, it } from 'vitest'
import { copy } from './copy'
import { DEFAULT_THEME, THEME_KEY, THEME_SPECS, THEMES, applyTheme, currentTheme, indexLabel, nextLine, onTheme, parseTheme, readTheme, resetThemeCache, screenDate, setTheme, stageLine } from './theme'

// The theme is presentation alone: which of three, kept on this phone, applied at once. These
// tests hold the parts that decide it: what counts as a stored choice, what applying it touches,
// and the few words a theme writes its own way.

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

function doc() {
  const meta: Record<string, string> = {}
  return {
    meta,
    documentElement: { dataset: {} as DOMStringMap },
    querySelector: (s: string) => (s === 'meta[name="theme-color"]' ? { setAttribute: (k: string, v: string) => void (meta[k] = v) } : null),
  }
}

beforeEach(() => resetThemeCache())

describe('the three themes', () => {
  it('are Instrument, Nocturne and Signal, and Nocturne is the default', () => {
    expect([...THEMES].sort()).toEqual(['instrument', 'nocturne', 'signal'])
    expect(DEFAULT_THEME).toBe('nocturne')
  })

  it('reads a stored choice, and anything else as Nocturne without an error', () => {
    for (const t of THEMES) expect(readTheme(store({ [THEME_KEY]: t }))).toBe(t)
    expect(readTheme(store())).toBe('nocturne')
    for (const bad of ['', 'Nocturne', 'neon', '{"theme":"signal"}']) expect(readTheme(store({ [THEME_KEY]: bad }))).toBe('nocturne')
    expect(parseTheme(undefined)).toBe('nocturne')
    expect(parseTheme(3)).toBe('nocturne')
    // Storage that throws (blocked, private mode) is the default, never a crash.
    expect(
      readTheme({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => undefined,
      }),
    ).toBe('nocturne')
    expect(readTheme(null)).toBe('nocturne')
  })

  it('applies a theme to the page: its tokens by name, its ground as the browser colour, and nothing else', () => {
    const d = doc()
    applyTheme('signal', d)
    expect(d.documentElement.dataset.theme).toBe('signal')
    expect(d.meta.content).toBe(THEME_SPECS.signal.ground)
    applyTheme('instrument', d)
    expect(d.documentElement.dataset.theme).toBe('instrument')
    expect(d.meta.content).toBe('#14171f')
  })

  it('keeps a choice on the phone, applies it at once and tells every screen, with no reload', () => {
    const s = store()
    const d = doc()
    const heard: string[] = []
    const off = onTheme((t) => heard.push(t))
    setTheme('instrument', s, d)
    expect(s.data.get(THEME_KEY)).toBe('instrument')
    expect(d.documentElement.dataset.theme).toBe('instrument')
    expect(currentTheme()).toBe('instrument')
    setTheme('signal', s, d)
    expect(heard).toEqual(['instrument', 'signal'])
    off()
    setTheme('nocturne', s, d)
    expect(heard).toEqual(['instrument', 'signal'])
    // A choice that cannot be stored still holds for the session.
    setTheme(
      'signal',
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('full')
        },
      },
      d,
    )
    expect(currentTheme()).toBe('signal')
    expect(d.documentElement.dataset.theme).toBe('signal')
  })

  it('holds instrument to Rule 15 as written: the ground #14171f', () => {
    expect(THEME_SPECS.instrument.ground).toBe('#14171f')
  })
})

describe('what a theme writes its own way', () => {
  it('writes a stage as "Stage 1 of 7", or in Signal as "Stage 01 / 07"; the same stage either way', () => {
    expect(stageLine(1, 7, 'nocturne', copy.path)).toBe('Stage 1 of 7')
    expect(stageLine(1, 7, 'instrument', copy.path)).toBe('Stage 1 of 7')
    expect(stageLine(1, 7, 'signal', copy.path)).toBe('Stage 01 / 07')
    expect(stageLine(4, 6, 'signal', copy.path)).toBe('Stage 04 / 06')
  })

  it('writes what comes next as "Next: Dating", or in Signal as "Next → Dating"', () => {
    expect(nextLine('Dating', 'nocturne', copy.path)).toBe('Next: Dating')
    expect(nextLine('Dating', 'signal', copy.path)).toBe('Next → Dating')
  })

  it('writes the day long, or in Signal compact; the date is the same', () => {
    const long = screenDate('2026-09-23', 'nocturne')
    const compact = screenDate('2026-09-23', 'signal')
    expect(long).toBe(screenDate('2026-09-23', 'instrument'))
    expect(long).toMatch(/23/)
    expect(compact).toMatch(/^\S+ · 23 \S+$/)
  })

  it('numbers rows from 01', () => {
    expect(indexLabel(0)).toBe('01')
    expect(indexLabel(11)).toBe('12')
  })
})
