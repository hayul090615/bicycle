import { useState } from 'react'
import { siteAuth } from '../services/siteAuth'

export type SiteDialogKind = 'logout' | 'learn'

const headings: Record<SiteDialogKind, string> = {
  logout: '로그아웃', learn: '타자 학습',
}

export function SiteDialog({ kind, userEmail, onClose }: {
  kind: SiteDialogKind; userEmail: string | null; onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <div className="site-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
      <button className="site-dialog-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
      <p className="site-dialog-kicker">SEOUL TYPING RIDE</p>
      <h2 id="site-dialog-title">{headings[kind]}</h2>
      {kind === 'logout' ? <>
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
