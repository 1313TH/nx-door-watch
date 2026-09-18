type Props = {
  channel: string
  size?: 40 | 80
}

export default function ReportingChannelIcon({
  channel,
  size = 40,
}: Props) {
  const wrapper =
    size === 80
      ? 'flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-800'
      : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800'

  const iconClass =
    size === 80 ? 'h-9 w-9' : 'h-5 w-5'

  if (channel === 'lexus') {
    return (
      <div
        className={wrapper}
        title="Lexus"
        aria-label="Lexus"
      >
        <span
          className={
            size === 80
              ? 'text-sm font-bold tracking-[-0.04em] text-gray-900'
              : 'text-[9px] font-bold tracking-[-0.04em] text-gray-900'
          }
        >
          LEXUS
        </span>
      </div>
    )
  }

  if (channel === 'vehicle_safety') {
    return (
      <div
        className={wrapper}
        title="車輛安全瑕疵通報"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClass}
          aria-hidden="true"
        >
          <path d="M3 14.5 5.2 9h10.5l2.2 5.5" />
          <path d="M4 14.5h14v4H4z" />
          <circle cx="7" cy="18.5" r="1.5" />
          <circle cx="15" cy="18.5" r="1.5" />
          <path d="M17 5.5 20 4l3 1.5v3.2c0 2.3-1.3 4.1-3 5.3-1.7-1.2-3-3-3-5.3z" />
          <path d="m18.8 8.7.9.9 1.7-2" />
        </svg>
      </div>
    )
  }

  if (channel === 'consumer_protection') {
    return (
      <div
        className={wrapper}
        title="消費者保護線上申訴"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClass}
          aria-hidden="true"
        >
          <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 10 4.2-2.2 7-5.4 7-10V6z" />
          <path d="m8.8 12 2.1 2.1 4.5-5" />
        </svg>
      </div>
    )
  }

  if (channel === '1950') {
    return (
      <div
        className={wrapper}
        title="1950 消費者服務專線"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClass}
          aria-hidden="true"
        >
          <path d="M7.5 3.5 10 8l-2.3 2c1.3 2.7 3.6 5 6.3 6.3l2-2.3 4.5 2.5v2.8c0 1-.8 1.7-1.8 1.7C10 20.5 3.5 14 3 5.3c0-1 .8-1.8 1.7-1.8z" />
        </svg>
      </div>
    )
  }

  if (channel === 'motc_mailbox') {
    return (
      <div
        className={wrapper}
        title="交通部部長／民意信箱"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={iconClass}
          aria-hidden="true"
        >
          <rect
            x="3"
            y="5"
            width="18"
            height="14"
            rx="2"
          />
          <path d="m4 7 8 6 8-6" />
        </svg>
      </div>
    )
  }

  return (
    <div className={wrapper}>
      <span className="text-sm font-semibold">
        ?
      </span>
    </div>
  )
}
