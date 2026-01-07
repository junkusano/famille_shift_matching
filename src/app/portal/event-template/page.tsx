// src/app/portal/event-template/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    //SelectContent,
    SelectItem,
    //SelectTrigger,
    //SelectValue,
} from "@/components/ui/select";

import type {
    CheckSource,
    DueRuleType,
    EventTemplateWithDocs,
    UpsertEventTemplatePayload,
} from "@/types/eventTemplate";

type DocMasterRow = {
    id: string;
    category: string;
    label: string;
    is_active: boolean;
};

const CHECK_SOURCES: Array<{ value: CheckSource; label: string }> = [
    { value: "cs_docs", label: "cs_docs 判定" },
    { value: "manual_admin", label: "手動（管理者）" },
    { value: "manual_manager", label: "手動（マネジャー）" },
    { value: "auto_generated", label: "自動生成後完了" },
];

const DUE_RULE_TYPES: Array<{ value: DueRuleType; label: string }> = [
    { value: "manual", label: "手動" },
    { value: "fixed_date", label: "固定日" },
    { value: "shift_start", label: "シフト開始基準" },
    { value: "shift_end", label: "シフト終了基準" },
    { value: "shift_service_code_start", label: "特定サービスコード開始基準" },
];

function safeJsonStringify(obj: unknown) {
    try {
        return JSON.stringify(obj ?? {}, null, 2);
    } catch {
        return "{}";
    }
}
function safeJsonParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

type ReqDocDraft = {
    doc_type_id: string;
    check_source: CheckSource;
    sort_order: number;
    memo: string;
};

type TemplateDraft = {
    template_name: string;
    overview: string;
    due_rule_type: DueRuleType;
    due_offset_days: number;
    due_rule_json_text: string; // textarea
    is_active: boolean;
    required_docs: ReqDocDraft[];
};

const emptyDraft = (): TemplateDraft => ({
    template_name: "",
    overview: "",
    due_rule_type: "manual",
    due_offset_days: 0,
    due_rule_json_text: "{}",
    is_active: true,
    required_docs: [],
});

const triggerDisabledClass = (disabled: boolean) =>
    disabled ? "pointer-events-none opacity-60" : "";


export default function Page() {
    const [loading, setLoading] = useState(false);
    const [admin, setAdmin] = useState(false);
    const [templates, setTemplates] = useState<EventTemplateWithDocs[]>([]);
    const [docMasters, setDocMasters] = useState<DocMasterRow[]>([]);

    const [createDraft, setCreateDraft] = useState<TemplateDraft>(emptyDraft());
    const [editId, setEditId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<TemplateDraft>(emptyDraft());

    const docMasterOptions = useMemo(() => {
        // active を優先して上に
        const sorted = [...docMasters].sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.label.localeCompare(b.label);
        });
        return sorted;
    }, [docMasters]);

    const refresh = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/event-template", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Failed to load");

            setAdmin(!!json.admin);
            setTemplates(json.templates ?? []);

            // doc master 一覧は UI 用に別途取る（将来: 検索/フィルタにも使う）
            // ※ ここは supabase 直叩きでも良いが、まずは軽く /api 使わずに簡易で
            //   （RLS前提だと見えない可能性があるので、必要なら別APIに切り出します）
            // 今回は event-template GET が required_docs の join 用に取っているので、
            // 追加で “全件” を取るために別APIを作るより、ここは専用APIを足します。

            const dmRes = await fetch("/api/user-doc-master?category=all", { cache: "no-store" });
            const dmJson = await dmRes.json();
            if (!dmRes.ok) throw new Error(dmJson?.error ?? "Failed to load doc master");
            setDocMasters(dmJson.rows ?? []);

        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const startEdit = (t: EventTemplateWithDocs) => {
        setEditId(t.id);
        setEditDraft({
            template_name: t.template_name ?? "",
            overview: t.overview ?? "",
            due_rule_type: (t.due_rule_type as DueRuleType) ?? "manual",
            due_offset_days: typeof t.due_offset_days === "number" ? t.due_offset_days : 0,
            due_rule_json_text: safeJsonStringify(t.due_rule_json),
            is_active: !!t.is_active,
            required_docs: (t.required_docs ?? []).map((d, idx) => ({
                doc_type_id: d.doc_type_id,
                check_source: d.check_source as CheckSource,
                sort_order: typeof d.sort_order === "number" ? d.sort_order : (idx + 1) * 10,
                memo: d.memo ?? "",
            })),
        });
    };

    const toPayload = (draft: TemplateDraft): UpsertEventTemplatePayload => {
        const parsed = safeJsonParse(draft.due_rule_json_text);
        const due_rule_json = parsed ?? {};

        return {
            template_name: draft.template_name.trim(),
            overview: draft.overview.trim() ? draft.overview.trim() : null,
            due_rule_type: draft.due_rule_type,
            due_offset_days: Number.isFinite(draft.due_offset_days) ? draft.due_offset_days : 0,
            due_rule_json,
            is_active: draft.is_active,
            required_docs: draft.required_docs
                .filter((r) => !!r.doc_type_id)
                .map((r) => ({
                    doc_type_id: r.doc_type_id,
                    check_source: r.check_source,
                    sort_order: r.sort_order,
                    memo: r.memo?.trim() ? r.memo.trim() : null,
                })),
        };
    };

    const addReqDocRow = (setter: (fn: (prev: TemplateDraft) => TemplateDraft) => void) => {
        setter((prev) => ({
            ...prev,
            required_docs: [
                ...prev.required_docs,
                {
                    doc_type_id: "",
                    check_source: "cs_docs",
                    sort_order: (prev.required_docs.length + 1) * 10,
                    memo: "",
                },
            ],
        }));
    };

    const removeReqDocRow = (
        idx: number,
        setter: (fn: (prev: TemplateDraft) => TemplateDraft) => void
    ) => {
        setter((prev) => ({
            ...prev,
            required_docs: prev.required_docs.filter((_, i) => i !== idx),
        }));
    };

    const onCreate = async () => {
        if (!admin) return;
        const payload = toPayload(createDraft);
        if (!payload.template_name) {
            alert("テンプレート名は必須です");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/event-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Create failed");

            setCreateDraft(emptyDraft());
            await refresh();
        } catch (e) {
            alert(e?.message ?? "Create failed");
        } finally {
            setLoading(false);
        }
    };

    const onUpdate = async () => {
        if (!admin || !editId) return;
        const payload = toPayload(editDraft);
        if (!payload.template_name) {
            alert("テンプレート名は必須です");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/event-template/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Update failed");

            setEditId(null);
            setEditDraft(emptyDraft());
            await refresh();
        } catch (e) {
            alert(e?.message ?? "Update failed");
        } finally {
            setLoading(false);
        }
    };

    const onDelete = async (id: string) => {
        if (!admin) return;
        if (!confirm("このテンプレートを inactive にします。よろしいですか？")) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/event-template/${id}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error ?? "Delete failed");
            await refresh();
        } catch (e) {
            alert(e?.message ?? "Delete failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-baseline justify-between">
                <h1 className="text-xl font-semibold">イベントテンプレ管理</h1>
                <div className="text-sm text-muted-foreground">
                    {loading ? "Loading..." : admin ? "admin" : "read-only"}
                </div>
            </div>

            {/* 新規作成 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">新規テンプレ作成</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>テンプレート名</Label>
                            <Input
                                value={createDraft.template_name}
                                onChange={(e) =>
                                    setCreateDraft((p) => ({ ...p, template_name: e.target.value }))
                                }
                                placeholder="例：訪問介護プランの更新"
                                disabled={!admin || loading}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>有効</Label>
                            <div className="flex items-center gap-2 pt-2">
                                <Checkbox
                                    checked={createDraft.is_active}
                                    onCheckedChange={(v) =>
                                        setCreateDraft((p) => ({ ...p, is_active: !!v }))
                                    }
                                    disabled={!admin || loading}
                                />
                                <span className="text-sm">is_active</span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label>期日ルール</Label>
                            <Select
                                value={createDraft.due_rule_type}
                                onValueChange={(v) =>
                                    setCreateDraft((p) => ({ ...p, due_rule_type: v as DueRuleType }))
                                }
                                className={triggerDisabledClass(!admin || loading)}
                                disabled={!admin || loading}
                                placeholder="選択"
                            >
                                {DUE_RULE_TYPES.map((x) => (
                                    <SelectItem key={x.value} value={x.value}>
                                        {x.label}
                                    </SelectItem>
                                ))}
                            </Select>

                        </div>

                        <div className="space-y-1">
                            <Label>オフセット（日）</Label>
                            <Input
                                type="number"
                                value={createDraft.due_offset_days}
                                onChange={(e) =>
                                    setCreateDraft((p) => ({
                                        ...p,
                                        due_offset_days: Number(e.target.value || 0),
                                    }))
                                }
                                disabled={!admin || loading}
                            />
                        </div>

                        <div className="md:col-span-2 space-y-1">
                            <Label>概要</Label>
                            <Textarea
                                value={createDraft.overview}
                                onChange={(e) =>
                                    setCreateDraft((p) => ({ ...p, overview: e.target.value }))
                                }
                                disabled={!admin || loading}
                                rows={3}
                            />
                        </div>

                        <div className="md:col-span-2 space-y-1">
                            <Label>due_rule_json（JSON）</Label>
                            <Textarea
                                value={createDraft.due_rule_json_text}
                                onChange={(e) =>
                                    setCreateDraft((p) => ({ ...p, due_rule_json_text: e.target.value }))
                                }
                                disabled={!admin || loading}
                                rows={5}
                            />
                            <div className="text-xs text-muted-foreground">
                                例：
                                <code className="ml-1">
                                    {`{"service_code":"HH1111","ref":"shift_start_date"}`}
                                </code>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div className="font-medium">必要書類（テンプレ子）</div>
                        <Button
                            variant="secondary"
                            onClick={() => addReqDocRow(setCreateDraft)}
                            disabled={!admin || loading}
                        >
                            + 行追加
                        </Button>
                    </div>

                    <ReqDocsEditor
                        draft={createDraft}
                        setDraft={setCreateDraft}
                        docMasterOptions={docMasterOptions}
                        disabled={!admin || loading}
                        onRemoveRow={(idx) => removeReqDocRow(idx, setCreateDraft)}
                    />

                    <div className="pt-2">
                        <Button onClick={onCreate} disabled={!admin || loading}>
                            作成
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 一覧 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">テンプレ一覧</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>name</TableHead>
                                <TableHead>active</TableHead>
                                <TableHead>due_rule</TableHead>
                                <TableHead>offset</TableHead>
                                <TableHead>docs</TableHead>
                                <TableHead className="w-[260px]">actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {templates.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-medium">{t.template_name}</TableCell>
                                    <TableCell>{t.is_active ? "Y" : "N"}</TableCell>
                                    <TableCell>{t.due_rule_type}</TableCell>
                                    <TableCell>{t.due_offset_days}</TableCell>
                                    <TableCell>{(t.required_docs ?? []).length}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="secondary"
                                                onClick={() => startEdit(t)}
                                                disabled={loading}
                                            >
                                                詳細/編集
                                            </Button>
                                            {admin && (
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => onDelete(t.id)}
                                                    disabled={loading}
                                                >
                                                    inactive
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!templates.length && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-muted-foreground">
                                        まだテンプレがありません
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {/* 編集欄 */}
                    {editId && (
                        <Card className="border mt-4">
                            <CardHeader>
                                <CardTitle className="text-base">編集</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label>テンプレート名</Label>
                                        <Input
                                            value={editDraft.template_name}
                                            onChange={(e) =>
                                                setEditDraft((p) => ({ ...p, template_name: e.target.value }))
                                            }
                                            disabled={!admin || loading}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>有効</Label>
                                        <div className="flex items-center gap-2 pt-2">
                                            <Checkbox
                                                checked={editDraft.is_active}
                                                onCheckedChange={(v) =>
                                                    setEditDraft((p) => ({ ...p, is_active: !!v }))
                                                }
                                                disabled={!admin || loading}
                                            />
                                            <span className="text-sm">is_active</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label>期日ルール</Label>
                                        <Select
                                            value={editDraft.due_rule_type}
                                            onValueChange={(v) =>
                                                setEditDraft((p) => ({ ...p, due_rule_type: v as DueRuleType }))
                                            }
                                            disabled={!admin || loading}
                                            placeholder="選択"
                                        >
                                            {DUE_RULE_TYPES.map((x) => (
                                                <SelectItem key={x.value} value={x.value}>
                                                    {x.label}
                                                </SelectItem>
                                            ))}
                                        </Select>

                                    </div>

                                    <div className="space-y-1">
                                        <Label>オフセット（日）</Label>
                                        <Input
                                            type="number"
                                            value={editDraft.due_offset_days}
                                            onChange={(e) =>
                                                setEditDraft((p) => ({
                                                    ...p,
                                                    due_offset_days: Number(e.target.value || 0),
                                                }))
                                            }
                                            disabled={!admin || loading}
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <Label>概要</Label>
                                        <Textarea
                                            value={editDraft.overview}
                                            onChange={(e) =>
                                                setEditDraft((p) => ({ ...p, overview: e.target.value }))
                                            }
                                            disabled={!admin || loading}
                                            rows={3}
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <Label>due_rule_json（JSON）</Label>
                                        <Textarea
                                            value={editDraft.due_rule_json_text}
                                            onChange={(e) =>
                                                setEditDraft((p) => ({
                                                    ...p,
                                                    due_rule_json_text: e.target.value,
                                                }))
                                            }
                                            disabled={!admin || loading}
                                            rows={5}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="font-medium">必要書類</div>
                                    <Button
                                        variant="secondary"
                                        onClick={() => addReqDocRow(setEditDraft)}
                                        disabled={!admin || loading}
                                    >
                                        + 行追加
                                    </Button>
                                </div>

                                <ReqDocsEditor
                                    draft={editDraft}
                                    setDraft={setEditDraft}
                                    docMasterOptions={docMasterOptions}
                                    disabled={!admin || loading}
                                    onRemoveRow={(idx) => removeReqDocRow(idx, setEditDraft)}
                                />

                                <div className="flex gap-2 pt-2">
                                    <Button onClick={onUpdate} disabled={!admin || loading}>
                                        更新
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setEditId(null);
                                            setEditDraft(emptyDraft());
                                        }}
                                        disabled={loading}
                                    >
                                        閉じる
                                    </Button>
                                </div>

                                {!admin && (
                                    <div className="text-sm text-muted-foreground">
                                        ※閲覧のみ（編集は管理者のみ）
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function ReqDocsEditor({
    draft,
    setDraft,
    docMasterOptions,
    disabled,
    onRemoveRow,
}: {
    draft: TemplateDraft;
    setDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>;
    docMasterOptions: DocMasterRow[];
    disabled: boolean;
    onRemoveRow: (idx: number) => void;
}) {
    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[380px]">doc_type</TableHead>
                        <TableHead className="w-[180px]">check_source</TableHead>
                        <TableHead className="w-[120px]">sort</TableHead>
                        <TableHead>memo</TableHead>
                        <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {draft.required_docs.map((r, idx) => (
                        <TableRow key={idx}>
                            <TableCell>
                                <Select
                                    value={r.doc_type_id || ""}
                                    onValueChange={(v) => {
                                        if (disabled) return;
                                        setDraft((p) => {
                                            const next = [...p.required_docs];
                                            next[idx] = { ...next[idx], doc_type_id: v };
                                            return { ...p, required_docs: next };
                                        });
                                    }}
                                    disabled={disabled}
                                    placeholder="選択"
                                >
                                    {docMasterOptions.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>
                                            {d.is_active ? "" : "[inactive] "}
                                            {d.category} / {d.label}
                                        </SelectItem>
                                    ))}
                                </Select>


                            </TableCell>

                            <TableCell>
                                <Select
                                    value={r.check_source}
                                    onValueChange={(v) => {
                                        if (disabled) return;
                                        setDraft((p) => {
                                            const next = [...p.required_docs];
                                            next[idx] = { ...next[idx], check_source: v as CheckSource };
                                            return { ...p, required_docs: next };
                                        });
                                    }}
                                    disabled={disabled}
                                    placeholder="選択"
                                >
                                    {CHECK_SOURCES.map((x) => (
                                        <SelectItem key={x.value} value={x.value}>
                                            {x.label}
                                        </SelectItem>
                                    ))}
                                </Select>


                            </TableCell>

                            <TableCell>
                                <Input
                                    type="number"
                                    value={r.sort_order}
                                    onChange={(e) =>
                                        setDraft((p) => {
                                            const next = [...p.required_docs];
                                            next[idx] = { ...next[idx], sort_order: Number(e.target.value || 0) };
                                            return { ...p, required_docs: next };
                                        })
                                    }
                                    disabled={disabled}
                                />
                            </TableCell>

                            <TableCell>
                                <Input
                                    value={r.memo}
                                    onChange={(e) =>
                                        setDraft((p) => {
                                            const next = [...p.required_docs];
                                            next[idx] = { ...next[idx], memo: e.target.value };
                                            return { ...p, required_docs: next };
                                        })
                                    }
                                    disabled={disabled}
                                />
                            </TableCell>

                            <TableCell>
                                <Button
                                    variant="ghost"
                                    onClick={() => onRemoveRow(idx)}
                                    disabled={disabled}
                                >
                                    削除
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}

                    {!draft.required_docs.length && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-muted-foreground">
                                行追加で必要書類を登録できます
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
