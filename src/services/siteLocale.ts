/**
 * 한국어를 기본 언어로 유지하고 사용자가 선택한 언어를 저장한다. URL의 명시적 언어 설정과 저장된 선호를 초기 화면에 적용한다.
 */
export type SiteLocale = 'ko' | 'en'
const LOCALE_KEY = 'ttareungi_site_locale_v1'

/** 저장된 언어가 유효하면 사용하고 기록이 없으면 한국어를 반환한다. */
export function savedSiteLocale(): SiteLocale {
  try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ko' }
  catch { return 'ko' }
}

/** URL의 명시적 언어 선택을 먼저 읽고 없으면 저장된 기본 언어를 사용한다. */
export function initialSiteLocale(): SiteLocale {
  const language = new URLSearchParams(window.location.search).get('lang')
  return language === 'ko' || language === 'en' ? language : savedSiteLocale()
}

/** 사용자의 언어 선택을 다음 방문에도 사용할 수 있게 저장한다. */
export function saveSiteLocale(locale: SiteLocale) {
  try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* URL still preserves the language. */ }
}
