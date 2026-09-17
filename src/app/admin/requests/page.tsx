import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import AdminOwnerContact from '@/components/admin/AdminOwnerContact'

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

  const hasError =
    revisionError ||
    archiveError ||
    vehicleError ||
    archivedError

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
            操作失敗，資料狀態可能已改變，請重新整理後再試。
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
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />
                    )}
                      </div>

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                        修改申請
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 rounded-2xl bg-gray-50 p-5 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          新車型
                        </p>
                        <p className="mt-1 font-medium">
                          {String(
                            proposed.model ?? '-'
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          新年式
                        </p>
                        <p className="mt-1 font-medium">
                          {String(
                            proposed.model_year ??
                              '-'
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          里程
                        </p>
                        <p className="mt-1 font-medium">
                          {String(
                            proposed.mileage ?? '-'
                          )}{' '}
                          km
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          發生日期
                        </p>
                        <p className="mt-1 font-medium">
                          {String(
                            proposed.incident_date ??
                              '-'
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          維修狀態
                        </p>
                        <p className="mt-1 font-medium">
                          {String(
                            proposed.repair_status ??
                              '-'
                          )}
                        </p>
                      </div>
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
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />
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
                      <AdminOwnerContact
                        vehicleId={vehicle.id}
                        className="mt-3 lg:absolute lg:right-6 lg:top-14 lg:mt-0"
                      />
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
