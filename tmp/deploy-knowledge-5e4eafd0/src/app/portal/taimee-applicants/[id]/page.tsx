'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabaseClient'

type Detail = { applicant: Record<string, unknown>; jobs: Array<Record<string, unknown>>; files: Array<Record<string, unknown> & { signed_url?: string | null }> }
export default function TaimeeApplicantDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter()
  const [detail, setDetail] = useState<Detail | null>(null); const [entryId, setEntryId] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(true)
  async function load() {
    setBusy(true); const { data } = await supabase.auth.getSession()
    const response = await fetch(`/api/taimee-applicants/${id}`, { headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}, cache: 'no-store' }); const result = await response.json() as { ok?: boolean; error?: string } & Partial<Detail>
    if (!response.ok || !result.ok || !result.applicant) setMessage(result.error ?? '応募者情報を取得できませんでした'); else { setDetail(result as Detail); setEntryId(String(result.applicant.entry_id ?? '')) }
    setBusy(false)
  }
  useEffect(() => { void load() }, [id])
  async function save(mode: 'auto' | 'manual' | 'unlink') {
    const { data } = await supabase.auth.getSession(); setBusy(true)
    const response = await fetch(`/api/taimee-applicants/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ mode, entry_id: mode === 'manual' ? entryId || null : null }) }); const result = await response.json() as { ok?: boolean; error?: string }
    setMessage(result.ok ? '保存しました' : result.error ?? '保存に失敗しました'); if (result.ok) await load(); else setBusy(false)
  }
  if (busy && !detail) return <div className="p-6">読み込み中…</div>
  if (!detail) return <div className="p-6 text-red-600">{message}</div>
  const applicant = detail.applicant; const name = String(applicant.full_name ?? `${applicant.last_name ?? ''}${applicant.first_name ?? ''}`)
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <div className="flex items-center justify-between"><div><div className="text-sm text-gray-500">タイミー応募者詳細</div><h1 className="text-2xl font-bold">{name || '氏名未取得'}</h1></div><Button variant="outline" onClick={() => router.push('/portal/taimee-emp')}>一覧へ戻る</Button></div>
    {message && <div className="rounded border bg-white p-3 text-sm">{message}</div>}
    <div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle>応募者情報</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>電話番号: {String(applicant.phone_display ?? applicant.phone ?? applicant.normalized_phone ?? '未取得')}</p><p>Worker ID: {String(applicant.taimee_user_id ?? '未取得')}</p><p>Application ID: {String(applicant.taimee_application_id ?? '未取得')}</p><p>紐付け状態: {String(applicant.link_status ?? 'unlinked')}</p><label className="block pt-3">エントリーID<input className="mt-1 w-full rounded border p-2" value={entryId} onChange={(event) => setEntryId(event.target.value)} placeholder="form_entries.id" /></label><div className="flex flex-wrap gap-2 pt-3"><Button disabled={busy} onClick={() => void save('auto')}>自動紐付け</Button><Button disabled={busy} variant="outline" onClick={() => void save('manual')}>手動紐付け</Button><Button disabled={busy} variant="destructive" onClick={() => void save('unlink')}>紐付け解除</Button></div></CardContent></Card>
      <Card><CardHeader><CardTitle>添付ファイル</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{detail.files.length === 0 ? <p className="text-gray-500">添付ファイルはありません</p> : detail.files.map((file) => <div key={String(file.id)} className="flex justify-between gap-3 border-b py-2"><span>{String(file.document_name ?? 'ファイル')} ({String(file.document_type ?? 'other')})</span>{file.signed_url && <a className="text-blue-600 underline" href={file.signed_url} target="_blank" rel="noreferrer">閲覧</a>}</div>)}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>応募・勤務履歴</CardTitle></CardHeader><CardContent>{detail.jobs.length === 0 ? <p className="text-gray-500">履歴はありません</p> : <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">勤務日</th><th className="p-2">求人</th><th className="p-2">状態</th></tr></thead><tbody>{detail.jobs.map((job) => <tr className="border-b" key={String(job.id)}><td className="p-2">{String(job.work_date ?? '')}</td><td className="p-2">{String(job.job_name ?? '')}</td><td className="p-2">{String(job.application_status ?? '')}</td></tr>)}</tbody></table>}</CardContent></Card>
  </div>
}
