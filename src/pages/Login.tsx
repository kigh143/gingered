import { FirebaseError } from 'firebase/app'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { auth } from '../lib/firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ''
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'Wrong email or password.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a few minutes and try again.'
            : 'Couldn’t sign in. Check your connection and try again.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card narrow login" onSubmit={submit}>
        <div className="brand big">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          gingered
        </div>
        <p className="muted">Recipe costing and test bakes. Admin sign-in.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
