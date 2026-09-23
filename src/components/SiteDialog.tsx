import { useState, type FormEvent } from 'react'
import { siteAuth } from '../services/siteAuth'

export type SiteDialogKind = 'login' | 'signup' | 'logout' | 'learn'

const headings: Record<SiteDialogKind, string> = {
  login: '로그인', signup: '회원가입', logout: '로그아웃', learn: '타자 학습',
}

export function SiteDialog({ kind, userEmail, onClose, onChangeKind }: {
  kind: SiteDialogKind; userEmail: string | null; onClose: () => void; onChangeKind: (kind: 'login' | 'signup') => void
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!siteAuth) {
      setMessage('인증 서버 설정이 아직 없습니다. Supabase URL과 anon key를 설정해 주세요. 입력 정보는 저장되지 않았습니다.')
      return
    }
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setBusy(true); setMessage('')
    try {
      if (kind === 'login') {
        const { error } = await siteAuth.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      } else {
        const nickname = String(form.get('nickname') ?? '')
        const { data, error } = await siteAuth.auth.signUp({ email, password, options: { data: { nickname } } })
        if (error) throw error
        setMessage(data.session ? '회원가입이 완료됐습니다.' : '가입 확인 메일을 보냈습니다. 메일에서 가입을 완료해 주세요.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '인증 요청을 완료하지 못했습니다.')
    } finally { setBusy(false) }
  }
  const auth = kind === 'login' || kind === 'signup'
  return <div className="site-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
      <button className="site-dialog-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
      <p className="site-dialog-kicker">SEOUL TYPING RIDE</p>
      <h2 id="site-dialog-title">{headings[kind]}</h2>
      {auth ? <>
        <div className="site-auth-tabs">
          <button type="button" className={kind === 'login' ? 'is-active' : ''} onClick={() => onChangeKind('login')}>로그인</button>
          <button type="button" className={kind === 'signup' ? 'is-active' : ''} onClick={() => onChangeKind('signup')}>회원가입</button>
        </div>
        <form className="site-auth-form" onSubmit={submit}>
          {kind === 'signup' && <label>닉네임<input name="nickname" autoComplete="nickname" required /></label>}
          <label>이메일<input name="email" type="email" autoComplete="email" required /></label>
          <label>비밀번호<input name="password" type="password" autoComplete={kind === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? '확인 중…' : kind === 'login' ? '로그인' : '가입하기'}</button>
        </form>
        <p className="site-dialog-note">비밀번호는 Supabase 인증 서비스로 전송되며 이 사이트에서 따로 보관하지 않습니다.</p>
        {message && <p className="site-dialog-message" role="status">{message}</p>}
      </> : kind === 'logout' ? <>
        <p className="site-dialog-copy">현재 {userEmail ? `${userEmail} 계정으로 로그인되어 있습니다.` : '로그인된 계정이 없습니다.'}</p>
        {userEmail ? <button className="button button--primary" type="button" disabled={busy} onClick={async () => {
          if (!siteAuth) { setMessage('인증 서버 설정이 없습니다.'); return }
          setBusy(true)
          const { error } = await siteAuth.auth.signOut()
          setBusy(false)
          if (error) setMessage(error.message); else onClose()
        }}>{busy ? '로그아웃 중…' : '로그아웃'}</button> : <button className="button button--ghost" type="button" onClick={onClose}>닫기</button>}
        {message && <p className="site-dialog-message" role="status">{message}</p>}
      </> : <>
        <p className="site-dialog-copy">화면에 보이는 글감을 읽고 아래 입력칸에 그대로 입력해 보세요. 맞은 글자는 초록색으로 표시됩니다.</p>
        <p className="site-dialog-copy">상단 필사 메뉴를 누르면 자치구를 고르고 시를 직접 고치며 연습할 수 있습니다.</p>
      </>}
    </section>
  </div>
}
