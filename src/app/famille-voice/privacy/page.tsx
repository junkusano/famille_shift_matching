import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'famille Voice プライバシーポリシー | 合同会社施恩',
  description: 'famille Voice における個人情報および録音・文字起こしデータの取扱いについて。',
};

const updatedAt = '2026年9月25日';

export default function FamilleVoicePrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fffdf8] px-4 py-10 text-slate-800 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dce9df] sm:p-10">
        <p className="mb-2 text-sm font-semibold tracking-wide text-[#4b8f55]">famille Voice</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#244534]">プライバシーポリシー</h1>
        <p className="mt-3 text-sm text-slate-600">最終更新日：{updatedAt}</p>

        <div className="mt-8 space-y-8 leading-7">
          <section>
            <h2 className="text-xl font-bold text-[#244534]">1. 基本方針</h2>
            <p className="mt-3">合同会社施恩（以下「当社」）は、職員向け音声記録アプリ「famille Voice」（以下「本アプリ」）において取り扱う個人情報、録音データおよび文字起こしデータを適切に管理します。本アプリは、当社および関係事業所の許可を受けた職員による業務利用を目的としています。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">2. 取得・取り扱う情報</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>ログインに必要なメールアドレス、ユーザーIDおよび所属情報</li>
              <li>録音日時、録音時間、ファイル名、ファイルサイズなどの録音メタデータ</li>
              <li>録音者、利用者様、会話の種類および参加者として入力・選択された情報</li>
              <li>端末のマイクから取得する音声データ</li>
              <li>ユーザーが明示的に文字起こしを実行した場合の文字起こし原文</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">3. 利用目的</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>本人確認、アクセス制御および本アプリの提供</li>
              <li>介護・相談支援等の業務上の会話、会議および連絡の記録管理</li>
              <li>ユーザーが選択した録音の文字起こし処理および文字起こし結果の保存・表示</li>
              <li>不正利用の防止、障害対応および本アプリの改善</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">4. 録音データと文字起こしの取扱い</h2>
            <p className="mt-3">録音ファイルは原則として利用端末内に保存されます。ユーザーが文字起こしを実行した録音に限り、文字起こし処理のため音声データを当社が利用する処理基盤へ一時的に送信します。音声ファイルを当社サーバーへ恒久保存することは原則として行いません。</p>
            <p className="mt-3">文字起こし処理には、Supabase のクラウド基盤および OpenAI の音声文字起こしサービスを利用します。文字起こし原文、録音メタデータおよび処理状況は、業務記録としてSupabase上に保存されます。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">5. 第三者提供・委託</h2>
            <p className="mt-3">当社は、本アプリの提供、認証、データ保存および文字起こし処理に必要な範囲で、SupabaseおよびOpenAIを含むサービス提供事業者を利用します。法令に基づく場合を除き、これらの目的以外で個人情報を第三者へ販売または提供しません。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">6. 安全管理とアクセス制御</h2>
            <p className="mt-3">本アプリでは、認証済みの利用者のみが情報へアクセスできるようにし、録音者本人のみの閲覧を指定した録音については、当該指定に応じたアクセス制御を行います。端末の紛失・盗難を含むリスクに備え、端末自体にも適切な画面ロック等を設定してください。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">7. 保存期間・削除</h2>
            <p className="mt-3">端末内の録音は、利用者が削除でき、保護設定および保存期限の情報を確認できます。文字起こし原文および業務上必要なメタデータは、当社の業務運用および法令上の必要性に応じて保存・管理します。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">8. 本ポリシーの変更</h2>
            <p className="mt-3">当社は、法令、サービス内容または運用の変更に応じて、本ポリシーを改定することがあります。重要な変更がある場合は、本ページまたは本アプリ上でお知らせします。</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-[#244534]">9. お問い合わせ先</h2>
            <p className="mt-3">本ポリシーおよび個人情報の取扱いに関するお問い合わせは、合同会社施恩の<a className="ml-1 font-semibold text-[#347b43] underline underline-offset-2" href="https://www.shi-on.net/#contact">お問い合わせ窓口</a>からご連絡ください。</p>
          </section>
        </div>
      </article>
    </main>
  );
}
