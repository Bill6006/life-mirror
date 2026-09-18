import { describe, expect, it } from 'vitest'
import { b64urlDecode, b64urlEncode, concat, encryptPayload, hkdf, sendPush, vapidJwt } from './push'

// Web Push over WebCrypto: the phone, holding the subscriber's private key, must be able to
// decrypt what the Worker encrypts; the push service must be able to verify the token.

const enc = new TextEncoder()
const dec = new TextDecoder()

async function decrypt(body: Uint8Array, subscriber: CryptoKeyPair, p256dh: Uint8Array, auth: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)
  const idlen = body[20]
  const ours = body.slice(21, 21 + idlen)
  expect(rs).toBe(4096)
  expect(idlen).toBe(65)
  const theirs = await crypto.subtle.importKey('raw', ours, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, subscriber.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), p256dh, ours), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)))
}

describe('the push the Worker sends', () => {
  it('encrypts for the phone’s key so only the phone can read it, with the header the push service expects', async () => {
    const subscriber = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', subscriber.publicKey))
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const body = await encryptPayload(enc.encode('{"kind":"cue"}'), p256dh, auth, undefined, salt)
    expect(body.slice(0, 16)).toEqual(salt)
    const plain = await decrypt(body, subscriber, p256dh, auth)
    expect(plain[plain.length - 1]).toBe(2)
    expect(dec.decode(plain.slice(0, -1))).toBe('{"kind":"cue"}')
    // A different salt each time, never the same ciphertext twice.
    const again = await encryptPayload(enc.encode('{"kind":"cue"}'), p256dh, auth)
    expect(b64urlEncode(again)).not.toBe(b64urlEncode(body))
  })

  it('signs the token as this app, in the form the push service verifies', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
    const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', keys.publicKey))
    const jwt = await vapidJwt('https://push.example', { publicKey, privateKey: jwk.d as string, subject: 'https://example.test' }, 1_800_000_000)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(dec.decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(dec.decode(b64urlDecode(c)))).toEqual({ aud: 'https://push.example', exp: 1_800_000_000, sub: 'https://example.test' })
    expect(b64urlDecode(s)).toHaveLength(64)
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, b64urlDecode(s), enc.encode(`${h}.${c}`))).toBe(true)
  })

  it('posts the ciphertext with the encoding, the lifetime and the signed authorization', async () => {
    const subscriber = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
    const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', keys.publicKey))
    const sub = { endpoint: 'https://push.example/send/abc', keys: { p256dh: b64urlEncode(await crypto.subtle.exportKey('raw', subscriber.publicKey)), auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) } }
    let seen: { url: string; init: RequestInit } | null = null
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} }
      return new Response(null, { status: 201 })
    }) as typeof fetch
    const r = await sendPush(sub, '{"kind":"cue"}', { publicKey, privateKey: jwk.d as string, subject: 'https://example.test' }, 1500, fetcher)
    expect(r.status).toBe(201)
    const headers = (seen as unknown as { init: RequestInit }).init.headers as Record<string, string>
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(headers.TTL).toBe('1500')
    expect(headers.Authorization.startsWith('vapid t=')).toBe(true)
    expect(headers.Authorization.endsWith(`k=${publicKey}`)).toBe(true)
    const body = (seen as unknown as { init: RequestInit }).init.body as Uint8Array
    expect(body.length).toBe(86 + '{"kind":"cue"}'.length + 1 + 16)
  })
})
