import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { transcribe } from '@/lib/api'

type State = 'idle' | 'listening' | 'transcribing'

// Speak, stop, and the words come back as text for the box beside it, to read and correct.
export function DictateButton({ onText, onBusy }: { onText: (text: string) => void; onBusy: (busy: boolean) => void }) {
  const [state, setState] = useState<State>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => { onBusy(state !== 'idle') }, [state, onBusy])

  useEffect(() => {
    if (state !== 'listening') return
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])

  // Leaving the screen mid-sentence lets go of the microphone and drops the audio.
  useEffect(() => () => {
    if (recorder.current) recorder.current.onstop = null
    stream.current?.getTracks().forEach(t => t.stop())
  }, [])

  const finish = async (audio: File) => {
    setState('transcribing')
    try {
      const text = (await transcribe(audio)).trim()
      if (text) onText(text)
      else setError("Didn't catch any words. Try again, closer to the microphone.")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setState('idle')
    }
  }

  const start = async () => {
    setError(null)
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(mic)
      const chunks: Blob[] = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        mic.getTracks().forEach(t => t.stop())
        finish(new File(chunks, 'dictation.webm', { type: rec.mimeType }))
      }
      rec.start()
      recorder.current = rec
      stream.current = mic
      setSeconds(0)
      setState('listening')
    } catch {
      setError('The microphone is blocked. Allow it in the browser, or type instead.')
    }
  }

  return (
    <>
      {state === 'listening' && (
        <Button type="button" variant="destructive" onClick={() => recorder.current?.stop()}>
          <Square className="fill-current" /> Stop ·{' '}
          <span className="tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
        </Button>
      )}
      {state === 'transcribing' && <Button type="button" variant="ghost" disabled><LoaderCircle className="animate-spin" /> Transcribing…</Button>}
      {state === 'idle' && <Button type="button" variant="ghost" onClick={start}><Mic /> Dictate</Button>}
      {error && <p role="alert" className="order-last basis-full text-xs text-destructive">{error}</p>}
    </>
  )
}
