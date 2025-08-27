// ===============================
// components/DocUploader.tsx
// ===============================
// 汎用コンポーネント: JSONBカラムを使ったファイルUpload/削除/表示/更新
// - 資格証, その他書類, CS書類などすべてに対応
// - propsで columnName / docCategory / title を指定
// - JSON構造は {id,url,label,type,mimeType,uploaded_at,acquired_at,size}

import React, { useMemo, useState } from "react";
import Image from "next/image";

// ===== 上限（Vercel考慮: 4MB）
const MAX_FILE_MB = 4;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const formatBytes = (n: number) => {
  if (!Number.isFinite(n)) return "";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let x = n;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(1)} ${u[i]}`;
};
const ensureSizeOK = (file: File) => {
  if (file.size > MAX_FILE_BYTES) {
    alert(`ファイルが大きすぎます（${formatBytes(file.size)}）。${MAX_FILE_MB}MBまでです。`);
    return false;
  }
  return true;
};

// ===== 型（uploaded_at / acquired_at は optional）
export type DocItem = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at?: string;
  acquired_at?: string;
  size?: number; // 新規アップロード時のみ保持
};

export type Attachment = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at?: string;
  acquired_at?: string;
};

export type DocMaster = { [category: string]: string[] };

export type DocUploaderProps = {
  title?: string;
  value: DocItem[];
  onChange: (next: DocItem[]) => void;
  docMaster: DocMaster;
  docCategory: string;
  uploadApiPath?: string;
  showPlaceholders?: boolean; // true: マスタ全件を“空スロット含め”表示 / false: 提出済みのみ表示
};

// ===== ユーティリティ（コンポーネント外に定義して useMemo 依存を安定化）
const extractFileId = (u?: string | null) => {
  if (!u) return null;
  const m = u.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/); // /d/<id> or ?id=<id>
  return m ? m[1] : null;
};

const stableIdOf = (d: Partial<DocItem>) =>
  d.id ?? (d.url ? `u:${extractFileId(d.url)}` : d.label ? `l:${d.label}` : undefined);

export default function DocUploader({
  value,
  onChange,
  docMaster,
  docCategory,
  uploadApiPath = "/api/upload",
  title = "書類アップロード",
  showPlaceholders = false,
}: DocUploaderProps) {
  const [acquiredRaw, setAcquiredRaw] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // ===== 正規化（安定ID、日付は埋めない）
  const list = useMemo<DocItem[]>(() => {
    const arr = Array.isArray(value) ? value : [];
    return arr.map((d) => ({
      id: stableIdOf(d) ?? crypto.randomUUID(),
      url: d.url ?? null,
      label: d.label,
      type: d.type ?? docCategory,
      mimeType: d.mimeType ?? null,
      uploaded_at: d.uploaded_at,
      acquired_at: d.acquired_at ?? d.uploaded_at,
      size: d.size,
    }));
  }, [value, docCategory]);

  // ===== API upload
  const uploadFileViaApi = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("filename", `${Date.now()}_${file.name}`);
    const res = await fetch(uploadApiPath, { method: "POST", body: form });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const json: { url?: string; mimeType?: string } = await res.json();

    const lower = file.name.toLowerCase();
    const guessed = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
      ? "image/jpeg"
      : null;

    const mimeType = (file.type || json.mimeType || guessed || null) as string | null;
    return { url: (json.url ?? "") as string, mimeType };
  };

  // ===== 日付ヘルパ
  const parseAcquired = (raw?: string | null) => {
    const s = (raw ?? "").replace(/\D/g, "");
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`;
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-01T00:00:00+09:00`;
    return undefined;
  };

  const formatAcquired = (iso?: string) => {
    if (!iso) return "未設定";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "未設定";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return day === "01" ? `${y}/${m}` : `${y}/${m}/${day}`;
  };

  // ===== 操作
  const isPlaceholderId = (id?: string) => !!id && id.startsWith("__placeholder__:");

  const handleReplace = async (id: string, file: File) => {
    if (!ensureSizeOK(file)) return;
    setBusyId(id);
    try {
      const { url, mimeType } = await uploadFileViaApi(file);
      const next = list.map((a) => (a.id === id ? { ...a, url, mimeType, size: file.size, uploaded_at: new Date().toISOString() } : a));
      onChange(next);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (id: string) => {
    const next = list.filter((a) => a.id !== id && `u:${extractFileId(a.url ?? null)}` !== id);
    onChange(next);
  };

  const labels = useMemo(
    () => (Array.isArray(docMaster?.[docCategory]) ? docMaster[docCategory] : []),
    [docMaster, docCategory]
  );

  const renderList = useMemo<DocItem[]>(() => {
    if (!showPlaceholders) return list;

    const pickBest = (cands: DocItem[]) => cands.find((c) => c.url) ?? cands.find((c) => c.uploaded_at) ?? cands[0];

    return labels.map((label) => {
      const cands = list.filter((v) => v.label === label);
      if (cands.length === 0) {
        return {
          id: `__placeholder__:${label}`,
          url: null,
          label,
          type: docCategory,
          mimeType: null,
          uploaded_at: undefined,
          acquired_at: undefined,
        } as DocItem;
      }
      return pickBest(cands);
    });
  }, [showPlaceholders, labels, list, docCategory]);

  const handleAdd = async (file: File) => {
    if (!ensureSizeOK(file)) return;
    const label = (useCustom ? customLabel : selectedLabel).trim();
    if (!label) {
      alert("書類名を選択または入力してください");
      return;
    }
    setBusyId("__new__");
    try {
      const { url, mimeType } = await uploadFileViaApi(file);
      const acquired = parseAcquired(acquiredRaw);
      const item: DocItem = {
        id: crypto.randomUUID(),
        url,
        mimeType,
        type: docCategory,
        label,
        uploaded_at: new Date().toISOString(),
        size: file.size,
        ...(acquired ? { acquired_at: acquired } : {}),
      };
      onChange([...list, item]);
      setAcquiredRaw("");
      setSelectedLabel("");
      setCustomLabel("");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddWithLabel = async (label: string, file: File) => {
    if (!ensureSizeOK(file)) return;
    setBusyId("__new__");
    try {
      const { url, mimeType } = await uploadFileViaApi(file);
      const acquired = parseAcquired(acquiredRaw);
      const item: DocItem = {
        id: crypto.randomUUID(),
        url,
        mimeType,
        type: docCategory,
        label,
        uploaded_at: new Date().toISOString(),
        size: file.size,
        ...(acquired ? { acquired_at: acquired } : {}),
      };
      onChange([...list, item]);
      setAcquiredRaw("");
    } finally {
      setBusyId(null);
    }
  };
  
  return (
    <div className="space-y-2">
      {title && <h3 className="text-lg font-semibold">{title} <span className="text-xs text-gray-500">（上限 {MAX_FILE_MB}MB）</span></h3>}

      {renderList.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {renderList.map((doc, idx) => (
            <div key={doc.id ?? `${doc.label}-${idx}`} className="border rounded p-2 bg-white">
              <Thumb
                title={`${doc.label ?? doc.type ?? "doc"}（取得: ${formatAcquired(doc.acquired_at)}${doc.size ? `・${formatBytes(doc.size)}` : ""}）`}
                src={doc.url ?? undefined}
                mimeType={doc.mimeType ?? undefined}
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="px-2 py-1 bg-blue-600 text-white rounded cursor-pointer text-xs">
                  差し替え
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={busyId !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (isPlaceholderId(doc.id)) {
                        void handleAddWithLabel(doc.label ?? docCategory, f);
                      } else {
                        void handleReplace(doc.id, f);
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {!isPlaceholderId(doc.id) && doc.url && (
                  <button
                    className="px-2 py-1 border rounded text-xs"
                    onClick={() => handleDelete(doc.id!)}
                    disabled={busyId !== null}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">まだ登録されていません。</div>
      )}

      <div className="mt-3 p-3 border rounded bg-gray-50">
        <div className="mb-2">
          <label className="block text-sm text-gray-600">取得日（YYYYMM または YYYYMMDD）</label>
          <input
            type="text"
            className="border rounded px-2 py-1 w-48"
            placeholder="例: 202508 または 20250817"
            value={acquiredRaw}
            onChange={(e) => setAcquiredRaw(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1"
            value={useCustom ? "__custom__" : selectedLabel}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") {
                setUseCustom(true);
                setSelectedLabel("");
              } else {
                setUseCustom(false);
                setSelectedLabel(v);
              }
            }}
          >
            <option value="">（書類名を選択）</option>
            {(docMaster[docCategory] ?? []).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
            <option value="__custom__">（自由入力）</option>
          </select>
          {useCustom && (
            <input
              className="border rounded px-2 py-1"
              placeholder={`例: ${docCategory}_書類名`}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
            />
          )}
          <label className="px-3 py-1 bg-green-600 text-white rounded cursor-pointer text-sm">
            アップロード
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={busyId !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!ensureSizeOK(file)) { e.currentTarget.value = ""; return; }
                void handleAdd(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div className="text-xs text-gray-500 mt-1">区分：{docCategory}（マスタから選択。必要に応じてカスタム入力も可能） / 上限 {MAX_FILE_MB}MB</div>
      </div>
    </div>
  );
}

function Thumb({ title, src, mimeType }: { title: string; src?: string; mimeType?: string | null }) {
  if (!src) {
    return (
      <div className="text-sm text-center text-gray-500">
        {title}
        <br />
        ファイルなし
      </div>
    );
  }
  const fileId = extractFileId(src);
  if (!fileId) {
    return (
      <div className="text-sm text-center text-red-500">
        {title}
        <br />
        無効なURL
      </div>
    );
  }
  const mt = (mimeType || "").toLowerCase();
  const isPdf = mt.includes("pdf");
  const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  if (isPdf) {
    return (
      <div className="text-sm text-center">
        <p className="mb-1">{title}</p>
        <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-40 border" />
        <div className="mt-2">
          <a href={`https://drive.google.com/uc?export=download&id=${fileId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            ファイルを開く
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm text-center">
      <p className="mb-1">{title}</p>
      <Image src={viewUrl} alt={title} width={320} height={192} className="w-full h-auto max-h-48 object-contain rounded border" />
      <div className="mt-2">
        <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          ファイルとして開く
        </a>
      </div>
    </div>
  );
}

// DocItem -> Attachment 変換
export const toAttachment = (d: DocItem, fallbackType = "その他"): Attachment => ({
  id: d.id,
  url: d.url,
  label: d.label,
  type: d.type ?? fallbackType,
  mimeType: d.mimeType ?? null,
  uploaded_at: d.uploaded_at,
  acquired_at: d.acquired_at,
});

// 既存の取得日ヘルパ（必要なら利用）
export const parseDocAcquired = (raw?: string | null) => {
  const s = (raw ?? "").replace(/\D/g, "");
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`;
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-01T00:00:00+09:00`;
  return new Date().toISOString();
};
export const formatDocAcquired = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return day === "01" ? `${y}/${m}` : `${y}/${m}/${day}`;
};
