// /types/shift-record-def.ts
export type ShiftRecordCategoryL = {
  id: string; code: string; name: string; sort_order: number; active: boolean;
};
export type ShiftRecordCategoryS = {
  id: string; l_id: string; code: string; name: string; sort_order: number; active: boolean;
};
export type ShiftRecordItemDef = {
  id: string;
  l_id: string | null;
  s_id: string | null;
  code: string;
  label: string;
  input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display";
  unit: string | null;
  required: boolean;
  sort_order: number;
  active: boolean;
  options: Record<string, unknown>;
};