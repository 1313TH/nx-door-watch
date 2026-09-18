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

async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: isAdmin } =
    await supabase.rpc('is_admin')

  if (isAdmin !== true) {
    redirect('/')
  }

  return supabase
}

async function reviewRevision(formData: FormData) {
  'use server'

  const supabase = await requireAdmin()

  const revisionId = String(
    formData.get('revision_id') ?? ''
  )

  const action = String(
    formData.get('action') ?? ''
  )

  const note = String(
    formData.get('note') ?? ''
  ).trim()

  if (
    !revisionId ||
    !['approve', 'needs_revision', 'reject'].includes(
      action
    )
  ) {
    redirect('/admin/requests?error=revision')
  }

  if (action === 'needs_revision' && !note) {
    redirect(
      '/admin/requests?error=note_required'
    )
  }

  const { error } = await supabase.rpc(
    'review_case_revision',
    {
      p_revision_id: revisionId,
      p_action: action,
      p_admin_note: note || null,
    }
  )

  if (error) {
    console.error(
      'review_case_revision error:',
      error
    )

    redirect('/admin/requests?error=revision')
  }

  revalidatePath('/admin/requests')
  revalidatePath('/admin')
  revalidatePath('/my-cases')
  revalidatePath('/cases')
  revalidatePath('/')

  redirect(
    `/admin/requests?done=revision_${action}`
  )
}

async function reviewArchive(formData: FormData) {
  'use server'

  const supabase = await requireAdmin()

  const requestId = String(
    formData.get('request_id') ?? ''
  )

  const action = String(
    formData.get('action') ?? ''
  )

  const note = String(
    formData.get('note') ?? ''
  ).trim()

  if (
    !requestId ||
    !['approve', 'reject'].includes(action)
  ) {
    redirect('/admin/requests?error=archive')
  }

  const { error } = await supabase.rpc(
    'review_case_archive',
    {
      p_request_id: requestId,
      p_action: action,
      p_admin_note: note || null,
    }
  )

  if (error) {
    console.error(
      'review_case_archive error:',
      error
    )

    redirect('/admin/requests?error=archive')
  }

  revalidatePath('/admin/requests')
  revalidatePath('/admin')
  revalidatePath('/my-cases')
  revalidatePath('/cases')
  revalidatePath('/')

  redirect(
    `/admin/requests?done=archive_${action}`
  )
}

async function restoreArchived(formData: FormData) {
  'use server'

  const supabase = await requireAdmin()

  const vehicleId = String(
    formData.get('vehicle_id') ?? ''
  )

  const note = String(
    formData.get('note') ?? ''
  ).trim()

  if (!vehicleId) {
    redirect('/admin/requests?error=restore')
  }

  const { error } = await supabase.rpc(
    'restore_archived_case',
    {
      p_vehicle_id: vehicleId,
      p_admin_note: note || null,
    }
  )

  if (error) {
    console.error(
      'restore_archived_case error:',
      error
    )

    redirect('/admin/requests?error=restore')
  }

  revalidatePath('/admin/requests')
  revalidatePath('/admin')
  revalidatePath('/my-cases')
  revalidatePath('/cases')
  revalidatePath('/')

  redirect('/admin/requests?done=restored')
}

export const dynamic = 'force-dynamic'

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    done?: string
    error?: string
  }>
}) {
  const query = await searchParams
  const supabase = await requireAdmin()

  const {
    data: revisions,
    error: revisionError,
  } = await supabase
    .from('case_revisions')
    .select(`
      id,
      vehicle_id,
      proposed_data,
      status,
      admin_note,
      created_at
    `)
    .eq('target_type', 'vehicle')
    .eq('status', 'pending')
    .order('created_at', {
      ascending: true,
    })

  const {
    data: archiveRequests,
    error: archiveError,
  } = await supabase
    .from('case_archive_requests')
    .select(`
      id,
      vehicle_id,
      reason,
      status,
      created_at
    `)
    .eq('status', 'pending')
    .order('created_at', {
      ascending: true,
    })

  const vehicleIds = [
    ...new Set([
      ...(revisions ?? []).map(
        (item) => item.vehicle_id
      ),
      ...(archiveRequests ?? []).map(
        (item) => item.vehicle_id
      ),
    ]),
  ]

  const {
    data: relatedVehicles,
    error: vehicleError,
  } =
    vehicleIds.length > 0
      ? await supabase
          .from('vehicles')
          .select(`
            id,
            public_case_id,
            model,
            model_year,
            moderation_status
          `)
          .in('id', vehicleIds)
      : { data: [], error: null }

  const vehicleMap = new Map(
    (relatedVehicles ?? []).map(
      (vehicle) => [vehicle.id, vehicle]
    )
  )

  const revisionVehicleIds = [
    ...new Set(
      (revisions ?? []).map(
        (revision) => revision.vehicle_id
      )
    ),
  ]

  const {
    data: currentIncidents,
    error: currentIncidentError,
  } =
    revisionVehicleIds.length > 0
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
            quoted_amount
          `)
          .in('vehicle_id', revisionVehicleIds)
          .eq('incident_number', 1)
      : { data: [], error: null }

  const currentIncidentMap = new Map(
    (currentIncidents ?? []).map(
      (incident) => [incident.vehicle_id, incident]
    )
  )

  const {
    data: archivedVehicles,
    error: archivedError,
  } = await supabase
    .from('vehicles')
    .select(`
      id,
      public_case_id,
      model,
      model_year,
      archived_at,
      archive_reason
    `)
    .is('deleted_at', null)
    .not('archived_at', 'is', null)
    .order('archived_at', {
      ascending: false,
    })

  const adminVehicleIds = [
    ...new Set([
      ...vehicleIds,
      ...(archivedVehicles ?? []).map(
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
      'admin requests owner batch error:',
      ownerContactError
    )
  }

  if (adminReportsError) {
    console.error(
      'admin requests reports batch error:',
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
    revisionError ||
    archiveError ||
    vehicleError ||
    currentIncidentError ||
    archivedError ||
    ownerContactError ||
    adminReportsError

  const doneMessages: Record<string, string> = {
    revision_approve:
      '修改申請已核准，公開案件已更新。',
    revision_needs_revision:
      '已要求車主修改申請內容。',
    revision_reject:
      '修改申請已拒絕。',
    archive_approve:
      '下架申請已核准，案件已從公開頁隱藏。',
    archive_reject:
      '下架申請已拒絕。',
    restored:
      '封存案件已恢復公開。',
  }

  const doneMessage = query.done
    ? doneMessages[query.done] ?? null
    : null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回審核中心
        </Link>

        <div className="mt-6">
          <p className="text-sm font-medium text-blue-600">
            Admin
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-gray-950">
            案件申請管理
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            審核已公開案件的修改、下架申請，以及管理封存案件。
          </p>
        </div>

        {doneMessage && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {doneMessage}
          </div>
        )}

        {query.error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error === 'note_required'
              ? '要求車主修改時，請填寫具體修改原因。'
              : '操作失敗，資料狀態可能已改變，請重新整理後再試。'}
          </div>
        )}

        {hasError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-medium">
              資料讀取失敗。
            </p>

            <div className="mt-3 space-y-1 text-xs">
              {revisionError && (
                <p>
                  case_revisions：{revisionError.message}
                </p>
              )}

              {archiveError && (
                <p>
                  case_archive_requests：{archiveError.message}
                </p>
              )}

              {vehicleError && (
                <p>
                  related vehicles：{vehicleError.message}
                </p>
              )}

              {currentIncidentError && (
                <p>
                  current incidents：{currentIncidentError.message}
                </p>
              )}

              {archivedError && (
                <p>
                  archived vehicles：{archivedError.message}
                </p>
              )}
            </div>
          </div>
        )}

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-950">
              待審修改申請
            </h2>

            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              {revisions?.length ?? 0}
            </span>
          </div>

          {!revisions?.length ? (
            <div className="mt-5 rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              目前沒有待審修改申請
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {revisions.map((revision) => {
                const vehicle =
                  vehicleMap.get(
                    revision.vehicle_id
                  )

                const proposed =
                  revision.proposed_data as Record<
                    string,
                    unknown
                  >

                const currentIncident =
                  currentIncidentMap.get(
                    revision.vehicle_id
                  )

                const formatList = (
                  value: unknown,
                  labels: Record<string, string>
                ) => {
                  if (!Array.isArray(value)) return '—'

                  return value
                    .map((item) =>
                      labels[String(item)] ??
                      String(item)
                    )
                    .join('、') || '—'
                }

                const formatBoolean = (
                  value: unknown
                ) =>
                  value === true
                    ? '是'
                    : value === false
                      ? '否'
                      : '—'

                const diffRows = [
                  {
                    label: '車型',
                    before: vehicle?.model ?? '—',
                    after: String(
                      proposed.model ??
                        vehicle?.model ??
                        '—'
                    ),
                  },
                  {
                    label: '年式',
                    before: String(
                      vehicle?.model_year ?? '—'
                    ),
                    after: String(
                      proposed.model_year ??
                        vehicle?.model_year ??
                        '—'
                    ),
                  },
                  {
                    label: '里程',
                    before:
                      currentIncident?.mileage != null
                        ? `${Number(
                            currentIncident.mileage
                          ).toLocaleString()} km`
                        : '—',
                    after:
                      proposed.mileage != null
                        ? `${Number(
                            proposed.mileage
                          ).toLocaleString()} km`
                        : currentIncident?.mileage != null
                          ? `${Number(
                              currentIncident.mileage
                            ).toLocaleString()} km`
                          : '—',
                  },
                  {
                    label: '發生日期',
                    before:
                      currentIncident?.incident_date ??
                      '—',
                    after: String(
                      proposed.incident_date ??
                        currentIncident?.incident_date ??
                        '—'
                    ),
                  },
                  {
                    label: '問題位置',
                    before: formatList(
                      currentIncident?.door_positions,
                      doorLabels
                    ),
                    after: formatList(
                      proposed.door_positions ??
                        currentIncident?.door_positions,
                      doorLabels
                    ),
                  },
                  {
                    label: '症狀',
                    before: formatList(
                      currentIncident?.symptoms,
                      symptomLabels
                    ),
                    after: formatList(
                      proposed.symptoms ??
                        currentIncident?.symptoms,
                      symptomLabels
                    ),
                  },
                  {
                    label: '發生頻率',
                    before:
                      currentIncident?.occurrence_frequency
                        ? frequencyLabels[
                            currentIncident
                              .occurrence_frequency
                          ] ??
                          currentIncident
                            .occurrence_frequency
                        : '—',
                    after: (() => {
                      const value =
                        proposed.occurrence_frequency ??
                        currentIncident
                          ?.occurrence_frequency

                      return value
                        ? frequencyLabels[
                            String(value)
                          ] ?? String(value)
                        : '—'
                    })(),
                  },
                  {
                    label: 'Lexus 回廠',
                    before: formatBoolean(
                      currentIncident?.dealer_visited
                    ),
                    after: formatBoolean(
                      proposed.dealer_visited ??
                        currentIncident?.dealer_visited
                    ),
                  },
                  {
                    label: '維修工單',
                    before: formatBoolean(
                      currentIncident?.has_work_order
                    ),
                    after: formatBoolean(
                      proposed.has_work_order ??
                        currentIncident?.has_work_order
                    ),
                  },
                  {
                    label: '維修狀態',
                    before:
                      currentIncident?.repair_status
                        ? repairLabels[
                            currentIncident.repair_status
                          ] ??
                          currentIncident.repair_status
                        : '—',
                    after: (() => {
                      const value =
                        proposed.repair_status ??
                        currentIncident?.repair_status

                      return value
                        ? repairLabels[
                            String(value)
                          ] ?? String(value)
                        : '—'
                    })(),
                  },
                  {
                    label: '是否有報價',
                    before: formatBoolean(
                      currentIncident?.has_quote
                    ),
                    after: formatBoolean(
                      proposed.has_quote ??
                        currentIncident?.has_quote
                    ),
                  },
                  {
                    label: '報價金額',
                    before:
                      currentIncident
                        ?.quoted_amount != null
                        ? `NT$ ${Number(
                            currentIncident
                              .quoted_amount
                          ).toLocaleString()}`
                        : '—',
                    after:
                      proposed.quoted_amount != null
                        ? `NT$ ${Number(
                            proposed.quoted_amount
                          ).toLocaleString()}`
                        : currentIncident
                            ?.quoted_amount != null
                          ? `NT$ ${Number(
                              currentIncident
                                .quoted_amount
                            ).toLocaleString()}`
                          : '—',
                  },
                ].filter(
                  (row) =>
                    String(row.before) !==
                    String(row.after)
                )

                return (
                  <article
                    key={revision.id}
                    className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-gray-500">
                          {vehicle?.public_case_id ??
                            revision.vehicle_id}
                        </p>

                        <h3 className="mt-1 text-xl font-semibold text-gray-950">
                          {vehicle?.model_year}{' '}
                          {vehicle?.model}
                        </h3>

                    {vehicle && (
                      <>
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        owner={ownerContactMap.get(vehicle.id) ?? null}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />


                      <AdminCaseReports
                        vehicleId={vehicle.id}
                        reports={reportMap.get(vehicle.id) ?? []}
                      />
              </>
            )}
                      </div>

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                        修改申請
                      </span>
                    </div>

                    <div className="mt-5 rounded-2xl bg-gray-50 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">
                          修改內容
                        </p>

                        {vehicle && (
                          <Link
                            href={`/cases/${vehicle.public_case_id}?from=cases`}
                            target="_blank"
                            className="text-xs font-medium text-blue-700 hover:underline"
                          >
                            查看完整案件 ↗
                          </Link>
                        )}
                      </div>

                      {diffRows.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {diffRows.map((row) => (
                            <div
                              key={row.label}
                              className="rounded-xl border border-gray-200 bg-white p-4"
                            >
                              <p className="text-xs font-medium text-gray-500">
                                {row.label}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-500 line-through decoration-gray-300">
                                  {row.before}
                                </span>

                                <span className="text-gray-300">
                                  →
                                </span>

                                <span className="font-semibold text-gray-950">
                                  {row.after}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-gray-500">
                          此申請沒有偵測到資料差異。
                        </p>
                      )}
                    </div>

                    <form
                      action={reviewRevision}
                      className="mt-5"
                    >
                      <input
                        type="hidden"
                        name="revision_id"
                        value={revision.id}
                      />

                      <textarea
                        name="note"
                        rows={3}
                        placeholder="管理員備註（可留空）"
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          name="action"
                          value="approve"
                          className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-medium text-white"
                        >
                          核准修改
                        </button>

                        <button
                          name="action"
                          value="needs_revision"
                          className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white"
                        >
                          要求修改
                        </button>

                        <button
                          name="action"
                          value="reject"
                          className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700"
                        >
                          拒絕
                        </button>
                      </div>
                    </form>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-950">
              待審下架申請
            </h2>

            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
              {archiveRequests?.length ?? 0}
            </span>
          </div>

          {!archiveRequests?.length ? (
            <div className="mt-5 rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              目前沒有待審下架申請
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {archiveRequests.map((request) => {
                const vehicle =
                  vehicleMap.get(
                    request.vehicle_id
                  )

                return (
                  <article
                    key={request.id}
                    className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <p className="text-sm text-gray-500">
                      {vehicle?.public_case_id}
                    </p>

                    <h3 className="mt-1 text-xl font-semibold">
                      {vehicle?.model_year}{' '}
                      {vehicle?.model}
                    </h3>

                    {vehicle && (
                      <div className="mt-2">
                        <Link
                          href={`/cases/${vehicle.public_case_id}?from=cases`}
                          target="_blank"
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          查看完整案件 ↗
                        </Link>
                      </div>
                    )}

                    {vehicle && (
                      <>
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        owner={ownerContactMap.get(vehicle.id) ?? null}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />


                      <AdminCaseReports
                        vehicleId={vehicle.id}
                        reports={reportMap.get(vehicle.id) ?? []}
                      />
                      </>
                    )}

                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-900">
                      下架原因：{request.reason}
                    </div>

                    <form
                      action={reviewArchive}
                      className="mt-5"
                    >
                      <input
                        type="hidden"
                        name="request_id"
                        value={request.id}
                      />

                      <textarea
                        name="note"
                        rows={3}
                        placeholder="管理員備註（可留空）"
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          name="action"
                          value="approve"
                          className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-medium text-white"
                        >
                          核准下架
                        </button>

                        <button
                          name="action"
                          value="reject"
                          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium"
                        >
                          拒絕
                        </button>
                      </div>
                    </form>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-950">
              已封存案件
            </h2>

            <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">
              {archivedVehicles?.length ?? 0}
            </span>
          </div>

          {!archivedVehicles?.length ? (
            <div className="mt-5 rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              目前沒有封存案件
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {archivedVehicles.map((vehicle) => (
                <article
                  key={vehicle.id}
                  className="relative rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-sm text-gray-500">
                    {vehicle.public_case_id}
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">
                    {vehicle.model_year}{' '}
                    {vehicle.model}
                  </h3>

                    {vehicle && (
                      <>
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        owner={ownerContactMap.get(vehicle.id) ?? null}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />


                      <AdminCaseReports
                        vehicleId={vehicle.id}
                        reports={reportMap.get(vehicle.id) ?? []}
                      />
                      </>
                    )}

                  <p className="mt-3 text-sm text-gray-600">
                    封存原因：
                    {vehicle.archive_reason ??
                      '未填寫'}
                  </p>

                  <form
                    action={restoreArchived}
                    className="mt-5"
                  >
                    <input
                      type="hidden"
                      name="vehicle_id"
                      value={vehicle.id}
                    />

                    <input
                      name="note"
                      placeholder="恢復備註（可留空）"
                      className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm"
                    />

                    <button
                      type="submit"
                      className="ml-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white"
                    >
                      恢復案件
                    </button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
