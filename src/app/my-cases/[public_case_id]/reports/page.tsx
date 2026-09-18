import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const channels = [
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
    description: '透過 1950 諮詢或反映消費爭議',
    href: 'https://cpc.ey.gov.tw/Page/1DCF8AA4D223F601/ebc630d6-b774-4db5-abdc-5b52ed0963cc',
  },
  {
    value: 'motc_mailbox',
    label: '交通部部長／民意信箱',
    description: '向交通部提出陳情並提供相關資料',
    href: 'https://poms.motc.gov.tw/message/tw',
  },
] as const

async function updateReports(formData: FormData) {
  'use server'

  const publicCaseId = String(
    formData.get('public_case_id') ?? ''
  )

  if (!publicCaseId) {
    redirect('/my-cases')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('public_case_id', publicCaseId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!vehicle) {
    redirect('/my-cases')
  }

  for (const channel of channels) {
    const status = String(
      formData.get(`status_${channel.value}`) ?? ''
    )

    if (status !== 'submitted') {
      const { error } = await supabase.rpc(
        'remove_case_report',
        {
          p_vehicle_id: vehicle.id,
          p_channel: channel.value,
        }
      )

      if (error) {
        console.error(
          `remove_case_report ${channel.value}:`,
          error
        )
      }

      continue
    }

    const reportedAt =
      String(
        formData.get(`date_${channel.value}`) ?? ''
      ).trim() || null

    const referenceNumber =
      String(
        formData.get(`reference_${channel.value}`) ?? ''
      ).trim() || null

    const note =
      String(
        formData.get(`note_${channel.value}`) ?? ''
      ).trim() || null

    const { error } = await supabase.rpc(
      'upsert_case_report',
      {
        p_vehicle_id: vehicle.id,
        p_channel: channel.value,
        p_status: 'submitted',
        p_reported_at: reportedAt,
        p_reference_number: referenceNumber,
        p_note: note,
      }
    )

    if (error) {
      console.error(
        `upsert_case_report ${channel.value}:`,
        error
      )

      redirect(
        `/my-cases/${publicCaseId}/reports?error=save`
      )
    }
  }

  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/my-cases')
  revalidatePath('/cases')
  revalidatePath(`/cases/${publicCaseId}`)
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/admin/requests')

  redirect(
    `/my-cases/${publicCaseId}/reports?saved=1`
  )
}

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_case_id: string }>
  searchParams: Promise<{
    saved?: string
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

  const { data: vehicle, error: vehicleError } =
    await supabase
      .from('vehicles')
      .select(`
        id,
        public_case_id,
        model,
        model_year,
        owner_id
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

  const { data: reports, error: reportsError } =
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

  if (reportsError) {
    throw new Error(reportsError.message)
  }

  const reportMap = new Map(
    (reports ?? []).map((report) => [
      report.channel,
      report,
    ])
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href={`/my-cases/${vehicle.public_case_id}`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回案件
        </Link>

        <div className="mt-5">
          <p className="text-sm text-gray-500">
            {vehicle.public_case_id}
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-gray-950">
            正式反映／申訴管理
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            {vehicle.model_year} {vehicle.model}
          </p>
        </div>

        {query.saved === '1' && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            正式反映狀態已更新。
          </div>
        )}

        {query.error === 'save' && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            儲存失敗，請稍後再試。
          </div>
        )}

        <form
          action={updateReports}
          className="mt-8 space-y-5"
        >
          <input
            type="hidden"
            name="public_case_id"
            value={vehicle.public_case_id}
          />

          {channels.map((channel) => {
            const current = reportMap.get(channel.value)

            const isSubmitted =
              current?.status === 'submitted' ||
              current?.status === 'completed'

            return (
              <section
                key={channel.value}
                className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <a
                      href={channel.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-base font-semibold text-blue-700 hover:text-blue-900"
                      style={{
                        textDecorationLine: 'underline',
                        textDecorationStyle: 'dashed',
                        textDecorationThickness: '1px',
                        textUnderlineOffset: '4px',
                      }}
                    >
                      {channel.label} ↗
                    </a>

                    <p className="mt-2 text-sm text-gray-500">
                      {channel.description}
                    </p>
                  </div>

                  <select
                    name={`status_${channel.value}`}
                    defaultValue={
                      isSubmitted ? 'submitted' : ''
                    }
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">
                      尚未反映
                    </option>
                    <option value="submitted">
                      已正式反映
                    </option>
                  </select>
                </div>

                <div className="mt-5 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    反映日期
                    <input
                      type="date"
                      name={`date_${channel.value}`}
                      defaultValue={
                        current?.reported_at ?? ''
                      }
                      className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
                    />
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    受理／案件編號
                    <input
                      name={`reference_${channel.value}`}
                      defaultValue={
                        current?.reference_number ?? ''
                      }
                      placeholder="選填"
                      className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
                    />
                  </label>

                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                    私人備註
                    <textarea
                      name={`note_${channel.value}`}
                      defaultValue={
                        current?.note ?? ''
                      }
                      rows={3}
                      placeholder="例如：客服回覆內容、預計追蹤日期等"
                      className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
                    />
                  </label>
                </div>

                <p className="mt-4 text-xs leading-5 text-gray-500">
                  受理編號與私人備註只提供你本人及管理員查看，不會顯示在公開案例頁。
                </p>
              </section>
            )
          })}

          <div className="flex justify-end gap-3">
            <Link
              href={`/my-cases/${vehicle.public_case_id}`}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800"
            >
              取消
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-gray-950 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              儲存正式反映狀態
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
