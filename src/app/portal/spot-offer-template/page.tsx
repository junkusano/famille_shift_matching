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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const RPA_TEMPLATE_ID = "caf1a290-b9ac-4eeb-84eb-eb7fd9936c2f";
const REQUIRED_LICENSE_OPTIONS = [
  "初任者研修",
  "実務者研修",
  "介護福祉士",
  "看護師",
  "准看護師",
  "普通自動車免許",
  "同行援護従業者養成研修",
  "行動援護従業者養成研修",
  "喀痰吸引等研修",
];

type NullableBoolean = boolean | null;

type RpaRequestRow = {
  status: string | null;
  requested_at: string | null;
  created_at: string | null;
  request_details: {
    core_id?: string | null;
  } | null;
};

function toArrayFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNullableTime(v: string): string | null {
  const s0 = v.trim();
  if (!s0) return null;

  let hh = "";
  let mm = "";
  let ss = "00";

  if (/^\d{2}:\d{2}$/.test(s0)) {
    hh = s0.slice(0, 2);
    mm = s0.slice(3, 5);
  } else if (/^\d{2}:\d{2}:\d{2}$/.test(s0)) {
    hh = s0.slice(0, 2);
    mm = s0.slice(3, 5);
    ss = s0.slice(6, 8);
  } else if (/^\d{4}$/.test(s0)) {
    hh = s0.slice(0, 2);
    mm = s0.slice(2, 4);
  } else {
    throw new Error(`時間形式が不正です: "${s0}"（例: 0930 / 09:30 / 09:30:00）`);
  }

  const h = Number(hh);
  const m = Number(mm);
  const sec = Number(ss);

  if (![h, m, sec].every(Number.isFinite) || h < 0 || h > 23 || m < 0 || m > 59 || sec < 0 || sec > 59) {
    throw new Error(`時間の値が不正です: "${s0}"`);
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function timeForInput(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
  return v;
}

function numberToInput(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function toNullableNumber(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    throw new Error(`数値形式が不正です: "${v}"`);
  }
  return n;
}

function boolLabel(v: NullableBoolean): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "null";
}

function BoolSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NullableBoolean;
  onChange: (value: NullableBoolean) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value === null ? "null" : value ? "true" : "false"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "null" ? null : v === "true");
        }}
      >
        <option value="null">未設定</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </div>
  );
}

function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="text-[11px] text-muted-foreground">
      {children}
      {required && <span className="ml-1 text-red-600 font-semibold">*</span>}
    </div>
  );
}

export default function SpotOfferTemplatePage() {
  const role = useUserRole();

  const [loading, setLoading] = useState(true);
  type RowWithClient = SpotOfferTemplateUnified & {
    client_name?: string;
    recent_rpa_requested_at?: string[];
  };

  const [rows, setRows] = useState<RowWithClient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<SpotOfferTemplateUnified | null>(null);

  const [openRpa, setOpenRpa] = useState(false);
  const [rpaTarget, setRpaTarget] = useState<SpotOfferTemplateUnified | null>(null);
  const [shiftStartDate, setShiftStartDate] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftEndDate, setShiftEndDate] = useState("");
  const [shiftEndTime, setShiftEndTime] = useState("");
  const [sendingRpa, setSendingRpa] = useState(false);

  const [fTimeeOfferId, setFTimeeOfferId] = useState("");
  const [fUcareOfferId, setFUcareOfferId] = useState("");
  const [fKaitekuOfferId, setFKaitekuOfferId] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCautions, setFCautions] = useState("");
  const [fAutoMsg, setFAutoMsg] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fEmergencyPhone, setFEmergencyPhone] = useState("");
  const [fSmokingPolicy, setFSmokingPolicy] = useState("");
  const [fSmokingAreaWork, setFSmokingAreaWork] = useState<NullableBoolean>(null);
  const [fRequiresLicense, setFRequiresLicense] = useState<NullableBoolean>(null);
  const [fRequiredLicenses, setFRequiredLicenses] = useState<string[]>([]);
  const [fBenefitsText, setFBenefitsText] = useState("");
  const [fBelongingsText, setFBelongingsText] = useState("");
  const [fInternalLabel, setFInternalLabel] = useState("");
  const [fPhotoUrlsText, setFPhotoUrlsText] = useState("");
  const [fSalary, setFSalary] = useState("");
  const [fFare, setFFare] = useState("");
  const [fKaipokeCsId, setFKaipokeCsId] = useState("");
  const [fStartAt, setFStartAt] = useState("");
  const [fEndAt, setFEndAt] = useState("");
  const [fStatusChecked, setFStatusChecked] = useState(true);
  const [fUnitAmount, setFUnitAmount] = useState("");
  const [fCommuteFee, setFCommuteFee] = useState("");
  const [fSendMsgFlg, setFSendMsgFlg] = useState<NullableBoolean>(null);
  const [fMatchingMsg, setFMatchingMsg] = useState("");
  const [fMeetingPlace, setFMeetingPlace] = useState("");
  const [fMeetingYuubinn, setFMeetingYuubinn] = useState("");
  const [fMatchingPlaceName, setFMatchingPlaceName] = useState("");
  const [fMeetingPlaceBanchi, setFMeetingPlaceBanchi] = useState("");
  const [postalLoading, setPostalLoading] = useState(false);
  const [postalError, setPostalError] = useState<string | null>(null);

  type ClientPreview = {
  name: string | null;
  address: string | null;
};

type ParkingPreview = {
  id: string;
  label: string | null;
  parking_orientation: string | null;
  permit_required: boolean | null;
  remarks: string | null;
};
  const [breakStartTime, setBreakStartTime] = useState("");
  const [breakEndTime, setBreakEndTime] = useState("");

  const [clientPreview, setClientPreview] = useState<ClientPreview | null>(null);
  const [parkingPreview, setParkingPreview] = useState<ParkingPreview[]>([]);
  const [loadingClientPreview, setLoadingClientPreview] = useState(false);

    type ClientOption = {
   kaipoke_cs_id: string;
   name: string;
  };
  
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  const canAccess = useMemo(() => ["admin", "manager"].includes(role), [role]);


  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await spotApi.listTemplates({ q });

      const csIds = Array.from(
        new Set(data.map((r) => r.kaipoke_cs_id).filter(Boolean))
      );

    let clientMap: Record<string, string> = {};
    
    if (csIds.length > 0) {
      const { data: clients } = await supabase
      .from("cs_kaipoke_info")
      .select("kaipoke_cs_id, name")
      .in("kaipoke_cs_id", csIds);

      clientMap = Object.fromEntries(
        (clients ?? []).map((c) => [String(c.kaipoke_cs_id), c.name])
       );
     } 

     const { data: rpaRequests, error: rpaError } = await supabase
      .from("rpa_command_requests")
      .select("status, requested_at, created_at, request_details")
      .eq("template_id", RPA_TEMPLATE_ID)
      .in("status", ["approved", "processing", "completed"])
      .order("requested_at", { ascending: false });

    if (rpaError) throw rpaError;

    const requestMap: Record<string, string[]> = {};

    for (const req of (rpaRequests ?? []) as RpaRequestRow[]) {
      const coreId = req.request_details?.core_id;
      const requestedAt = req.requested_at ?? req.created_at;

      if (!coreId || !requestedAt) continue;

      if (!requestMap[coreId]) {
        requestMap[coreId] = [];
      }

      if (requestMap[coreId].length < 5) {
        requestMap[coreId].push(requestedAt);
      }
    }

     const merged = data.map((r) => ({
      ...r,
      client_name: r.kaipoke_cs_id
        ? clientMap[String(r.kaipoke_cs_id)] ?? "-"
       : "-",
       recent_rpa_requested_at: requestMap[r.core_id] ?? [],
       }));

       console.log("spot rows preview", merged.slice(0, 5).map((r) => ({
        core_id: r.core_id,
        title: r.template_title,
        client_name: r.client_name,
        work_address: r.work_address,
        start_at: r.start_at,
        end_at: r.end_at,
        status: r.status
      })));

       setRows(merged);

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const csId = fKaipokeCsId.trim();

  if (!csId) {
    setClientPreview(null);
    setParkingPreview([]);
    return;
  }

  let cancelled = false;

  const fetchClientPreview = async () => {
    try {
      setLoadingClientPreview(true);

      const [{ data: clientData, error: clientError }, { data: parkingData, error: parkingError }] =
        await Promise.all([
          supabase
            .from("cs_kaipoke_info")
            .select("name, address")
            .eq("kaipoke_cs_id", csId)
            .maybeSingle(),

          supabase
            .from("parking_cs_places_admin_view")
            .select("id, label, parking_orientation, permit_required, remarks")
            .eq("kaipoke_cs_id", csId)
            .order("serial", { ascending: true }),
        ]);

      if (clientError) throw clientError;
      if (parkingError) throw parkingError;

      if (cancelled) return;

      setClientPreview(
        clientData
          ? {
              name: clientData.name ?? null,
              address: clientData.address ?? null,
            }
          : null
      );

      setParkingPreview(parkingData ?? []);
    } catch (e) {
      if (cancelled) return;
      console.error("利用者情報取得エラー:", e);
      setClientPreview(null);
      setParkingPreview([]);
    } finally {
      if (!cancelled) {
        setLoadingClientPreview(false);
      }
    }
  };

  void fetchClientPreview();

  return () => {
    cancelled = true;
  };
}, [fKaipokeCsId]);

useEffect(() => {
  const loadClientOptions = async () => {
    try {
      const { data, error } = await supabase
       .from("cs_kaipoke_info")
       .select("kaipoke_cs_id, name")
       .not("kaipoke_cs_id", "is", null)
       .not("name", "is", null)
       .order("name", { ascending: true });

     if (error) throw error;

     setClientOptions(
      (data ?? []).map((row) => ({
       kaipoke_cs_id: row.kaipoke_cs_id,
       name: row.name,
     }))
   );
   } catch (e) {
    console.error("利用者一覧取得エラー:", e);
     setClientOptions([]);
    }
 };

  void loadClientOptions();
  }, []);

useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFTimeeOfferId("");
    setFUcareOfferId("");
    setFKaitekuOfferId("");
    setFTitle("");
    setFDesc("");
    setFCautions("");
    setFAutoMsg("");
    setFAddress("");
    setFEmergencyPhone("");
    setFSmokingPolicy("");
    setFSmokingAreaWork(null);
    setFRequiresLicense(null);
    setFRequiredLicenses([]);
    setFBenefitsText("");
    setFBelongingsText("");
    setFInternalLabel("");
    setFPhotoUrlsText("");
    setFSalary("");
    setFFare("");
    setFKaipokeCsId("");
    setFStartAt("");
    setFEndAt("");
    setFStatusChecked(true);
    setFUnitAmount("");
    setFCommuteFee("");
    setFSendMsgFlg(true);
    setFMatchingMsg("");
    setFMeetingPlace("");
    setFMeetingYuubinn("");
    setFMatchingPlaceName("");
    setFMeetingPlaceBanchi("");
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setOpenEdit(true);
  };

  const openUpdate = (row: SpotOfferTemplateUnified) => {
    setEditing(row);
    setFTimeeOfferId(row.timee_offer_id ?? "");
    setFUcareOfferId(row.ucare_offer_id ?? "");
    setFKaitekuOfferId(row.kaiteku_offer_id ?? "");
    setFTitle(row.template_title ?? "");
    setFDesc(row.work_description ?? "");
    setFCautions(row.cautions ?? "");
    setFAutoMsg(row.auto_message ?? "");
    setFAddress(row.work_address ?? "");
    setFEmergencyPhone(row.emergency_phone ?? "");
    setFSmokingPolicy(row.smoking_policy ?? "");
    setFSmokingAreaWork(row.smoking_area_work ?? null);
    setFRequiresLicense(row.requires_license ?? null);
    setFRequiredLicenses(row.required_licenses ?? []);
    setFBenefitsText((row.benefits ?? []).join("\n"));
    setFBelongingsText((row.belongings ?? []).join("\n"));
    setFInternalLabel(row.internal_label ?? "");
    setFPhotoUrlsText((row.photo_urls ?? []).join("\n"));
    setFSalary(row.salary ?? "");
    setFFare(row.fare ?? "");
    setFKaipokeCsId(row.kaipoke_cs_id ?? "");
    setFStartAt(timeForInput(row.start_at));
    setFEndAt(timeForInput(row.end_at));
    setFStatusChecked((row.status ?? "active") === "active");
    setFUnitAmount(numberToInput(row.unit_amount));
    setFCommuteFee(numberToInput(row.commute_fee));
    setFSendMsgFlg(row.send_msg_flg ?? true);
    setFMatchingMsg(row.matching_msg ?? "");
    setFMeetingPlace(row.meeting_place ?? "");
    setFMeetingYuubinn(row.meeting_yuubinn ?? "");
    setFMatchingPlaceName(row.matching_place_name ?? "");
    setFMeetingPlaceBanchi(row.meeting_place_banchi ?? "");
    setOpenEdit(true);
  };

  const lookupAddressByPostalCode = async (postalCodeRaw: string) => {
  const postalCode = postalCodeRaw.replace(/[^\d]/g, "");

  if (!postalCode) {
    setPostalError(null);
    return;
  }

  if (!/^\d{7}$/.test(postalCode)) {
    setPostalError("郵便番号は7桁で入力してください");
    return;
  }

  try {
    setPostalLoading(true);
    setPostalError(null);

    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
    const json = await res.json();

    if (!res.ok) {
      throw new Error("住所検索に失敗しました");
    }

    if (!json.results || json.results.length === 0) {
      setPostalError("該当する住所が見つかりませんでした。住所を直接入力してください。");
      return;
    }

    const result = json.results[0];
    const autoAddress = `${result.address1 ?? ""}${result.address2 ?? ""}${result.address3 ?? ""}`;

    if (autoAddress.trim()) {
      setFMeetingPlace(autoAddress);
    }
  } catch (e) {
    setPostalError(e instanceof Error ? e.message : "住所検索に失敗しました");
  } finally {
    setPostalLoading(false);
  }
};

const saveTemplate = async () => {
  try {
    setError(null);

    if (!fTitle.trim()) {
      throw new Error("タイトルは必須です");
    }
    if (!fMeetingPlace.trim()) {
      throw new Error("住所は必須です");
    }
    if (!fMeetingPlaceBanchi.trim()) {
      throw new Error("番地は必須です");
    }
    if (!fStartAt.trim()) {
      throw new Error("開始時間は必須です");
    }
    if (!fEndAt.trim()) {
      throw new Error("終了時間は必須です");
    }

    const payload: Partial<SpotOfferTemplateUnified> = {
      timee_offer_id: fTimeeOfferId.trim() || null,
      ucare_offer_id: fUcareOfferId.trim() || null,
      kaiteku_offer_id: fKaitekuOfferId.trim() || null,
      template_title: fTitle.trim() || null,
      work_description: fDesc.trim() || null,
      cautions: fCautions.trim() || null,
      auto_message: fAutoMsg.trim() || null,
      work_address: fAddress.trim() || null,
      emergency_phone: fEmergencyPhone.trim() || null,
      smoking_policy: fSmokingPolicy.trim() || null,
      smoking_area_work: fSmokingAreaWork,
      requires_license: fRequiresLicense,
      required_licenses: fRequiredLicenses,
      benefits: toArrayFromTextarea(fBenefitsText),
      belongings: toArrayFromTextarea(fBelongingsText),
      internal_label: fInternalLabel.trim() || null,
      photo_urls: toArrayFromTextarea(fPhotoUrlsText),
      salary: fSalary.trim() || null,
      fare: fFare.trim() || null,
      kaipoke_cs_id: fKaipokeCsId.trim() || null,
      start_at: toNullableTime(fStartAt),
      end_at: toNullableTime(fEndAt),
      status: fStatusChecked ? "active" : "inactive",
      unit_amount: toNullableNumber(fUnitAmount),
      commute_fee: toNullableNumber(fCommuteFee),
      send_msg_flg: !!fSendMsgFlg,
      matching_msg: fMatchingMsg.trim() || null,
      meeting_place: fMeetingPlace.trim() || null,
      meeting_yuubinn: fMeetingYuubinn.trim() || null,
      matching_place_name: fMatchingPlaceName.trim() || null,
      meeting_place_banchi: fMeetingPlaceBanchi.trim() || null,
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
     if (!shiftStartTime && fStartAt) {
      setShiftStartTime(fStartAt);
     }
      if (!shiftEndTime && fEndAt) {
      setShiftEndTime(fEndAt);
     }  
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

      const { data: userData, error: userError } = await supabase
        .from("user_entry_united_view")
        .select("manager_auth_user_id, manager_user_id, user_id")
        .eq("auth_user_id", authUserId)
        .eq("group_type", "人事労務サポートルーム")
        .limit(1)
        .single();

      if (userError || !userData?.manager_auth_user_id) {
        throw new Error("承認者（マネージャー）情報取得に失敗しました");
      }

      const details = {
        core_id: rpaTarget.core_id,
        created_from: "/portal/spot-offer-template",

        shift_start_date: shiftStartDate.trim(),
        shift_start_time: toNullableTime(shiftStartTime),
        shift_end_date: shiftEndDate.trim(),
        shift_end_time: toNullableTime(shiftEndTime),

        break_start_time: toNullableTime(breakStartTime),
        break_end_time: toNullableTime(breakEndTime),

        requester_user_id: userData.user_id,

        template_title: rpaTarget.template_title ?? null,
        work_address: rpaTarget.work_address ?? null,
        salary: rpaTarget.salary ?? null,
        fare: rpaTarget.fare ?? null,
        status: rpaTarget.status ?? null,
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
              <TableHead className="w-[120px]">状態</TableHead>
              <TableHead className="w-[240px]">タイトル</TableHead>
              <TableHead className="w-[180px]">利用者名</TableHead>
              <TableHead className="w-[260px]">住所</TableHead>
              <TableHead className="w-[180px] whitespace-nowrap">時間</TableHead>
              <TableHead className="w-[220px]">リクエスト作成日</TableHead>
              <TableHead className="w-[220px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  データなし
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.core_id}>
                  <TableCell className="whitespace-nowrap">
                     {r.status === "active" ? "アクティブ" : r.status === "inactive" ? "非アクティブ" : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="truncate" title={r.template_title ?? ""}>
                      {r.template_title ?? "(無題)"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={r.core_id}>
                      core_id: {r.core_id}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.client_name ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="truncate" title={r.work_address ?? ""}>
                      {r.work_address ?? "-"}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {timeForInput(r.start_at) || "-"} ～ {timeForInput(r.end_at) || "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.recent_rpa_requested_at?.length ? (
                      <div className="space-y-1">
                        {r.recent_rpa_requested_at.map((dt, idx) => (
                          <div key={idx}>{new Date(dt).toLocaleDateString("ja-JP")}</div>
                        ))}
                      </div>
                    ) : (
                      "-"
                   )}
                  </TableCell>
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

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="w-[96vw] max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "テンプレ編集" : "テンプレ新規追加"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold">基本情報</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div>
                  <div className="md:col-span-2 xl:col-span-3"></div>
                  <FieldLabel required>タイトル　※ここに個人名は入れないでください。</FieldLabel>
                  <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="例：港区 夕方短時間 2時間" />
                </div>
                <div>
                  <FieldLabel>状態</FieldLabel>
                  <label className="flex items-center gap-2 h-9">
                    <input
                        type="checkbox"
                        checked={fStatusChecked}
                        onChange={(e) => setFStatusChecked(e.target.checked)}
                      />
                      <span>{fStatusChecked ? "アクティブ" : "非アクティブ"}</span>
                  </label>
               </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">内部ラベル</div>
                  <Input value={fInternalLabel} onChange={(e) => setFInternalLabel(e.target.value)} placeholder="例：〇〇様 行動援護　など" />
                </div>

                <div className="md:col-span-2">
                  <FieldLabel>利用者選択</FieldLabel>

               <Select value={fKaipokeCsId} onValueChange={setFKaipokeCsId}>
                <SelectTrigger>
                 <SelectValue placeholder="利用者を選択" />
              </SelectTrigger>
              <SelectContent>
                {clientOptions.map((c) => (
                <SelectItem key={c.kaipoke_cs_id} value={c.kaipoke_cs_id}>
                 {c.name}
                </SelectItem>
              ))}
            </SelectContent>
           </Select>
          </div>
                
                <div className="md:col-span-2 xl:col-span-3 rounded border p-3 bg-muted/30">
                  <div className="text-sm font-semibold mb-2">利用者情報プレビュー</div>

                  {!fKaipokeCsId.trim() ? (
                    <div className="text-xs text-muted-foreground">
                      利用者様を選択すると、住所・駐車場情報を表示します。
                     </div>
                  ) : loadingClientPreview ? (
                     <div className="text-xs text-muted-foreground">取得中...</div>
  ) : (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-muted-foreground">住所</div>
          <div className="text-sm whitespace-pre-wrap">{clientPreview?.address ?? "-"}</div>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground mb-1">駐車場情報</div>
        {parkingPreview.length === 0 ? (
          <div className="text-sm text-muted-foreground">駐車場情報なし</div>
        ) : (
          <div className="space-y-2">
            {parkingPreview.map((p, index) => (
              <div key={p.id} className="rounded border p-2 bg-background">
                <div className="text-sm font-medium">
                  {p.label || `駐車場${index + 1}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  向き: {p.parking_orientation ?? "-"} / 許可証:{" "}
                  {p.permit_required == null ? "-" : p.permit_required ? "必要" : "不要"}
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  備考: {p.remarks ?? "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )}    
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold">勤務情報</div>
  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
    <div className="md:col-span-2 xl:col-span-3">
      <FieldLabel>シフト日程</FieldLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          type="date"
          value={shiftStartDate}
          onChange={(e) => setShiftStartDate(e.target.value)}
        />
        <Input
          type="date"
          value={shiftEndDate}
          onChange={(e) => setShiftEndDate(e.target.value)}
        />
      </div>
    </div>

    <div className="md:col-span-2 xl:col-span-3">
      <FieldLabel required>勤務時間 ※リクエスト作成時に変更可</FieldLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          value={fStartAt}
          onChange={(e) => {
            setFStartAt(e.target.value);
            setShiftStartTime(e.target.value);
          }}
          placeholder="開始時間 例：0930 / 09:30"
        />
        <Input
          value={fEndAt}
          onChange={(e) => {
            setFEndAt(e.target.value);
            setShiftEndTime(e.target.value);
          }}
          placeholder="終了時間 例：1730 / 17:30"
        />
      </div>
    </div>

    <div className="md:col-span-2 xl:col-span-3">
      <FieldLabel>休憩時間</FieldLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          value={breakStartTime}
          onChange={(e) => setBreakStartTime(e.target.value)}
          placeholder="休憩開始 例：1200 / 12:00"
        />
        <Input
          value={breakEndTime}
          onChange={(e) => setBreakEndTime(e.target.value)}
          placeholder="休憩終了 例：1230 / 12:30"
        />
      </div>
    </div>
    <div>
      <div className="text-[11px] text-muted-foreground">時給</div>
      <Input
        value={fUnitAmount}
        onChange={(e) => setFUnitAmount(e.target.value)}
        placeholder="例：1500"
        inputMode="numeric"
      />
    </div>

    <div>
      <div className="text-[11px] text-muted-foreground">交通費</div>
      <Input
        value={fCommuteFee}
        onChange={(e) => setFCommuteFee(e.target.value)}
        placeholder="例：200"
        inputMode="numeric"
      />
    </div>
     <div className="md:col-span-2 xl:col-span-3">
        <div className="text-[11px] text-muted-foreground">仕事内容</div>
        <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={4} />
     </div>
   </div>
   
</div>  
            <div>
              <div className="text-sm font-semibold">集合情報</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">集合場所名</div>
                  <Input value={fMatchingPlaceName} onChange={(e) => setFMatchingPlaceName(e.target.value)} placeholder="例：〇〇公園"/>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">郵便番号</div>
                  <div className="flex gap-2">
                    <Input
                     value={fMeetingYuubinn}
                     onChange={(e) => {
                      setFMeetingYuubinn(e.target.value);
                      setPostalError(null);
                     }}
                     onBlur={() => void lookupAddressByPostalCode(fMeetingYuubinn)}
                     placeholder="例：4560018　ハイフンなしで入力"
                     inputMode="numeric" 
                  />
                  <Button
                   type="button"
                   variant="outline"
                   onClick={() => void lookupAddressByPostalCode(fMeetingYuubinn)}
                   disabled={postalLoading}
                >
                  {postalLoading ? "検索中..." : "住所検索"}
                </Button>
                  </div>
                  {postalError && (
                   <div className="mt-1 text-xs text-red-600">{postalError}</div>
                )}
                
                </div>
                  <div className="md:col-span-2 xl:col-span-3">
                   <FieldLabel required>住所</FieldLabel> 
                  <Input value={fMeetingPlace} onChange={(e) => setFMeetingPlace(e.target.value)} placeholder="例：愛知県名古屋市熱田区新尾頭"/>
                </div>
                  <div className="md:col-span-2 xl:col-span-3">
                   <FieldLabel required>番地</FieldLabel>
                  <Input value={fMeetingPlaceBanchi} onChange={(e) => setFMeetingPlaceBanchi(e.target.value)} placeholder="例：３丁目1-18 WIZ金山602"/>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold">資格</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  <BoolSelect
                    label="資格必須"
                    value={fRequiresLicense}
                    onChange={setFRequiresLicense} />

                  <div className="md:col-span-2 xl:col-span-3">
      <FieldLabel>必要資格</FieldLabel>
      <select
        multiple
        className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        value={fRequiredLicenses}
        onChange={(e) => {
          const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
          setFRequiredLicenses(values);
        }}
      >
        {REQUIRED_LICENSE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <div className="mt-2 flex flex-wrap gap-2">
        {fRequiredLicenses.length === 0 ? (
          <span className="text-xs text-muted-foreground">未選択</span>
        ) : (
          fRequiredLicenses.map((license) => (
            <span
              key={license}
              className="inline-flex items-center rounded-full border px-2 py-1 text-xs bg-background"
            >
              {license}
            </span>
          ))
        )}
      </div>

      <div className="mt-1 text-xs text-muted-foreground">
        Ctrl または Command を押しながらクリックすると複数選択できます
      </div>
    </div>
  </div>
 </div>

  <div>
  <div className="text-sm font-semibold">メッセージ</div>
  <div className="mt-2 space-y-3">
    <div>
      <FieldLabel>send_msg_flg</FieldLabel>
      <label className="flex items-center gap-2 h-9">
        <input
          type="checkbox"
          checked={!!fSendMsgFlg}
          onChange={(e) => setFSendMsgFlg(e.target.checked)}
        />
        <span>{fSendMsgFlg ? "送信する" : "送信しない"}</span>
      </label>
    </div>

    <div>
      <div className="text-[11px] text-muted-foreground">マッチングメッセージ</div>
      <Textarea
        value={fMatchingMsg}
        onChange={(e) => setFMatchingMsg(e.target.value)}
        rows={3}
      />
    </div>
  </div>
</div>


            <div>
              <div className="text-sm font-semibold">ID / 連携情報</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">timee_offer_id</div>
                  <Input value={fTimeeOfferId} onChange={(e) => setFTimeeOfferId(e.target.value)} />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">ucare_offer_id</div>
                  <Input value={fUcareOfferId} onChange={(e) => setFUcareOfferId(e.target.value)} />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">kaiteku_offer_id</div>
                  <Input value={fKaitekuOfferId} onChange={(e) => setFKaitekuOfferId(e.target.value)} />
                </div>

                {editing && (
                  <div className="md:col-span-2 xl:col-span-2 text-xs text-muted-foreground self-end">
                    core_id: {editing.core_id}
                    <br />
                    timee_scraped_at: {editing.timee_scraped_at ?? "-"}
                    <br />
                    ucare_scraped_at: {editing.ucare_scraped_at ?? "-"}
                    <br />
                    kaiteku_scraped_at: {editing.kaiteku_scraped_at ?? "-"}
                    <br />
                    created_at: {editing.created_at ?? "-"}
                    <br />
                    updated_at: {editing.updated_at ?? "-"}
                  </div>
                )}
              </div>
            </div>
            {editing && (
              <div className="rounded border p-3 text-xs text-muted-foreground">
                DBの存在確認済み追加項目: smoking_policy / smoking_area_work / requires_license / unit_amount /
                commute_fee / send_msg_flg / matching_msg / meeting_place / meeting_yuubinn /
                matching_place_name / meeting_place_banchi
                <br />
                現在値: smoking_area_work={boolLabel(editing.smoking_area_work)} / requires_license={boolLabel(editing.requires_license)} / send_msg_flg={boolLabel(editing.send_msg_flg)}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>
              閉じる
            </Button>
            <Button onClick={saveTemplate}>{editing ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
     </Dialog>

      <Dialog open={openRpa} onOpenChange={setOpenRpa}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
                <Input type="date" value={shiftStartDate} onChange={(e) => setShiftStartDate(e.target.value)} />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">shift_start_time（任意）</div>
                <Input
                  value={shiftStartTime}
                  onChange={(e) => setShiftStartTime(e.target.value)}
                  placeholder="0930 / 09:30（空欄OK）"
                />
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground">shift_end_date（必須）</div>
                <Input type="date" value={shiftEndDate} onChange={(e) => setShiftEndDate(e.target.value)} />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">shift_end_time（任意）</div>
                <Input
                  value={shiftEndTime}
                  onChange={(e) => setShiftEndTime(e.target.value)}
                  placeholder="0930 / 09:30（空欄OK）"
                />
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground">休憩開始（任意）</div>
                <Input
                  value={breakStartTime}
                  onChange={(e) => setBreakStartTime(e.target.value)}
                  placeholder="1200 / 12:00（空欄OK）"
                />
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground">休憩終了（任意）</div>
                <Input
                  value={breakEndTime}
                  onChange={(e) => setBreakEndTime(e.target.value)}
                  placeholder="1230 / 12:30（空欄OK）"
                />
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
