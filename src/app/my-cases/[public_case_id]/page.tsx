import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

const moderationLabels: Record<string, string> = {
  pending: '審核中',
  approved: '已公開',
  needs_revision: '需要修改',
  rejected: '未通過',
  deleted: '已刪除',
}

function moderationStyle(status: string) {
  if (status === 'approved') {
    return 'bg-green-50 text-green-700'
  }

  if (status === 'pending') {
    return 'bg-amber-50 text-amber-700'
  }

  if (status === 'needs_revision') {
    return 'bg-blue-50 text-blue-700'
  }

  if (status === 'rejected') {
    return 'bg-red-50 text-red-700'
  }

  return 'bg-gray-100 text-gray-600'
}

export const dynamic = 'force-dynamic'

export default async function MyCaseDetailPage({
  params,
}: {
  params: Promise<{ public_case_id: string }>
}) {
  const { public_case_id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select(`
      id,
      owner_id,
      public_case_id,
      model,
      model_year,
      moderation_status,
      published_at,
      created_at
    `)
    .eq('public_case_id', public_case_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (vehicleError) {
    throw new Error(vehicleError.message)
  }

  if (!vehicle) {
    notFound()
  }

  const { data: incidents, error: incidentError } = await supabase
    .from('incidents')
    .select(`
      id,
      incident_number,
      mileage,
      incident_date,
      door_positions,
      symptoms,
      occurrence_frequency,
      dealer_visited,
      has_work_order,
      repair_status,
      has_quote,
      quoted_amount,
      moderation_status,
      created_at
    `)
    .eq('vehicle_id', vehicle.id)
    .order('incident_number', { ascending: true })

  if (incidentError) {
    throw new Error(incidentError.message)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/my-cases"
          className="text-sm text-gray-500 transition hover:text-gray-950"
        >
          ← 回我的案件
        </Link>

        <header className="mt-8 rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-gray-500">
                {vehicle.public_case_id}
              </p>

              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
                {vehicle.model_year} {vehicle.model}
              </h1>

              <p className="mt-3 text-sm text-gray-500">
                建立日期：
                {new Date(vehicle.created_at).toLocaleDateString('zh-TW')}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${moderationStyle(
                vehicle.moderation_status
              )}`}
            >
              {moderationLabels[vehicle.moderation_status] ??
                vehicle.moderation_status}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gray-50 p-4">
            <p className="text-sm leading-6 text-gray-600">
              後續如果再次發生故障、回廠檢查或完成維修，
              可以直接追加在同一個案件中。
            </p>

            <Link
              href={`/my-cases/${vehicle.public_case_id}/new-incident`}
              className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              ＋ 新增後續紀錄
            </Link>
          </div>
        </header>

        <section className="mt-8">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">
              案件時間軸
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              共 {incidents?.length ?? 0} 筆故障／維修紀錄
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {incidents?.map((incident) => (
              <article
                key={incident.id}
                className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500">
                      RECORD {incident.incident_number}
                    </p>

                    <h3 className="mt-1 text-lg font-semibold text-gray-950">
                      第 {incident.incident_number} 次紀錄
                    </h3>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${moderationStyle(
                      incident.moderation_status
                    )}`}
                  >
                    {moderationLabels[incident.moderation_status] ??
                      incident.moderation_status}
                  </span>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500">發生日期</p>
                    <p className="mt-1 font-medium text-gray-950">
                      {incident.incident_date ?? '未填寫'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">發生里程</p>
                    <p className="mt-1 font-medium text-gray-950">
                      {incident.mileage.toLocaleString()} km
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">發生頻率</p>
                    <p className="mt-1 font-medium text-gray-950">
                      {incident.occurrence_frequency
                        ? frequencyLabels[incident.occurrence_frequency] ??
                          incident.occurrence_frequency
                        : '未填寫'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">問題位置</p>
                    <p className="mt-1 font-medium text-gray-950">
                      {incident.door_positions
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
                      {incident.symptoms
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
                      {repairLabels[incident.repair_status] ??
                        incident.repair_status}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-5 text-xs text-gray-600">
                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    Lexus 回廠：
                    {incident.dealer_visited ? '是' : '否'}
                  </span>

                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    維修工單：
                    {incident.has_work_order ? '有' : '無'}
                  </span>

                  <span className="rounded-full bg-gray-100 px-3 py-1">
                    報價：
                    {incident.has_quote
                      ? incident.quoted_amount !== null
                        ? `NT$ ${incident.quoted_amount.toLocaleString()}`
                        : '有'
                      : '無'}
                  </span>
                </div>

                {incident.moderation_status === 'pending' && (
                  <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    這筆新紀錄正在審核中；審核通過前不會顯示在公開案例頁。
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
