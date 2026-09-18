import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'

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

export const dynamic = 'force-dynamic'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const getParam = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : ''
  }

  const q = getParam('q').trim().toLowerCase()
  const model = getParam('model')
  const year = getParam('year')
  const door = getParam('door')
  const symptom = getParam('symptom')
  const sort = getParam('sort') || 'published_newest'

  const supabase = createPublicClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select(`
      id,
      public_case_id,
      model,
      model_year,
      moderation_status,
      published_at
    `)
    .order('published_at', { ascending: false })

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
            repair_status,
            moderation_status
          `)
          .in('vehicle_id', vehicleIds)
          .order('incident_number', { ascending: false })
      : { data: [], error: null }

  const publicCases = vehicles ?? []
  const publicIncidents = incidents ?? []

  const {
    data: reportingRows,
    error: reportingError,
  } =
    vehicleIds.length > 0
      ? await supabase.rpc(
          'get_public_case_report_channels_batch',
          {
            p_vehicle_ids: vehicleIds,
          }
        )
      : { data: [], error: null }

  const reportingCountMap = new Map<
    string,
    number
  >()

  for (const row of reportingRows ?? []) {
    reportingCountMap.set(
      row.vehicle_id,
      (reportingCountMap.get(
        row.vehicle_id
      ) ?? 0) + 1
    )
  }

  const reportingCountForVehicle = (
    vehicleId: string
  ) =>
    reportingCountMap.get(vehicleId) ?? 0

  const modelOptions = [...new Set(publicCases.map((item) => item.model))]
    .filter(Boolean)
    .sort()

  const yearOptions = [
    ...new Set(publicCases.map((item) => String(item.model_year))),
  ]
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a))

  const incidentsForVehicle = (vehicleId: string) =>
    publicIncidents.filter(
      (incident) => incident.vehicle_id === vehicleId
    )

  const latestIncidentForVehicle = (vehicleId: string) => {
    const list = incidentsForVehicle(vehicleId)

    return [...list].sort(
      (a, b) =>
        Number(b.incident_number ?? 0) -
        Number(a.incident_number ?? 0)
    )[0]
  }

  let filteredCases = publicCases.filter((vehicle) => {
    const vehicleIncidents = incidentsForVehicle(vehicle.id)

    const matchesSearch =
      !q ||
      vehicle.public_case_id.toLowerCase().includes(q) ||
      vehicle.model.toLowerCase().includes(q) ||
      String(vehicle.model_year).includes(q)

    const matchesModel =
      !model || vehicle.model === model

    const matchesYear =
      !year || String(vehicle.model_year) === year

    const matchesDoor =
      !door ||
      vehicleIncidents.some((incident) =>
        incident.door_positions?.includes(door)
      )

    const matchesSymptom =
      !symptom ||
      vehicleIncidents.some((incident) =>
        incident.symptoms?.includes(symptom)
      )

    return (
      matchesSearch &&
      matchesModel &&
      matchesYear &&
      matchesDoor &&
      matchesSymptom
    )
  })

  filteredCases = [...filteredCases].sort((a, b) => {
    if (sort === 'incident_newest') {
      const latestDate = (vehicleId: string) =>
        Math.max(
          0,
          ...incidentsForVehicle(vehicleId).map((incident) =>
            incident.incident_date
              ? new Date(incident.incident_date).getTime()
              : 0
          )
        )

      return latestDate(b.id) - latestDate(a.id)
    }

    if (sort === 'mileage_asc' || sort === 'mileage_desc') {
      const aMileage =
        latestIncidentForVehicle(a.id)?.mileage ?? 0
      const bMileage =
        latestIncidentForVehicle(b.id)?.mileage ?? 0

      return sort === 'mileage_asc'
        ? aMileage - bMileage
        : bMileage - aMileage
    }

    const aPublished = a.published_at
      ? new Date(a.published_at).getTime()
      : 0

    const bPublished = b.published_at
      ? new Date(b.published_at).getTime()
      : 0

    return bPublished - aPublished
  })

  const hasError =
    vehicleError ||
    incidentError ||
    reportingError

  const hasFilters =
    Boolean(q) ||
    Boolean(model) ||
    Boolean(year) ||
    Boolean(door) ||
    Boolean(symptom) ||
    sort !== 'published_newest'

  const activeFilters = [
    q
      ? {
          key: 'q',
          label: `搜尋：${getParam('q')}`,
        }
      : null,
    model
      ? {
          key: 'model',
          label: `車型：${model}`,
        }
      : null,
    year
      ? {
          key: 'year',
          label: `年式：${year}`,
        }
      : null,
    door
      ? {
          key: 'door',
          label: `位置：${doorLabels[door] ?? door}`,
        }
      : null,
    symptom
      ? {
          key: 'symptom',
          label: `症狀：${symptomLabels[symptom] ?? symptom}`,
        }
      : null,
  ].filter(Boolean) as {
    key: string
    label: string
  }[]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 transition hover:text-gray-950"
            >
              ← 回首頁
            </Link>

            <p className="mt-6 text-sm font-medium text-gray-500">
              Lexus NX 電子門案例資料庫
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
              公開案例
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              搜尋與篩選已通過管理員審核的匿名車主案例。
            </p>
          </div>

          <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm">
            {filteredCases.length} 件符合條件
          </div>
        </header>

      <details className="group mt-9 md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm md:hidden">
          <span>
            搜尋與篩選條件
            {activeFilters.length > 0 && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {activeFilters.length}
              </span>
            )}
          </span>
          <span className="text-gray-500 transition-transform group-open:rotate-180">
            ↓
          </span>
        </summary>
        <form
          action="/cases"
          method="get"
          className="hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-sm group-open:block"
        >
          <div className="grid gap-4 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className="text-xs font-medium text-gray-500">
                搜尋
              </span>

              <input
                type="search"
                name="q"
                defaultValue={getParam('q')}
                placeholder="案件編號、車型或年式"
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none focus:border-gray-900"
              />
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                車型
              </span>

              <select
                name="model"
                defaultValue={model}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部車型</option>

                {modelOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                年式
              </span>

              <select
                name="year"
                defaultValue={year}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部年式</option>

                {yearOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                問題位置
              </span>

              <select
                name="door"
                defaultValue={door}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部位置</option>

                {Object.entries(doorLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                症狀
              </span>

              <select
                name="symptom"
                defaultValue={symptom}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部症狀</option>

                {Object.entries(symptomLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-4">
            <label className="min-w-52">
              <span className="text-xs font-medium text-gray-500">
                排序
              </span>

              <select
                name="sort"
                defaultValue={sort}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="published_newest">
                  最新公開
                </option>
                <option value="incident_newest">
                  最新發生日期
                </option>
                <option value="mileage_asc">
                  里程低 → 高
                </option>
                <option value="mileage_desc">
                  里程高 → 低
                </option>
              </select>
            </label>

            <div className="flex gap-2">
              {hasFilters && (
                <Link
                  href="/cases"
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  清除篩選
                </Link>
              )}

              <button
                type="submit"
                className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                套用
              </button>
            </div>
          </div>
        </form>
      </details>

        <form
          action="/cases"
          method="get"
          className="mt-9 hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:block"
        >
          <div className="grid gap-4 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className="text-xs font-medium text-gray-500">
                搜尋
              </span>

              <input
                type="search"
                name="q"
                defaultValue={getParam('q')}
                placeholder="案件編號、車型或年式"
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-950 outline-none focus:border-gray-900"
              />
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                車型
              </span>

              <select
                name="model"
                defaultValue={model}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部車型</option>

                {modelOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                年式
              </span>

              <select
                name="year"
                defaultValue={year}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部年式</option>

                {yearOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                問題位置
              </span>

              <select
                name="door"
                defaultValue={door}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部位置</option>

                {Object.entries(doorLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-medium text-gray-500">
                症狀
              </span>

              <select
                name="symptom"
                defaultValue={symptom}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm"
              >
                <option value="">全部症狀</option>

                {Object.entries(symptomLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-4">
            <label className="min-w-52">
              <span className="text-xs font-medium text-gray-500">
                排序
              </span>

              <select
                name="sort"
                defaultValue={sort}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="published_newest">
                  最新公開
                </option>
                <option value="incident_newest">
                  最新發生日期
                </option>
                <option value="mileage_asc">
                  里程低 → 高
                </option>
                <option value="mileage_desc">
                  里程高 → 低
                </option>
              </select>
            </label>

            <div className="flex gap-2">
              {hasFilters && (
                <Link
                  href="/cases"
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  清除篩選
                </Link>
              )}

              <button
                type="submit"
                className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                套用
              </button>
            </div>
          </div>
        </form>

        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-gray-500">
              已套用
            </span>

            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
              >
                {filter.label}
              </span>
            ))}

            <Link
              href="/cases"
              className="ml-1 text-xs font-medium text-gray-500 underline underline-offset-4 hover:text-gray-950"
            >
              全部清除
            </Link>
          </div>
        )}

        {hasError && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            公開案例讀取失敗：
            {vehicleError?.message ??
              incidentError?.message ??
              reportingError?.message}
          </div>
        )}

        {!hasError && filteredCases.length === 0 && (
          <section className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="font-semibold text-gray-950">
              找不到符合條件的案例
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              可以調整搜尋文字或清除部分篩選條件。
            </p>

            <Link
              href="/cases"
              className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white"
            >
              顯示全部案例
            </Link>
          </section>
        )}

        {!hasError && filteredCases.length > 0 && (
          <div className="mt-8 grid gap-5">
            {filteredCases.map((vehicle) => {
              const vehicleIncidents =
                incidentsForVehicle(vehicle.id)

              const matchingIncidents =
                vehicleIncidents.filter((incident) => {
                  const matchesDoor =
                    !door ||
                    incident.door_positions?.includes(door)

                  const matchesSymptom =
                    !symptom ||
                    incident.symptoms?.includes(symptom)

                  return matchesDoor && matchesSymptom
                })

              const representativeIncident =
                [...matchingIncidents].sort(
                  (a, b) =>
                    Number(b.incident_number ?? 0) -
                    Number(a.incident_number ?? 0)
                )[0] ??
                latestIncidentForVehicle(vehicle.id)

              return (
                <Link
                  key={vehicle.id}
                  href={`/cases/${vehicle.public_case_id}?from=cases`}
                  className="group block rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {vehicle.public_case_id}
                      </p>

                      <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <h2 className="text-2xl font-semibold text-gray-950">
                          {vehicle.model_year} {vehicle.model}
                        </h2>

                        <span className="text-xs font-medium text-gray-400">
                          · {vehicleIncidents.length} 次紀錄
                        </span>
                      </div>

                      {reportingCountForVehicle(vehicle.id) > 0 && (
                        <p className="mt-2 text-xs font-medium text-blue-700">
                          已正式反映{' '}
                          {reportingCountForVehicle(vehicle.id)} 個管道
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                      已公開
                    </span>
                  </div>

                  {representativeIncident && (
                    <>
                      <div className="mt-6 grid gap-5 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs text-gray-500">
                            發生里程
                          </p>

                          <p className="mt-1 font-medium text-gray-950">
                            {representativeIncident.mileage.toLocaleString()} km
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500">
                            問題位置
                          </p>

                          <p className="mt-1 font-medium text-gray-950">
                            {representativeIncident.door_positions
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
                            {representativeIncident.symptoms
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
                              representativeIncident.repair_status
                            ] ??
                              representativeIncident.repair_status}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-500">
                        {representativeIncident.occurrence_frequency && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            {frequencyLabels[
                              representativeIncident.occurrence_frequency
                            ] ??
                              representativeIncident.occurrence_frequency}
                          </span>
                        )}

                        {representativeIncident.incident_date && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            發生日期{' '}
                            {representativeIncident.incident_date}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <div className="mt-5 text-sm font-medium text-gray-700 transition group-hover:text-gray-950">
                    查看完整案例 →
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
