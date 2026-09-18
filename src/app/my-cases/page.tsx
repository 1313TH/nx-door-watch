import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function getStatusLabel(status: string) {
  switch (status) {
    case 'approved':
      return '✓ 已完成審核'
    case 'needs_revision':
      return '需修改'
    case 'rejected':
      return '未通過'
    case 'deleted':
      return '已移除'
    case 'pending':
      return '已公開・待審'
    default:
      return status
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
      is_primary,
      created_at,
      updated_at
    `)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const vehicleIds = vehicles?.map((vehicle) => vehicle.id) ?? []

  const { data: incidents } =
    vehicleIds.length > 0
      ? await supabase
          .from('incidents')
          .select('vehicle_id')
          .in('vehicle_id', vehicleIds)
          .neq('moderation_status', 'deleted')
      : { data: [] }

  const { data: caseReports } =
    vehicleIds.length > 0
      ? await supabase
          .from('case_reports')
          .select('vehicle_id, channel, status')
          .in('vehicle_id', vehicleIds)
          .in('status', ['submitted', 'completed'])
      : { data: [] }

  const incidentCountForVehicle = (vehicleId: string) =>
    (incidents ?? []).filter(
      (incident) => incident.vehicle_id === vehicleId
    ).length

  const reportedChannelCountForVehicle = (vehicleId: string) =>
    new Set(
      (caseReports ?? [])
        .filter(
          (report) => report.vehicle_id === vehicleId
        )
        .map((report) => report.channel)
    ).size

  const sortedVehicles = [...(vehicles ?? [])].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    )
  })

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between gap-6">
          <div>
            <Link
              href="/"
              className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-950 hover:text-white"
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
            ＋ 新增另一台車
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
            {sortedVehicles.map((vehicle) => (
              <article
                key={vehicle.id}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      {vehicle.public_case_id}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-gray-950">
                        {vehicle.model_year} {vehicle.model}
                      </h2>

                      {vehicle.is_primary && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          主要車輛
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>
                        {incidentCountForVehicle(vehicle.id)} 次紀錄
                      </span>

                      {reportedChannelCountForVehicle(vehicle.id) > 0 && (
                        <span>
                          ✓ 已正式反映{' '}
                          {reportedChannelCountForVehicle(vehicle.id)} 個管道
                        </span>
                      )}

                      <span>
                        建立日期：
                        {new Date(vehicle.created_at).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
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

                  {vehicle.moderation_status === 'approved' && (
                    <Link
                      href={`/my-cases/${vehicle.public_case_id}/new-incident`}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                    >
                      ＋ 新增紀錄
                    </Link>
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
