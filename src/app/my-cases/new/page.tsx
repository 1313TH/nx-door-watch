import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function createCase(formData: FormData) {
  'use server'

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

  const repairStatus =
    String(formData.get('repair_status') ?? 'not_visited')

  const doorPositions = formData
    .getAll('door_positions')
    .map(String)

  const symptoms = formData
    .getAll('symptoms')
    .map(String)

  const dealerVisited = formData.get('dealer_visited') === 'on'
  const hasWorkOrder = formData.get('has_work_order') === 'on'
  const hasQuote = formData.get('has_quote') === 'on'

  const quotedAmountRaw = String(
    formData.get('quoted_amount') ?? ''
  ).trim()

  const quotedAmount =
    quotedAmountRaw === '' ? null : Number(quotedAmountRaw)

  if (!model || !modelYear || !Number.isFinite(mileage)) {
    redirect('/my-cases/new?error=missing_fields')
  }

  if (doorPositions.length === 0 || symptoms.length === 0) {
    redirect('/my-cases/new?error=missing_issue')
  }

  const { data: createdCase, error: createError } = await supabase.rpc(
    'create_case_atomic',
    {
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
      p_quoted_amount: hasQuote ? quotedAmount : null,
    }
  )

  if (createError) {
    console.error('create_case_atomic error:', createError)

    redirect(
      `/my-cases/new?error=create&detail=${encodeURIComponent(
        createError.message ?? 'Unknown error'
      )}`
    )
  }

  const vehicleId = createdCase?.[0]?.vehicle_id

  if (!vehicleId) {
    redirect('/my-cases/new?error=create')
  }

  const reportingChannels = [
    'lexus',
    'vehicle_safety',
    'consumer_protection',
    '1950',
    'motc_mailbox',
  ]

  for (const channel of reportingChannels) {
    const status = String(
      formData.get(`report_${channel}`) ?? ''
    )

    if (status !== 'submitted') {
      continue
    }

    const { error: reportError } = await supabase.rpc(
      'upsert_case_report',
      {
        p_vehicle_id: vehicleId,
        p_channel: channel,
        p_status: status,
        p_reported_at:
          status === 'submitted'
            ? new Date().toISOString().slice(0, 10)
            : null,
        p_reference_number: null,
        p_note: null,
      }
    )

    if (reportError) {
      console.error(
        `upsert_case_report ${channel} error:`,
        reportError
      )
    }
  }

  redirect('/my-cases?created=1')
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    detail?: string
  }>
}) {
  const params = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const errorMessages: Record<string, string> = {
    missing_fields: '請填寫車型、年式與目前里程。',
    missing_issue: '請至少選擇一個故障車門位置與一項症狀。',
    case_id: '案件編號建立失敗，請稍後再試。',
    vehicle: '車輛資料建立失敗，請稍後再試。',
    incident: '故障資料建立失敗，請稍後再試。',
    create: '案件建立失敗，請稍後再試。',
  }

  const errorMessage = params.error
    ? errorMessages[params.error]
    : null

  const inputClass =
    'mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 outline-none focus:border-gray-900'

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/my-cases"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回我的案件
        </Link>

        <h1 className="mt-4 text-3xl font-semibold text-gray-950">
          建立案例
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          資料送出後會先進入審核，不會立即公開。
          審核完成後仍可回到「我的案件」查看與更新進度。
        </p>

        {errorMessage && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-medium">
              {errorMessage}
            </p>

            {params.detail && (
              <p className="mt-2 break-words text-xs">
                {params.detail}
              </p>
            )}
          </div>
        )}

        <form
          action={createCase}
          className="mt-8 space-y-8 rounded-3xl bg-white p-8 shadow-sm"
        >
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
                  defaultValue=""
                  className={inputClass}
                >
                  <option value="" disabled>
                    請選擇
                  </option>
                  <option value="NX200">NX200</option>
                  <option value="NX250">NX250</option>
                  <option value="NX350">NX350</option>
                  <option value="NX350h">NX350h</option>
                  <option value="NX450h+">NX450h+</option>
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
                  placeholder="例如：2026"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                發生問題時里程（km）
                <input
                  name="mileage"
                  type="number"
                  min="0"
                  required
                  placeholder="例如：12500"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                問題發生日期
                <input
                  name="incident_date"
                  type="date"
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
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              發生頻率
              <select
                name="occurrence_frequency"
                defaultValue=""
                className={inputClass}
              >
                <option value="">未填寫</option>
                <option value="first_time">首次發生</option>
                <option value="two_to_three">已發生 2～3 次</option>
                <option value="repeated">反覆發生</option>
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
                <input type="checkbox" name="dealer_visited" />
                已回 Lexus 經銷商／服務廠檢查
              </label>

              <label className="flex items-center gap-3 text-sm text-gray-800">
                <input type="checkbox" name="has_work_order" />
                已取得維修工單
              </label>

              <label className="block text-sm font-medium text-gray-700">
                目前維修狀態
                <select
                  name="repair_status"
                  defaultValue="not_visited"
                  className={inputClass}
                >
                  <option value="not_visited">尚未回廠</option>
                  <option value="waiting_inspection">等待檢查</option>
                  <option value="observe">持續觀察</option>
                  <option value="no_fault_code">查無故障碼</option>
                  <option value="waiting_parts">等待零件</option>
                  <option value="parts_arrived">零件已到</option>
                  <option value="repair_scheduled">已排定維修</option>
                  <option value="repaired_warranty">保固維修完成</option>
                  <option value="repaired_goodwill">專案／善意維修完成</option>
                  <option value="repaired_self_paid">自費維修完成</option>
                  <option value="completed">已完成／結案</option>
                  <option value="other">其他</option>
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm text-gray-800">
                <input type="checkbox" name="has_quote" />
                已取得報價
              </label>

              <label className="block text-sm font-medium text-gray-700">
                報價金額（NT$）
                <input
                  name="quoted_amount"
                  type="number"
                  min="0"
                  placeholder="尚無報價可留空"
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <hr className="border-gray-200" />

          <section>
            <h2 className="text-lg font-semibold text-gray-950">
              正式反映／申訴進度
            </h2>

            <p className="mt-1 text-sm leading-6 text-gray-500">
              選填。點擊管道名稱可直接前往官方網站進行反映或申訴；
              完成後再將狀態改為「已正式反映」。
            </p>

            <div className="mt-5 space-y-4">
              {[
                {
                  value: 'lexus',
                  label: 'Lexus 原廠／客服',
                  description: '向 Lexus 客服、經銷商或服務廠正式反映',
                  href: 'https://www.lexus.com.tw/contact.aspx?s=faq&sid=1',
                },
                {
                  value: 'vehicle_safety',
                  label: '車輛安全瑕疵通報',
                  description: '向交通部車輛安全瑕疵資訊通報平台提出通報',
                  href: 'https://www.car-safety.org.tw/car_safety/VehicleFailureNotification',
                },
                {
                  value: 'consumer_protection',
                  label: '消費者保護線上申訴',
                  description: '透過行政院消費者保護會提出正式線上申訴',
                  href: 'https://appeal.cpc.ey.gov.tw/WWW/step_one.aspx',
                },
                {
                  value: '1950',
                  label: '1950 消費者服務專線',
                  description: '查看官方說明；1950 可轉接所在地消費者服務中心',
                  href: 'https://cpc.ey.gov.tw/Page/1DCF8AA4D223F601/ebc630d6-b774-4db5-abdc-5b52ed0963cc',
                },
                {
                  value: 'motc_mailbox',
                  label: '交通部部長／民意信箱',
                  description: '向交通部提出陳情，可填寫內容並上傳附件',
                  href: 'https://poms.motc.gov.tw/message/tw',
                },
              ].map((item) => (
                <div
                  key={item.value}
                  className="rounded-2xl border border-gray-200 p-4"
                >
                  <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
                    <div className="min-w-0">
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
                        style={{
                          textDecorationLine: 'underline',
                          textDecorationStyle: 'dashed',
                          textDecorationThickness: '1px',
                          textUnderlineOffset: '4px',
                          textDecorationColor: '#60a5fa',
                        }}
                      >
                        {item.label}
                        <span aria-hidden="true">↗</span>
                      </a>

                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {item.description}
                      </p>
                    </div>

                    <select
                      name={`report_${item.value}`}
                      defaultValue=""
                      className="mt-3 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 sm:mt-0"
                    >
                      <option value="">
                        尚未反映
                      </option>

                      <option value="submitted">
                        已正式反映
                      </option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              點擊上方管道名稱可直接前往官方頁面。
              完成申訴或通報後，再將狀態改為「已正式反映」，
              才會加入平台的公開統計數據。
            </div>
          </section>

          <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            送出後案件狀態會是「審核中」。
            在管理員核准以前，不會出現在公開案例資料中。
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/my-cases"
              className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-800 hover:bg-gray-50"
            >
              取消
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-gray-950 px-6 py-3 font-medium text-white hover:bg-gray-800"
            >
              送出案例
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
