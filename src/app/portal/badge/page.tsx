export default function FamilleBadge() {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-4 w-[350px] text-center border border-green-500">
        <div className="flex justify-start mb-2">
          <img
            src="/myfamille_logo.png"
            alt="famille ロゴ"
            width={60}
            height={60}
          />
        </div>
        <h1 className="text-xl font-bold text-green-700 mb-1">famille バッジ</h1>
        <p className="text-sm text-gray-700 mb-4">
          このバッジは、<span className="font-semibold">当事業所職員</span>であることを証明します。
        </p>

        <div className="rounded-lg border border-green-400 p-2 bg-green-50">
          <img
            src="/badge-image.png"
            alt="ファミーユ バッジ画像"
            width={150}
            height={150}
            className="mx-auto"
          />
          <p className="mt-2 text-green-800 text-sm">認定バッジ獲得</p>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-left">
          <p>ファミーユヘルパーサービス愛知</p>
          <p>所在地：〒456-0018 名古屋市熱田区新尾頭3丁目1-18 WIZ金山602</p>
          <p>電話番号：052-990-3734</p>
        </div>
      </div>
    </div>
  );
}
