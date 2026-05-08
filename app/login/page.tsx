'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card w-full max-w-sm text-center">
        <div className="text-4xl mb-3">🐾</div>
        <h1 className="text-xl font-semibold mb-1">PawTracker</h1>
        <p className="text-sm text-gray-500 mb-8">Dog Care Business Manager</p>
        {sent ? (
          <div>
            <div className="text-3xl mb-3">📬</div>
            <p className="font-medium mb-2">Check your email!</p>
            <p className="text-sm text-gray-500">We sent a login link to <strong>{email}</strong>. Click it to sign in — no password needed.</p>
            <button className="text-sm text-emerald-600 mt-4" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink}>
            <div className="mb-4 text-left">
              <label className="label">Your email address</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" required />
            </div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <button className="btn btn-primary w-full justify-center" type="submit" disabled={loading}>
              {loading ? 'Sending…' : '✉️ Send me a login link'}
            </button>
            <p className="text-xs text-gray-400 mt-4">No password needed. We'll email you a secure link.</p>
          </form>
        )}
      </div>
    </div>
  )
}