import { supabaseAdmin } from "@/lib/supabase/service";
import { Group } from "@/types/lineworks";

export async function saveGroupsMaster(groups: Group[]) {
    if (!Array.isArray(groups)) {
        throw new Error("groups は配列である必要があります");
    }

    const formatted = groups.map((group) => {
        const rawName = group.groupName || "";
        const atIndex = Math.max(rawName.lastIndexOf("@"), rawName.lastIndexOf("＠"));
        const group_name = atIndex !== -1 ? rawName.slice(0, atIndex).trim() : rawName.trim();
        const group_account = atIndex !== -1 ? rawName.slice(atIndex + 1).trim() : null;

        const client_code_match = group_name.match(/\[(\d+)\]/);
        const client_code = client_code_match ? client_code_match[1] : null;

        const group_type = determineGroupType(group_name);

        return {
            group_id: group.groupId,
            group_name,
            group_account,
            client_code,
            group_type,
            is_active: true,
            updated_at: new Date().toISOString(),
        };
    });

    const { error } = await supabaseAdmin
        .from("groups_lw")
        .upsert(formatted, { onConflict: "group_id" });

    if (error) {
        throw new Error(`groups_lw 同期失敗: ${error.message}`);
    }
}

function determineGroupType(name: string): string | null {
    if (!name) return null;
    if (name.includes("人事労務サポートルーム")) return "人事労務サポートルーム";
    if (name.includes("勤務キャリア・コーディネートルーム")) return "勤務キャリア・コーディネートルーム";
    if (name.match(/様[　\s]*情報連携/)) return "利用者様情報連携グループ";

    const keywords = [
        "ヘルパーマネジャー", "全ヘルパーグループ", "電子サイン対応グループ",
        "駐車許可グループ", "事務連絡グループ", "トップマネジメントグループ",
        "訪問記録エラー通知", "全社員グループ", "採用応募グループ",
        "◆対応忘れグループ◆", "全マネジャー・ケアマネグループ",
        "【運営】安全衛生グループ", "安全衛生委員会", "マネジャー行動・予定・成果報告連携グループ"
    ];

    return keywords.find((kw) => name.includes(kw)) ? "広域グループ" : null;
}
