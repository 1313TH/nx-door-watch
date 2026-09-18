import { createClient } from '@/lib/supabase/server'
import ReportingChannelIcon from '@/components/ReportingChannelIcon'

export type AdminCaseReport = {
  id: string
  vehicle_id?: string
  channel: string
  status: string
  reported_at: string | null
  reference_number: string | null
  note: string | null
}

type Props = {
  vehicleId: string
  compact?: boolean
  reports?: AdminCaseReport[] | null
}

const channelLabels: Record<string, string> = {
  lexus: 'Lexus 原廠／客服',
  vehicle_safety: '車輛安全瑕疵通報',
  consumer_protection: '消費者保護線上申訴',
  '1950': '1950 消費者諮詢專線',
  motc_mailbox: '交通部部長／民意信箱',
}

export default async function AdminCaseReports({
  vehicleId,
  compact = false,
  reports: providedReports,
}: Props) {
  let reports = providedReports

  if (providedReports === undefined) {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('case_reports')
      .select(`
        id,
        channel,
        status,
        reported_at,
        reference_number,
        note
      `)
      .eq('vehicle_id', vehicleId)
      .in('status', ['submitted', 'completed'])
      .order('reported_at', { ascending: false })

    if (error) {
      console.error('AdminCaseReports error:', error)
      return null
    }

    reports = data
  }

  if (!reports || reports.length === 0) {
    return null
  }

  if (compact) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {reports.map((report) => (
          <span
            key={report.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
          >
            ✓ {channelLabels[report.channel] ?? report.channel}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">
          反映／諮詢紀錄
        </p>

        <span className="text-xs text-gray-500">
          {reports.length} 個管道
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {reports.map((report) => (
          <div
            key={report.id}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
          >
            <div className="flex items-start gap-3">
              <ReportingChannelIcon channel={report.channel} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {channelLabels[report.channel] ??
                        report.channel}
                    </p>

                    <p
                      className={
                        report.channel === '1950'
                          ? 'mt-1 text-xs text-blue-700'
                          : 'mt-1 text-xs text-green-700'
                      }
                    >
                      {report.channel === '1950'
                        ? '✓ 已完成諮詢'
                        : '✓ 已正式反映'}
                    </p>
                  </div>

                  {report.reported_at && (
                    <span className="text-xs text-gray-400">
                      {report.reported_at}
                    </span>
                  )}
                </div>

                {report.reference_number && (
                  <div className="mt-3 rounded-xl bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-400">
                      受理／案件編號
                    </p>

                    <p className="mt-0.5 break-all text-sm font-medium text-gray-900">
                      {report.reference_number}
                    </p>
                  </div>
                )}

                {report.note && (
                  <div className="mt-2 rounded-xl bg-white px-3 py-2">
                    <p className="text-[11px] text-gray-400">
                      車主私人備註
                    </p>

                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {report.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        受理編號與備註為私人資料，僅案件本人及管理員可查看。
      </p>
    </div>
  )
}
