import { useEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import { DictateButton } from '@/components/dictate-button'
import { Button } from '@/components/ui/button'
import type { Asked } from '@/lib/checks'

type CheckInChatProps = {
  questions: Asked[]
  // What the painter has open, which a question with no other subject is about.
  section: string | null
  // Rejects with what went wrong. onPhase says what it's doing.
  onAsk: (question: string, onPhase: (phase: string) => void) => Promise<void>
}

// Questions for Spark at the easel, when the instructions don't help or something else comes up.
export function CheckInChat({ questions, section, onAsk }: CheckInChatProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [phase, setPhase] = useState('Starting…')
  const [error, setError] = useState<string | null>(null)
  const [dictating, setDictating] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const canSend = text.trim().length > 0 && !pending && !dictating

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [questions.length, pending])

  const send = async () => {
    if (!canSend) return
    const question = text.trim()
    setError(null)
    setPending(question)
    setPhase('Starting…')
    setText('')
    try {
      await onAsk(question, setPhase)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get an answer. Try again.")
      setText(question)
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Ask a question">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Ask a question</h2>
        {questions.length === 0 && !pending && (
          <p className="text-xs text-pretty text-muted-foreground">If the instructions don't help, or something else comes up. It knows this painting's plan and what your check-ins found.</p>
        )}
      </div>

      {(questions.length > 0 || pending) && (
        <ol ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain" aria-live="polite">
          {questions.map(q => (
            <li key={q.asked_at + q.question} className="flex flex-col gap-2">
              <Question text={q.question} />
              <p className="whitespace-pre-wrap text-pretty">{q.answer}</p>
            </li>
          ))}
          {pending && (
            <li className="flex flex-col gap-2">
              <Question text={pending} />
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{phase}</p>
            </li>
          )}
        </ol>
      )}

      {error && <p role="alert" className="text-xs text-pretty text-destructive">{error}</p>}

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex shrink-0 flex-col gap-1 rounded-xl bg-background p-2 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.05)]"
      >
        {section && <span className="self-start truncate rounded-md bg-muted px-2 py-0.5 text-xs" title={section}>About: {section}</span>}
        <textarea
          aria-label="Your question"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask anything about this painting"
          rows={2}
          maxLength={1000}
          className="field-sizing-content max-h-40 min-h-12 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DictateButton onText={t => setText(v => (v ? `${v} ${t}` : t))} onBusy={setDictating} />
          <Button type="submit" size="icon-sm" aria-label="Send" disabled={!canSend} className="rounded-full">
            {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </section>
  )
}

function Question({ text }: { text: string }) {
  return <p className="max-w-[90%] self-end rounded-lg bg-muted px-3 py-2 text-pretty whitespace-pre-wrap">{text}</p>
}
