/**
 * Supabase URL과 공개 키가 설정되었을 때 인증 클라이언트를 만든다. 인증 설정이 없으면 null을 반환해 일반 지도 기능을 계속 사용할 수 있게 한다.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const siteAuth = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null
