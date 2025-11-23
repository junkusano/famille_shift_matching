// /src/lib/cs_contract_plan.ts
//
// 利用者ごとの「契約書／計画書」不足を判定するロジック。
// 2025-07-01 〜 指定日(+10日) までの shift を対象に
// shift_service_code の contract_requrired / plan_required をもとに
// cs_kaipoke_info.documents をチェックする。

import { supabaseAdmin } from "@/lib/supabase/service";

export type RequirementType = "contract" | "plan";

export type MissingDoc = {
    docId: string;
    docLabel: string;
    requirementTypes: RequirementType[];
    requiredByServices: string[]; // この書類を要求しているサービスコード一覧
};

export type ClientMissingDocs = {
    clientId: string; // cs_kaipoke_info.id (uuid)
    kaipoke_cs_id: string;
    name: string;
    relatedServiceCodes: string[]; // 対象期間中に実施予定のサービスコード一覧
    missingDocs: MissingDoc[];
};

export type ContractPlanScanOptions = {
    fromDate?: string; // YYYY-MM-DD, デフォルト "2025-07-01"
    toDate?: string; // YYYY-MM-DD, デフォルト: (今日 + 10日)
};

export type ContractPlanScanResult = {
    scannedShifts: number;
    clients: ClientMissingDocs[];
};

// shift テーブルから使う最低限の項目
type ShiftRow = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string | null;
    service_code: string | null;
};

// shift_service_code から使う項目
type ShiftServiceCodeRow = {
    service_code: string | null;
    contract_requrired: string | null;
    plan_required: string | null;
};

// cs_kaipoke_info から使う項目
type ClientRow = {
    id: string;
    kaipoke_cs_id: string;
    name: string;
    documents: unknown;
};

type ServiceDocRequirement = {
    docId: string;
    requirementType: RequirementType;
};

type ClientAccumulator = {
    kaipoke_cs_id: string;
    serviceCodes: Set<string>;
    requiredDocs: Map<
        string,
        {
            requirementTypes: Set<RequirementType>;
            requiredByServices: Set<string>;
        }
    >;
};

const DEFAULT_FROM_DATE = "2025-07-01";

// 日付を YYYY-MM-DD 文字列に整形
function formatYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// cs_kaipoke_info.documents から「書類マスタID」を抜き出す
// ※ 実際の JSON 構造に合わせて key 名は調整してください。
function extractDocMasterIdsFromDocuments(documents: unknown): Set<string> {
    const result = new Set<string>();
    if (!documents) return result;

    let arr: unknown[] = [];
    if (Array.isArray(documents)) {
        arr = documents as unknown[];
    } else if (typeof documents === "string") {
        try {
            const parsed: unknown = JSON.parse(documents);
            if (Array.isArray(parsed)) arr = parsed as unknown[];
        } catch {
            // パース失敗は無視
        }
    }

    for (const item of arr) {
        if (!item || typeof item !== "object") continue;

        const record = item as Record<string, unknown>;

        // documents の 1要素に「どの user_doc_master を使ったか」の ID が入っているはず。
        const candidates = ["doc_master_id", "type_id", "doc_type_id", "document_type_id"];
        let id: string | null = null;

        for (const key of candidates) {
            const v = record[key];
            if (typeof v === "string" && v) {
                id = v;
                break;
            }
        }

        if (id) result.add(id);
    }

    return result;
}

// 必要書類が足りていない利用者を検索
export async function findClientsMissingContractAndPlanDocs(
    options?: ContractPlanScanOptions,
): Promise<ContractPlanScanResult> {
    const startTs = Date.now();
    console.info("[cs_contract_plan] start scan", { options });

    const now = new Date();
    const baseTo = new Date(now.getTime() + 10 * 86400000); // 今日 + 10日

    const fromDate = options?.fromDate ?? DEFAULT_FROM_DATE;
    const toDate = options?.toDate ?? formatYmd(baseTo);

    console.info("[cs_contract_plan] date range", { fromDate, toDate });

    // 1. 期間内のシフト取得（ダミー利用者を除外）
    const { data: shifts, error: shiftError } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, service_code")
        .gte("shift_start_date", fromDate)
        .lte("shift_start_date", toDate)
        .not("kaipoke_cs_id", "ilike", "99999999%")
        .not("service_code", "is", null);

    if (shiftError) {
        console.error("[cs_contract_plan] failed to load shifts", {
            fromDate,
            toDate,
            error: shiftError,
        });
        return { scannedShifts: 0, clients: [] };
    }

    console.info("[cs_contract_plan] fetched shifts", {
        rawCount: shifts?.length ?? 0,
    });

    const validShifts: ShiftRow[] = (shifts ?? []).filter(
        (s): s is ShiftRow =>
            !!s.kaipoke_cs_id && !!s.service_code && !!s.shift_start_date,
    );

    console.info("[cs_contract_plan] valid shifts after filter", {
        validCount: validShifts.length,
    });

    if (validShifts.length === 0) {
        console.info("[cs_contract_plan] no shifts in range", { fromDate, toDate });
        return { scannedShifts: 0, clients: [] };
    }

    // 2. 対象 service_code 一覧
    const serviceCodes = Array.from(
        new Set(validShifts.map((s) => s.service_code as string)),
    );

    console.info("[cs_contract_plan] unique service_codes", {
        serviceCodeCount: serviceCodes.length,
    });

    if (serviceCodes.length === 0) {
        return { scannedShifts: validShifts.length, clients: [] };
    }

    // 3. shift_service_code マスタ取得
    const { data: svcRows, error: svcError } = await supabaseAdmin
        .from("shift_service_code")
        .select("service_code, contract_requrired, plan_required")
        .in("service_code", serviceCodes);

    if (svcError) {
        console.error("[cs_contract_plan] failed to load shift_service_code", {
            error: svcError,
        });
        return { scannedShifts: validShifts.length, clients: [] };
    }

    const svcList: ShiftServiceCodeRow[] = (svcRows ?? []) as ShiftServiceCodeRow[];

    console.info("[cs_contract_plan] loaded shift_service_code rows", {
        count: svcList.length,
    });

    // service_code -> 必要書類リスト
    const svcDocMap = new Map<string, ServiceDocRequirement[]>();

    for (const row of svcList) {
        const code = row.service_code;
        if (!code) continue;

        const list = svcDocMap.get(code) ?? [];

        if (row.contract_requrired) {
            // 同じ docId が重複しないようチェック
            if (!list.some((x) => x.docId === row.contract_requrired)) {
                list.push({
                    docId: row.contract_requrired,
                    requirementType: "contract",
                });
            }
        }

        if (row.plan_required) {
            if (!list.some((x) => x.docId === row.plan_required)) {
                list.push({
                    docId: row.plan_required,
                    requirementType: "plan",
                });
            }
        }

        if (list.length > 0) {
            svcDocMap.set(code, list);
        }
    }

    console.info("[cs_contract_plan] built service doc map", {
        serviceWithRequirements: svcDocMap.size,
    });

    if (svcDocMap.size === 0) {
        console.info(
            "[cs_contract_plan] no contract/plan requirements defined in shift_service_code",
        );
        return { scannedShifts: validShifts.length, clients: [] };
    }

    // 4. 利用者ごとに「必要書類IDセット」を作成
    const clientMap = new Map<string, ClientAccumulator>(); // key = kaipoke_cs_id

    const ensureClient = (kaipoke_cs_id: string): ClientAccumulator => {
        let acc = clientMap.get(kaipoke_cs_id);
        if (!acc) {
            acc = {
                kaipoke_cs_id,
                serviceCodes: new Set<string>(),
                requiredDocs: new Map(),
            };
            clientMap.set(kaipoke_cs_id, acc);
        }
        return acc;
    };

    for (const shift of validShifts) {
        const csId = shift.kaipoke_cs_id as string;
        const svc = shift.service_code as string;

        const docReqs = svcDocMap.get(svc);
        if (!docReqs || docReqs.length === 0) continue;

        const acc = ensureClient(csId);
        acc.serviceCodes.add(svc);

        for (const req of docReqs) {
            const current =
                acc.requiredDocs.get(req.docId) ??
                {
                    requirementTypes: new Set<RequirementType>(),
                    requiredByServices: new Set<string>(),
                };

            current.requirementTypes.add(req.requirementType);
            current.requiredByServices.add(svc);
            acc.requiredDocs.set(req.docId, current);
        }
    }

    console.info("[cs_contract_plan] built clientMap (requirements)", {
        clientCount: clientMap.size,
    });

    if (clientMap.size === 0) {
        return { scannedShifts: validShifts.length, clients: [] };
    }

    const targetCsIds = Array.from(clientMap.keys());

    console.info("[cs_contract_plan] target cs_ids for client fetch", {
        count: targetCsIds.length,
    });

    // 5. 利用者情報取得（is_active, end_at はあえて見ない：過去分も整備対象）
    const { data: clientRows, error: clientError } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("id, kaipoke_cs_id, name, documents")
        .in("kaipoke_cs_id", targetCsIds);

    if (clientError) {
        console.error("[cs_contract_plan] failed to load cs_kaipoke_info", {
            error: clientError,
        });
        return { scannedShifts: validShifts.length, clients: [] };
    }

    console.info("[cs_contract_plan] loaded cs_kaipoke_info rows", {
        count: clientRows?.length ?? 0,
    });

    const clientByCsId = new Map<string, ClientRow>();
    for (const row of clientRows ?? []) {
        const r = row as ClientRow;
        clientByCsId.set(r.kaipoke_cs_id, r);
    }

    // 6. 必要書類ID一覧をまとめて doc マスタから名称取得（任意）
    const allDocIds = new Set<string>();
    for (const acc of clientMap.values()) {
        for (const docId of acc.requiredDocs.keys()) {
            allDocIds.add(docId);
        }
    }

    console.info("[cs_contract_plan] all required doc ids", {
        docIdCount: allDocIds.size,
    });

    const docNameById: Record<string, string> = {};
    if (allDocIds.size > 0) {
        const { data: docRows, error: docError } = await supabaseAdmin
            .from("user_doc_master")
            .select("id, label")
            .in("id", Array.from(allDocIds));

        if (docError) {
            console.warn(
                "[cs_contract_plan] failed to load user_doc_master; fallback to generic labels",
                { error: docError },
            );
        } else {
            console.info("[cs_contract_plan] loaded user_doc_master rows", {
                count: docRows?.length ?? 0,
            });

            for (const row of docRows ?? []) {
                const { id, label } = row as { id: string; label: string | null };
                if (id && label) {
                    docNameById[id] = label;
                }
            }
        }
    }

    // 7. 利用者ごとに不足書類を判定
    const resultClients: ClientMissingDocs[] = [];

    for (const [csId, acc] of clientMap.entries()) {
        const client = clientByCsId.get(csId);
        if (!client) continue;

        const presentDocIds = extractDocMasterIdsFromDocuments(client.documents);

        const missingDocs: MissingDoc[] = [];

        for (const [docId, meta] of acc.requiredDocs.entries()) {
            if (presentDocIds.has(docId)) continue;

            const types = Array.from(meta.requirementTypes);
            const svcCodes = Array.from(meta.requiredByServices).sort();

            let label = docNameById[docId];
            if (!label) {
                if (types.length === 1) {
                    label = types[0] === "contract" ? "契約書" : "計画書";
                } else if (types.length > 1) {
                    label = "契約書／計画書";
                } else {
                    label = `書類(${docId})`;
                }
            }

            missingDocs.push({
                docId,
                docLabel: label,
                requirementTypes: types,
                requiredByServices: svcCodes,
            });
        }

        if (missingDocs.length === 0) continue;

        resultClients.push({
            clientId: client.id,
            kaipoke_cs_id: client.kaipoke_cs_id,
            name: client.name,
            relatedServiceCodes: Array.from(acc.serviceCodes).sort(),
            missingDocs,
        });
    }

    console.info("[cs_contract_plan] result clients with missing docs", {
        clientCount: resultClients.length,
    });

    if (resultClients.length > 0) {
        console.debug(
            "[cs_contract_plan] first few result clients",
            resultClients.slice(0, 5).map((c) => ({
                kaipoke_cs_id: c.kaipoke_cs_id,
                name: c.name,
                missingDocCount: c.missingDocs.length,
            })),
        );
    }

    const endTs = Date.now();
    console.info("[cs_contract_plan] end scan", {
        scannedShifts: validShifts.length,
        resultClients: resultClients.length,
        durationMs: endTs - startTs,
    });

    return {
        scannedShifts: validShifts.length,
        clients: resultClients,
    };
}
