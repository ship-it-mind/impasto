import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/lib/use-object-url'

export { useObjectUrl }

// The voice note once it's in: name, a player, and a way to remove it.
export function VoiceNote({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useObjectUrl(file)
  return (
    <div className="flex items-center gap-3 rounded-lg bg-background p-2 pl-3 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
      <Mic className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{file.name}</span>
      {url && <audio src={url} controls className="ml-auto h-8 max-w-56" />}
      <Button variant="ghost" size="icon-sm" aria-label="Remove voice note" onClick={onRemove}>
        <X />
      </Button>
    </div>
  )
}

// Record a voice note in the browser, or upload one.
export function VoiceButtons({ onFile }: { onFile: (f: File) => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        onFile(new File(chunks, 'voice-note.webm', { type: rec.mimeType }))
      }
      rec.start()
      recorder.current = rec
      setSeconds(0)
      setRecording(true)
    } catch {
      setError('The microphone is blocked. Allow it in the browser, or upload the voice note instead.')
    }
  }
  const stop = () => { recorder.current?.stop(); setRecording(false) }

  return (
    <>
      {recording ? (
        <Button type="button" variant="destructive" onClick={stop}>
          <Square className="fill-current" /> Stop ·{' '}
          <span className="tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
        </Button>
      ) : (
        <Button type="button" variant="ghost" onClick={start}><Mic /> Record</Button>
      )}
      <Button type="button" variant="ghost" onClick={() => upload.current?.click()} disabled={recording}><Upload /> Voice note</Button>
      <input ref={upload} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {error && <p className="basis-full text-xs text-destructive">{error}</p>}
    </>
  )
}
