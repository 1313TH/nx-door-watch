import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import WithdrawIncidentForm from '@/components/WithdrawIncidentForm'

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

const reportChannelLabels: Record<string, string> = {
  lexus: 'Lexus 原廠／客服',
  vehicle_safety: '車輛安全瑕疵通報',
  consumer_protection: '消費者保護線上申訴',
  '1950': '1950 消費者服務專線',
  motc_mailbox: '交通部部長／民意信箱',
}

const moderationLabels: Record<string, string> = {
  pending: '審核中',
  approved: '已公開',
  needs_revision: '需要修改',
  rejected: '未通過',
  withdrawn: '已撤回',
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


async function withdrawPendingIncidentAction(formData: FormData) {
  'use server'

  const incidentId = String(formData.get('incident_id') ?? '')
  const publicCaseId = String(formData.get('public_case_id') ?? '')

  if (!incidentId || !publicCaseId) {
    redirect('/my-cases')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.rpc(
    'withdraw_pending_incident_atomic',
    {
      p_incident_id: incidentId,
    }
  )

  if (error) {
    console.error(
      'withdraw_pending_incident_atomic error:',
      error
    )

    redirect(
      `/my-cases/${publicCaseId}?error=withdraw`
    )
  }

  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/admin')
  revalidatePath('/cases')
  revalidatePath(`/cases/${publicCaseId}`)
  revalidatePath('/')

  redirect(
    `/my-cases/${publicCaseId}?withdrawn=1`
  )
}

export default async function MyCaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_case_id: string }>
  searchParams: Promise<{
    updated?: string
    withdrawn?: string
    resubmitted?: string
    case_updated?: string
    error?: string
  }>
}) {
  const { public_case_id } = await params
  const query = await searchParams

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
      created_at,
      updated_at
    `)
    .eq('vehicle_id', vehicle.id)
    .order('incident_number', { ascending: false })

  if (incidentError) {
    throw new Error(incidentError.message)
  }

  const { data: caseReports, error: caseReportsError } =
    await supabase
      .from('case_reports')
      .select(`
        channel,
        status,
        reported_at,
        reference_number,
        note
      `)
      .eq('vehicle_id', vehicle.id)
      .in('status', ['submitted', 'completed'])

  if (caseReportsError) {
    throw new Error(caseReportsError.message)
  }

  const feedbackPairs = await Promise.all(
    (incidents ?? [])
      .filter((incident) =>
        ['needs_revision', 'rejected'].includes(
          incident.moderation_status
        )
      )
      .map(async (incident) => {
        const { data, error } = await supabase.rpc(
          'get_incident_feedback',
          {
            p_incident_id: incident.id,
          }
        )

        if (error) {
          console.error(
            'get_incident_feedback error:',
            error
          )

          return [incident.id, null] as const
        }

        const feedback = Array.isArray(data)
          ? data[0] ?? null
          : data ?? null

        return [incident.id, feedback] as const
      })
  )

  const feedbackByIncident = new Map(feedbackPairs)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/my-cases"
          className="text-sm text-gray-500 transition hover:text-gray-950"
        >
          ← 回我的案件
        </Link>

        {query.updated === '1' && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            待審紀錄已更新，狀態仍維持「審核中」。
          </div>
        )}

        {query.case_updated === '1' && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            案件資料已更新，並重新送交管理員審核。
          </div>
        )}

        {query.withdrawn === '1' && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            紀錄已撤回，不會進入管理員審核或顯示於公開案例。
          </div>
        )}

        {query.resubmitted === '1' && (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            修改完成，這筆紀錄已重新送交管理員審核。
          </div>
        )}

        {query.error === 'withdraw' && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            撤回失敗。紀錄可能已被管理員處理，請重新整理後確認狀態。
          </div>
        )}

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

          {['pending', 'needs_revision'].includes(
            vehicle.moderation_status
          ) && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/my-cases/${vehicle.public_case_id}/edit`}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
              >
                修改案件
              </Link>

              <p className="flex items-center text-xs text-gray-500">
                修改後會重新進入審核。
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gray-50 p-4">
            <p className="text-sm leading-6 text-gray-600">
              後續如果再次發生故障、回廠檢查或完成維修，
              可以直接追加在同一個案件中。
            </p>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/my-cases/${vehicle.public_case_id}/reports`}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-gray-100"
              >
                管理正式反映
              </Link>

              <Link
                href={`/my-cases/${vehicle.public_case_id}/new-incident`}
                className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                ＋ 新增後續紀錄
              </Link>
            </div>
          </div>

          {(caseReports?.length ?? 0) > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-5">
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-900">
                  正式反映
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {caseReports?.map((report) => (
                  <div
                    key={report.channel}
                    className="rounded-2xl border border-blue-100 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-950">
                          {reportChannelLabels[report.channel] ??
                            report.channel}
                        </p>

                        <p className="mt-1 text-xs text-green-700">
                          ✓ 已正式反映
                        </p>
                      </div>

                      {report.reported_at && (
                        <span className="shrink-0 text-xs text-gray-400">
                          {report.reported_at}
                        </span>
                      )}
                    </div>

                    {report.reference_number && (
                      <p className="mt-2 text-xs text-gray-500">
                        受理編號：
                        <span className="font-medium text-gray-800">
                          {report.reference_number}
                        </span>
                      </p>
                    )}

                    {report.note && (
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        {report.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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

          <div className="relative mt-6">
            <div className="absolute bottom-0 left-[11px] top-0 w-px bg-gray-200 sm:left-[15px]" />

            <div className="space-y-6">
              {incidents?.map((incident) => (
                <div
                  key={incident.id}
                  className="relative pl-10 sm:pl-12"
                >
                  <div className="absolute left-0 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full border-4 border-gray-50 bg-gray-950 sm:h-8 sm:w-8">
                    <span className="h-2 w-2 rounded-full bg-white sm:h-2.5 sm:w-2.5" />
                  </div>

                  <article
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
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm leading-6 text-amber-800">
                      這筆新紀錄正在審核中；審核通過前不會顯示在公開案例頁。
                    </p>

                    <p className="mt-1 text-xs text-amber-700">
                      最後更新：
                      {new Date(incident.updated_at).toLocaleString('zh-TW')}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={`/my-cases/${vehicle.public_case_id}/incidents/${incident.id}/edit`}
                        className="inline-flex rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                      >
                        修改待審紀錄
                      </Link>

                      <WithdrawIncidentForm
                        action={withdrawPendingIncidentAction}
                        incidentId={incident.id}
                        publicCaseId={vehicle.public_case_id}
                      />
                    </div>
                  </div>
                )}

                {incident.moderation_status === 'withdrawn' && (
                  <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
                    此筆紀錄已由你撤回，不會進入審核或顯示於公開案例。
                  </div>
                )}

                {incident.moderation_status === 'needs_revision' && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-medium text-amber-900">
                      管理員要求修改
                    </p>

                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      {feedbackByIncident.get(incident.id)?.note ||
                        '管理員要求補充或修正這筆紀錄。'}
                    </p>

                    <div className="mt-4">
                      <Link
                        href={`/my-cases/${vehicle.public_case_id}/incidents/${incident.id}/edit`}
                        className="inline-flex rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-800"
                      >
                        修改並重新送審
                      </Link>
                    </div>
                  </div>
                )}

                {incident.moderation_status === 'rejected' && (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="font-medium text-red-900">
                      這筆紀錄未通過審核
                    </p>

                    <p className="mt-1 text-sm leading-6 text-red-800">
                      {feedbackByIncident.get(incident.id)?.note ||
                        '這筆紀錄已被管理員拒絕。'}
                    </p>

                    <div className="mt-4 rounded-xl border border-red-200 bg-white/70 px-4 py-3 text-sm leading-6 text-red-800">
                      此筆紀錄已保留於你的案件歷史，但不會顯示於公開案例。
                      如果內容需要修正，請新增一筆新的後續紀錄；
                      已拒絕的原始紀錄不會直接覆寫。
                    </div>
                  </div>
                )}
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
