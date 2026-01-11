//app/singup/page.tsx
'use client'

import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-xl font-bold mb-4">ここからサインアップはできません</h1>
      <p className="text-gray-700 mb-4">
        既にサービススタッフの方は
        <Link href="/login" className="text-blue-600 underline ml-1">ログイン</Link>
        してください。
      </p>
      <p className="text-gray-700">
        これから応募される方は
        <Link href="/entry" className="text-blue-600 underline ml-1">エントリー</Link>
        ページからご登録ください。
      </p>
    </div>
  )
}
