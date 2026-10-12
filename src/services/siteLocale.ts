export type SiteLocale = 'ko' | 'en'
const LOCALE_KEY = 'ttareungi_site_locale_v1'

export function savedSiteLocale(): SiteLocale {
  try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ko' }
  catch { return 'ko' }
}

export function initialSiteLocale(): SiteLocale {
  const language = new URLSearchParams(window.location.search).get('lang')
  return language === 'ko' || language === 'en' ? language : savedSiteLocale()
}

export function saveSiteLocale(locale: SiteLocale) {
  try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* URL still preserves the language. */ }
}
