// Web Push from a Worker with nothing but WebCrypto: the payload encrypted for the phone's own
// key (RFC 8291, aes128gcm) and the request signed as this app (RFC 8292, VAPID). The push
// service sees a ciphertext; the payload here is content-free anyway.

export interface Subscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface Vapid {
  publicKey: string
  privateKey: string
  subject: string
}

const enc = new TextEncoder()

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** The content-coding header and the ciphertext, one record, as the push service expects them. */
export async function encryptPayload(payload: Uint8Array, p256dh: Uint8Array, auth: Uint8Array, local?: CryptoKeyPair, salt?: Uint8Array): Promise<Uint8Array> {
  // The casts keep one source honest under both the browser's and the Workers' WebCrypto typings.
  const keys = local ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const theirs = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = { name: 'ECDH', public: theirs } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0]
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, keys.privateKey, 256))
  const ours = new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer)
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), p256dh, ours), 32)
  const cek = await hkdf(s, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(s, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concat(payload, new Uint8Array([2]))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))
  // salt (16), record size 4096 (4, big-endian), key id length (1), our public key (65).
  const header = concat(s, new Uint8Array([0, 0, 16, 0]), new Uint8Array([ours.length]), ours)
  return concat(header, cipher)
}

/** The token that names this app to the push service: ES256 over the audience, the expiry and the subject. */
export async function vapidJwt(aud: string, vapid: Vapid, exp: number): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey)
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: vapid.privateKey, ext: true }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp, sub: vapid.subject })))
  const input = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))
  return `${input}.${b64urlEncode(sig)}`
}

export async function sendPush(sub: Subscription, payload: string, vapid: Vapid, ttl = 1500, fetcher: typeof fetch = fetch): Promise<Response> {
  const body = await encryptPayload(enc.encode(payload), b64urlDecode(sub.keys.p256dh), b64urlDecode(sub.keys.auth))
  const aud = new URL(sub.endpoint).origin
  const jwt = await vapidJwt(aud, vapid, Math.floor(Date.now() / 1000) + 12 * 3600)
  return fetcher(sub.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal', Authorization: `vapid t=${jwt}, k=${vapid.publicKey}` },
    body,
  })
}
