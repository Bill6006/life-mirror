import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { writtenBy } from './brainFlow'
import { getBrainPrefs, setBrainSwitch, setWriterModel } from './brainPrefs'
import { BRAIN_SWITCHES, WRITER_MODELS } from './brainShared'
import { copy } from './copy'
import { db } from './db'

// The Brain settings on the phone (Part 30): Opus and every switch on until changed; nothing but
// the four aliases accepted; and who wrote a line said the same way wherever it is shown.

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('the Brain settings', () => {
  it('start on Opus with every category on, as Rule 21 says', async () => {
    expect(await getBrainPrefs()).toEqual({ id: 'prefs', updatedAt: '', writerModel: 'opus', switches: {} })
    expect(WRITER_MODELS).toEqual(['opus', 'fable', 'sonnet', 'haiku'])
    expect(Object.keys(copy.brainScreen.switches)).toEqual([...BRAIN_SWITCHES])
  })

  it('take only the four aliases for the writer, refusing best and any full id', async () => {
    expect(await setWriterModel('fable')).toBe(true)
    expect(await setWriterModel('best')).toBe(false)
    expect(await setWriterModel('claude-opus-5-5')).toBe(false)
    expect((await getBrainPrefs()).writerModel).toBe('fable')
  })

  it('keep a switch turned off, and forget it when turned back on', async () => {
    await setBrainSwitch('reflections', false)
    await setBrainSwitch('faith', false)
    expect((await getBrainPrefs()).switches).toEqual({ reflections: false, faith: false })
    await setBrainSwitch('reflections', true)
    expect((await getBrainPrefs()).switches).toEqual({ faith: false })
  })
})

describe('who wrote a line, in words', () => {
  const words = copy.brain
  it('names Claude with the model asked for and the one that wrote, the free chain and why it stood in, or the phone', () => {
    expect(writtenBy({ source: 'worker', model: 'claude-opus-5-5', writer: 'claude', askedModel: 'opus' }, words)).toBe('Written by Claude through your claude.ai routine: asked for Opus, written by claude-opus-5-5, from your record as Settings → Brain allows.')
    expect(writtenBy({ source: 'worker', model: '@cf/openai/gpt-oss-120b', writer: 'free', fallback: 'no valid line from Claude within 20 minutes' }, words)).toBe('Written by a free model under your Cloudflare account, @cf/openai/gpt-oss-120b, from the day’s facts, standing in for Claude: no valid line from Claude within 20 minutes.')
    expect(writtenBy({ source: 'worker', model: '@cf/openai/gpt-oss-120b' }, words)).toBe('Written by the brain under your account, @cf/openai/gpt-oss-120b, from the facts and the library.')
    expect(writtenBy({ source: 'phone', model: null }, words)).toBe(words.fromPhone)
  })
})
