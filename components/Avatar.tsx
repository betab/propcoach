// components/Avatar.tsx
// Circular avatar, everywhere one renders — an uploaded photo (see
// components/AvatarUpload.tsx), or a single-letter placeholder when the
// user hasn't set one, so the header/settings layout never has to branch
// on whether avatar_url exists.
export default function Avatar({
  url,
  name,
  size = 32,
}: {
  url?: string | null
  name?: string | null
  size?: number
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  if (url) {
    return (
      <img
        src={url}
        alt={name ? `${name}'s avatar` : 'Avatar'}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="rounded-full bg-bg2 border border-border text-muted flex items-center justify-center font-display shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  )
}
