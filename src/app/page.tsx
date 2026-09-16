import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="rounded-3xl bg-white p-10 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Lexus NX 車主案例觀察平台
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950">
              NX Door Watch
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-600">
              蒐集 Lexus NX 電子門鎖相關案例、維修進度與車主回報，
              讓公開資料更容易被整理與理解。
            </p>

            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex rounded-xl bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800"
              >
                使用 Google 登入
              </Link>
            </div>

            <p className="mt-6 text-sm text-gray-500">
              公開案例與 Dashboard 不需要登入即可查看。
            </p>
          </div>
        </div>
      </main>
    )
  }

  const { data: adminStatus } = await supabase.rpc('is_admin')

  const isAdmin = adminStatus === true

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Lexus NX 車主案例觀察平台
            </p>

            <h1 className="mt-1 text-3xl font-semibold text-gray-950">
              NX Door Watch
            </h1>
          </div>

          <div className="rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
            已登入
          </div>
        </header>

        <section className="mt-10 rounded-3xl bg-white p-8 shadow-sm">
          <p className="text-sm text-gray-500">目前登入帳號</p>

          <p className="mt-1 font-medium text-gray-950">
            {user.email ?? 'Google 使用者'}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              身分：{isAdmin ? '管理員' : '車主'}
            </span>

            {isAdmin && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                Admin
              </span>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/my-cases"
              className="rounded-xl bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              我的案件
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-medium text-gray-900 hover:bg-gray-50"
              >
                管理後台
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
