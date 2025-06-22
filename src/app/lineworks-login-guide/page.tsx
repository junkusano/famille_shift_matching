import Image from 'next/image';
import Link from 'next/link';

export default function LineworksLoginGuidePage() {
  return (
    <div className="guide-content mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">LINE WORKS ログインガイド</h1>

      <p className="mb-4">初回ログイン方法やアプリのインストール手順をご案内します。</p>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">アプリをインストール</h2>
          <div className="store-badges flex gap-4 items-center">
            <Image
              src="/appstore-badge.png"
              alt="App Store"
              width={160}
              height={50}
            />
            <Image
              src="/googleplay-badge.png"
              alt="Google Play"
              width={160}
              height={50}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">ログイン手順</h2>
          <div className="space-y-4">
            <Image
              src="/lineworks-login-step1.JPG"
              alt="ログインステップ1"
              width={600}
              height={400}
              className="rounded border"
            />
            <Image
              src="/lineworks-login-step2.JPG"
              alt="ログインステップ2"
              width={600}
              height={400}
              className="rounded border"
            />
            <Image
              src="/lineworks-login-step3.JPG"
              alt="ログインステップ3"
              width={600}
              height={400}
              className="rounded border"
            />
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">詳細マニュアル</h2>
          <p>より詳しい情報は以下のPDFをご覧ください。</p>
          <Link
            href="/lineworks-login-manu.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            マニュアルPDFを表示・ダウンロード
          </Link>
        </div>
      </div>
    </div>
  );
}
