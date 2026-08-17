import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import { chooseUniqueEntry, type EntryCandidate } from '@/lib/taimee/applicantMatching'
type Context = { params: Promise<{ id: string }> }
async function requireManager(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new Error('UNAUTHORIZED')
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) throw new Error('UNAUTHORIZED')
  const { data: user, error: userError } = await supabaseAdmin.from('users').select('system_role').eq('auth_user_id', data.user.id).maybeSingle()
  if (userError) throw userError
  if (!['admin', 'manager'].includes(String(user?.system_role ?? '').toLowerCase())) throw new Error('FORBIDDEN')
}
export async function GET(request: Request, context: Context) {
  try {
    await requireManager(request)
    const id = (await context.params).id
    const [applicant, jobs, documents] = await Promise.all([
      supabaseAdmin.from('taimee_applicants').select('*').eq('id', id).single(),
      supabaseAdmin.from('taimee_applicant_jobs').select('*').eq('applicant_id', id).order('work_date', { ascending: false }),
      supabaseAdmin.from('taimee_applicant_documents').select('*').eq('applicant_id', id).order('created_at', { ascending: false }),
    ])
    if (applicant.error) throw applicant.error
    if (jobs.error) throw jobs.error
    if (documents.error) throw documents.error
    const files = await Promise.all((documents.data ?? []).map(async (file) => {
      const signed = await supabaseAdmin.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 300)
      return { ...file, signed_url: signed.data?.signedUrl ?? null }
    }))
    return NextResponse.json({ ok: true, applicant: applicant.data, jobs: jobs.data ?? [], files })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}
export async function POST(request: Request, context: Context) {
  try {
    await requireManager(request)
    const id = (await context.params).id
    const body = await request.json() as { entry_id?: string | null; mode?: 'auto' | 'manual' | 'unlink' }
    let entryId = body.entry_id ?? null
    let linkStatus: 'auto_linked' | 'manual_linked' | 'unlinked' = body.mode === 'auto' ? 'auto_linked' : 'manual_linked'
    if (body.mode === 'auto') {
      const { data: applicant, error: applicantError } = await supabaseAdmin.from('taimee_applicants').select('full_name,last_name,first_name,phone,normalized_phone').eq('id', id).single()
      if (applicantError) throw applicantError
      const { data: entries, error: entriesError } = await supabaseAdmin.from('form_entries').select('id,last_name_kanji,first_name_kanji,phone').not('phone', 'is', null)
      if (entriesError) throw entriesError
      const candidates: EntryCandidate[] = (entries ?? []).map((entry) => ({ id: entry.id, phone: entry.phone, fullName: `${entry.last_name_kanji}${entry.first_name_kanji}` }))
      const match = chooseUniqueEntry({ fullName: applicant.full_name ?? `${applicant.last_name ?? ''}${applicant.first_name ?? ''}`, phone: applicant.normalized_phone ?? applicant.phone }, candidates)
      if (!match) return NextResponse.json({ ok: false, error: '一意に特定できるエントリー候補がありません' }, { status: 409 })
      entryId = match.id
    }
    if (body.mode === 'unlink' || !entryId) { entryId = null; linkStatus = 'unlinked' }
    const { error } = await supabaseAdmin.from('taimee_applicants').update({ entry_id: entryId, link_status: linkStatus }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true, entry_id: entryId, link_status: linkStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500 })
  }
}
