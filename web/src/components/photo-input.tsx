import { useRef, useState } from 'react'
import { webImage } from '@/lib/api'

// A hidden camera / file input: open it from any button, and get back a photo the browser can show.
export function usePhotoInput(onPhoto: (file: File) => void) {
  const input = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = async (picked: File | undefined) => {
    if (!picked) return
    setError(null)
    setPreparing(true)
    try {
      onPhoto(await webImage(picked))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPreparing(false)
    }
  }

  const element = (
    <input
      ref={input}
      type="file"
      accept="image/*,.heic,.heif"
      capture="environment"
      className="sr-only"
      tabIndex={-1}
      onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}
    />
  )
  return { element, open: () => input.current?.click(), preparing, error }
}
