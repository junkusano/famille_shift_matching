// src/lib/assessment/template.ts
import type { AssessmentContent, AssessmentServiceKind } from "@/types/assessment";

function row(key: string, label: string) {
    return { key, label, check: "NONE" as const, remark: "", hope: "" };
}

function isCare(serviceKind: AssessmentServiceKind) {
    return serviceKind === "要支援" || serviceKind === "要介護";
}

export function getDefaultAssessmentContent(serviceKind: AssessmentServiceKind): AssessmentContent {
    // care（要介護・要支援）
    if (isCare(serviceKind)) {
        // 将来：要介護・要支援用テンプレをここに追加
        return { version: 1, sheets: [] };
    }

    // disability_ido（障害・移動支援）：カイポケを参考にした構成
    return {
        version: 1,
        sheets: [
            {
                key: "meal",
                title: "食事 シート",
                printTarget: true,
                rows: [
                    row("meal_01", "適量を食事することができる"),
                    row("meal_02", "箸やスプーン等の道具を使用し食事を行なう事ができる"),
                    row("meal_03", "適切な場所で食事をする事ができる"),
                    row("meal_04", "買物・準備ができる"),
                    row("meal_05", "調理する事ができる"),
                    row("meal_06", "献立を考える事ができる"),
                    row("meal_07", "食事介助の必要性がある"),
                ],
            },
            {
                key: "clean",
                title: "清潔 シート",
                printTarget: true,
                rows: [
                    row("clean_01", "入浴準備・後片付けを行う事ができる"),
                    row("clean_02", "洗濯する事ができる"),
                    row("clean_03", "清掃する事ができる"),
                    row("clean_04", "入浴介助の必要性がある"),
                ],
            },
            {
                key: "toilet",
                title: "排泄 シート",
                printTarget: true,
                rows: [
                    row("toilet_01", "トイレの意思表示ができる"),
                    row("toilet_02", "トイレへのこだわりがある"),
                    row("toilet_03", "排泄介助の必要性がある"),
                ],
            },
            {
                key: "move",
                title: "移動 シート",
                printTarget: true,
                rows: [
                    row("move_01", "安定した歩行ができる"),
                    row("move_02", "車椅子・杖等の必要性がある"),
                    row("move_03", "納得しないと動かない"),
                    row("move_04", "公共の場で他人に迷惑をかける"),
                    row("move_05", "目的地を理解できる"),
                ],
            },
            {
                key: "daily",
                title: "日常生活 シート",
                printTarget: true,
                rows: [
                    row("daily_01", "自ら起床する事ができる"),
                    row("daily_02", "着替える事ができる"),
                    row("daily_03", "洗顔・歯磨きをする事ができる"),
                    row("daily_04", "活動等に積極的に参加する事ができる"),
                    row("daily_05", "一人で外出できる"),
                    row("daily_06", "外出先から連絡する事ができる"),
                    row("daily_07", "社会のルールを理解できる"),
                    row("daily_08", "社会のルールを守る事ができる"),
                    row("daily_09", "他人への気配りができる"),
                ],
            },
            {
                key: "self",
                title: "自己選択 シート",
                printTarget: true,
                rows: [
                    row("self_01", "自分の意思で希望する事物を選択する事ができる"),
                    row("self_02", "他人からの問いかけに自分の意思で応答する事ができる"),
                    row("self_03", "日課やスケジュールに従って行動できる"),
                    row("self_04", "不測の事態に適切に対応できる"),
                    row("self_05", "自己主張・自己弁護ができる"),
                ],
            },
            {
                key: "relation",
                title: "人間関係 シート",
                printTarget: true,
                rows: [
                    row("relation_01", "信頼関係を築く事ができる"),
                    row("relation_02", "積極的に会話する事ができる"),
                    row("relation_03", "字を読む事ができる"),
                    row("relation_04", "耳が聞こえる"),
                    row("relation_05", "相手の話の内容が理解できる"),
                    row("relation_06", "予定変更の受容ができる"),
                ],
            },

            // TODO: カイポケ項目を追記して完成
            { key: "health", title: "健康管理 シート", printTarget: true, rows: [] },
            { key: "money", title: "金銭管理 シート", printTarget: true, rows: [] },
            { key: "crisis", title: "危機管理 シート", printTarget: true, rows: [] },
            { key: "behavior", title: "行動障害 シート", printTarget: true, rows: [] },
        ],
    };
}
