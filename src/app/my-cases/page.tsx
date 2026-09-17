import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function getStatusLabel(status: string) {
  switch (status) {
    case 'approved':
      return '已公開'
    case 'needs_revision':
      return '需修改'
    case 'rejected':
      return '未通過'
    case 'deleted':
      return '已移除'
    default:
      return '審核中'
  }
}

export default async function MyCasesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select(`
      id,
      public_case_id,
      model,
      model_year,
      moderation_status,
      created_at,
      updated_at
    `)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between gap-6">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← 回首頁
            </Link>

            <h1 className="mt-4 text-3xl font-semibold text-gray-950">
              我的案件
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              查看自己提交的案例，以及後續審核與更新狀態。
            </p>
          </div>

          <Link
            href="/my-cases/new"
            className="rounded-xl bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800"
          >
            ＋ 建立案例
          </Link>
        </div>

        {error && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            讀取案件時發生錯誤：{error.message}
          </div>
        )}

        {!error && (!vehicles || vehicles.length === 0) && (
          <section className="mt-10 rounded-3xl border border-dashed border-gray-300 bg-white px-8 py-16 text-center">
            <h2 className="text-lg font-semibold text-gray-950">
              目前還沒有案件
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              建立第一筆 Lexus NX 電子門鎖案例後，
              你可以隨時回到這裡查看與更新進度。
            </p>

            <Link
              href="/my-cases/new"
              className="mt-6 inline-flex rounded-xl bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800"
            >
              ＋ 建立第一筆案例
            </Link>
          </section>
        )}

        {!error && vehicles && vehicles.length > 0 && (
          <div className="mt-10 grid gap-4">
            {vehicles.map((vehicle) => (
              <article
                key={vehicle.id}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      {vehicle.public_case_id}
                    </p>

                    <h2 className="mt-1 text-xl font-semibold text-gray-950">
                      {vehicle.model_year} {vehicle.model}
                    </h2>

                    <p className="mt-3 text-sm text-gray-500">
                      建立日期：
                      {new Date(vehicle.created_at).toLocaleDateString('zh-TW')}
                    </p>
                  </div>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                    {getStatusLabel(vehicle.moderation_status)}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  {['pending', 'needs_revision'].includes(
                    vehicle.moderation_status
                  ) && (
                    <Link
                      href={`/my-cases/${vehicle.public_case_id}/edit`}
                      className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      修改案件
                    </Link>
                  )}

                  {vehicle.moderation_status === 'approved' && (
                    <>
                      <Link
                        href={`/my-cases/${vehicle.public_case_id}/request-edit`}
                        className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                      >
                        申請修改
                      </Link>

                      <Link
                        href={`/my-cases/${vehicle.public_case_id}/request-archive`}
                        className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        申請下架
                      </Link>
                    </>
                  )}

                  <Link
                    href={`/my-cases/${vehicle.public_case_id}`}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                  >
                    查看案件
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
