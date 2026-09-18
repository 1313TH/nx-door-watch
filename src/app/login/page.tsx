'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleGoogleLogin() {
    setLoading(true)
    setErrorMessage('')

    const supabase = createClient()

    const params = new URLSearchParams(
      window.location.search
    )

    const requestedNext =
      params.get('next') || '/'

    const next =
      requestedNext.startsWith('/') &&
      !requestedNext.startsWith('//')
        ? requestedNext
        : '/'

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            NX Door Watch
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            登入後即可建立案例、查看自己的案件，
            並持續更新維修與通報進度。
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '正在前往 Google…' : '使用 Google 繼續'}
        </button>

        {errorMessage && (
          <p className="mt-4 text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-gray-500">
          登入僅用於識別案件所有權與必要通知。
          Google 帳號資訊不會出現在公開案例中。
        </p>
      </div>
    </main>
  )
}
