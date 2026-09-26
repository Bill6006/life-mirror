import { describe, expect, it } from 'vitest'
import { RELOAD_SETTLE_MS, reloadWhenSafe, typingIn, type ReloadHost } from './swUpdate'

// A new build reloads the page onto itself, but never under someone's typing: the place typed in
// Settings was lost this way (Part 35, reproduced in Pass 4) because it saves when the field is left.

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as Element

function host(active: Element | null) {
  const h = {
    reloads: 0,
    active,
    listeners: [] as (() => void)[],
    timers: [] as { fn: () => void; ms: number }[],
  }
  const api: ReloadHost = {
    document: {
      get activeElement() {
        return h.active
      },
      addEventListener: (_type, listener) => void h.listeners.push(listener),
    },
    location: { reload: () => void h.reloads++ },
    setTimeout: (fn, ms) => void h.timers.push({ fn, ms }),
  }
  const leave = (next: Element | null) => {
    const fire = h.listeners.splice(0)
    h.active = next
    for (const f of fire) f()
  }
  const runTimers = () => {
    for (const t of h.timers.splice(0)) t.fn()
  }
  return { h, api, leave, runTimers }
}

describe('a new build reloads the page, never under typing', () => {
  it('knows a field typed into from one tapped', () => {
    expect(typingIn(el('INPUT', { type: 'text' }))).toBe(true)
    expect(typingIn(el('INPUT', { type: '' }))).toBe(true)
    expect(typingIn(el('INPUT', { type: 'search' }))).toBe(true)
    expect(typingIn(el('TEXTAREA'))).toBe(true)
    expect(typingIn(el('DIV', { isContentEditable: true }))).toBe(true)
    for (const type of ['checkbox', 'radio', 'button', 'range']) expect(typingIn(el('INPUT', { type })), type).toBe(false)
    expect(typingIn(el('BUTTON'))).toBe(false)
    expect(typingIn(null)).toBe(false)
  })

  it('reloads at once when nothing is being typed', () => {
    const t = host(el('BUTTON'))
    reloadWhenSafe(t.api)
    expect(t.h.reloads).toBe(1)
  })

  it('waits while a field is being typed in, then reloads a moment after it is left, once its save has run', () => {
    const t = host(el('INPUT', { type: 'text' }))
    reloadWhenSafe(t.api)
    expect(t.h.reloads).toBe(0)
    // Leaving the field starts its save; the reload waits a moment for it.
    t.leave(el('BODY'))
    expect(t.h.reloads).toBe(0)
    expect(t.h.timers.map((x) => x.ms)).toEqual([RELOAD_SETTLE_MS])
    t.runTimers()
    expect(t.h.reloads).toBe(1)
  })

  it('keeps waiting when the next field is typed in too, and reloads once the last is left', () => {
    const t = host(el('INPUT', { type: 'text' }))
    reloadWhenSafe(t.api)
    t.leave(el('TEXTAREA'))
    t.runTimers()
    expect(t.h.reloads).toBe(0)
    t.leave(el('BUTTON'))
    t.runTimers()
    expect(t.h.reloads).toBe(1)
  })
})
