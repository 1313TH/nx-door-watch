import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function resubmitIncidentAction(formData: FormData) {
  'use server'

  const incidentId = String(formData.get('incident_id') ?? '')
  const publicCaseId = String(formData.get('public_case_id') ?? '')

  const mileage = Number(formData.get('mileage'))
  const incidentDate =
    String(formData.get('incident_date') ?? '') || null

  const doorPositions = formData
    .getAll('door_positions')
    .map(String)

  const symptoms = formData
    .getAll('symptoms')
    .map(String)

  const occurrenceFrequency = String(
    formData.get('occurrence_frequency') ?? ''
  )

  const dealerVisited =
    formData.get('dealer_visited') === 'on'

  const hasWorkOrder =
    formData.get('has_work_order') === 'on'

  const repairStatus = String(
    formData.get('repair_status') ?? ''
  )

  const hasQuote =
    formData.get('has_quote') === 'on'

  const quotedAmountRaw = String(
    formData.get('quoted_amount') ?? ''
  ).trim()

  const quotedAmount =
    hasQuote && quotedAmountRaw
      ? Number(quotedAmountRaw)
      : null

  if (
    !incidentId ||
    !publicCaseId ||
    !Number.isFinite(mileage) ||
    mileage < 0 ||
    doorPositions.length === 0 ||
    symptoms.length === 0
  ) {
    redirect(
      `/my-cases/${publicCaseId}/incidents/${incidentId}/edit?error=invalid`
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.rpc(
    'resubmit_incident_atomic',
    {
      p_incident_id: incidentId,
      p_mileage: mileage,
      p_incident_date: incidentDate,
      p_door_positions: doorPositions,
      p_symptoms: symptoms,
      p_occurrence_frequency: occurrenceFrequency,
      p_dealer_visited: dealerVisited,
      p_has_work_order: hasWorkOrder,
      p_repair_status: repairStatus,
      p_has_quote: hasQuote,
      p_quoted_amount: quotedAmount,
    }
  )

  if (error) {
    console.error('resubmit_incident_atomic error:', error)

    redirect(
      `/my-cases/${publicCaseId}/incidents/${incidentId}/edit?error=resubmit`
    )
  }

  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/admin')
  revalidatePath('/cases')
  revalidatePath(`/cases/${publicCaseId}`)
  revalidatePath('/')

  redirect(
    `/my-cases/${publicCaseId}?resubmitted=1`
  )
}

export default async function EditIncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    public_case_id: string
    incident_id: string
  }>
  searchParams: Promise<{ error?: string }>
}) {
  const { public_case_id, incident_id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: vehicle, error: vehicleError } =
    await supabase
      .from('vehicles')
      .select(`
        id,
        owner_id,
        public_case_id,
        model,
        model_year
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

  const { data: incident, error: incidentError } =
    await supabase
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
      .eq('id', incident_id)
      .eq('vehicle_id', vehicle.id)
      .maybeSingle()

  if (incidentError) {
    throw new Error(incidentError.message)
  }

  if (!incident) {
    notFound()
  }

  if (incident.moderation_status !== 'needs_revision') {
    redirect(`/my-cases/${public_case_id}`)
  }

  const { data: feedbackData } = await supabase.rpc(
    'get_incident_feedback',
    {
      p_incident_id: incident.id,
    }
  )

  const feedback = Array.isArray(feedbackData)
    ? feedbackData[0] ?? null
    : feedbackData ?? null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href={`/my-cases/${vehicle.public_case_id}`}
          className="text-sm text-gray-500 hover:text-gray-950"
        >
          ← 回 {vehicle.public_case_id}
        </Link>

        <header className="mt-7">
          <p className="text-sm font-medium text-gray-500">
            {vehicle.public_case_id} · {vehicle.model_year}{' '}
            {vehicle.model}
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-gray-950">
            修改第 {incident.incident_number} 次紀錄
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            修改完成後會重新送交管理員審核。
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">
            管理員要求修改
          </p>

          <p className="mt-2 text-sm leading-6 text-amber-800">
            {feedback?.note ||
              '請補充或修正這筆紀錄後重新送審。'}
          </p>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error === 'invalid'
              ? '請確認必填資料都有正確填寫。'
              : '重新送審失敗，請稍後再試。'}
          </div>
        )}

        <form
          action={resubmitIncidentAction}
          className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
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

          <section>
            <h2 className="text-lg font-semibold text-gray-950">
              發生資訊
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-gray-700">
                  發生里程（km）
                </span>

                <input
                  required
                  min="0"
                  type="number"
                  name="mileage"
                  defaultValue={incident.mileage}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-gray-700">
                  發生日期
                </span>

                <input
                  type="date"
                  name="incident_date"
                  defaultValue={incident.incident_date ?? ''}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-7">
            <h2 className="text-lg font-semibold">
              問題位置
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['front_left', '左前門'],
                ['front_right', '右前門'],
                ['rear_left', '左後門'],
                ['rear_right', '右後門'],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    name="door_positions"
                    value={value}
                    defaultChecked={incident.door_positions.includes(
                      value
                    )}
                  />

                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-7">
            <h2 className="text-lg font-semibold">
              症狀
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['cannot_open', '車門無法開啟'],
                ['intermittent', '偶發無法開啟'],
                ['delay', '開門反應延遲'],
                ['warning', '出現警告訊息'],
                ['abnormal_sound', '異常聲響'],
                ['other', '其他'],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    name="symptoms"
                    value={value}
                    defaultChecked={incident.symptoms.includes(
                      value
                    )}
                  />

                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-gray-700">
                發生頻率
              </span>

              <select
                name="occurrence_frequency"
                defaultValue={
                  incident.occurrence_frequency ?? 'repeated'
                }
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
              >
                <option value="first_time">
                  首次發生
                </option>

                <option value="two_to_three">
                  已發生 2～3 次
                </option>

                <option value="repeated">
                  反覆發生
                </option>
              </select>
            </label>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-7">
            <h2 className="text-lg font-semibold">
              維修進度
            </h2>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="dealer_visited"
                  defaultChecked={incident.dealer_visited}
                />

                <span className="text-sm">
                  已回 Lexus 經銷商／服務廠檢查
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="has_work_order"
                  defaultChecked={incident.has_work_order}
                />

                <span className="text-sm">
                  已取得維修工單
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="has_quote"
                  defaultChecked={incident.has_quote}
                />

                <span className="text-sm">
                  已取得報價
                </span>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-gray-700">
                目前維修狀態
              </span>

              <select
                name="repair_status"
                defaultValue={incident.repair_status}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
              >
                <option value="not_visited">尚未回廠</option>
                <option value="waiting_inspection">
                  等待檢查
                </option>
                <option value="observe">持續觀察</option>
                <option value="no_fault_code">
                  查無故障碼
                </option>
                <option value="waiting_parts">
                  等待零件
                </option>
                <option value="parts_arrived">
                  零件已到
                </option>
                <option value="repair_scheduled">
                  已排定維修
                </option>
                <option value="repaired_warranty">
                  保固維修完成
                </option>
                <option value="repaired_goodwill">
                  專案／善意維修完成
                </option>
                <option value="repaired_self_paid">
                  自費維修完成
                </option>
                <option value="completed">
                  已完成／結案
                </option>
                <option value="other">其他</option>
              </select>
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-gray-700">
                報價金額（NT$）
              </span>

              <input
                min="0"
                type="number"
                name="quoted_amount"
                defaultValue={incident.quoted_amount ?? ''}
                placeholder="沒有報價可留空"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
              />
            </label>
          </section>

          <div className="mt-7 rounded-2xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            送出後，這筆紀錄會重新變成「審核中」。
            管理員核准前不會出現在公開案例頁。
          </div>

          <div className="mt-7 flex justify-end gap-3">
            <Link
              href={`/my-cases/${vehicle.public_case_id}`}
              className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium"
            >
              取消
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-gray-950 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              修改並重新送審
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
