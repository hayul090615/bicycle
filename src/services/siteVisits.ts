import { siteAuth } from './siteAuth'

const VISITED_KEY = 'ttareungi_site_visited_v1'
const TUTORIAL_KEY = 'ttareungi_tutorial_seen_v1'
let visitPromise: Promise<boolean> | null = null
let tutorialPresented = false
const accountHistory = new Map<string, boolean>()

function browserHasVisited() {
  try { if (localStorage.getItem(VISITED_KEY) === '1') return true } catch { /* Check the independent cookie fallback. */ }
  try { return document.cookie.split(';').some(value => [VISITED_KEY, TUTORIAL_KEY].some(key => value.trim().startsWith(`${key}=`))) }
  catch { return false }
}

function rememberBrowserVisit() {
  try { localStorage.setItem(VISITED_KEY, '1') } catch { /* IndexedDB and cookies are independent fallbacks. */ }
  try {
    document.cookie = `${VISITED_KEY}=1; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  } catch { /* Storage can be disabled by the browser. */ }
}

function recordBrowserDatabaseVisit(previouslyVisited: boolean): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    let database: IDBDatabase | null = null
    const finish = (returning: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      database?.close()
      resolve(returning)
    }
    const timeout = window.setTimeout(() => finish(previouslyVisited), 1500)
    try {
      const request = indexedDB.open('ttareungi_site_history', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('visits', { keyPath: 'scope' })
      request.onerror = request.onblocked = () => finish(previouslyVisited)
      request.onsuccess = () => {
        database = request.result
        if (settled) { database.close(); return }
        try {
          const transaction = database.transaction('visits', 'readwrite')
          const visits = transaction.objectStore('visits')
          let returning = previouslyVisited
          const lookup = visits.get('site')
          lookup.onsuccess = () => {
            const previous = lookup.result as { firstSeenAt: number; count: number } | undefined
            returning ||= Boolean(previous)
            visits.put({ scope: 'site', firstSeenAt: previous?.firstSeenAt ?? Date.now(), lastSeenAt: Date.now(), count: (previous?.count ?? 0) + 1 })
          }
          transaction.oncomplete = () => finish(returning)
          transaction.onerror = transaction.onabort = () => finish(previouslyVisited)
        } catch { finish(previouslyVisited) }
      }
    } catch { finish(previouslyVisited) }
  })
}

async function accountHasVisited(): Promise<boolean> {
  if (!siteAuth) return false
  let timeout = 0
  try {
    const result = await Promise.race([
      siteAuth.auth.getSession(),
      new Promise<null>(resolve => { timeout = window.setTimeout(() => resolve(null), 2000) }),
    ])
    const user = result?.data.session?.user
    if (!user) return false
    if (accountHistory.has(user.id)) return accountHistory.get(user.id)!
    const returning = user.user_metadata[TUTORIAL_KEY] === true
    accountHistory.set(user.id, returning)
    if (!returning) void siteAuth.auth.updateUser({ data: { [TUTORIAL_KEY]: true } }).catch(() => {})
    return returning
  } catch { return false }
  finally { window.clearTimeout(timeout) }
}

async function recordServerVisit(): Promise<boolean> {
  try {
    const response = await fetch('/api/site-visit', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(2500) })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
    const result = await response.json() as { storage?: string; previouslyVisited?: boolean }
    return result.storage === 'database' && result.previouslyVisited === true
  } catch { return false }
}

// Register once per document, including visits that start on the typing/login page.
export function registerSiteVisit(): Promise<boolean> {
  if (!visitPromise) {
    const returning = browserHasVisited()
    rememberBrowserVisit()
    visitPromise = Promise.all([recordBrowserDatabaseVisit(returning), recordServerVisit(), accountHasVisited()])
      .then(results => results.some(Boolean))
  }
  return visitPromise
}

export async function isReturningVisitor() {
  const [returning, returningAccount] = await Promise.all([registerSiteVisit(), accountHasVisited()])
  return returning || returningAccount
}

export function claimTutorialPresentation() {
  if (tutorialPresented) return false
  tutorialPresented = true
  return true
}
