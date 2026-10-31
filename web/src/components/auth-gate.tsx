import { useEffect, useState, type ReactNode } from 'react'
import { currentAccount, signOut, whenSignedOut, type Account } from '@/lib/api'
import { SignInScreen } from '@/screens/sign-in'

type AuthGateProps = {
  children: (account: Account, onSignOut: () => void) => ReactNode
}

// A whole page load, so nothing the last person had open stays in memory for the next.
function leave() {
  location.assign(location.pathname)
}

// The app only mounts once someone's signed in, so none of its requests go out before.
export function AuthGate({ children }: AuthGateProps) {
  // undefined: still asking the server, and showing neither screen until it answers.
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    let current = true
    currentAccount()
      .catch(() => null)
      .then(found => { if (current) setAccount(found) })
    const stop = whenSignedOut(() => { setEnded(true); setAccount(null) })
    return () => { current = false; stop() }
  }, [])

  if (account === undefined) return null
  if (account === null) {
    return (
      <SignInScreen
        notice={ended ? "You've been signed out. Sign in again to carry on." : undefined}
        onSignedIn={signedIn => { setEnded(false); setAccount(signedIn) }}
      />
    )
  }
  return <>{children(account, () => { signOut().finally(leave) })}</>
}
