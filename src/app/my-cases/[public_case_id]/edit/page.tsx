import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function updateCase(formData: FormData) {
  'use server'

  const publicCaseId = String(
    formData.get('public_case_id') ?? ''
  ).trim()

  const vehicleId = String(
    formData.get('vehicle_id') ?? ''
  ).trim()

  if (!publicCaseId || !vehicleId) {
    redirect('/my-cases')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const model = String(formData.get('model') ?? '').trim()
  const modelYear = Number(formData.get('model_year'))
  const mileage = Number(formData.get('mileage'))

  const incidentDate =
    String(formData.get('incident_date') ?? '').trim() || null

  const occurrenceFrequency =
    String(formData.get('occurrence_frequency') ?? '').trim() || null

  const repairStatus = String(
    formData.get('repair_status') ?? 'not_visited'
  )

  const doorPositions = formData
    .getAll('door_positions')
    .map(String)

  const symptoms = formData
    .getAll('symptoms')
    .map(String)

  const dealerVisited =
    formData.get('dealer_visited') === 'on'

  const hasWorkOrder =
    formData.get('has_work_order') === 'on'

  const hasQuote =
    formData.get('has_quote') === 'on'

  const quotedAmountRaw = String(
    formData.get('quoted_amount') ?? ''
  ).trim()

  const quotedAmount =
    quotedAmountRaw === ''
      ? null
      : Number(quotedAmountRaw)

  if (
    !model ||
    !modelYear ||
    !Number.isFinite(mileage)
  ) {
    redirect(
      `/my-cases/${publicCaseId}/edit?error=missing_fields`
    )
  }

  if (
    doorPositions.length === 0 ||
    symptoms.length === 0
  ) {
    redirect(
      `/my-cases/${publicCaseId}/edit?error=missing_issue`
    )
  }

  const { error } = await supabase.rpc(
    'update_editable_case',
    {
      p_vehicle_id: vehicleId,
      p_model: model,
      p_model_year: modelYear,
      p_mileage: mileage,
      p_incident_date: incidentDate,
      p_door_positions: doorPositions,
      p_symptoms: symptoms,
      p_occurrence_frequency: occurrenceFrequency,
      p_dealer_visited: dealerVisited,
      p_has_work_order: hasWorkOrder,
      p_repair_status: repairStatus,
      p_has_quote: hasQuote,
      p_quoted_amount: hasQuote
        ? quotedAmount
        : null,
    }
  )

  if (error) {
    console.error(
      'update_editable_case error:',
      error
    )

    redirect(
      `/my-cases/${publicCaseId}/edit?error=update`
    )
  }

  revalidatePath('/my-cases')
  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/admin')

  redirect(
    `/my-cases/${publicCaseId}?case_updated=1`
  )
}

export default async function EditCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ public_case_id: string }>
  searchParams: Promise<{ error?: string }>
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

  const { data: vehicle, error: vehicleError } =
    await supabase
      .from('vehicles')
      .select(`
        id,
        owner_id,
        public_case_id,
        model,
        model_year,
        moderation_status
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

  if (
    !['pending', 'needs_revision'].includes(
      vehicle.moderation_status
    )
  ) {
    redirect(`/my-cases/${public_case_id}`)
  }

  const { data: incident, error: incidentError } =
    await supabase
      .from('incidents')
      .select(`
        id,
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
      .eq('vehicle_id', vehicle.id)
      .eq('incident_number', 1)
      .maybeSingle()

  if (incidentError) {
    throw new Error(incidentError.message)
  }

  if (!incident) {
    notFound()
  }

  const errorMessages: Record<string, string> = {
    missing_fields:
      '請填寫車型、年式與發生問題時里程。',
    missing_issue:
      '請至少選擇一個問題位置與一項症狀。',
    update:
      '案件修改失敗。案件狀態可能已經改變，請回上一頁重新確認。',
  }

  const errorMessage = query.error
    ? errorMessages[query.error] ?? null
    : null

  const inputClass =
    'mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 outline-none focus:border-gray-900'

  const doorPositions =
    incident.door_positions ?? []

  const symptoms =
    incident.symptoms ?? []

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href={`/my-cases/${public_case_id}`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回案件
        </Link>

        <h1 className="mt-4 text-3xl font-semibold text-gray-950">
          修改案件
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          {vehicle.moderation_status ===
          'needs_revision'
            ? '請依照管理員要求修正資料。送出後案件會重新公開，並回到待後審狀態。'
            : '案件目前已公開並等待後續審核，你仍可在審核完成前修改內容。'}
        </p>

        {errorMessage && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form
          action={updateCase}
          className="mt-8 space-y-8 rounded-3xl bg-white p-8 shadow-sm"
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
              車輛資料
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                NX 車型
                <select
                  name="model"
                  required
                  defaultValue={vehicle.model}
                  className={inputClass}
                >
                  <option value="NX200">
                    NX200
                  </option>
                  <option value="NX250">
                    NX250
                  </option>
                  <option value="NX350">
                    NX350
                  </option>
                  <option value="NX350h">
                    NX350h
                  </option>
                  <option value="NX450h+">
                    NX450h+
                  </option>
                </select>
              </label>

              <label className="text-sm font-medium text-gray-700">
                年式
                <input
                  name="model_year"
                  type="number"
                  min="2015"
                  max="2030"
                  required
                  defaultValue={vehicle.model_year}
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                發生問題時里程（km）
                <input
                  name="mileage"
                  type="number"
                  min="0"
                  max="1000000"
                  required
                  defaultValue={incident.mileage}
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                問題發生日期
                <input
                  name="incident_date"
                  type="date"
                  defaultValue={
                    incident.incident_date ?? ''
                  }
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <hr className="border-gray-200" />

          <section>
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
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-sm text-gray-800"
                >
                  <input
                    type="checkbox"
                    name="door_positions"
                    value={value}
                    defaultChecked={doorPositions.includes(
                      value
                    )}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section>
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
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-sm text-gray-800"
                >
                  <input
                    type="checkbox"
                    name="symptoms"
                    value={value}
                    defaultChecked={symptoms.includes(
                      value
                    )}
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              發生頻率
              <select
                name="occurrence_frequency"
                defaultValue={
                  incident.occurrence_frequency ?? ''
                }
                className={inputClass}
              >
                <option value="">
                  未填寫
                </option>
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

          <hr className="border-gray-200" />

          <section>
            <h2 className="text-lg font-semibold text-gray-950">
              維修進度
            </h2>

            <div className="mt-5 space-y-4">
              <label className="flex items-center gap-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  name="dealer_visited"
                  defaultChecked={
                    incident.dealer_visited
                  }
                />
                已回 Lexus 經銷商／服務廠檢查
              </label>

              <label className="flex items-center gap-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  name="has_work_order"
                  defaultChecked={
                    incident.has_work_order
                  }
                />
                已取得維修工單
              </label>

              <label className="block text-sm font-medium text-gray-700">
                目前維修狀態
                <select
                  name="repair_status"
                  defaultValue={
                    incident.repair_status
                  }
                  className={inputClass}
                >
                  <option value="not_visited">
                    尚未回廠
                  </option>
                  <option value="waiting_inspection">
                    等待檢查
                  </option>
                  <option value="observe">
                    持續觀察
                  </option>
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
                  <option value="other">
                    其他
                  </option>
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  name="has_quote"
                  defaultChecked={
                    incident.has_quote
                  }
                />
                已取得報價
              </label>

              <label className="block text-sm font-medium text-gray-700">
                報價金額（NT$）
                <input
                  name="quoted_amount"
                  type="number"
                  min="0"
                  defaultValue={
                    incident.quoted_amount ?? ''
                  }
                  placeholder="尚無報價可留空"
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            儲存修改後，案件會立即恢復公開並回到「已公開・待審」狀態，
            管理員會再進行後續確認。
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href={`/my-cases/${public_case_id}`}
              className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-800 hover:bg-gray-50"
            >
              取消
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-gray-950 px-6 py-3 font-medium text-white hover:bg-gray-800"
            >
              儲存並重新公開
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
