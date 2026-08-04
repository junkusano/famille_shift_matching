"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type TaimeeJobSetting = {
  id: string;
  setting_key: string;
  setting_name: string;
  offer_id: string;
  work_weekday: number;
  work_start_time: string;
  work_end_time: string;
  open_weekday: number;
  open_time: string;
  hourly_wage: number;
  headcount: number;
  environment: "test" | "production";
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  detail?: string;
  settings?: TaimeeJobSetting[];
  setting?: TaimeeJobSetting;
};

const WEEKDAYS = [
  { value: 0, label: "日曜日" },
  { value: 1, label: "月曜日" },
  { value: 2, label: "火曜日" },
  { value: 3, label: "水曜日" },
  { value: 4, label: "木曜日" },
  { value: 5, label: "金曜日" },
  { value: 6, label: "土曜日" },
];

function toTimeInputValue(value: string): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

function normalizeSetting(
  setting: TaimeeJobSetting
): TaimeeJobSetting {
  return {
    ...setting,
    work_start_time: toTimeInputValue(
      setting.work_start_time
    ),
    work_end_time: toTimeInputValue(
      setting.work_end_time
    ),
    open_time: toTimeInputValue(
      setting.open_time
    ),
  };
}

export default function TaimeeJobSettingsPage() {
  const [settings, setSettings] = useState<
    TaimeeJobSetting[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<
    string | null
  >(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/admin/taimee-job-settings",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ??
            "タイミー求人設定の取得に失敗しました。"
        );
      }

      const loadedSettings = (
        result.settings ?? []
      ).map(normalizeSetting);

      setSettings(loadedSettings);
    } catch (error) {
      console.error(
        "[taimee-job-settings-page] load failed",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "タイミー求人設定の取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasSettings = useMemo(
    () => settings.length > 0,
    [settings]
  );

  function updateSetting<K extends keyof TaimeeJobSetting>(
    id: string,
    key: K,
    value: TaimeeJobSetting[K]
  ) {
    setSettings((current) =>
      current.map((setting) =>
        setting.id === id
          ? {
              ...setting,
              [key]: value,
            }
          : setting
      )
    );

    setSuccessMessage("");
  }

  async function saveSetting(
    setting: TaimeeJobSetting
  ) {
    setSavingId(setting.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/taimee-job-settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: setting.id,
            offer_id: setting.offer_id,
            work_weekday:
              setting.work_weekday,
            work_start_time:
              setting.work_start_time,
            work_end_time:
              setting.work_end_time,
            open_weekday:
              setting.open_weekday,
            open_time: setting.open_time,
            hourly_wage:
              setting.hourly_wage,
            headcount: setting.headcount,
            environment:
              setting.environment,
            is_enabled:
              setting.is_enabled,
          }),
        }
      );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.detail
            ? `${result.message ?? "保存に失敗しました。"} ${result.detail}`
            : result.message ??
                "タイミー求人設定の保存に失敗しました。"
        );
      }

      if (result.setting) {
        const savedSetting = normalizeSetting(
          result.setting
        );

        setSettings((current) =>
          current.map((item) =>
            item.id === savedSetting.id
              ? savedSetting
              : item
          )
        );
      }

      setSuccessMessage(
        `${setting.setting_name}の設定を保存しました。`
      );
    } catch (error) {
      console.error(
        "[taimee-job-settings-page] save failed",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "タイミー求人設定の保存に失敗しました。"
      );
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold text-slate-900">
            タイミー求人オープン設定
          </h1>

          <p className="mt-4 text-sm text-slate-600">
            設定を読み込んでいます。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            タイミー求人オープン設定
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            無資格タイミー・無資格マネージャーの
            求人条件を管理します。
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {!hasSettings ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            タイミー求人設定が登録されていません。
          </div>
        ) : (
          <div className="space-y-6">
            {settings.map((setting) => {
              const isSaving =
                savingId === setting.id;

              return (
                <section
                  key={setting.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {setting.setting_name}
                        </h2>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            setting.is_enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {setting.is_enabled
                            ? "有効"
                            : "無効"}
                        </span>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            setting.environment ===
                            "production"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {setting.environment ===
                          "production"
                            ? "本番"
                            : "テスト"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        設定キー：
                        {setting.setting_key}
                      </p>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={
                          setting.is_enabled
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "is_enabled",
                            event.target.checked
                          )
                        }
                        className="h-5 w-5 rounded border-slate-300"
                      />
                      求人オープンを有効にする
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block xl:col-span-2">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        オファーID・テンプレートUUID
                      </span>

                      <input
                        type="text"
                        value={setting.offer_id}
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "offer_id",
                            event.target.value
                          )
                        }
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        実行環境
                      </span>

                      <select
                        value={
                          setting.environment
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "environment",
                            event.target.value as
                              | "test"
                              | "production"
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      >
                        <option value="test">
                          テスト
                        </option>
                        <option value="production">
                          本番
                        </option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        求人の曜日
                      </span>

                      <select
                        value={
                          setting.work_weekday
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "work_weekday",
                            Number(
                              event.target.value
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      >
                        {WEEKDAYS.map(
                          (weekday) => (
                            <option
                              key={weekday.value}
                              value={weekday.value}
                            >
                              {weekday.label}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        求人開始時間
                      </span>

                      <input
                        type="time"
                        value={
                          setting.work_start_time
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "work_start_time",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        求人終了時間
                      </span>

                      <input
                        type="time"
                        value={
                          setting.work_end_time
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "work_end_time",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        オープン曜日
                      </span>

                      <select
                        value={
                          setting.open_weekday
                        }
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "open_weekday",
                            Number(
                              event.target.value
                            )
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      >
                        {WEEKDAYS.map(
                          (weekday) => (
                            <option
                              key={weekday.value}
                              value={weekday.value}
                            >
                              {weekday.label}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        オープン時間
                      </span>

                      <input
                        type="time"
                        value={setting.open_time}
                        onChange={(event) =>
                          updateSetting(
                            setting.id,
                            "open_time",
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        時給
                      </span>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={
                            setting.hourly_wage
                          }
                          onChange={(event) =>
                            updateSetting(
                              setting.id,
                              "hourly_wage",
                              Number(
                                event.target.value
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                        />

                        <span className="text-sm text-slate-600">
                          円
                        </span>
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        募集人数
                      </span>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={
                            setting.headcount
                          }
                          onChange={(event) =>
                            updateSetting(
                              setting.id,
                              "headcount",
                              Number(
                                event.target.value
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                        />

                        <span className="text-sm text-slate-600">
                          人
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      最終更新：
                      {setting.updated_at
                        ? new Date(
                            setting.updated_at
                          ).toLocaleString(
                            "ja-JP"
                          )
                        : "未更新"}
                    </p>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void saveSetting(setting)
                      }
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSaving
                        ? "保存中..."
                        : "この設定を保存"}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          オープン曜日・オープン時間は現在、
          管理用データとして保存されます。
          実際のCron実行日時は、次の共通Cron対応で反映します。
        </div>
      </div>
    </main>
  );
}