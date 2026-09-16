import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function addIncidentAction(formData: FormData) {
  'use server'

  const publicCaseId = String(formData.get('public_case_id') ?? '')
  const vehicleId = String(formData.get('vehicle_id') ?? '')

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
    !publicCaseId ||
    !vehicleId ||
    !Number.isFinite(mileage) ||
    mileage < 0 ||
    doorPositions.length === 0 ||
    symptoms.length === 0
  ) {
    redirect(
      `/my-cases/${publicCaseId}/new-incident?error=invalid`
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data, error } = await supabase.rpc(
    'add_incident_atomic',
    {
      p_vehicle_id: vehicleId,
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
    console.error('add_incident_atomic error:', error)

    redirect(
      `/my-cases/${publicCaseId}/new-incident?error=create`
    )
  }

  const created = Array.isArray(data) ? data[0] : data

  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath(`/cases/${publicCaseId}`)
  revalidatePath('/cases')
  revalidatePath('/')

  redirect(
    `/my-cases/${publicCaseId}?created=${
      created?.incident_number ?? ''
    }`
  )
}

export default async function NewIncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_case_id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { public_case_id } = await params
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

  const { data: latestIncident } = await supabase
    .from('incidents')
    .select(`
      incident_number,
      mileage,
      incident_date,
      repair_status
    `)
    .eq('vehicle_id', vehicle.id)
    .order('incident_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNumber =
    (latestIncident?.incident_number ?? 0) + 1

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href={`/my-cases/${vehicle.public_case_id}`}
          className="text-sm text-gray-500 transition hover:text-gray-950"
        >
          ← 回 {vehicle.public_case_id}
        </Link>

        <header className="mt-7">
          <p className="text-sm font-medium text-gray-500">
            {vehicle.public_case_id} · {vehicle.model_year}{' '}
            {vehicle.model}
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
            新增後續紀錄
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            預計建立第 {nextNumber} 次紀錄。實際編號會在送出時由資料庫自動產生。
          </p>
        </header>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error === 'invalid'
              ? '請確認里程、問題位置與症狀都有正確填寫。'
              : '後續紀錄建立失敗，請稍後再試。'}
          </div>
        )}

        {latestIncident && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            上一筆為第 {latestIncident.incident_number} 次紀錄，
            當時里程{' '}
            <span className="font-medium text-gray-950">
              {latestIncident.mileage.toLocaleString()} km
            </span>
            。
          </div>
        )}

        <form
          action={addIncidentAction}
          className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <input
            type="hidden"
            name="vehicle_id"
            value={vehicle.id}
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
                  defaultValue={latestIncident?.mileage ?? ''}
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-900"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-gray-700">
                  發生日期
                </span>

                <input
                  type="date"
                  name="incident_date"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-900"
                />
              </label>
            </div>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-7">
            <h2 className="text-lg font-semibold text-gray-950">
              問題位置
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              可複選。
            </p>

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
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-7">
            <h2 className="text-lg font-semibold text-gray-950">
              症狀
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              可複選。
            </p>

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
                required
                name="occurrence_frequency"
                defaultValue="repeated"
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
            <h2 className="text-lg font-semibold text-gray-950">
              維修進度
            </h2>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="dealer_visited"
                />
                <span className="text-sm text-gray-700">
                  已回 Lexus 經銷商／服務廠檢查
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="has_work_order"
                />
                <span className="text-sm text-gray-700">
                  已取得維修工單
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="has_quote"
                />
                <span className="text-sm text-gray-700">
                  已取得報價
                </span>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-gray-700">
                目前維修狀態
              </span>

              <select
                required
                name="repair_status"
                defaultValue="not_visited"
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
              >
                <option value="not_visited">尚未回廠</option>
                <option value="waiting_inspection">等待檢查</option>
                <option value="observe">持續觀察</option>
                <option value="no_fault_code">查無故障碼</option>
                <option value="waiting_parts">等待零件</option>
                <option value="parts_arrived">零件已到</option>
                <option value="repair_scheduled">已排定維修</option>
                <option value="repaired_warranty">保固維修完成</option>
                <option value="repaired_goodwill">
                  專案／善意維修完成
                </option>
                <option value="repaired_self_paid">自費維修完成</option>
                <option value="completed">已完成／結案</option>
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
                placeholder="沒有報價可留空"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-900"
              />
            </label>
          </section>

          <div className="mt-7 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            新增的後續紀錄會先標示為「審核中」。
            原本已公開的案件與舊紀錄不會因此下架。
          </div>

          <div className="mt-7 flex justify-end gap-3">
            <Link
              href={`/my-cases/${vehicle.public_case_id}`}
              className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-gray-950 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              送出後續紀錄
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
