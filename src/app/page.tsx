import Link from 'next/link'
import { LogoutButton } from '@/components/logout-button'
import { UserAvatar } from '@/components/user-avatar'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import AdminOwnerContact from '@/components/admin/AdminOwnerContact'

const doorLabels: Record<string, string> = {
  front_left: '左前門',
  front_right: '右前門',
  rear_left: '左後門',
  rear_right: '右後門',
}

const symptomLabels: Record<string, string> = {
  cannot_open: '車門無法開啟',
  intermittent: '偶發無法開啟',
  delay: '開門反應延遲',
  warning: '出現警告訊息',
  abnormal_sound: '異常聲響',
  other: '其他',
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // 公開統計永遠使用匿名 Client
  const publicSupabase = createPublicClient()

  const { data: vehicles, error: vehicleError } = await publicSupabase
    .from('vehicles')
    .select(`
      id,
      public_case_id,
      model,
      model_year,
      published_at
    `)
    .order('published_at', { ascending: false })

  const { data: incidents, error: incidentError } = await publicSupabase
    .from('incidents')
    .select(`
      id,
      vehicle_id,
      mileage,
      incident_date,
      door_positions,
      symptoms,
      repair_status
    `)
    .order('incident_date', { ascending: false })

  // 登入狀態只用來決定導航按鈕
  const serverSupabase = await createServerClient()

  const {
    data: { user },
  } = await serverSupabase.auth.getUser()

  let isAdmin = false

  if (user) {
    const { data } = await serverSupabase.rpc('is_admin')
    isAdmin = data === true
  }

  const publicCases = vehicles ?? []
  const publicIncidents = incidents ?? []

  const modelCount = new Set(
    publicCases.map((vehicle) => vehicle.model)
  ).size

  const doorCounts = Object.entries(doorLabels).map(([key, label]) => ({
    key,
    label,
    count: new Set(
      publicIncidents
        .filter((incident) =>
          incident.door_positions?.includes(key)
        )
        .map((incident) => incident.vehicle_id)
    ).size,
  }))

  const maxDoorCount = Math.max(
    1,
    ...doorCounts.map((door) => door.count)
  )

  const topDoor =
    [...doorCounts].sort((a, b) => b.count - a.count)[0] ?? null

  const symptomCounts = Object.entries(symptomLabels)
    .map(([key, label]) => ({
      key,
      label,
      count: new Set(
        publicIncidents
          .filter((incident) =>
            incident.symptoms?.includes(key)
          )
          .map((incident) => incident.vehicle_id)
      ).size,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)

  const latestCases = publicCases.slice(0, 5)

  const hasPublicError = vehicleError || incidentError

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Lexus NX 電子門案例觀察平台
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">
              NX Door Watch
            </h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/cases"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
            >
              公開案例
            </Link>

            {user ? (
              <>
                <Link
                  href="/my-cases"
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
                >
                  我的案件
                </Link>

                {isAdmin && (
                  <Link
                    href="/admin"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
                  >
                    管理後台
                  </Link>
                )}
              <UserAvatar
                email={user.email}
                avatarUrl={user.user_metadata?.avatar_url}
                fullName={user.user_metadata?.full_name}
              />

              <LogoutButton />
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                登入 / 回報案例
              </Link>
            )}
          </nav>
        </header>

        <section className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              車主共同建立的匿名案例資料庫
            </span>

            <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
              看見 Lexus NX
              <br />
              電子門問題的真實案例。
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-600">
              蒐集車主實際發生狀況、里程、問題位置與維修進度。
              所有公開案例皆先經管理員審核，並移除車主個人識別資訊。
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/cases"
                className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                瀏覽公開案例
              </Link>

              <Link
                href={user ? '/my-cases/new' : '/login'}
                className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
              >
                回報我的案例
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              資料庫目前狀態
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-3xl font-semibold text-gray-950">
                  {publicCases.length}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  公開案例
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-3xl font-semibold text-gray-950">
                  {modelCount}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  涉及車型
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-3xl font-semibold text-gray-950">
                  {publicIncidents.length}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  故障紀錄
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xl font-semibold text-gray-950">
                  {topDoor && topDoor.count > 0
                    ? topDoor.label
                    : '—'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  最高發位置
                </p>
              </div>
            </div>
          </div>
        </section>

        {hasPublicError && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            公開統計資料讀取失敗：
            {vehicleError?.message ?? incidentError?.message}
          </div>
        )}

        {!hasPublicError && (
          <>
            <section className="mt-16 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    問題車門出現率
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    公開案件中曾出現各車門問題的案件比例，可複選
                  </p>
                </div>

                <div className="mt-7 space-y-5">
                  {doorCounts.map((door) => {
                    const percentage =
                      publicCases.length > 0
                        ? Math.round(
                            (door.count / publicCases.length) * 100
                          )
                        : 0

                    const width =
                      door.count > 0
                        ? Math.max(
                            8,
                            (door.count / maxDoorCount) * 100
                          )
                        : 0

                    return (
                      <div key={door.key}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-gray-800">
                            {door.label}
                          </span>

                          <span className="text-gray-500">
                            {door.count} 案例 · {percentage}%
                          </span>
                        </div>

                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gray-900"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-950">
                  常見症狀
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  曾出現在公開案件中的症狀案例數
                </p>

                {symptomCounts.length > 0 ? (
                  <div className="mt-7 space-y-3">
                    {symptomCounts.map((symptom, index) => (
                      <div
                        key={symptom.key}
                        className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-500 shadow-sm">
                            {index + 1}
                          </span>

                          <span className="font-medium text-gray-800">
                            {symptom.label}
                          </span>
                        </div>

                        <span className="text-sm font-medium text-gray-500">
                          {symptom.count} 案例
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-7 rounded-2xl bg-gray-50 p-8 text-center text-sm text-gray-500">
                    尚無公開症狀統計。
                  </div>
                )}
              </div>
            </section>

            <section className="mt-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-950">
                    最新公開案例
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    最近通過審核並公開的車主案例
                  </p>
                </div>

                <Link
                  href="/cases"
                  className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
                >
                  查看全部 →
                </Link>
              </div>

              {latestCases.length > 0 ? (
                <div className="mt-6 grid gap-4">
                  {latestCases.map((vehicle) => {
                    const firstIncident = publicIncidents.find(
                      (incident) =>
                        incident.vehicle_id === vehicle.id
                    )

                    return (
                      <Link
                        key={vehicle.id}
                        href={`/cases/${vehicle.public_case_id}?from=home`}
                        className="group flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-500">
                            {vehicle.public_case_id}
                          </p>

                          <h3 className="mt-1 text-xl font-semibold text-gray-950">
                            {vehicle.model_year} {vehicle.model}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                          {firstIncident && (
                            <>
                              <div>
                                <p className="text-xs text-gray-500">
                                  發生里程
                                </p>
                                <p className="mt-1 text-sm font-medium text-gray-900">
                                  {firstIncident.mileage.toLocaleString()} km
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-gray-500">
                                  問題位置
                                </p>
                                <p className="mt-1 text-sm font-medium text-gray-900">
                                  {firstIncident.door_positions
                                    .map(
                                      (value: string) =>
                                        doorLabels[value] ?? value
                                    )
                                    .join('、')}
                                </p>
                              </div>
                            </>
                          )}

                          {isAdmin && (
                            <AdminOwnerContact
                              vehicleId={vehicle.id}
                              emailClickable={false}
                              className="hidden xl:inline-flex"
                            />
                          )}

                          <span className="text-sm font-medium text-gray-500 transition group-hover:text-gray-950">
                            查看 →
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center">
                  <p className="font-medium text-gray-900">
                    目前還沒有公開案例
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    第一筆通過審核的案例會出現在這裡。
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        <footer className="mt-16 border-t border-gray-200 py-8 text-sm leading-6 text-gray-500">
          NX Door Watch 為車主案例資訊整理平台。
          公開內容來自車主回報並經人工審核，
          個別案例不代表所有 Lexus NX 車輛皆會發生相同狀況。
        </footer>
      </div>
    </main>
  )
}
