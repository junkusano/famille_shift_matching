// components/assessment/ElderCareAssessmentForm.tsx
"use client";

import type { AssessmentContent } from "@/types/assessment";

type ChoiceOption = { value: string; label: string };

type ElderCareRow = {
  key: string;
  label: string;
  check: "NONE" | "CIRCLE";
  remark: string;
  hope: string;
  inputType?: "text" | "textarea" | "radio" | "checkbox" | "number" | "date";
  value?: string;
  defaultValue?: string;
  options?: ChoiceOption[];
  unit?: string;
  placeholder?: string;
  group?: string;
  width?: "full" | "half" | "third" | "quarter";
};

type ElderCareSheet = {
  key: string;
  title: string;
  printTarget: boolean;
  rows: ElderCareRow[];
  layout?:
    | "basic-information"
    | "service-frequency"
    | "housing"
    | "health"
    | "special"
    | "adl"
    | "cognition";
};

type Props = {
  content: AssessmentContent;
  onChange: (content: AssessmentContent) => void;
};

function getGroupTitle(group: string) {
  const titles: Record<string, string> = {
    reception: "受付情報",
    client: "利用者情報",
    assessment: "アセスメント情報",
    certification: "要介護認定",
    independence: "日常生活自立度",
    family_1: "家族・主たる介護者 1",
    family_2: "家族・主たる介護者 2",
    consultation: "生活状況・相談内容",
    home_service: "訪問系サービス",
    day_service: "通所系サービス",
    short_stay: "短期入所サービス",
    equipment: "福祉用具・住宅改修",
    other: "その他のサービス",
    home: "住居形態",
    room: "居室・寝具",
    toilet: "トイレ",
    bath: "浴室・入浴",
    movement: "移動手段",
    note: "特記事項",
    medical_history: "既往歴・現症",
    body: "身体情報",
    oral: "口腔・歯の状況",
    skin: "皮膚・じょくそう",
    doctor_opinion: "医師の意見",
    risk: "発生リスクと対処方針",
    outlook: "生活機能の見通し",
    medical_management: "医学的管理",
    medical_caution: "医学的留意事項",
    infection: "感染症",
    summary: "まとめ",
    necessity: "対応の必要性",
    movement_meal: "移動・食事",
    toileting: "排泄",
    clean_clothing: "清潔・更衣",
    iadl: "IADL",
    cognition: "認知機能",
    behavior: "行動・心理症状",
    communication: "コミュニケーション",
    social: "社会との関わり",
  };
  return titles[group] ?? group;
}

function groupRows(rows: ElderCareRow[]) {
  const grouped = new Map<string, ElderCareRow[]>();
  rows.forEach((row) => {
    const key = row.group?.trim() || "other";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  return Array.from(grouped.entries());
}

export default function ElderCareAssessmentForm({ content, onChange }: Props) {
  const sheets = (content.sheets ?? []) as unknown as ElderCareSheet[];

  function updateRow(sheetKey: string, rowKey: string, updater: (row: ElderCareRow) => ElderCareRow) {
    const nextSheets = sheets.map((sheet) =>
      sheet.key !== sheetKey
        ? sheet
        : { ...sheet, rows: sheet.rows.map((row) => (row.key === rowKey ? updater(row) : row)) },
    );
    onChange({ ...content, sheets: nextSheets } as unknown as AssessmentContent);
  }

  function setTextValue(sheetKey: string, rowKey: string, value: string) {
    updateRow(sheetKey, rowKey, (row) => ({ ...row, remark: value, value }));
  }

  function setHope(sheetKey: string, rowKey: string, value: string) {
    updateRow(sheetKey, rowKey, (row) => ({ ...row, hope: value }));
  }

  function setChoiceValue(sheetKey: string, rowKey: string, value: string) {
    updateRow(sheetKey, rowKey, (row) => ({
      ...row,
      value,
      check: value === "00" || value === "" ? "NONE" : "CIRCLE",
    }));
  }

  function setPrintTarget(sheetKey: string, printTarget: boolean) {
    const nextSheets = sheets.map((sheet) =>
      sheet.key === sheetKey ? { ...sheet, printTarget } : sheet,
    );
    onChange({ ...content, sheets: nextSheets } as unknown as AssessmentContent);
  }

  function renderRadioField(sheetKey: string, row: ElderCareRow) {
    const options = Array.isArray(row.options) ? row.options : [];
    const currentValue = String(row.value ?? row.defaultValue ?? "00");

    return (
      <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1.5">
        {options.map((option) => (
          <label key={option.value} className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs text-gray-900">
            <input
              type="radio"
              name={`${sheetKey}_${row.key}`}
              value={option.value}
              checked={currentValue === option.value}
              onChange={(event) => setChoiceValue(sheetKey, row.key, event.target.value)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  function renderTextField(sheetKey: string, row: ElderCareRow) {
    const currentValue = String(row.value ?? row.remark ?? "");
    const inputType = row.inputType ?? "textarea";

    if (inputType === "textarea") {
      return (
        <textarea
          className="min-h-[76px] w-full resize-y rounded-none border border-gray-400 bg-white px-2 py-1.5 text-sm leading-5 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-300"
          value={currentValue}
          placeholder={row.placeholder ?? ""}
          onChange={(event) => setTextValue(sheetKey, row.key, event.target.value)}
        />
      );
    }

    return (
      <div className="flex items-center gap-2">
        <input
          type={inputType === "number" ? "number" : inputType === "date" ? "date" : "text"}
          className="min-h-8 min-w-0 flex-1 rounded-none border border-gray-400 bg-white px-2 py-1 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-300"
          value={currentValue}
          placeholder={row.placeholder ?? ""}
          onChange={(event) => setTextValue(sheetKey, row.key, event.target.value)}
        />
        {row.unit ? <span className="shrink-0 text-xs text-gray-700">{row.unit}</span> : null}
      </div>
    );
  }

  function renderRow(sheetKey: string, row: ElderCareRow) {
    const isRadio = row.inputType === "radio" && Array.isArray(row.options);
    const showHopeField = row.inputType === "textarea" || Boolean(row.hope?.trim());

    return (
      <tr key={row.key} className="break-inside-avoid">
        <th className="w-[190px] border-b border-r border-gray-300 bg-gray-50 px-2 py-2 text-left align-middle text-xs font-semibold text-gray-900">
          {row.label}
        </th>
        <td className="border-b border-r border-gray-300 bg-white px-2 py-2 align-middle">
          {isRadio ? renderRadioField(sheetKey, row) : renderTextField(sheetKey, row)}
        </td>
        <td className="w-[240px] border-b border-gray-300 bg-amber-50/40 px-2 py-2 align-middle">
          {showHopeField ? (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-gray-600">本人・家族の希望・要望</div>
              <textarea
                className="min-h-[58px] w-full resize-y rounded-none border border-gray-300 bg-white px-2 py-1.5 text-xs leading-5 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-300"
                value={row.hope ?? ""}
                onChange={(event) => setHope(sheetKey, row.key, event.target.value)}
              />
            </div>
          ) : (
            <span className="text-xs text-gray-400">－</span>
          )}
        </td>
      </tr>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="border border-yellow-300 bg-yellow-50 p-4">
        <div className="font-semibold text-yellow-900">介護アセスメント項目がありません</div>
        <div className="mt-1 text-sm text-yellow-800">新しい介護テンプレートで再作成または自動生成してください。</div>
      </div>
    );
  }

  return (
    <div className="assessment-page text-[13px] text-gray-900">
      <div className="mb-3 border-t-[3px] border-amber-500 border-b border-gray-300 bg-white px-3 py-2">
        <div className="text-lg font-bold">介護保険アセスメント</div>
        <div className="mt-0.5 text-xs text-gray-600">要介護・要支援用のアセスメント様式</div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
        <nav className="no-print sticky top-3 hidden overflow-hidden border border-gray-300 bg-white xl:block">
          <div className="border-b border-gray-300 bg-gray-100 px-3 py-2 text-xs font-bold">管理情報・項目一覧</div>
          {sheets.map((sheet) => (
            <button
              key={sheet.key}
              type="button"
              className="block w-full border-b border-gray-200 px-3 py-2 text-left text-xs hover:bg-amber-50"
              onClick={() => document.getElementById(`elder-sheet-${sheet.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              ■ {sheet.title}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {sheets.map((sheet) => {
            const groupedRows = groupRows(sheet.rows ?? []);
            return (
              <section id={`elder-sheet-${sheet.key}`} key={sheet.key} className="scroll-mt-3 overflow-hidden border border-gray-400 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-400 bg-gray-100 px-3 py-2">
                  <h2 className="text-sm font-bold">■ {sheet.title}</h2>
                  <div className="no-print flex items-center gap-3 text-xs">
                    <span className="text-gray-600">印刷対象</span>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name={`elder_print_${sheet.key}`} checked={sheet.printTarget === true} onChange={() => setPrintTarget(sheet.key, true)} />
                      対象
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name={`elder_print_${sheet.key}`} checked={sheet.printTarget === false} onChange={() => setPrintTarget(sheet.key, false)} />
                      対象外
                    </label>
                  </div>
                </div>

                {groupedRows.map(([groupKey, rows]) => (
                  <div key={`${sheet.key}_${groupKey}`} className="break-inside-avoid-page">
                    <div className="border-b border-gray-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800">
                      {getGroupTitle(groupKey)}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] table-fixed border-collapse">
                        <tbody>{rows.map((row) => renderRow(sheet.key, row))}</tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}