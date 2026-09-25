import { logUse } from './useLog'

// Life Mirror opened (Follow-up F1): once at launch, and again on coming back after five minutes or
// more away. Only the app's own visibility is read; nothing about what else the phone did. Kept out
// of the use log's module, which the service worker shares and which has no page.

/** Away at least this long, and coming back counts as opening Life Mirror again. */
export const APP_RETURN_MINUTES = 5

/** The page's own visibility, and nothing else of it. */
export type Visibility = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>

export function watchAppOpens(page: Visibility = document, clock: () => Date = () => new Date()): () => void {
  void logUse('appOpened', 'launch', clock())
  let hiddenAt: number | null = null
  const onChange = () => {
    if (page.visibilityState === 'hidden') hiddenAt = clock().getTime()
    else if (hiddenAt !== null) {
      const away = clock().getTime() - hiddenAt
      hiddenAt = null
      if (away >= APP_RETURN_MINUTES * 60_000) void logUse('appOpened', 'return', clock())
    }
  }
  page.addEventListener('visibilitychange', onChange)
  return () => page.removeEventListener('visibilitychange', onChange)
}
