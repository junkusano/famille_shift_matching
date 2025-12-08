"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// =======================
// 型定義
// =======================

type ServiceKindGenre = "介護" | "要支援" | "障害";

type KaipokeUser = {
    id: string;
    kaipoke_cs_id: string;
    name: string;
    service_kind: string | null;
    postal_code: string | null;
    asigned_org: string | null;
    asigned_jisseki_staff: string | null;
};

type OrgOption = {
    orgunitid: string;
    orgunitname: string;
};

type StaffOption = {
    user_id: string;
    name: string;
};

type RowState = KaipokeUser & {
    postal_area: string;
    isSavingOrg?: boolean;
    isSavingStaff?: boolean;
    errorOrg?: string | null;
    errorStaff?: string | null;
};

// =======================
// Supabase クライアント
// =======================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// `@supabase/supabase-js` の標準クライアント
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =======================
// ユーティリティ
// =======================

/**
 * service_kind を 介護・要支援・障害 の 3ジャンルに丸める
 */
function toGenre(serviceKind: string | null): ServiceKindGenre {
    if (!serviceKind) return "障害";
    if (serviceKind.includes("要介護") || serviceKind.includes("介護")) return "介護";
    if (serviceKind.includes("要支援")) return "要支援";
    // それ以外はとりあえず「障害」にまとめる
    return "障害";
}

/**
 * 郵便番号の上3桁
 */
function extractPostalArea(postalCode: string | null): string {
    if (!postalCode) return "";
    return postalCode.replace(/-/g, "").slice(0, 3);
}

// =======================
// メインコンポーネント
// =======================

export default function AssignMatomePage() {
    const [rows, setRows] = useState<RowState[]>([]);
    const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
    const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // -----------------------
    // 初期データ取得
    // -----------------------
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                // 利用者一覧
                const { data: usersData, error: usersError } = await supabase
                    .from("cs_kaipoke_info")
                    .select(
                        `
            id,
            kaipoke_cs_id,
            name,
            service_kind,
            postal_code,
            asigned_org,
            asigned_jisseki_staff
          `
                    )
                    .eq("is_active", true)
                    .order("name", { ascending: true });

                if (usersError) throw usersError;

                const baseRows: RowState[] =
                    (usersData as KaipokeUser[] | null)?.map((u) => ({
                        ...u,
                        postal_area: extractPostalArea(u.postal_code),
                    })) ?? [];

                setRows(baseRows);

                // チーム一覧（orgs）
                const { data: orgsRaw, error: orgsError } = await supabase
                    .from("orgs")
                    .select("orgunitid, orgunitname, displaylevel, displayorder")
                    .eq("displaylevel", 3)
                    .order("displayorder", { ascending: true });

                if (orgsError) throw orgsError;

                type OrgRow = {
                    orgunitid: string;
                    orgunitname: string;
                };

                const orgsData = (orgsRaw ?? []) as OrgRow[];

                setOrgOptions(
                    orgsData.map((o) => ({
                        orgunitid: o.orgunitid,
                        orgunitname: o.orgunitname,
                    }))
                );

                // スタッフ一覧
                // TODO: ここは既存のスタッフ一覧テーブル/ビュー名・カラム名に合わせて変更してください
                // 例）user_id, last_name_kanji, first_name_kanji を持つ view: staff_list_view
                const { data: staffRaw, error: staffError } = await supabase
                    .from("staff_list_view") // ← プロジェクトに合わせて変更
                    .select("user_id, last_name_kanji, first_name_kanji")
                    .order("last_name_kanji", { ascending: true });

                if (staffError) {
                    // スタッフ一覧が取れない場合は致命的ではないのでログだけ残す
                    console.warn("staff list load error", staffError.message);
                }

                if (staffRaw) {
                    type StaffRow = {
                        user_id: string;
                        last_name_kanji: string | null;
                        first_name_kanji: string | null;
                    };

                    const staffData = staffRaw as StaffRow[];

                    const staffOpts: StaffOption[] = staffData.map((s) => ({
                        user_id: s.user_id,
                        name: `${s.last_name_kanji ?? ""} ${s.first_name_kanji ?? ""}`.trim(),
                    }));
                    setStaffOptions(staffOpts);
                }
            } catch (e: unknown) {
                console.error(e);
                const message =
                    e instanceof Error ? e.message : "データ取得に失敗しました";
                setLoadError(message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // -----------------------
    // 上部：集計（サービス種別ごとの人数）
    // -----------------------
    const summaryByGenre = useMemo(() => {
        const result: Record<ServiceKindGenre, number> = {
            介護: 0,
            要支援: 0,
            障害: 0,
        };

        rows.forEach((r) => {
            const g = toGenre(r.service_kind);
            result[g] += 1;
        });

        return result;
    }, [rows]);

    // -----------------------
    // 上部：集計（チームごとの人数）
    // -----------------------
    const summaryByOrg = useMemo(() => {
        const result = new Map<string, number>(); // orgunitid → count

        rows.forEach((r) => {
            if (!r.asigned_org) return;
            result.set(r.asigned_org, (result.get(r.asigned_org) ?? 0) + 1);
        });

        // チーム名も付けて配列に
        return orgOptions.map((org) => ({
            orgunitid: org.orgunitid,
            orgunitname: org.orgunitname,
            count: result.get(org.orgunitid) ?? 0,
        }));
    }, [rows, orgOptions]);

    // -----------------------
    // 更新ハンドラ（チーム）
    // -----------------------
    const handleOrgChange = async (id: string, oldOrgId: string | null, newOrgId: string) => {
        // 楽観的更新：先に画面だけ変える
        setRows((prev) =>
            prev.map((r) =>
                r.id === id
                    ? {
                        ...r,
                        asigned_org: newOrgId || null,
                        isSavingOrg: true,
                        errorOrg: null,
                    }
                    : r
            )
        );

        const { error } = await supabase
            .from("cs_kaipoke_info")
            .update({ asigned_org: newOrgId || null })
            .eq("id", id);

        if (error) {
            // 失敗したら元に戻す
            console.error(error);
            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                            ...r,
                            asigned_org: oldOrgId,
                            isSavingOrg: false,
                            errorOrg: "保存に失敗しました",
                        }
                        : r
                )
            );
        } else {
            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                            ...r,
                            isSavingOrg: false,
                            errorOrg: null,
                        }
                        : r
                )
            );
        }
    };

    // -----------------------
    // 更新ハンドラ（実績記録担当者）
    // -----------------------
    const handleStaffChange = async (
        id: string,
        oldStaffId: string | null,
        newStaffId: string
    ) => {
        setRows((prev) =>
            prev.map((r) =>
                r.id === id
                    ? {
                        ...r,
                        asigned_jisseki_staff: newStaffId || null,
                        isSavingStaff: true,
                        errorStaff: null,
                    }
                    : r
            )
        );

        const { error } = await supabase
            .from("cs_kaipoke_info")
            .update({ asigned_jisseki_staff: newStaffId || null })
            .eq("id", id);

        if (error) {
            console.error(error);
            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                            ...r,
                            asigned_jisseki_staff: oldStaffId,
                            isSavingStaff: false,
                            errorStaff: "保存に失敗しました",
                        }
                        : r
                )
            );
        } else {
            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                            ...r,
                            isSavingStaff: false,
                            errorStaff: null,
                        }
                        : r
                )
            );
        }
    };

    // =======================
    // レンダリング
    // =======================

    return (
        <div className="p-4 space-y-6">
            <h1 className="text-xl font-bold mb-2">チーム一覧管理</h1>

            {loading && <p>読み込み中です…</p>}
            {loadError && (
                <p className="text-red-600 text-sm">
                    初期データ取得に失敗しました：{loadError}
                </p>
            )}

            {/* 上部：集計エリア */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* サービス種別ごとの人数 */}
                <div className="border rounded-md p-3 bg-white shadow-sm">
                    <h2 className="font-semibold mb-2 text-sm">サービス種別ごとの利用者数</h2>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-1 px-2">種別</th>
                                <th className="text-right py-1 px-2">人数</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b">
                                <td className="py-1 px-2">介護</td>
                                <td className="py-1 px-2 text-right">{summaryByGenre["介護"]}</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-1 px-2">要支援</td>
                                <td className="py-1 px-2 text-right">{summaryByGenre["要支援"]}</td>
                            </tr>
                            <tr>
                                <td className="py-1 px-2">障害</td>
                                <td className="py-1 px-2 text-right">{summaryByGenre["障害"]}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* チームごとの人数 */}
                <div className="border rounded-md p-3 bg-white shadow-sm">
                    <h2 className="font-semibold mb-2 text-sm">チームごとのメンバー数</h2>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-1 px-2">チーム</th>
                                <th className="text-right py-1 px-2">人数</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryByOrg.map((org) => (
                                <tr key={org.orgunitid} className="border-b last:border-b-0">
                                    <td className="py-1 px-2">{org.orgunitname}</td>
                                    <td className="py-1 px-2 text-right">{org.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 下部：利用者一覧 */}
            <div className="border rounded-md p-3 bg-white shadow-sm">
                <h2 className="font-semibold mb-2 text-sm">利用者一覧</h2>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="min-w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="text-left py-1 px-2">名前</th>
                                <th className="text-left py-1 px-2">サービス種別</th>
                                <th className="text-left py-1 px-2">エリア（郵便上3桁）</th>
                                <th className="text-left py-1 px-2">実績記録担当者</th>
                                <th className="text-left py-1 px-2">チーム</th>
                                <th className="text-left py-1 px-2 w-24">状態</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const staffSaving = row.isSavingStaff;
                                const orgSaving = row.isSavingOrg;
                                return (
                                    <tr key={row.id} className="border-b last:border-b-0">
                                        {/* 名前（クリックで利用者情報ページへ） */}
                                        <td className="py-1 px-2">
                                            <Link
                                                href={`/portal/kaipoke-info-detail/${row.id}`}
                                                className="text-blue-600 hover:underline"
                                            >
                                                {row.name}
                                            </Link>
                                        </td>

                                        {/* サービス種別 */}
                                        <td className="py-1 px-2">
                                            {row.service_kind ?? ""}
                                        </td>

                                        {/* エリア（郵便上3桁） */}
                                        <td className="py-1 px-2">{row.postal_area}</td>

                                        {/* 実績記録担当者：Select */}
                                        <td className="py-1 px-2">
                                            <select
                                                className="w-full border rounded px-1 py-0.5 text-xs"
                                                value={row.asigned_jisseki_staff ?? ""}
                                                onChange={(e) =>
                                                    handleStaffChange(
                                                        row.id,
                                                        row.asigned_jisseki_staff,
                                                        e.target.value
                                                    )
                                                }
                                            >
                                                <option value="">(未設定)</option>
                                                {staffOptions.map((s) => (
                                                    <option key={s.user_id} value={s.user_id}>
                                                        {s.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {row.errorStaff && (
                                                <p className="text-[10px] text-red-600">
                                                    {row.errorStaff}
                                                </p>
                                            )}
                                        </td>

                                        {/* チーム：Select */}
                                        <td className="py-1 px-2">
                                            <select
                                                className="w-full border rounded px-1 py-0.5 text-xs"
                                                value={row.asigned_org ?? ""}
                                                onChange={(e) =>
                                                    handleOrgChange(row.id, row.asigned_org, e.target.value)
                                                }
                                            >
                                                <option value="">(未設定)</option>
                                                {orgOptions.map((org) => (
                                                    <option key={org.orgunitid} value={org.orgunitid}>
                                                        {org.orgunitname}
                                                    </option>
                                                ))}
                                            </select>
                                            {row.errorOrg && (
                                                <p className="text-[10px] text-red-600">
                                                    {row.errorOrg}
                                                </p>
                                            )}
                                        </td>

                                        {/* 状態：保存中など */}
                                        <td className="py-1 px-2 text-[10px]">
                                            {staffSaving || orgSaving ? (
                                                <span className="text-gray-500">保存中…</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {rows.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="py-4 text-center text-gray-500">
                                        データがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
