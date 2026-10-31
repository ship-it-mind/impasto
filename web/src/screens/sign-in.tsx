import { useId, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, signUp, type Account } from '@/lib/api'

const MIN_PASSWORD_CHARS = 8

type SignInScreenProps = {
  // Why they're here, when a session has just ended.
  notice?: string
  onSignedIn: (account: Account) => void
}

// The invite link is ?invite=CODE: it opens on creating an account, with the code filled in.
function inviteInUrl(): string {
  return new URLSearchParams(location.search).get('invite') ?? ''
}

function withoutInvite(): void {
  const params = new URLSearchParams(location.search)
  if (!params.has('invite')) return
  params.delete('invite')
  const rest = params.toString()
  history.replaceState(null, '', rest ? `?${rest}` : location.pathname)
}

export function SignInScreen({ notice, onSignedIn }: SignInScreenProps) {
  const [invite, setInvite] = useState(inviteInUrl)
  const [creating, setCreating] = useState(() => inviteInUrl() !== '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const ids = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      const account = creating ? await signUp(email, password, invite) : await signIn(email, password)
      withoutInvite()
      onSignedIn(account)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the server. Try again.")
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <header className="flex h-14 items-center px-6 lg:px-10">
        <span className="font-semibold tracking-tight">Impasto</span>
      </header>
      <main className="flex flex-1 justify-center px-6 pt-[12vh] pb-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{creating ? 'Create your account' : 'Sign in to Impasto'}</h1>
            {creating && <p className="text-muted-foreground">Impasto is invite-only for now.</p>}
            {!creating && notice && <p className="text-muted-foreground">{notice}</p>}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {creating && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${ids}-invite`}>Invite code</Label>
                <Input
                  id={`${ids}-invite`}
                  name="invite"
                  className="h-10"
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  value={invite}
                  onChange={e => setInvite(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-email`}>Email</Label>
              <Input
                id={`${ids}-email`}
                name="email"
                type="email"
                className="h-10"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus={!('ontouchstart' in window)}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-password`}>Password</Label>
              <div className="relative">
                <Input
                  ref={passwordInput}
                  id={`${ids}-password`}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="h-10 pr-11"
                  required
                  minLength={creating ? MIN_PASSWORD_CHARS : undefined}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby={creating ? `${ids}-password-hint` : undefined}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => { setShowPassword(s => !s); passwordInput.current?.focus() }}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
              {creating && <p id={`${ids}-password-hint`} className="text-xs text-muted-foreground">At least {MIN_PASSWORD_CHARS} characters.</p>}
            </div>

            {error && <p role="alert" className="text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="mt-1 h-10 w-full" disabled={sending}>
              {sending
                ? (creating ? 'Creating your account…' : 'Signing in…')
                : (creating ? 'Create account' : 'Sign in')}
            </Button>
          </form>

          <p className="text-muted-foreground">
            {creating ? 'Already have an account?' : 'Have an invite code?'}{' '}
            <button
              type="button"
              onClick={() => { setCreating(c => !c); setError(null) }}
              className="text-foreground underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {creating ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
