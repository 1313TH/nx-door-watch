'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogoutButton } from '@/components/logout-button'
import { UserAvatar } from '@/components/user-avatar'

type UserState = {
  email?: string | null
  avatarUrl?: string | null
  fullName?: string | null
}

export default function HomeHeader() {
  const [user, setUser] = useState<UserState | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminReviewCount, setAdminReviewCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    async function loadAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoaded(true)
        return
      }

      setUser({
        email: user.email,
        avatarUrl: user.user_metadata?.avatar_url,
        fullName: user.user_metadata?.full_name,
      })

      const { data: adminStatus } = await supabase.rpc('is_admin')
      if (adminStatus === true) {
        setIsAdmin(true)
        const [
          { count: pendingCaseCount },
          { count: pendingFollowupCount },
          { count: pendingRevisionCount },
          { count: pendingArchiveCount },
        ] = await Promise.all([
          supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('moderation_status', 'pending').is('deleted_at', null).is('archived_at', null),
          supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('moderation_status', 'pending').gt('incident_number', 1),
          supabase.from('case_revisions').select('id', { count: 'exact', head: true }).eq('target_type', 'vehicle').eq('status', 'pending'),
          supabase.from('case_archive_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])
        setAdminReviewCount(
          (pendingCaseCount ?? 0) +
          (pendingFollowupCount ?? 0) +
          (pendingRevisionCount ?? 0) +
          (pendingArchiveCount ?? 0)
        )
      }

      setLoaded(true)
    }

    void loadAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null)
        setIsAdmin(false)
        setAdminReviewCount(0)
        setLoaded(true)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (!loaded) {
    return (
      <nav className="flex flex-wrap items-center gap-2" aria-hidden="true">
        <Link href="/cases" className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800">
          公開案例
        </Link>
        <Link href="/login" className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white">
          登入 / 回報案例
        </Link>
      </nav>
    )
  }

  return (
    <nav className="flex flex-wrap items-center gap-2">
      <Link href="/cases" className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100">
        公開案例
      </Link>
      {user ? (
        <>
          <Link href="/my-cases" className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100">
            我的案件
          </Link>
          {isAdmin && (
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100">
              <span>管理後台</span>
              {adminReviewCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                  {adminReviewCount > 99 ? '99+' : adminReviewCount}
                </span>
              )}
            </Link>
          )}
          <UserAvatar email={user.email} avatarUrl={user.avatarUrl} fullName={user.fullName} />
          <LogoutButton />
        </>
      ) : (
        <Link href="/login" className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800">
          登入 / 回報案例
        </Link>
      )}
    </nav>
  )
}
