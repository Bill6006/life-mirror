import { describe, expect, it } from 'vitest'
import { pushAddressOf } from './address'

// The ping's address since 2026-10-20 (the owner's decision): the one the phone's settings record carries in the cloud
// copy, and the secret copied by hand only for a record from an app before the change.

const SYNCED = { endpoint: 'https://push.example.test/send/synced', expirationTime: null, keys: { p256dh: 'synced-p256dh', auth: 'synced-auth' } }
const SECRET = JSON.stringify({ endpoint: 'https://push.example.test/send/secret', keys: { p256dh: 'secret-p256dh', auth: 'secret-auth' } })

describe('the ping’s address', () => {
  it('is the one the settings record carries, with when the phone set it up, over the secret copied by hand', () => {
    const a = pushAddressOf({ reminders: { enabled: true }, push: { subscription: SYNCED, subscribedAt: '2026-10-20T15:30:00.000Z' } }, SECRET)
    expect(a).toEqual({ sub: { endpoint: SYNCED.endpoint, keys: SYNCED.keys }, from: 'cloud', setUpAt: '2026-10-20T15:30:00.000Z' })
  })

  it('is none when the record says the ping was turned off, never the secret in its place', () => {
    expect(pushAddressOf({ push: { subscription: null, subscribedAt: null } }, SECRET)).toEqual({ sub: null, from: 'cloud', setUpAt: null })
    expect(pushAddressOf({ push: null }, SECRET)).toEqual({ sub: null, from: 'cloud', setUpAt: null })
  })

  it('is the secret only for a record without the field, from an app before the change, or with no record at all', () => {
    expect(pushAddressOf({ reminders: { enabled: true } }, SECRET)).toEqual({ sub: { endpoint: 'https://push.example.test/send/secret', keys: { p256dh: 'secret-p256dh', auth: 'secret-auth' } }, from: 'secret', setUpAt: null })
    expect(pushAddressOf(null, SECRET).from).toBe('secret')
    expect(pushAddressOf({ reminders: { enabled: true } }, undefined)).toEqual({ sub: null, from: null, setUpAt: null })
    expect(pushAddressOf({ reminders: { enabled: true } }, 'not json')).toEqual({ sub: null, from: null, setUpAt: null })
  })

  it('refuses an address the push service could not be sent to: no https endpoint, or a key missing', () => {
    for (const bad of [{ ...SYNCED, endpoint: 'http://push.example.test/x' }, { ...SYNCED, keys: { p256dh: 'k', auth: '' } }, { endpoint: SYNCED.endpoint }, 'text'])
      expect(pushAddressOf({ push: { subscription: bad, subscribedAt: '2026-10-20T15:30:00.000Z' } }, SECRET)).toEqual({ sub: null, from: 'cloud', setUpAt: null })
  })
})
