import Link from 'next/link'

export default function AuthCodeErrorPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-red-600">
            登入未完成
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-gray-950">
            Google 帳號登入失敗
          </h1>

          <p className="mt-4 text-sm leading-6 text-gray-600">
            驗證連結可能已失效、被重複使用，或登入流程中途被中斷。
            請回到登入頁重新使用 Google 登入。
          </p>

          <div className="mt-6 flex gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              重新登入
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              回首頁
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
