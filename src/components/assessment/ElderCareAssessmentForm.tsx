//components/assessment/ElderCareAssessmentForm.tsx
"use client";

import type { AssessmentContent } from "@/types/assessment";

type ChoiceOption = {
  value: string;
  label: string;
};

type ElderCareRow = {
  key: string;
  label: string;
  check: "NONE" | "CIRCLE";
  remark: string;
  hope: string;

  inputType?:
    | "text"
    | "textarea"
    | "radio"
    | "checkbox"
    | "number"
    | "date";

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

function getWidthClass(width: ElderCareRow["width"]) {
  switch (width) {
    case "quarter":
      return "md:col-span-3";
    case "third":
      return "md:col-span-4";
    case "half":
      return "md:col-span-6";
    case "full":
    default:
      return "md:col-span-12";
  }
}

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
    const groupKey = row.group?.trim() || "other";

    const currentRows = grouped.get(groupKey) ?? [];
    currentRows.push(row);
    grouped.set(groupKey, currentRows);
  });

  return Array.from(grouped.entries());
}

export default function ElderCareAssessmentForm({
  content,
  onChange,
}: Props) {
  const sheets = (content.sheets ?? []) as unknown as ElderCareSheet[];

  function updateRow(
    sheetKey: string,
    rowKey: string,
    updater: (row: ElderCareRow) => ElderCareRow,
  ) {
    const nextSheets = sheets.map((sheet) => {
      if (sheet.key !== sheetKey) {
        return sheet;
      }

      return {
        ...sheet,
        rows: sheet.rows.map((row) => {
          if (row.key !== rowKey) {
            return row;
          }

          return updater(row);
        }),
      };
    });

    onChange({
      ...content,
      sheets: nextSheets,
    } as unknown as AssessmentContent);
  }

  function setTextValue(
    sheetKey: string,
    rowKey: string,
    value: string,
  ) {
    updateRow(sheetKey, rowKey, (row) => ({
      ...row,

      /*
       * 従来のAI自動生成・プラン生成処理との互換性を保つため、
       * 文章入力はremarkに保存します。
       */
      remark: value,
      value,
    }));
  }

  function setHope(
    sheetKey: string,
    rowKey: string,
    value: string,
  ) {
    updateRow(sheetKey, rowKey, (row) => ({
      ...row,
      hope: value,
    }));
  }

  function setChoiceValue(
    sheetKey: string,
    rowKey: string,
    value: string,
  ) {
    updateRow(sheetKey, rowKey, (row) => ({
      ...row,
      value,
      check: value === "00" || value === "" ? "NONE" : "CIRCLE",
    }));
  }

  function setPrintTarget(
    sheetKey: string,
    printTarget: boolean,
  ) {
    const nextSheets = sheets.map((sheet) =>
      sheet.key === sheetKey
        ? {
            ...sheet,
            printTarget,
          }
        : sheet,
    );

    onChange({
      ...content,
      sheets: nextSheets,
    } as unknown as AssessmentContent);
  }

  function renderRadioField(
    sheetKey: string,
    row: ElderCareRow,
  ) {
    const options = Array.isArray(row.options) ? row.options : [];

    const currentValue = String(
      row.value ?? row.defaultValue ?? "00",
    );

    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={[
              "inline-flex cursor-pointer items-center gap-1.5",
              "rounded border px-2.5 py-1.5 text-sm",
              currentValue === option.value
                ? "border-blue-500 bg-blue-50 font-medium"
                : "border-gray-300 bg-white",
            ].join(" ")}
          >
            <input
              type="radio"
              name={`${sheetKey}_${row.key}`}
              value={option.value}
              checked={currentValue === option.value}
              onChange={(event) =>
                setChoiceValue(
                  sheetKey,
                  row.key,
                  event.target.value,
                )
              }
            />

            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  function renderTextField(
    sheetKey: string,
    row: ElderCareRow,
  ) {
    const currentValue = String(
      row.value ?? row.remark ?? "",
    );

    const inputType = row.inputType ?? "textarea";

    if (inputType === "textarea") {
      return (
        <textarea
          className={[
            "mt-2 min-h-[100px] w-full rounded border",
            "border-gray-300 bg-white px-3 py-2",
            "text-sm leading-6",
          ].join(" ")}
          value={currentValue}
          placeholder={row.placeholder ?? ""}
          onChange={(event) =>
            setTextValue(
              sheetKey,
              row.key,
              event.target.value,
            )
          }
        />
      );
    }

    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          type={
            inputType === "number"
              ? "number"
              : inputType === "date"
                ? "date"
                : "text"
          }
          className={[
            "min-w-0 flex-1 rounded border border-gray-300",
            "bg-white px-3 py-2 text-sm",
          ].join(" ")}
          value={currentValue}
          placeholder={row.placeholder ?? ""}
          onChange={(event) =>
            setTextValue(
              sheetKey,
              row.key,
              event.target.value,
            )
          }
        />

        {row.unit ? (
          <span className="shrink-0 text-sm text-gray-700">
            {row.unit}
          </span>
        ) : null}
      </div>
    );
  }

  function renderRow(
    sheetKey: string,
    row: ElderCareRow,
  ) {
    const isRadio =
      row.inputType === "radio" &&
      Array.isArray(row.options);

    const showHopeField =
      row.inputType === "textarea" ||
      Boolean(row.hope?.trim());

    return (
      <div
        key={row.key}
        className={[
          "col-span-12 rounded border border-gray-300",
          "bg-white p-3",
          getWidthClass(row.width),
        ].join(" ")}
      >
        <div className="text-sm font-semibold text-gray-800">
          {row.label}
        </div>

        {isRadio
          ? renderRadioField(sheetKey, row)
          : renderTextField(sheetKey, row)}

        {showHopeField ? (
          <div className="mt-3 border-t border-dashed pt-3">
            <label className="block text-xs font-medium text-gray-600">
              本人・家族の希望・要望
            </label>

            <textarea
              className={[
                "mt-1 min-h-[70px] w-full rounded border",
                "border-gray-300 bg-gray-50 px-3 py-2 text-sm",
              ].join(" ")}
              value={row.hope ?? ""}
              onChange={(event) =>
                setHope(
                  sheetKey,
                  row.key,
                  event.target.value,
                )
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="rounded border border-yellow-300 bg-yellow-50 p-4">
        <div className="font-semibold text-yellow-900">
          介護アセスメント項目がありません
        </div>

        <div className="mt-1 text-sm text-yellow-800">
          新しい介護テンプレートで再作成または自動生成してください。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-blue-200 bg-blue-50 p-4">
        <div className="font-bold text-blue-950">
          介護保険アセスメント
        </div>

        <div className="mt-1 text-sm text-blue-900">
          要介護・要支援用のアセスメント様式です。
        </div>
      </div>

      {sheets.map((sheet) => {
        const groupedRows = groupRows(sheet.rows ?? []);

        return (
          <section
            key={sheet.key}
            className="overflow-hidden rounded border border-gray-300 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-100 px-4 py-3">
              <h2 className="text-base font-bold text-gray-900">
                {sheet.title}
              </h2>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-600">
                  印刷対象
                </span>

                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name={`elder_print_${sheet.key}`}
                    checked={sheet.printTarget === true}
                    onChange={() =>
                      setPrintTarget(sheet.key, true)
                    }
                  />
                  対象
                </label>

                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name={`elder_print_${sheet.key}`}
                    checked={sheet.printTarget === false}
                    onChange={() =>
                      setPrintTarget(sheet.key, false)
                    }
                  />
                  対象外
                </label>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {groupedRows.map(([groupKey, rows]) => (
                <div
                  key={`${sheet.key}_${groupKey}`}
                  className="overflow-hidden rounded border border-gray-200"
                >
                  <div className="border-b bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                    {getGroupTitle(groupKey)}
                  </div>

                  <div className="grid grid-cols-12 gap-3 p-3">
                    {rows.map((row) =>
                      renderRow(sheet.key, row),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}