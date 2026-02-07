//types/assessment.ts
export type AssessmentServiceKind = "障害" | "移動支援" | "要支援" | "要介護";


export type AssessmentCheck = "NONE" | "CIRCLE";

export type AssessmentRow = {
    key: string;
    label: string;
    check: AssessmentCheck;
    remark: string;
    hope: string;
};

export type AssessmentSheet = {
    key: string;          // "meal" etc
    title: string;        // "食事 シート"
    printTarget: boolean; // 印刷対象
    rows: AssessmentRow[];
};

export type AssessmentContent = {
    version: number;
    sheets: AssessmentSheet[];
};

export type AssessmentRecord = {
    assessment_id: string;
    client_id: string;
    service_kind: AssessmentServiceKind;
    assessed_on: string; // yyyy-mm-dd
    author_user_id: string;
    author_name: string;
    content: AssessmentContent;
    created_at: string;
    updated_at: string;
};
