// lib/cropImage.ts
// Turns a source image + a react-easy-crop pixel crop area into a square
// JPEG Blob ready to upload — pure canvas work, no dependency beyond the
// crop coordinates react-easy-crop already computes for us.
import type { Area } from 'react-easy-crop'

// Fixed output resolution so a large source photo (a modern phone photo can
// be 4000px+ wide) doesn't get stored at full size for what only ever
// renders as a small circle — 512x512 is comfortably sharp at any size this
// app actually displays an avatar.
const OUTPUT_SIZE = 512

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload  = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export async function getCroppedImageBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width  = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')

  // Cropping (not just resizing) to a circle later is a display-time
  // concern (border-radius on the <img>) — the stored file itself stays a
  // plain square JPEG, which is what lets it also work as a normal
  // rectangular fallback anywhere a circle mask isn't applied.
  ctx.drawImage(
    image,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Failed to export the cropped image.')),
      'image/jpeg',
      0.9
    )
  })
}
