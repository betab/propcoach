'use client'
// components/AvatarUpload.tsx
// File picker -> circular crop modal (react-easy-crop) -> Supabase Storage
// upload -> profiles.avatar_url update. One fixed storage path per user
// (upsert) so re-uploading replaces the old photo instead of accumulating
// orphaned objects; see supabase/migrations/012_avatar_upload.sql.
import { useCallback, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { createClient } from '@/lib/supabase/client'
import { getCroppedImageBlob } from '@/lib/cropImage'
import Avatar from './Avatar'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB — generous for a phone photo, still bounded

export default function AvatarUpload({
  userId,
  currentUrl,
  displayName,
  onUploaded,
}: {
  userId: string
  currentUrl: string | null
  displayName: string | null
  onUploaded: (url: string) => void
}) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Object URL of the just-picked file — the crop modal is open exactly
  // while this is set, and it's the single source of truth for that.
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [crop,          setCrop]          = useState<Point>({ x: 0, y: 0 })
  const [zoom,          setZoom]          = useState(1)
  const [croppedArea,   setCroppedArea]   = useState<Area | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [error,         setError]         = useState('')

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // clear so picking the exact same file again still fires onChange
    if (!file) return

    setError('')
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > MAX_FILE_BYTES) { setError('That image is too large — 8MB max.'); return }

    setSelectedImage(URL.createObjectURL(file))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
  }

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels)
  }, [])

  function closeCropModal() {
    if (selectedImage) URL.revokeObjectURL(selectedImage)
    setSelectedImage(null)
    setCroppedArea(null)
  }

  async function handleSaveCrop() {
    if (!selectedImage || !croppedArea) return
    setUploading(true)
    setError('')
    try {
      const blob = await getCroppedImageBlob(selectedImage, croppedArea)
      const path = `${userId}/avatar.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // The storage path never changes on re-upload, so without a
      // cache-busting param a browser that already fetched the old image at
      // this exact URL would keep showing it after a new crop is saved.
      const url = `${data.publicUrl}?v=${Date.now()}`

      const { error: profileError } = await supabase
        .from('profiles').update({ avatar_url: url }).eq('id', userId)
      if (profileError) throw profileError

      onUploaded(url)
      closeCropModal()
    } catch (err: any) {
      setError(err?.message || 'Upload failed — please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar url={currentUrl} name={displayName} size={64} />
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] tracking-widest uppercase border border-border text-muted px-3 py-2 rounded hover:border-blue/40 transition-colors"
          >
            {currentUrl ? 'Change Photo' : 'Upload Photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFilePicked}
            className="hidden"
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-3 mt-3">{error}</div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded max-w-md w-full p-4">
            <div className="stat-label mb-3">Crop Your Photo</div>
            <div className="relative w-full rounded overflow-hidden" style={{ height: 320 }}>
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full mt-4 accent-green"
              aria-label="Zoom"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={closeCropModal}
                disabled={uploading}
                className="btn-ghost text-xs px-4 py-2 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCrop}
                disabled={uploading || !croppedArea}
                className="text-[10px] tracking-widest uppercase border border-green text-green px-4 py-2 rounded hover:bg-green/10 transition-colors font-mono disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Save Photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
