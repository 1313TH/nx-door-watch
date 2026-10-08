'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function CaseBackLink() {
  const searchParams = useSearchParams()
  const from = searchParams.get('from')
  return (
    <Link
      href={from === 'home' ? '/' : '/cases'}
      className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-950 hover:text-white"
    >
      {from === 'home' ? '← 回首頁' : '← 回公開案例'}
    </Link>
  )
}
