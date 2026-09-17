type UserAvatarProps = {
  email?: string | null
  avatarUrl?: string | null
  fullName?: string | null
}

export function UserAvatar({
  email,
  avatarUrl,
  fullName,
}: UserAvatarProps) {
  const fallback = (email?.[0] || fullName?.[0] || 'U').toUpperCase()

  return (
    <div className="group relative flex h-9 w-9 shrink-0 items-center justify-center">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={fullName || email || 'Google account'}
          className="h-9 w-9 rounded-full border border-gray-300 object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-sm font-medium text-gray-700">
          {fallback}
        </div>
      )}

      {email && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg bg-gray-950 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
          {email}
          <div className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-gray-950" />
        </div>
      )}
    </div>
  )
}
