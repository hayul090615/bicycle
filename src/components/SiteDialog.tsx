/**
 * 로그아웃 요청 또는 타자 학습 설명 대화상자다. 선택된 종류에 맞는 내용과 닫기 버튼을 표시하고 인증 요청 상태를 안내한다.
 */
import { useState } from 'react'
import { siteAuth } from '../services/siteAuth'

export type SiteDialogKind = 'logout' | 'learn'

const headings: Record<SiteDialogKind, string> = {
  logout: '로그아웃', learn: '타자 학습',
}

export function SiteDialog({ kind, userEmail, onClose }: {
  kind: SiteDialogKind; userEmail: string | null; onClose: () => void
}) {
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <div className="site-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
      <button className="site-dialog-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
      <p className="site-dialog-kicker">TTAREUNGI SEOUL JOURNEY</p>
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
