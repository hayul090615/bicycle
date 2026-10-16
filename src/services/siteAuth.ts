/**
 * Supabase URL과 공개 키가 설정되었을 때 인증 클라이언트를 만든다. 인증 설정이 없으면 null을 반환해 일반 지도 기능을 계속 사용할 수 있게 한다.
 */
import { createClient, isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const siteAuth = supabaseUrl && supabasePublicKey
  ? createClient(supabaseUrl, supabasePublicKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null

/** 서버의 인증 오류를 이용자가 해결할 수 있는 안내로 바꾼다. 원본 응답·키는 표시하지 않는다. */
export function authErrorMessage(error: unknown, kind: 'login' | 'signup'): string {
  if (isAuthRetryableFetchError(error)) return '인증 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'
  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials': return '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해 주세요.'
      case 'email_not_confirmed': return '가입 확인 메일의 링크를 누른 뒤 다시 로그인해 주세요.'
      case 'weak_password': return '비밀번호가 보안 조건에 맞지 않습니다. 더 긴 비밀번호를 사용해 주세요.'
      case 'email_address_invalid': return '사용할 수 있는 이메일 주소를 입력해 주세요.'
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit': return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
      case 'email_address_not_authorized': return '가입 확인 메일을 보낼 수 없습니다. 운영자에게 문의해 주세요.'
      case 'signup_disabled': return '현재 신규 회원가입이 중단되어 있습니다. 잠시 후 다시 확인해 주세요.'
      case 'email_provider_disabled': return '이메일 로그인을 사용할 수 없습니다. 운영자에게 문의해 주세요.'
    }
  }
  return kind === 'signup'
    ? '회원가입을 완료하지 못했습니다. 입력 정보를 확인하고 다시 시도해 주세요.'
    : '로그인하지 못했습니다. 이메일과 비밀번호, 가입 확인 메일을 확인해 주세요.'
}
