// app/portal/sms-bulk/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Row = { 姓?: string; 名?: string; 電話?: string; 電話番号?: string }
type PreviewItem = { phone: string; body: string; ok: boolean; error?: string }

const KEY_TEMPLATE = 'sms_template_v1'
const KEY_FIXED = 'sms_fixed_text_v1'

const DEFAULT_TEMPLATE = `{姓}{名} 様

{本文}

配信停止: 返信で STOP`

const DEFAULT_FIXED = `ファミーユヘルパーサービス愛知タイミーでお仕事してくれてありがとうございました。✨ 実は…タイミー掲載案件は、ほんの一部です！ ファミーユでは独自アプリ 「シフ子」 を使って、1日100件近いサービス の中から ⏰ 好きな時間・📍好きな場所のお仕事を自分で選べます。

✅ 身体/同行援護/行動援護:時給 2,330円~ ＋交通費
✅ 有給取得率100％ 休み希望もアプリで簡単！ （わずらわしいやり取り不要）
✅ 給与先払い制度あり 急な出費にも安心！
✅ 資格取得補助充実 受講料＋研修時間も時給あり

✨ エントリーしたい！方は↓
https://myfamille.shi-on.net/entry

✨ 詳しい情報を知りたいという方は↓
https://www.shi-on.net/recruit

✨ 正社員でファミーユに応募したいという方は以下は↓
https://www.shi-on.net/column?page=17

採用担当者　新川： 090-9140-2642`

export default function SmsBulkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE)
  const [fixedText, setFixedText] = useState<string>(DEFAULT_FIXED)
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 初期ロード：localStorage復元
  useEffect(() => {
    try {
      const t = window.localStorage.getItem(KEY_TEMPLATE)
      const f = window.localStorage.getItem(KEY_FIXED)
      if (t) setTemplate(t)
      if (f) setFixedText(f)
    } catch {
      // no-op（SSR環境や権限で失敗しても画面は使える）
    }
  }, [])

  // 入力保存：localStorage永続化
  useEffect(() => {
    try { window.localStorage.setItem(KEY_TEMPLATE, template) } catch {}
  }, [template])
  useEffect(() => {
    try { window.localStorage.setItem(KEY_FIXED, fixedText) } catch {}
  }, [fixedText])

  // CSV読み込み
  function handleCsvLoad() {
    if (!file) { setMessage('CSVファイルを選択してください'); return }
    setMessage(null)
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data || []).map((r) => ({
          姓: (r.姓 ?? '').toString().trim(),
          名: (r.名 ?? '').toString().trim(),
          電話: (r.電話 ?? r.電話番号 ?? '').toString().trim(),
        }))
        setRows(data)
        setPreview([])
        setMessage(`読み込み: ${data.length}件`)
      },
      error: (err) => setMessage(`CSV読込エラー: ${err.message}`),
    })
  }

  // プレビュー
  async function doPreview() {
    if (rows.length === 0) { setMessage('先にCSVを読み込んでください'); return }
    setLoading(true); setMessage(null)
    try {
      const r = await fetch('/api/sms/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, template, fixedText }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'プレビュー失敗')
      setPreview(j.items as PreviewItem[])
      setMessage(`プレビュー: 有効 ${j.validCount} / 無効 ${j.invalidCount} / 合計 ${j.total}`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'プレビュー失敗')
    } finally {
      setLoading(false)
    }
  }

  // 送信
  async function doSend() {
    if (preview.length === 0) { setMessage('先にプレビューを実行してください'); return }
    const targets = preview.filter(p => p.ok)
    if (targets.length === 0) { setMessage('送信可能な対象がありません'); return }
    setLoading(true); setMessage(null)
    try {
      const r = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: targets }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '送信失敗')
      setMessage(`送信完了: ${j.sent}/${j.total} 件`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '送信失敗')
    } finally {
      setLoading(false)
    }
  }

  const okCount = useMemo(() => preview.filter(p => p.ok).length, [preview])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">SMS一斉送信（Twilio）</h1>

      {/* CSVアップロード */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <Label>CSVファイル（ヘッダ: 姓, 名, 電話 または 電話番号）</Label>
              <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Button onClick={handleCsvLoad}>CSV読み込み</Button>
            </div>
          </div>

          {rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              取り込み件数: {rows.length} 件
            </p>
          )}
        </CardContent>
      </Card>

      {/* テンプレ＆固定文 */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>送信テンプレート（差し込み: {'{姓}'} {'{名}'} {'{本文}'})</Label>
              <Textarea rows={10} value={template} onChange={(e) => setTemplate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                SMSはHTML非対応。絵文字・URL・改行は可。Trial中はTwilioの文言が先頭に付きます。
              </p>
            </div>
            <div className="space-y-2">
              <Label>固定文（{'{本文}'} に差し込み）</Label>
              <Textarea rows={16} value={fixedText} onChange={(e) => setFixedText(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFixedText(DEFAULT_FIXED)}>既定文に戻す</Button>
                <Button variant="outline" size="sm" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>テンプレ初期化</Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={doPreview} disabled={rows.length===0 || loading}>
              プレビュー
            </Button>
            <Button onClick={doSend} disabled={okCount===0 || loading}>
              一斉送信
            </Button>
          </div>

          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>

      {/* プレビュー結果 */}
      {preview.length>0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm">
              送信可能: {okCount} / 合計: {preview.length}
            </p>
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-[960px] text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 w-[220px]">電話(正規化)</th>
                    <th className="text-left p-2">本文(差し込み後)</th>
                    <th className="text-left p-2 w-[60px]">OK</th>
                    <th className="text-left p-2 w-[200px]">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((it, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2">{it.phone}</td>
                      <td className="p-2 whitespace-pre-wrap">{it.body}</td>
                      <td className="p-2">{it.ok ? '✓' : ''}</td>
                      <td className="p-2 text-red-600">{it.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              ※ STOP表記は送信API側でも自動付与されます（本文末尾）。二重付与は避けたい場合はテンプレ側のSTOPは削ってOK。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
