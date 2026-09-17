import { createClient } from '@/lib/supabase/server'

type Props = {
  vehicleId: string
  className?: string
  emailClickable?: boolean
}

type OwnerContact = {
  vehicle_id: string
  owner_id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
}

function getInitials(
  name: string | null,
  email: string | null
) {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
  }

  return email?.[0]?.toUpperCase() ?? '?'
}

export default async function AdminOwnerContact({
  vehicleId,
  className = '',
  emailClickable = true,
}: Props) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'get_admin_case_owner_contacts',
    {
      p_vehicle_ids: [vehicleId],
    }
  )

  if (error) {
    console.error(
      'get_admin_case_owner_contacts error:',
      error
    )
    return null
  }

  const owner =
    (data?.[0] ?? null) as OwnerContact | null

  if (!owner) return null

  const displayName =
    owner.full_name?.trim() ||
    owner.email ||
    '未命名帳號'

  return (
    <div
      className={`inline-flex max-w-[260px] items-center gap-2.5 ${className}`}
    >
      {owner.avatar_url ? (
        <img
          src={owner.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {getInitials(
            owner.full_name,
            owner.email
          )}
        </div>
      )}

      <div className="min-w-0 text-left">
        <p className="truncate text-sm font-semibold text-gray-900">
          {displayName}
        </p>

        {owner.email &&
          (emailClickable ? (
            <a
              href={`mailto:${owner.email}`}
              className="block truncate text-xs text-blue-600 hover:underline"
            >
              {owner.email}
            </a>
          ) : (
            <p className="truncate text-xs text-blue-600">
              {owner.email}
            </p>
          ))}
      </div>
    </div>
  )
}
