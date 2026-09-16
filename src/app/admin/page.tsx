import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
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
  revalidatePath('/')

  redirect(`/admin?done=${action}`)
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

export default async function AdminPage() {
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

  const { data: vehicles, error: vehicleError } = await supabase
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
            dealer_visited,
            has_work_order,
            repair_status,
            has_quote,
            quoted_amount,
            moderation_status
          `)
          .in('vehicle_id', vehicleIds)
          .order('incident_number', { ascending: true })
      : { data: [], error: null }

  const hasError = vehicleError || incidentError

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-start justify-between gap-6">
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
              待審核案件
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              檢查車主提交的案件內容，再決定是否公開。
            </p>
          </div>

          <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            {vehicles?.length ?? 0} 件待審核
          </div>
        </div>

        {hasError && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            讀取待審核案件失敗：
            {vehicleError?.message ?? incidentError?.message}
          </div>
        )}

        {!hasError && (!vehicles || vehicles.length === 0) && (
          <section className="mt-10 rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="font-semibold text-gray-950">
              目前沒有待審核案件
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              新案件送出後會出現在這裡。
            </p>
          </section>
        )}

        {!hasError && vehicles && vehicles.length > 0 && (
          <div className="mt-10 space-y-6">
            {vehicles.map((vehicle) => {
              const vehicleIncidents =
                incidents?.filter(
                  (incident) => incident.vehicle_id === vehicle.id
                ) ?? []

              return (
                <article
                  key={vehicle.id}
                  className="overflow-hidden rounded-3xl bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {vehicle.public_case_id}
                      </p>

                      <h2 className="mt-1 text-2xl font-semibold text-gray-950">
                        {vehicle.model_year} {vehicle.model}
                      </h2>

                      <p className="mt-2 text-sm text-gray-500">
                        提交日期：
                        {new Date(vehicle.created_at).toLocaleDateString(
                          'zh-TW'
                        )}
                      </p>
                    </div>

                    <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                      待審核
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
                            <p className="text-xs text-gray-500">里程</p>
                            <p className="mt-1 font-medium text-gray-950">
                              {incident.mileage.toLocaleString()} km
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">發生日期</p>
                            <p className="mt-1 font-medium text-gray-950">
                              {incident.incident_date ?? '未填寫'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">發生頻率</p>
                            <p className="mt-1 font-medium text-gray-950">
                              {incident.occurrence_frequency
                                ? frequencyLabels[
                                    incident.occurrence_frequency
                                  ] ?? incident.occurrence_frequency
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

                        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
                          <span>
                            回廠：
                            {incident.dealer_visited ? '是' : '否'}
                          </span>

                          <span>
                            工單：
                            {incident.has_work_order ? '有' : '無'}
                          </span>

                          <span>
                            報價：
                            {incident.has_quote
                              ? incident.quoted_amount !== null
                                ? `NT$ ${incident.quoted_amount.toLocaleString()}`
                                : '有'
                              : '無'}
                          </span>
                        </div>
                      </section>
                    ))}

                    <form
                      action={moderateCase}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
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
                          placeholder="例如：資料完整，可公開。或說明需要車主補充的內容。"
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
                          要求修改
                        </button>

                        <button
                          type="submit"
                          name="action"
                          value="approved"
                          className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                        >
                          核准公開
                        </button>
                      </div>
                    </form>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
