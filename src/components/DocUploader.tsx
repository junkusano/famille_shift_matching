// ===============================
// components/DocUploader.tsx
// ===============================
// 汎用コンポーネント: JSONBカラムを使ったファイルUpload/削除/表示/更新
// - 資格証, その他書類, CS書類などすべてに対応
// - propsで columnName / docCategory / title を指定
// - JSON構造は {id,url,label,type,mimeType,uploaded_at,acquired_at}

import React, { useMemo, useState } from "react";
import Image from "next/image";

export type DocItem = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at: string;
  acquired_at: string;
};

export type DocMaster = { [category: string]: string[] };

export type DocUploaderProps = {
  value: DocItem[];
  onChange: (next: DocItem[]) => void;
  docMaster: DocMaster;
  docCategory: string;        // user_doc_master.category （例: "certificate" | "other" | "cs_doc"）
  uploadApiPath?: string;
  title?: string;
};

export default function DocUploader({
  value,
  onChange,
  docMaster,
  docCategory,
  uploadApiPath = "/api/upload",
  title = "書類アップロード",
}: DocUploaderProps) {
  const [acquiredRaw, setAcquiredRaw] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo<DocItem[]>(() => {
    const arr = Array.isArray(value) ? value : [];
    return arr.map((d) => ({
      id: d.id ?? crypto.randomUUID(),
      url: d.url ?? null,
      label: d.label,
      type: d.type ?? docCategory,
      mimeType: d.mimeType ?? null,
      uploaded_at: d.uploaded_at ?? new Date().toISOString(),
      acquired_at: d.acquired_at ?? d.uploaded_at ?? new Date().toISOString(),
    }));
  }, [value, docCategory]);

  const uploadFileViaApi = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("filename", `${Date.now()}_${file.name}`);
    const res = await fetch(uploadApiPath, { method: "POST", body: form });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const json = await res.json();

    const lower = file.name.toLowerCase();
    const guessed = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
      ? "image/jpeg"
      : null;

    const mimeType = (file.type || json.mimeType || guessed || null) as string | null;
    return { url: json.url as string, mimeType };
  };

  const parseAcquired = (raw?: string | null) => {
    const s = (raw ?? "").replace(/\D/g, "");
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00+09:00`;
    if (/^\d{6}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-01T00:00:00+09:00`;
    return new Date().toISOString();
  };

  const formatAcquired = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return day === "01" ? `${y}/${m}` : `${y}/${m}/${day}`;
  };

  const handleReplace = async (id: string, file: File) => {
    setBusyId(id);
    try {
      const { url, mimeType } = await uploadFileViaApi(file);
      const next = list.map((a) => (a.id === id ? { ...a, url, mimeType, uploaded_at: new Date().toISOString() } : a));
      onChange(next);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const next = list.filter((a) => a.id !== id);
    onChange(next);
  };

  const handleAdd = async (file: File) => {
    const label = (useCustom ? newLabel : newLabel).trim();
    if (!label) {
      alert("書類名を選択または入力してください");
      return;
    }
    setBusyId("__new__");
    try {
      const { url, mimeType } = await uploadFileViaApi(file);
      const now = new Date().toISOString();
      const item: DocItem = {
        id: crypto.randomUUID(),
        url,
        mimeType,
        type: docCategory,
        label,
        uploaded_at: now,
        acquired_at: parseAcquired(acquiredRaw),
      };
      onChange([...list, item]);
      setAcquiredRaw("");
      setNewLabel("");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>

      {list.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {list.map((doc) => (
            <div key={doc.id} className="border rounded p-2 bg-white">
              <Thumb title={`${doc.label ?? doc.type ?? "doc"}（取得: ${formatAcquired(doc.acquired_at)}）`} src={doc.url ?? undefined} mimeType={doc.mimeType ?? undefined} />
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
                      void handleReplace(doc.id, f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button className="px-2 py-1 border rounded text-xs" onClick={() => handleDelete(doc.id)} disabled={busyId !== null}>
                  削除
                </button>
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
            value={useCustom ? "__custom__" : newLabel || ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") {
                setUseCustom(true);
                setNewLabel("");
              } else {
                setUseCustom(false);
                setNewLabel(v);
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
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
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
                void handleAdd(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <div className="text-xs text-gray-500 mt-1">区分：{docCategory}（マスタから選択。必要に応じてカスタム入力も可能）</div>
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
  const fileIdMatch = src.match(/[-\w]{25,}/);
  const fileId = fileIdMatch ? fileIdMatch[0] : null;
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
