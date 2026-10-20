import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyPermission, reconcilePush, setUpPing } from './push'
import type { PushState, Settings, SyncedPush } from './settings'

// The ping's address kept alive (the owner's report of 2026-10-20): a browser that withdraws its notification permission
// cancels the address, and nothing noticed. At start and on coming back, the address kept is checked against the
// browser's own; one the browser lost is made again when notifications are allowed, and Now offers the tap otherwise.

interface FakeSub {
  endpoint: string
  options: { applicationServerKey: ArrayBuffer | null }
  toJSON: () => PushSubscriptionJSON
  unsubscribe: () => Promise<boolean>
}

const json = (endpoint: string): PushSubscriptionJSON => ({ endpoint, expirationTime: null, keys: { p256dh: `${endpoint}-p256dh`, auth: `${endpoint}-auth` } })

/** A phone's browser: its page permission, its push manager's, the address it holds, and what was asked of it. */
function browser(o: { page?: NotificationPermission; push?: PermissionState; live?: string | null; oldKey?: boolean; refuse?: boolean } = {}) {
  let n = 0
  const made = (endpoint: string, oldKey = false): FakeSub => ({
    endpoint,
    options: { applicationServerKey: oldKey ? new Uint8Array([1, 2, 3]).buffer : null },
    toJSON: () => json(endpoint),
    unsubscribe: async () => {
      state.live = null
      state.unsubscribed++
      return true
    },
  })
  const state = { page: o.page ?? 'granted', live: o.live ? made(o.live, o.oldKey) : null as FakeSub | null, subscribed: 0, unsubscribed: 0, asked: 0 }
  const pushManager = {
    getSubscription: async () => state.live,
    subscribe: async () => {
      if (o.refuse) throw new Error('push service error')
      state.subscribed++
      state.live = made(`https://push.example.test/new-${++n}`)
      return state.live
    },
    permissionState: async () => o.push ?? (state.page === 'granted' ? 'granted' : state.page === 'denied' ? 'denied' : 'prompt'),
  }
  vi.stubGlobal('window', { PushManager: function PushManager() {} })
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } })
  vi.stubGlobal('Notification', {
    get permission() {
      return state.page
    },
    requestPermission: async () => {
      state.asked++
      if (state.page === 'default') state.page = 'granted'
      return state.page
    },
  })
  return state
}

const KEPT = 'https://push.example.test/kept'
const SET_UP = '2026-10-19T20:30:00.000Z'
const none: PushState = { subscription: null, subscribedAt: null, changed: false }
const kept = (over: Partial<PushState> = {}): PushState => ({ subscription: json(KEPT), subscribedAt: SET_UP, changed: false, syncedEndpoint: KEPT, ...over })
const phone = (push: PushState, over: { enabled?: boolean; cloudPush?: SyncedPush | null } = {}): Pick<Settings, 'push' | 'cloudPush' | 'reminders'> => ({
  push,
  ...(over.cloudPush !== undefined ? { cloudPush: over.cloudPush } : {}),
  reminders: { enabled: over.enabled ?? true, times: { morning: '09:30', afternoon: '13:00', evening: '19:30' } },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the ping’s address, checked at start against the browser’s own', () => {
  it('leaves a live address alone once the cloud copy has had it', async () => {
    const b = browser({ live: KEPT })
    expect(await reconcilePush(phone(kept()))).toBeNull()
    expect(b.subscribed).toBe(0)
  })

  it('sends a live address the cloud copy has not had, keeping when it was set up', async () => {
    browser({ live: KEPT })
    expect(await reconcilePush(phone(kept({ syncedEndpoint: undefined })))).toMatchObject({ subscription: { endpoint: KEPT }, subscribedAt: SET_UP, syncedEndpoint: KEPT, needsTap: false })
  })

  it('takes the browser’s address when it is not the one kept, set up now', async () => {
    browser({ live: 'https://push.example.test/rotated' })
    const next = await reconcilePush(phone(kept()))
    expect(next).toMatchObject({ subscription: { endpoint: 'https://push.example.test/rotated' }, syncedEndpoint: 'https://push.example.test/rotated', needsTap: false })
    expect(next?.subscribedAt).not.toBe(SET_UP)
  })

  it('makes the address again at once when the browser lost it and notifications are allowed', async () => {
    const b = browser({ live: null, page: 'granted' })
    const next = await reconcilePush(phone(kept()))
    expect(b.subscribed).toBe(1)
    expect(next).toMatchObject({ subscription: { endpoint: 'https://push.example.test/new-1' }, syncedEndpoint: 'https://push.example.test/new-1', needsTap: false, droppedAt: null })
  })

  it('makes it again when only the installed app’s own permission allows it, the page’s still undecided', async () => {
    const b = browser({ live: null, page: 'default', push: 'granted' })
    expect(await notifyPermission()).toBe('granted')
    expect((await reconcilePush(phone(kept())))?.subscription?.endpoint).toBe('https://push.example.test/new-1')
    expect(b.asked).toBe(0)
  })

  it('asks for the tap, once, when only a tap can allow it, and never asks the browser unprompted', async () => {
    const b = browser({ live: null, page: 'default' })
    const next = await reconcilePush(phone(kept()))
    expect(next).toMatchObject({ subscription: null, subscribedAt: SET_UP, needsTap: true })
    expect(b.asked).toBe(0)
    expect(b.subscribed).toBe(0)
    expect(await reconcilePush(phone(next as PushState))).toBeNull()
  })

  it('asks for the tap when the push service gives no address now, though notifications are allowed', async () => {
    browser({ live: null, page: 'granted', refuse: true })
    expect(await reconcilePush(phone(kept()))).toMatchObject({ subscription: null, needsTap: true })
  })

  it('asks for no tap while notifications are blocked: no tap can help, and Settings says they are blocked', async () => {
    const b = browser({ live: null, page: 'denied' })
    expect(await reconcilePush(phone(kept()))).toMatchObject({ subscription: null, needsTap: false })
    expect(b.subscribed).toBe(0)
  })

  it('makes it again for a phone whose own copy was lost with its database, from the address its cloud copy held', async () => {
    const b = browser({ live: null, page: 'granted' })
    expect((await reconcilePush(phone(none, { cloudPush: { subscription: json(KEPT), subscribedAt: SET_UP } })))?.subscription?.endpoint).toBe('https://push.example.test/new-1')
    expect(b.subscribed).toBe(1)
  })

  it('starts no ping that was never set up, and leaves one turned off by hand off', async () => {
    const b = browser({ live: null, page: 'granted' })
    expect(await reconcilePush(phone(none))).toBeNull()
    expect(await reconcilePush(phone({ ...none, droppedAt: '2026-10-20T15:00:00.000Z' }, { cloudPush: { subscription: json(KEPT), subscribedAt: SET_UP } }))).toBeNull()
    expect(b.subscribed).toBe(0)
  })

  it('does nothing while reminders are off, and takes back a tap it asked for', async () => {
    const b = browser({ live: null, page: 'default' })
    expect(await reconcilePush(phone(kept(), { enabled: false }))).toBeNull()
    expect(await reconcilePush(phone(kept({ subscription: null, needsTap: true }), { enabled: false }))).toMatchObject({ needsTap: false })
    expect(b.subscribed).toBe(0)
  })

  it('replaces an address made under an older signing key', async () => {
    const b = browser({ live: KEPT, oldKey: true, page: 'granted' })
    const next = await reconcilePush(phone(kept()))
    expect(b.unsubscribed).toBe(1)
    expect(next?.subscription?.endpoint).toBe('https://push.example.test/new-1')
  })
})

describe('setting up the ping on a tap', () => {
  it('asks for the permission while it is undecided, then makes the address', async () => {
    const b = browser({ live: null, page: 'default' })
    const next = await setUpPing(kept({ subscription: null, needsTap: true }))
    expect(b.asked).toBe(1)
    expect(next).toMatchObject({ subscription: { endpoint: 'https://push.example.test/new-1' }, needsTap: false, droppedAt: null, syncedEndpoint: 'https://push.example.test/new-1' })
  })

  it('makes nothing while notifications are blocked', async () => {
    const b = browser({ live: null, page: 'denied' })
    expect(await setUpPing(none)).toBeNull()
    expect(b.subscribed).toBe(0)
  })
})
