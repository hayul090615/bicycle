import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { SITE_LANGUAGES, type SiteLocale } from '../services/siteLocale'
import { siteText } from '../services/tourTranslations'

/** SVG 국기는 Windows에서도 이모지 지원 여부와 관계없이 표시된다. */
function LanguageFlag({ locale }: { locale: SiteLocale }) {
  return <svg className="tour-language-flag" viewBox="0 0 30 20" aria-hidden="true">
    {locale === 'ko' && <>
      <path fill="#fff" d="M0 0h30v20H0z" />
      <g transform="translate(15 10) rotate(33.7)">
        <circle r="5" fill="#cd2e3a" /><path d="M-5 0a5 5 0 0 0 10 0 2.5 2.5 0 0 0-5 0 2.5 2.5 0 0 1-5 0" fill="#0047a0" />
      </g>
      <g stroke="#111" strokeWidth="1.05">
        <path d="m4 5 3-3m-2 4 3-3m-2 4 3-3M21 16l3-3m-2 4 3-3m-2 4 3-3M4 15l3 3m-2-4 3 3m-2-4 3 3M21 4l3 3m-2-4 3 3m-2-4 3 3" />
      </g>
      <g stroke="#fff" strokeWidth=".7"><path d="m22 14 3 3M5 16l2-2m17-9 2-2m-4 0 2-2" /></g>
    </>}
    {locale === 'en' && <>
      <path fill="#012169" d="M0 0h30v20H0z" />
      <path stroke="#fff" strokeWidth="4" d="m0 0 30 20M30 0 0 20" />
      <path stroke="#c8102e" strokeWidth="1.4" d="m0 0 30 20M30 0 0 20" />
      <path stroke="#fff" strokeWidth="6" d="M15 0v20M0 10h30" />
      <path stroke="#c8102e" strokeWidth="3.6" d="M15 0v20M0 10h30" />
    </>}
    {locale === 'pt' && <>
      <path fill="#f00" d="M0 0h30v20H0z" /><path fill="#006600" d="M0 0h12v20H0z" />
      <circle cx="12" cy="10" r="4.6" fill="none" stroke="#ffcd00" strokeWidth="1.1" />
      <path d="M9 6.5h6v5a3 3 0 0 1-6 0z" fill="#fff" stroke="#c8102e" strokeWidth="1.3" />
      <path stroke="#003399" strokeWidth="1.1" d="M12 8v1.2m-1.5.3v1.2m3-1.2v1.2m-1.5-.3v1.2" />
    </>}
    {locale === 'ja' && <><path fill="#fff" d="M0 0h30v20H0z" /><circle cx="15" cy="10" r="6" fill="#bc002d" /></>}
    {locale === 'fr' && <><path fill="#fff" d="M0 0h30v20H0z" /><path fill="#002395" d="M0 0h10v20H0z" /><path fill="#ed2939" d="M20 0h10v20H20z" /></>}
  </svg>
}

export function LanguagePicker({ locale, onChange }: { locale: SiteLocale; onChange: (locale: SiteLocale) => void }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selected = SITE_LANGUAGES.find(language => language.code === locale)!
  useEffect(() => {
    if (!open) return
    container.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); trigger.current?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (!open) { setOpen(true); return }
    const options = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  }
  return <div className="tour-language-picker" ref={container} onKeyDown={handleKeys}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" ref={trigger} className="tour-language-button" aria-label={`${siteText(locale, 'Language', '언어 선택')}: ${selected.name}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}>
      <LanguageFlag locale={locale} /><span lang={locale}>{selected.name}</span>
      <svg className="tour-language-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div className="tour-language-options" id={listId} role="listbox" aria-label={siteText(locale, 'Language', '언어 선택')}>
      {SITE_LANGUAGES.map(language => <button type="button" role="option" key={language.code} lang={language.code}
        aria-selected={locale === language.code} tabIndex={locale === language.code ? 0 : -1}
        onClick={() => { onChange(language.code); setOpen(false); trigger.current?.focus() }}>
        <LanguageFlag locale={language.code} /><span>{language.name}</span><span className="tour-language-check" aria-hidden="true">{locale === language.code ? '✓' : ''}</span>
      </button>)}
    </div>}
  </div>
}
