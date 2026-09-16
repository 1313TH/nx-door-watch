import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'

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

const frequencyLabels: Record<string, string> = {
  first_time: '首次發生',
  two_to_three: '已發生 2～3 次',
  repeated: '反覆發生',
}

const repairLabels: Record<string, string> = {
  not_visited: '尚未回廠',
  waiting_inspection: '等待檢查',
  observe: '持續觀察',
  no_fault_code: '查無故障碼',
  waiting_parts: '等待零件',
  parts_arrived: '零件已到',
  repair_scheduled: '已排定維修',
  repaired_warranty: '保固維修完成',
  repaired_goodwill: '專案／善意維修完成',
  repaired_self_paid: '自費維修完成',
  completed: '已完成／結案',
  other: '其他',
}

export const dynamic = 'force-dynamic'

export default async function CasesPage() {
  const supabase = createPublicClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select(`
      id,
      public_case_id,
      model,
      model_year,
      moderation_status,
      published_at
    `)
    .order('published_at', { ascending: false })

  const vehicleIds = vehicles?.map((vehicle) => vehicle.id) ?? []

  const { data: incidents, error: incidentError } =
    vehicleIds.length > 0
      ? await supabase
          .from('incidents')
          .select(`
            id,
            vehicle_id,
            incident_number,
            mileage,
            incident_date,
            door_positions,
            symptoms,
            occurrence_frequency,
            repair_status,
            moderation_status
          `)
          .in('vehicle_id', vehicleIds)
          .order('incident_number', { ascending: true })
      : { data: [], error: null }

  const hasError = vehicleError || incidentError

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 transition hover:text-gray-950"
            >
              ← 回首頁
            </Link>

            <p className="mt-6 text-sm font-medium text-gray-500">
              Lexus NX 電子門案例資料庫
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
              公開案例
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              此處只顯示已經過管理員審核並公開的匿名案例資料，
              不包含車主帳號或個人識別資訊。
            </p>
          </div>

          <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm">
            {vehicles?.length ?? 0} 件公開案例
          </div>
        </header>

        {hasError && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            公開案例讀取失敗：
            {vehicleError?.message ?? incidentError?.message}
          </div>
        )}

        {!hasError && (!vehicles || vehicles.length === 0) && (
          <section className="mt-10 rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="font-semibold text-gray-950">
              目前還沒有公開案例
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              經審核核准的案例會出現在這裡。
            </p>
          </section>
        )}

        {!hasError && vehicles && vehicles.length > 0 && (
          <div className="mt-10 grid gap-5">
            {vehicles.map((vehicle) => {
              const vehicleIncidents =
                incidents?.filter(
                  (incident) => incident.vehicle_id === vehicle.id
                ) ?? []

              const firstIncident = vehicleIncidents[0]

              return (
                <Link
                  key={vehicle.id}
                  href={`/cases/${vehicle.public_case_id}`}
                  className="group block rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {vehicle.public_case_id}
                      </p>

                      <h2 className="mt-1 text-2xl font-semibold text-gray-950">
                        {vehicle.model_year} {vehicle.model}
                      </h2>
                    </div>

                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                      已公開
                    </span>
                  </div>

                  {firstIncident && (
                    <div className="mt-6 grid gap-5 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-gray-500">發生里程</p>
                        <p className="mt-1 font-medium text-gray-950">
                          {firstIncident.mileage.toLocaleString()} km
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">問題位置</p>
                        <p className="mt-1 font-medium text-gray-950">
                          {firstIncident.door_positions
                            .map(
                              (value: string) =>
                                doorLabels[value] ?? value
                            )
                            .join('、')}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">症狀</p>
                        <p className="mt-1 font-medium text-gray-950">
                          {firstIncident.symptoms
                            .map(
                              (value: string) =>
                                symptomLabels[value] ?? value
                            )
                            .join('、')}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">維修狀態</p>
                        <p className="mt-1 font-medium text-gray-950">
                          {repairLabels[firstIncident.repair_status] ??
                            firstIncident.repair_status}
                        </p>
                      </div>
                    </div>
                  )}

                  {firstIncident && (
                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="rounded-full bg-gray-100 px-3 py-1">
                        {frequencyLabels[
                          firstIncident.occurrence_frequency
                        ] ?? firstIncident.occurrence_frequency}
                      </span>

                      {firstIncident.incident_date && (
                        <span className="rounded-full bg-gray-100 px-3 py-1">
                          發生日期 {firstIncident.incident_date}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-5 text-sm font-medium text-gray-700 transition group-hover:text-gray-950">
                    查看完整案例 →
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
