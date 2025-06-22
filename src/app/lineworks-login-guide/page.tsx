export default function LineworksLoginGuide() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">LINE WORKS 初回ログインガイド</h1>
      <p>このページでは、LINE WORKS のアプリインストールと初回ログインの流れを説明します。</p>

      <div className="flex gap-4">
        <a
          href="https://apps.apple.com/jp/app/line-works/id1109684173"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/appstore-badge.png" alt="App Store からダウンロード" width={150} />
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.worksmobile.enterprise.office&hl=ja&gl=US"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/googleplay-badge.png" alt="Google Play で手に入れよう" width={150} />
        </a>
      </div>

      <section>
        <h2 className="text-xl font-semibold mt-4">初回ログイン手順</h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">1️⃣ アプリ起動後、ログインを選択</h3>
            <img
              src="/lineworks-login-step1.JPG"
              alt="ログイン画面"
              className="w-full max-w-md"
            />
          </div>

          <div>
            <h3 className="font-semibold">2️⃣ アクセス許可画面で「次へ」</h3>
            <img
              src="/lineworks-login-step2.JPG"
              alt="アクセス許可画面"
              className="w-full max-w-md"
            />
          </div>

          <div>
            <h3 className="font-semibold">3️⃣ ID・初期パスワードを入力</h3>
            <img
              src="/lineworks-login-step3.JPG"
              alt="IDとパスワード入力画面"
              className="w-full max-w-md"
            />
          </div>
        </div>
      </section>

      <p className="mt-4">ログイン後、パスワード変更を行い、安全にご利用ください。</p>

      <div className="mt-6">
        <a
          href="/lineworks-login-manu.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
        >
          詳細マニュアル（PDFダウンロード）
        </a>
      </div>
    </div>
  );
}
