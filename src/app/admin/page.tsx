import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminOwnerContact, {
  type OwnerContact,
} from '@/components/admin/AdminOwnerContact'
import AdminCaseReports, {
  type AdminCaseReport,
} from '@/components/admin/AdminCaseReports'

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

async function moderateCase(formData: FormData) {
  'use server'

  const vehicleId = String(formData.get('vehicle_id') ?? '')
  const action = String(formData.get('action') ?? '')
  const note = String(formData.get('note') ?? '').trim()

  if (
    !vehicleId ||
    !['approved', 'needs_revision', 'rejected'].includes(action)
  ) {
    redirect('/admin?error=invalid')
  }

  if (action === 'needs_revision' && !note) {
    redirect('/admin?error=note_required')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.rpc('moderate_case_atomic', {
    p_vehicle_id: vehicleId,
    p_action: action,
    p_note: note || null,
  })

  if (error) {
    console.error('moderate_case_atomic error:', error)
    redirect('/admin?error=moderation')
  }

  revalidatePath('/admin')
  revalidatePath('/my-cases')
  revalidatePath('/cases')
  revalidatePath('/')

  redirect(`/admin?done=${action}`)
}

async function moderateIncident(formData: FormData) {
  'use server'

  const incidentId = String(formData.get('incident_id') ?? '')
  const publicCaseId = String(
    formData.get('public_case_id') ?? ''
  )
  const action = String(formData.get('action') ?? '')
  const note = String(formData.get('note') ?? '').trim()

  if (
    !incidentId ||
    !publicCaseId ||
    !['approved', 'needs_revision', 'rejected'].includes(action)
  ) {
    redirect('/admin?error=invalid_incident')
  }

  if (action === 'needs_revision' && !note) {
    redirect('/admin?error=note_required')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.rpc(
    'moderate_incident_atomic',
    {
      p_incident_id: incidentId,
      p_action: action,
      p_note: note || null,
    }
  )

  if (error) {
    console.error('moderate_incident_atomic error:', error)

    const message = (error.message ?? '').toLowerCase()

    if (
      message.includes('no longer pending') ||
      message.includes('only pending')
    ) {
      redirect('/admin?error=stale')
    }

    redirect('/admin?error=incident_moderation')
  }

  revalidatePath('/admin')
  revalidatePath('/my-cases')
  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/cases')
  revalidatePath(`/cases/${publicCaseId}`)
  revalidatePath('/')

  redirect(`/admin?done=incident_${action}`)
}

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string
    error?: string
  }>
}) {
  const query = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: adminStatus, error: adminError } =
    await supabase.rpc('is_admin')

  if (adminError || adminStatus !== true) {
    redirect('/')
  }

  // 已公開案件的修改 / 下架申請數量
  const {
    count: pendingRevisionCount,
    error: revisionCountError,
  } = await supabase
    .from('case_revisions')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('target_type', 'vehicle')
    .eq('status', 'pending')

  const {
    count: pendingArchiveCount,
    error: archiveCountError,
  } = await supabase
    .from('case_archive_requests')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('status', 'pending')

  const requestRevisionCount =
    pendingRevisionCount ?? 0

  const requestArchiveCount =
    pendingArchiveCount ?? 0

  const requestTotal =
    requestRevisionCount +
    requestArchiveCount

  // 1. 尚未公開的新案件
  const { data: pendingVehicles, error: vehicleError } =
    await supabase
      .from('vehicles')
      .select(`
        id,
        public_case_id,
        model,
        model_year,
        moderation_status,
        created_at
      `)
      .eq('moderation_status', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

  const pendingVehicleIds =
    pendingVehicles?.map((vehicle) => vehicle.id) ?? []

  const { data: newCaseIncidents, error: newCaseIncidentError } =
    pendingVehicleIds.length > 0
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
            dealer_visited,
            has_work_order,
            repair_status,
            has_quote,
            quoted_amount,
            moderation_status
          `)
          .in('vehicle_id', pendingVehicleIds)
          .order('incident_number', { ascending: true })
      : { data: [], error: null }

  // 2. 所有 pending incident
  const {
    data: allPendingIncidents,
    error: pendingIncidentError,
  } = await supabase
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
      dealer_visited,
      has_work_order,
      repair_status,
      has_quote,
      quoted_amount,
      moderation_status,
      created_at
    `)
    .eq('moderation_status', 'pending')
    .order('created_at', { ascending: true })

  const pendingIncidentVehicleIds = [
    ...new Set(
      (allPendingIncidents ?? []).map(
        (incident) => incident.vehicle_id
      )
    ),
  ]

  // 3. 只找「已公開案件」的 vehicle
  //    因此不會跟上面的新案件重複。
  const {
    data: approvedVehiclesWithPendingIncidents,
    error: followupVehicleError,
  } =
    pendingIncidentVehicleIds.length > 0
      ? await supabase
          .from('vehicles')
          .select(`
            id,
            public_case_id,
            model,
            model_year,
            moderation_status,
            published_at
          `)
          .in('id', pendingIncidentVehicleIds)
          .eq('moderation_status', 'approved')
          .is('deleted_at', null)
      : { data: [], error: null }

  const approvedVehicleMap = new Map(
    (approvedVehiclesWithPendingIncidents ?? []).map(
      (vehicle) => [vehicle.id, vehicle]
    )
  )

  const pendingFollowupIncidents =
    (allPendingIncidents ?? []).filter((incident) =>
      approvedVehicleMap.has(incident.vehicle_id)
    )

  // =======================================================
  // Admin 卡片共用資料：整頁批次抓取，避免每張卡 N+1
  // =======================================================

  const adminVehicleIds = [
    ...new Set([
      ...(pendingVehicles ?? []).map(
        (vehicle) => vehicle.id
      ),
      ...(approvedVehiclesWithPendingIncidents ?? []).map(
        (vehicle) => vehicle.id
      ),
    ]),
  ]

  const {
    data: ownerContacts,
    error: ownerContactError,
  } =
    adminVehicleIds.length > 0
      ? await supabase.rpc(
          'get_admin_case_owner_contacts',
          {
            p_vehicle_ids: adminVehicleIds,
          }
        )
      : { data: [], error: null }

  const {
    data: adminReports,
    error: adminReportsError,
  } =
    adminVehicleIds.length > 0
      ? await supabase
          .from('case_reports')
          .select(`
            id,
            vehicle_id,
            channel,
            status,
            reported_at,
            reference_number,
            note
          `)
          .in('vehicle_id', adminVehicleIds)
          .in('status', ['submitted', 'completed'])
          .order('reported_at', { ascending: false })
      : { data: [], error: null }

  if (ownerContactError) {
    console.error(
      'admin owner batch error:',
      ownerContactError
    )
  }

  if (adminReportsError) {
    console.error(
      'admin reports batch error:',
      adminReportsError
    )
  }

  const ownerContactMap = new Map<
    string,
    OwnerContact
  >(
    ((ownerContacts ?? []) as OwnerContact[]).map(
      (owner) => [owner.vehicle_id, owner]
    )
  )

  const reportMap = new Map<
    string,
    AdminCaseReport[]
  >()

  for (
    const report of
    (adminReports ?? []) as AdminCaseReport[]
  ) {
    if (!report.vehicle_id) continue

    const current =
      reportMap.get(report.vehicle_id) ?? []

    current.push(report)

    reportMap.set(
      report.vehicle_id,
      current
    )
  }

  const hasError =
    vehicleError ||
    newCaseIncidentError ||
    pendingIncidentError ||
    followupVehicleError ||
    revisionCountError ||
    archiveCountError

  const newCaseCount = pendingVehicles?.length ?? 0
  const followupCount = pendingFollowupIncidents.length
  const totalPending = newCaseCount + followupCount

  const doneMessages: Record<string, string> = {
    approved: '新案件已完成審核。',
    needs_revision: '已要求車主修改新案件資料。',
    rejected: '新案件已拒絕。',
    incident_approved: '後續紀錄已完成審核。',
    incident_needs_revision: '已要求車主修改這筆後續紀錄。',
    incident_rejected: '後續紀錄已拒絕。',
  }

  const errorMessages: Record<string, string> = {
    invalid: '送出的案件審核資料不完整，請重新操作。',
    invalid_incident: '送出的後續紀錄審核資料不完整，請重新操作。',
    moderation: '案件審核失敗，請稍後再試。',
    incident_moderation: '後續紀錄審核失敗，請稍後再試。',
    note_required:
      '要求車主修改時，請填寫具體修改原因，讓車主知道需要修正哪些內容。',
    stale:
      '這筆紀錄的狀態已經改變，可能已被車主修改或撤回。頁面已重新載入最新狀態，請確認後再操作。',
  }

  const doneMessage = query.done
    ? doneMessages[query.done] ?? null
    : null

  const actionErrorMessage = query.error
    ? errorMessages[query.error] ?? null
    : null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← 回首頁
            </Link>

            <p className="mt-6 text-sm font-medium text-blue-600">
              Admin
            </p>

            <h1 className="mt-1 text-3xl font-semibold text-gray-950">
              審核中心
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              檢查已先行公開的新案件與後續紀錄；若內容需要修正，可立即暫時隱藏並要求車主修改。
            </p>

            <Link
              href="/admin/requests"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              修改／下架／封存管理

              {requestTotal > 0 && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {requestTotal}
                </span>
              )}

              <span>→</span>
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm">
              新案件 {newCaseCount}
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm">
              後續紀錄 {followupCount}
            </span>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              共 {totalPending} 件待審
            </span>
          </div>
        </header>

        {requestTotal > 0 && (
          <Link
            href="/admin/requests"
            className="mt-8 block rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:bg-amber-100"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-amber-950">
                  有新的案件申請需要處理
                </p>

                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {requestRevisionCount > 0 && (
                    <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-800">
                      修改申請 {requestRevisionCount}
                    </span>
                  )}

                  {requestArchiveCount > 0 && (
                    <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800">
                      下架申請 {requestArchiveCount}
                    </span>
                  )}
                </div>
              </div>

              <span className="text-sm font-medium text-amber-900">
                前往處理 →
              </span>
            </div>
          </Link>
        )}

        {doneMessage && (
          <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            {doneMessage}
          </div>
        )}

        {actionErrorMessage && (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {actionErrorMessage}
          </div>
        )}

        {hasError && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            審核資料讀取失敗：
            {vehicleError?.message ??
              newCaseIncidentError?.message ??
              pendingIncidentError?.message ??
              followupVehicleError?.message}
          </div>
        )}

        {!hasError && (
          <>
            {/* 後續紀錄 */}
            <section className="mt-10">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-gray-950">
                    已公開・待審後續紀錄
                  </h2>

                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {followupCount}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  已公開案件新增的故障或維修紀錄。
                  新紀錄已先公開，管理員再進行後續審核。
                </p>
              </div>

              {pendingFollowupIncidents.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center">
                  <p className="font-medium text-gray-900">
                    目前沒有已公開・待審後續紀錄
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-6">
                  {pendingFollowupIncidents.map((incident) => {
                    const vehicle = approvedVehicleMap.get(
                      incident.vehicle_id
                    )

                    if (!vehicle) return null

                    return (
                      <article
                        key={incident.id}
                        className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
                          <div>
                            <p className="text-sm font-medium text-gray-500">
                              {vehicle.public_case_id}
                            </p>

                            <h3 className="mt-1 text-2xl font-semibold text-gray-950">
                              {vehicle.model_year} {vehicle.model}
                            </h3>

                            <AdminOwnerContact
                              vehicleId={vehicle.id}
                              owner={ownerContactMap.get(vehicle.id) ?? null}
                              className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                            />


                            <AdminCaseReports
                              vehicleId={vehicle.id}
                              reports={reportMap.get(vehicle.id) ?? []}
                            />
                            <p className="mt-2 text-sm font-medium text-blue-700">
                              第 {incident.incident_number} 次紀錄
                            </p>
                          </div>

                          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                            已公開・待後審
                          </span>
                        </div>

                        <div className="p-6">
                          <div className="grid gap-5 rounded-2xl border border-gray-200 p-5 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <p className="text-xs text-gray-500">
                                發生里程
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.mileage.toLocaleString()} km
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                發生日期
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.incident_date ?? '未填寫'}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                發生頻率
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.occurrence_frequency
                                  ? frequencyLabels[
                                      incident.occurrence_frequency
                                    ] ??
                                    incident.occurrence_frequency
                                  : '未填寫'}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                問題位置
                              </p>

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
                              <p className="text-xs text-gray-500">
                                症狀
                              </p>

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
                              <p className="text-xs text-gray-500">
                                維修狀態
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {repairLabels[
                                  incident.repair_status
                                ] ?? incident.repair_status}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                Lexus 回廠
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.dealer_visited ? '是' : '否'}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                維修工單
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.has_work_order ? '有' : '無'}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-gray-500">
                                報價
                              </p>

                              <p className="mt-1 font-medium text-gray-950">
                                {incident.has_quote
                                  ? incident.quoted_amount !== null
                                    ? `NT$ ${incident.quoted_amount.toLocaleString()}`
                                    : '有'
                                  : '無'}
                              </p>
                            </div>
                          </div>

                          <form
                            action={moderateIncident}
                            className="mt-5 rounded-2xl bg-gray-50 p-5"
                          >
                            <input
                              type="hidden"
                              name="incident_id"
                              value={incident.id}
                            />

                            <input
                              type="hidden"
                              name="public_case_id"
                              value={vehicle.public_case_id}
                            />

                            <label className="block text-sm font-medium text-gray-700">
                              管理員備註

                              <textarea
                                name="note"
                                rows={3}
                                placeholder="例如：後續維修資料完整，可公開。"
                                className="mt-2 w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none focus:border-gray-900"
                              />
                            </label>

                            <div className="mt-5 flex flex-wrap justify-end gap-3">
                              <button
                                type="submit"
                                name="action"
                                value="rejected"
                                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                              >
                                拒絕
                              </button>

                              <button
                                type="submit"
                                name="action"
                                value="needs_revision"
                                className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                              >
                                要求修改並暫時隱藏
                              </button>

                              <button
                                type="submit"
                                name="action"
                                value="approved"
                                className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                              >
                                完成這筆審核
                              </button>
                            </div>
                          </form>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 新案件 */}
            <section className="mt-14 border-t border-gray-200 pt-10">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-gray-950">
                    已公開・待審新案件
                  </h2>

                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {newCaseCount}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  已公開、等待管理員後續審核的新車主案件。
                </p>
              </div>

              {!pendingVehicles ||
              pendingVehicles.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center">
                  <p className="font-medium text-gray-900">
                    目前沒有已公開・待審新案件
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-6">
                  {pendingVehicles.map((vehicle) => {
                    const vehicleIncidents =
                      newCaseIncidents?.filter(
                        (incident) =>
                          incident.vehicle_id === vehicle.id
                      ) ?? []

                    return (
                      <article
                        key={vehicle.id}
                        className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
                          <div>
                            <p className="text-sm font-medium text-gray-500">
                              {vehicle.public_case_id}
                            </p>

                            <h3 className="mt-1 text-2xl font-semibold text-gray-950">
                              {vehicle.model_year} {vehicle.model}
                            </h3>

                            <AdminOwnerContact
                              vehicleId={vehicle.id}
                              owner={ownerContactMap.get(vehicle.id) ?? null}
                              className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                            />


                            <AdminCaseReports
                              vehicleId={vehicle.id}
                              reports={reportMap.get(vehicle.id) ?? []}
                            />
                            <p className="mt-2 text-sm text-gray-500">
                              提交日期：
                              {new Date(
                                vehicle.created_at
                              ).toLocaleDateString('zh-TW')}
                            </p>
                          </div>

                          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                            已公開・待後審
                          </span>
                        </div>

                        <div className="space-y-6 p-6">
                          {vehicleIncidents.map((incident) => (
                            <section
                              key={incident.id}
                              className="rounded-2xl border border-gray-200 p-5"
                            >
                              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <p className="text-xs text-gray-500">
                                    里程
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {incident.mileage.toLocaleString()} km
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-gray-500">
                                    發生日期
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {incident.incident_date ??
                                      '未填寫'}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-gray-500">
                                    發生頻率
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {incident.occurrence_frequency
                                      ? frequencyLabels[
                                          incident
                                            .occurrence_frequency
                                        ] ??
                                        incident.occurrence_frequency
                                      : '未填寫'}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-gray-500">
                                    問題位置
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {incident.door_positions
                                      .map(
                                        (value: string) =>
                                          doorLabels[value] ??
                                          value
                                      )
                                      .join('、')}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-gray-500">
                                    症狀
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {incident.symptoms
                                      .map(
                                        (value: string) =>
                                          symptomLabels[value] ??
                                          value
                                      )
                                      .join('、')}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs text-gray-500">
                                    維修狀態
                                  </p>
                                  <p className="mt-1 font-medium text-gray-950">
                                    {repairLabels[
                                      incident.repair_status
                                    ] ??
                                      incident.repair_status}
                                  </p>
                                </div>
                              </div>
                            </section>
                          ))}

                          <form
                            action={moderateCase}
                            className="rounded-2xl bg-gray-50 p-5"
                          >
                            <input
                              type="hidden"
                              name="vehicle_id"
                              value={vehicle.id}
                            />

                            <label className="block text-sm font-medium text-gray-700">
                              管理員備註

                              <textarea
                                name="note"
                                rows={3}
                                placeholder="例如：資料完整，可公開。"
                                className="mt-2 w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none focus:border-gray-900"
                              />
                            </label>

                            <div className="mt-5 flex flex-wrap justify-end gap-3">
                              <button
                                type="submit"
                                name="action"
                                value="rejected"
                                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
                              >
                                拒絕
                              </button>

                              <button
                                type="submit"
                                name="action"
                                value="needs_revision"
                                className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                              >
                                要求修改並暫時隱藏
                              </button>

                              <button
                                type="submit"
                                name="action"
                                value="approved"
                                className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                              >
                                完成審核
                              </button>
                            </div>
                          </form>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
