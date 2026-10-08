'use client'

import { useEffect, useState } from 'react'
import AdminArchiveCaseForm from '@/components/admin/AdminArchiveCaseForm'
import { createClient } from '@/lib/supabase/client'

export default function AdminArchiveCaseGate({
  vehicleId,
  action,
}: {
  vehicleId: string
  action: (formData: FormData) => Promise<void>
}) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoaded(true)
        return
      }
      const { data } = await supabase.rpc('is_admin')
      setIsAdmin(data === true)
      setLoaded(true)
    })()
  }, [])

  if (!loaded || !isAdmin) return null
  return <AdminArchiveCaseForm vehicleId={vehicleId} action={action} />
}
