type Props = {
  type: 'cases' | 'reported' | 'unreported' | 'rate'
}

export default function ActionMetricIcon({ type }: Props) {
  const cls =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800'

  if (type === 'cases') {
    return (
      <div className={cls}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 3h10v18H7z" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        </svg>
      </div>
    )
  }

  if (type === 'reported') {
    return (
      <div className={cls}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 10 4.2-2.2 7-5.4 7-10V6z" />
          <path d="m8.5 12 2.2 2.2 4.8-5.2" />
        </svg>
      </div>
    )
  }

  if (type === 'unreported') {
    return (
      <div className={cls}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 17h.01" />
        </svg>
      </div>
    )
  }

  return (
    <div className={cls}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 19 19 5" />
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
      </svg>
    </div>
  )
}
