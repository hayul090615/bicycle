import { useEffect, useState, type FormEvent } from 'react'
import { siteAuth } from '../services/siteAuth'

export type AuthPageKind = 'login' | 'signup'

export function AuthPage({ kind, onHome, onNavigate }: {
  kind: AuthPageKind
  onHome: () => void
  onNavigate: (kind: AuthPageKind) => void
}) {
  const isSignup = kind === 'signup'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !siteAuth) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const nickname = String(form.get('nickname') ?? '').trim()
    if (isSignup && !nickname) { setMessage('닉네임을 입력해 주세요.'); return }
    if (isSignup && password !== form.get('passwordConfirm')) {
      setMessage('비밀번호가 서로 다릅니다. 다시 확인해 주세요.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (isSignup) {
        const { data, error } = await siteAuth.auth.signUp({ email, password, options: {
          data: { nickname }, emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        } })
        if (error) throw error
        if (data.session) onHome()
        else setEmailSent(true)
      } else {
        const { error } = await siteAuth.auth.signInWithPassword({ email, password })
        if (error) throw error
        onHome()
      }
    } catch {
      setMessage(isSignup
        ? '회원가입을 완료하지 못했습니다. 입력 정보를 확인하고 다시 시도해 주세요.'
        : '로그인하지 못했습니다. 이메일과 비밀번호, 가입 확인 메일을 확인해 주세요.')
    } finally { setBusy(false) }
  }

  return <main className="auth-screen">
    <header className="auth-topbar">
      <button type="button" className="auth-brand start-brand" onClick={onHome} aria-label="서울 타자 라이딩 홈">
        <span className="brand-bike" aria-hidden="true">🚲</span>
        <div><b>서울 타자 라이딩</b><small>SEOUL TYPING RIDE</small></div>
      </button>
      <button type="button" className="button button--ghost" onClick={onHome}>홈으로</button>
    </header>
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="auth-icon" aria-hidden="true">{isSignup ? '🌱' : '🚲'}</span>
      <p className="eyebrow">SEOUL TYPING RIDE</p>
      <h1 id="auth-title">{isSignup ? '회원가입' : '로그인'}</h1>
      <p className="auth-description">{isSignup ? '서울 타자 라이딩에 오신 것을 환영합니다.' : '다시 만나 반가워요. 오늘도 서울을 달려볼까요?'}</p>
      {emailSent ? <div className="auth-success" role="status">
        <h2>이메일을 확인해 주세요</h2>
        <p>가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료한 뒤 로그인해 주세요.</p>
        <button type="button" className="button button--primary" onClick={() => onNavigate('login')}>로그인으로 이동</button>
      </div> : <>
        {!siteAuth && <p className="auth-notice" role="status">로그인·회원가입 서비스를 준비 중입니다. 연결이 완료되면 이용할 수 있어요.</p>}
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy || !siteAuth}>
            {isSignup && <label htmlFor="auth-nickname">닉네임<input id="auth-nickname" name="nickname" autoComplete="nickname" maxLength={30} placeholder="사용할 이름을 입력해 주세요" required /></label>}
            <label htmlFor="auth-email">이메일<input id="auth-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required /></label>
            <label htmlFor="auth-password">비밀번호<input id="auth-password" name="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 8 : undefined} placeholder={isSignup ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} required /></label>
            {isSignup && <label htmlFor="auth-password-confirm">비밀번호 확인<input id="auth-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력해 주세요" required /></label>}
            {message && <p className="auth-error" role="alert">{message}</p>}
            <button className="button button--primary" type="submit">{busy ? '처리 중…' : isSignup ? '가입하기' : '로그인'}</button>
          </fieldset>
        </form>
        <p className="auth-switch">{isSignup ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?'} <button type="button" disabled={busy} onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? '로그인' : '회원가입'}</button></p>
      </>}
    </section>
  </main>
}
