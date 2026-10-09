"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { RosterShiftCard } from "@/types/roster";
import { supabase } from "@/lib/supabaseClient";
import {
  buildMultipleServiceItems,
  minutesLabel,
  multipleServiceTitle,
  type MultipleServiceGroup,
  type MultipleServiceSource,
} from "@/lib/multiple-services";

type PanelShift = MultipleServiceSource & {
  card: RosterShiftCard;
};

type Props = {
  date: string;
  cards: RosterShiftCard[];
  selectedIds: number[];
  setSelectedIds: Dispatch<SetStateAction<number[]>>;
};

function uniqueShifts(cards: RosterShiftCard[]): PanelShift[] {
  const byId = new Map<number, PanelShift>();
  for (const card of cards) {
    const shift = card.dialog;
    if (!shift || byId.has(shift.shift_id)) continue;
    byId.set(shift.shift_id, {
      shift_id: shift.shift_id,
      shift_start_date: shift.shift_date,
      shift_start_time: shift.start_at,
      shift_end_time: shift.end_at,
      service_code: shift.service_code,
      client_name: shift.client_name,
      kaipoke_cs_id: shift.kaipoke_cs_id,
      multiple_service_group_id:
        shift.multiple_service_group_id ?? card.multiple_service_group_id ?? null,
      card,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => a.shift_start_time.localeCompare(b.shift_start_time),
  );
}

export default function MultipleServicesBetaPanel({ date, cards, selectedIds, setSelectedIds }: Props) {
  const shifts = useMemo(() => uniqueShifts(cards), [cards]);
  const items = useMemo(() => buildMultipleServiceItems(shifts), [shifts]);
  const groups = items.filter(
    (item): item is MultipleServiceGroup<PanelShift> => item.kind === "multiple-service",
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [scope, setScope] = useState<"single" | "future">("future");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = shifts.filter((shift) => selectedIds.includes(Number(shift.shift_id)));
  const previewTitle = selected.length >= 2 ? multipleServiceTitle(selected) : null;
  const selectedGroup = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return groups.find((group) => {
      const groupIds = group.shifts.map((shift) => Number(shift.shift_id));
      return groupIds.length === selectedSet.size && groupIds.every((id) => selectedSet.has(id));
    }) ?? null;
  }, [groups, selectedIds]);

  const authHeaders = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("ログイン情報を取得できません");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/multiple-services", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          shiftIds: selectedIds,
          effectiveFrom: date,
          scope,
          groupId: editingGroupId,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        affectedDates?: number;
        affectedShifts?: number;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "保存できませんでした");
      setMessage(
        scope === "future"
          ? `この日以降 ${payload.affectedDates ?? 0}日分、${payload.affectedShifts ?? 0}シフトへ反映しました`
          : "この日の複数サービスを保存しました",
      );
      setSelectedIds([]);
      setEditingGroupId(null);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (
    group: MultipleServiceGroup<PanelShift>,
    removeScope: "single" | "future",
  ) => {
    const label = removeScope === "future" ? "この日以降すべて" : "この日だけ";
    if (!window.confirm(`${group.title}を${label}解除しますか？\n個々のシフトは削除されません。`)) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/multiple-services", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({
          groupId: group.id,
          effectiveFrom: date,
          scope: removeScope,
          shiftIds: group.shifts.map((shift) => shift.shift_id),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "解除できませんでした");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解除できませんでした");
      setSaving(false);
    }
  };

  const edit = (group: MultipleServiceGroup<PanelShift>) => {
    setEditingGroupId(group.id);
    setSelectedIds(group.shifts.map((shift) => Number(shift.shift_id)));
    setScope("future");
    setMessage("構成するシフトを選び直してください");
  };

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-violet-950">複数サービス β</h2>
            <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[11px] font-bold text-violet-900">
              メニュー非掲載
            </span>
          </div>
          <p className="mt-1 text-xs text-violet-800">
            通常シフトはダブルクリック、登録済みの紫色グループカードはクリックで選択できます。名称・時間・利用者・サービスは自動生成します。
          </p>
        </div>
        <span className="rounded-full border border-violet-200 bg-white px-2 py-1 text-xs text-violet-800">
          登録済み {groups.length}件
        </span>
      </div>

      {selectedGroup ? (
        <div className="mt-3 rounded-lg border-2 border-violet-500 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-violet-700">選択中の複数サービス</div>
              <div className="font-bold text-slate-950">{selectedGroup.title}</div>
              <div className="text-xs text-slate-600">
                {selectedGroup.startTime}～{selectedGroup.endTime}・{selectedGroup.shifts.length}サービス
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded border px-3 py-1 text-xs hover:bg-slate-50"
            >
              選択解除
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => edit(selectedGroup)} className="rounded border px-3 py-1 text-xs hover:bg-slate-50">
              構成を編集
            </button>
            <button type="button" onClick={() => void remove(selectedGroup, "single")} className="rounded border px-3 py-1 text-xs hover:bg-slate-50">
              この日だけ解除
            </button>
            <button type="button" onClick={() => void remove(selectedGroup, "future")} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">
              この日以降を解除
            </button>
          </div>
        </div>
      ) : null}

      {groups.length > 0 && (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {groups.map((group) => (
            <article
              key={group.id}
              className={`rounded-lg bg-white p-3 ${selectedGroup?.id === group.id ? "border-2 border-violet-500" : "border border-violet-200"}`}
            >
              <div className="font-bold text-slate-950">{group.title}</div>
              <div className="mt-1 text-sm text-slate-700">
                {group.startTime}～{group.endTime}（拘束 {minutesLabel(group.spanMinutes)}／サービス {minutesLabel(group.serviceMinutes)}）
              </div>
              {group.gapMinutes > 0 && (
                <div className="text-xs text-slate-500">間隔合計 {minutesLabel(group.gapMinutes)}</div>
              )}
              {group.invalidReason && (
                <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                  {group.invalidReason}
                </div>
              )}
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                {group.shifts.map((shift) => (
                  <div key={String(shift.shift_id)}>
                    {shift.shift_start_time.slice(0, 5)}～{shift.shift_end_time.slice(0, 5)}　
                    {shift.client_name}様　{shift.service_code}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => edit(group)} className="rounded border px-3 py-1 text-xs hover:bg-slate-50">
                  構成を編集
                </button>
                <button type="button" onClick={() => void remove(group, "single")} className="rounded border px-3 py-1 text-xs hover:bg-slate-50">
                  この日だけ解除
                </button>
                <button type="button" onClick={() => void remove(group, "future")} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">
                  この日以降を解除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3">
        <div className="text-sm font-bold text-slate-900">
          {editingGroupId ? "複数サービスの構成を編集" : "複数サービスを作成"}
        </div>
        <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {shifts.map((shift) => (
            <label key={String(shift.shift_id)} className="flex cursor-pointer items-start gap-2 rounded border p-2 text-xs hover:bg-violet-50">
              <input
                type="checkbox"
                checked={selectedIds.includes(Number(shift.shift_id))}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, Number(shift.shift_id)])]
                      : current.filter((id) => id !== Number(shift.shift_id)),
                  )
                }
              />
              <span>
                <strong>{shift.shift_start_time.slice(0, 5)}～{shift.shift_end_time.slice(0, 5)}</strong>
                <br />
                {shift.client_name}様　{shift.service_code}
              </span>
            </label>
          ))}
        </div>

        {previewTitle && (
          <div className="mt-3 rounded-lg bg-violet-100 px-3 py-2 text-sm">
            <span className="text-xs text-violet-700">自動名称</span>
            <div className="font-bold text-violet-950">{previewTitle}</div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-xs">
            <input type="radio" checked={scope === "future"} onChange={() => setScope("future")} />
            この日以降の同じ曜日・時間へ反映
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="radio" checked={scope === "single"} onChange={() => setScope("single")} />
            この日だけ
          </label>
          <button
            type="button"
            disabled={saving || selectedIds.length < 2}
            onClick={() => void save()}
            className="ml-auto rounded bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? "保存中…" : editingGroupId ? "変更を保存" : "複数サービスにする"}
          </button>
          {editingGroupId && (
            <button
              type="button"
              onClick={() => {
                setEditingGroupId(null);
                setSelectedIds([]);
                setMessage(null);
              }}
              className="rounded border px-3 py-2 text-sm"
            >
              キャンセル
            </button>
          )}
        </div>
        {message && (
          <div className={`mt-2 text-sm ${message.includes("できません") || message.includes("不正") ? "text-red-700" : "text-violet-800"}`}>
            {message}
          </div>
        )}
      </div>
    </section>
  );
}
