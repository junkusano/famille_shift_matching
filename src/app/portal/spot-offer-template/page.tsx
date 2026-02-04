// src/app/portal/spot-offer-template/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUserRole } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import { spotApi, type SpotOfferTemplateUnified } from "@/lib/spot/spotApi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const RPA_TEMPLATE_ID = "caf1a290-b9ac-4eeb-84eb-eb7fd9936c2f";

function toArrayFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNullableTime(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // "HH:MM" を "HH:MM:00" に寄せる（DBが time 型）
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s; // "HH:MM:SS" などはそのまま
}

export default function SpotOfferTemplatePage() {
  const role = useUserRole();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SpotOfferTemplateUnified[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // CRUD Dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<SpotOfferTemplateUnified | null>(null);

  // RPA Dialog
  const [openRpa, setOpenRpa] = useState(false);
  const [rpaTarget, setRpaTarget] = useState<SpotOfferTemplateUnified | null>(null);
  const [shiftStartDate, setShiftStartDate] = useState(""); // YYYY-MM-DD
  const [shiftStartTime, setShiftStartTime] = useState(""); // HH:MM (optional)
  const [shiftEndDate, setShiftEndDate] = useState(""); // YYYY-MM-DD
  const [shiftEndTime, setShiftEndTime] = useState(""); // HH:MM (optional)
  const [sendingRpa, setSendingRpa] = useState(false);

  // edit form fields (最低限＋必要そうなもの)
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCautions, setFCautions] = useState("");
  const [fAutoMsg, setFAutoMsg] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fEmergencyPhone, setFEmergencyPhone] = useState("");
  const [fSalary, setFSalary] = useState("");
  const [fFare, setFFare] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fInternalLabel, setFInternalLabel] = useState("");
  const [fRequiredLicensesText, setFRequiredLicensesText] = useState(""); // 改行区切り
  const [fBenefitsText, setFBenefitsText] = useState("");
  const [fBelongingsText, setFBelongingsText] = useState("");
  const [fPhotoUrlsText, setFPhotoUrlsText] = useState("");

  const canAccess = useMemo(() => ["admin", "manager"].includes(role), [role]);

  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await spotApi.listTemplates({ q: q.trim() || undefined, limit: 300 });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFTitle("");
    setFDesc("");
    setFCautions("");
    setFAutoMsg("");
    setFAddress("");
    setFEmergencyPhone("");
    setFSalary("");
    setFFare("");
    setFStatus("");
    setFInternalLabel("");
    setFRequiredLicensesText("");
    setFBenefitsText("");
    setFBelongingsText("");
    setFPhotoUrlsText("");
    setOpenEdit(true);
  };

  const openUpdate = (row: SpotOfferTemplateUnified) => {
    setEditing(row);
    setFTitle(row.template_title ?? "");
    setFDesc(row.work_description ?? "");
    setFCautions(row.cautions ?? "");
    setFAutoMsg(row.auto_message ?? "");
    setFAddress(row.work_address ?? "");
    setFEmergencyPhone(row.emergency_phone ?? "");
    setFSalary(row.salary ?? "");
    setFFare(row.fare ?? "");
    setFStatus(row.status ?? "");
    setFInternalLabel(row.internal_label ?? "");
    setFRequiredLicensesText((row.required_licenses ?? []).join("\n"));
    setFBenefitsText((row.benefits ?? []).join("\n"));
    setFBelongingsText((row.belongings ?? []).join("\n"));
    setFPhotoUrlsText((row.photo_urls ?? []).join("\n"));
    setOpenEdit(true);
  };

  const saveTemplate = async () => {
    try {
      setError(null);

      const payload: Partial<SpotOfferTemplateUnified> = {
        template_title: fTitle.trim() || null,
        work_description: fDesc.trim() || null,
        cautions: fCautions.trim() || null,
        auto_message: fAutoMsg.trim() || null,
        work_address: fAddress.trim() || null,
        emergency_phone: fEmergencyPhone.trim() || null,
        salary: fSalary.trim() || null,
        fare: fFare.trim() || null,
        status: fStatus.trim() || null,
        internal_label: fInternalLabel.trim() || null,
        required_licenses: toArrayFromTextarea(fRequiredLicensesText),
        benefits: toArrayFromTextarea(fBenefitsText),
        belongings: toArrayFromTextarea(fBelongingsText),
        photo_urls: toArrayFromTextarea(fPhotoUrlsText),
      };

      if (editing) {
        await spotApi.updateTemplate(editing.core_id, payload);
      } else {
        await spotApi.createTemplate(payload);
      }

      setOpenEdit(false);
      await fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteTemplate = async (row: SpotOfferTemplateUnified) => {
    const ok = window.confirm(`削除しますか？\n\n${row.template_title ?? "(無題)"}\ncore_id=${row.core_id}`);
    if (!ok) return;

    try {
      setError(null);
      await spotApi.deleteTemplate(row.core_id);
      await fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openRpaDialog = (row: SpotOfferTemplateUnified) => {
    setRpaTarget(row);
    setShiftStartDate("");
    setShiftStartTime("");
    setShiftEndDate("");
    setShiftEndTime("");
    setOpenRpa(true);
  };

  const sendRpaRequest = async () => {
    if (!rpaTarget) return;

    if (!shiftStartDate.trim()) {
      alert("shift_start_date は必須です");
      return;
    }
    if (!shiftEndDate.trim()) {
      alert("shift_end_date は必須です");
      return;
    }

    try {
      setSendingRpa(true);

      const session = await supabase.auth.getSession();
      const authUserId = session.data?.session?.user?.id;
      if (!authUserId) throw new Error("ログインユーザー未取得");

      // fax-sending と同じロジックで approver（マネージャー）を引く
      const { data: userData, error: userError } = await supabase
        .from("user_entry_united_view")
        .select("manager_auth_user_id, manager_user_id, user_id")
        .eq("auth_user_id", authUserId)
        // ここは運用に合わせて group_type を調整してください（fax-sending を踏襲）
        .eq("group_type", "人事労務サポートルーム")
        .limit(1)
        .single();

      if (userError || !userData?.manager_auth_user_id) {
        throw new Error("承認者（マネージャー）情報取得に失敗しました");
      }

      const details = {
        core_id: rpaTarget.core_id,
        template_snapshot: {
          template_title: rpaTarget.template_title,
          work_address: rpaTarget.work_address,
          salary: rpaTarget.salary,
          fare: rpaTarget.fare,
          status: rpaTarget.status,
        },
        shift_start_date: shiftStartDate.trim(),
        shift_start_time: toNullableTime(shiftStartTime), // null OK
        shift_end_date: shiftEndDate.trim(),
        shift_end_time: toNullableTime(shiftEndTime), // null OK
        requester_user_id: userData.user_id,
        created_from: "/portal/spot-offer-template",
      };

      const { error: insertError } = await supabase.from("rpa_command_requests").insert({
        template_id: RPA_TEMPLATE_ID,
        requester_id: authUserId,
        approver_id: userData.manager_auth_user_id,
        status: "approved",
        request_details: details,
      });

      if (insertError) throw new Error(`RPAリクエスト送信に失敗: ${insertError.message}`);

      alert("RPAリクエストを送信しました");
      setOpenRpa(false);
      setRpaTarget(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingRpa(false);
    }
  };

  if (!canAccess) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">スポット求人テンプレ管理 / RPAリクエスト</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={fetchList} disabled={loading}>
            再読み込み
          </Button>
          <Button onClick={openCreate}>新規テンプレ追加</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_auto] gap-2 items-end">
        <div>
          <div className="text-[11px] text-muted-foreground">検索（タイトル/住所/ラベル）</div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：名古屋 / 夜勤 / 港区" />
        </div>
        <div className="md:justify-self-start">
          <Button variant="outline" onClick={fetchList} disabled={loading}>
            検索
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

      <div className="border rounded overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[240px]">タイトル</TableHead>
              <TableHead>住所</TableHead>
              <TableHead className="w-[160px]">給与</TableHead>
              <TableHead className="w-[120px]">状態</TableHead>
              <TableHead className="w-[220px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  データなし
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.core_id}>
                  <TableCell className="font-medium">
                    <div className="truncate" title={r.template_title ?? ""}>
                      {r.template_title ?? "(無題)"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={r.core_id}>
                      core_id: {r.core_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate" title={r.work_address ?? ""}>
                      {r.work_address ?? "-"}
                    </div>
                  </TableCell>
                  <TableCell>{r.salary ?? "-"}</TableCell>
                  <TableCell>{r.status ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openUpdate(r)}>
                        編集
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteTemplate(r)}>
                        削除
                      </Button>
                      <Button size="sm" onClick={() => openRpaDialog(r)}>
                        RPAリクエスト作成
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* CRUD Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "テンプレ編集" : "テンプレ新規追加"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">タイトル</div>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="例：港区 夕方短時間 2時間" />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">住所</div>
              <Input value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="例：名古屋市港区..." />
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground">給与</div>
              <Input value={fSalary} onChange={(e) => setFSalary(e.target.value)} placeholder="例：時給1,500円" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">交通費/手当</div>
              <Input value={fFare} onChange={(e) => setFFare(e.target.value)} placeholder="例：交通費500円" />
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground">状態</div>
              <Input value={fStatus} onChange={(e) => setFStatus(e.target.value)} placeholder="例：active / draft" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">内部ラベル</div>
              <Input value={fInternalLabel} onChange={(e) => setFInternalLabel(e.target.value)} placeholder="例：急募/夜勤" />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">仕事内容</div>
              <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={4} />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">注意事項</div>
              <Textarea value={fCautions} onChange={(e) => setFCautions(e.target.value)} rows={3} />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">自動メッセージ</div>
              <Textarea value={fAutoMsg} onChange={(e) => setFAutoMsg(e.target.value)} rows={3} />
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground">緊急連絡先</div>
              <Input value={fEmergencyPhone} onChange={(e) => setFEmergencyPhone(e.target.value)} placeholder="例：052-xxx-xxxx" />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">必要資格（改行区切り）</div>
              <Textarea value={fRequiredLicensesText} onChange={(e) => setFRequiredLicensesText(e.target.value)} rows={3} />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">福利厚生（改行区切り）</div>
              <Textarea value={fBenefitsText} onChange={(e) => setFBenefitsText(e.target.value)} rows={3} />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">持ち物（改行区切り）</div>
              <Textarea value={fBelongingsText} onChange={(e) => setFBelongingsText(e.target.value)} rows={3} />
            </div>

            <div className="md:col-span-2">
              <div className="text-[11px] text-muted-foreground">写真URL（改行区切り）</div>
              <Textarea value={fPhotoUrlsText} onChange={(e) => setFPhotoUrlsText(e.target.value)} rows={3} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>
              閉じる
            </Button>
            <Button onClick={saveTemplate}>{editing ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RPA Dialog */}
      <Dialog open={openRpa} onOpenChange={setOpenRpa}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>RPAリクエスト作成</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">{rpaTarget?.template_title ?? ""}</div>
              <div className="text-[11px] text-muted-foreground">core_id: {rpaTarget?.core_id ?? ""}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">shift_start_date（必須）</div>
                <Input value={shiftStartDate} onChange={(e) => setShiftStartDate(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">shift_start_time（任意）</div>
                <Input value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} placeholder="HH:MM（空欄OK）" />
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground">shift_end_date（必須）</div>
                <Input value={shiftEndDate} onChange={(e) => setShiftEndDate(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">shift_end_time（任意）</div>
                <Input value={shiftEndTime} onChange={(e) => setShiftEndTime(e.target.value)} placeholder="HH:MM（空欄OK）" />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              ※ このページは RPAテンプレートID: {RPA_TEMPLATE_ID} に対して request_details を作成します。
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setOpenRpa(false)} disabled={sendingRpa}>
              閉じる
            </Button>
            <Button onClick={sendRpaRequest} disabled={sendingRpa}>
              {sendingRpa ? "送信中..." : "RPAリクエスト送信"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
