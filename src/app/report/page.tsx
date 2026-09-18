import Link from 'next/link'
import ReportingChannelIcon from '@/components/ReportingChannelIcon'

const channels = [
  {
    key: 'lexus',
    title: 'Lexus 原廠／客服',
    description:
      '適合先向 Lexus 客服、經銷商或服務廠建立正式紀錄，並要求後續追蹤。',
    href: 'https://www.lexus.com.tw/contact.aspx?s=faq&sid=1',
    action: '前往 Lexus 客服',
    goodFor: [
      '希望原廠先建立客服案件',
      '保固、維修與零件處理追蹤',
      '希望取得原廠正式回覆',
    ],
  },
  {
    key: 'vehicle_safety',
    title: '車輛安全瑕疵通報',
    description:
      '若電子門異常可能影響車輛安全，可向交通主管機關的車輛安全瑕疵通報平台提出正式通報。',
    href: 'https://www.car-safety.org.tw/car_safety/VehicleFailureNotification',
    action: '前往車安通報',
    goodFor: [
      '車門無法正常開啟或關閉',
      '行駛中出現門鎖或安全相關警示',
      '懷疑是具有共通性的車輛安全問題',
    ],
  },
  {
    key: 'consumer_protection',
    title: '消費者保護線上申訴',
    description:
      '適合保固、維修費用、待料、服務處理或其他消費爭議。行政院消保會提供正式線上申訴流程。',
    href: 'https://appeal.cpc.ey.gov.tw/www/step_explanation.aspx',
    action: '前往線上申訴',
    goodFor: [
      '維修或保固處理產生爭議',
      '對原廠或經銷商處理方式不滿',
      '希望透過正式消費爭議程序處理',
    ],
  },
  {
    key: '1950',
    title: '1950 消費者諮詢專線',
    description:
      '如果還不確定該走哪個申訴程序，可以先撥打 1950 諮詢，系統會轉接所在地縣市政府消費者服務中心。',
    href: 'https://cpc.ey.gov.tw/Page/1DCF8AA4D223F601/ebc630d6-b774-4db5-abdc-5b52ed0963cc',
    action: '查看 1950 官方說明',
    goodFor: [
      '不確定該向哪個單位申訴',
      '想先詢問處理方式',
      '想確認下一步程序',
    ],
  },
  {
    key: 'motc_mailbox',
    title: '交通部部長／民意信箱',
    description:
      '若希望向交通主管機關反映完整事件經過，可透過交通部民意信箱提出陳情。',
    href: 'https://poms.motc.gov.tw/message/tw',
    action: '前往交通部民意信箱',
    goodFor: [
      '希望向主管機關留下正式陳情',
      '需要說明較完整的事件經過',
      '希望附上相關資料或附件',
    ],
  },
] as const

export default function ReportGuidePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回首頁
        </Link>

        <header className="mt-6">
          <p className="text-sm font-medium text-gray-500">
            NX Door Watch
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
            正式通報與申訴指南
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
            不同問題適合不同處理管道。你可以先在 NX Door Watch
            建立案例保存紀錄，再依問題性質選擇原廠、車安或消保等正式管道。
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            申訴前建議先準備
          </h2>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              '車型、年式與車輛基本資料',
              '問題發生日期與當時里程',
              '問題車門位置與症狀描述',
              '照片或影片紀錄',
              '回廠檢查或維修工單',
              '報價、維修或更換零件紀錄',
              '與 Lexus／經銷商往來紀錄',
              '希望對方如何處理的具體訴求',
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
              >
                ✓ {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-5">
          {channels.map((channel) => (
            <article
              key={channel.key}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-0 gap-4">
                  <ReportingChannelIcon channel={channel.key} />

                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">
                      {channel.title}
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                      {channel.description}
                    </p>
                  </div>
                </div>

                <a
                  href={channel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  {channel.action} ↗
                </a>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="text-xs font-medium text-gray-500">
                  適合情況
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {channel.goodFor.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl bg-gray-950 p-7 text-white">
          <h2 className="text-xl font-semibold">
            已經完成申訴或通報？
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-300">
            回到「我的案件」更新正式反映狀態，平台會以匿名統計方式呈現，
            讓其他車主知道目前有多少案例已進入正式反映流程。
          </p>

          <Link
            href="/my-cases"
            className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-950"
          >
            前往我的案件 →
          </Link>
        </section>
      </div>
    </main>
  )
}
