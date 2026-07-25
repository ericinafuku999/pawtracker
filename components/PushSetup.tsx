'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushSetup() {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied' | 'dismissed'>('idle')
  const [working, setWorking] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (!ok) return

    if (Notification.permission === 'denied') { setStatus('denied'); return }
    if (localStorage.getItem('push_dismissed') === '1') { setStatus('dismissed'); return }

    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const existing = await reg.pushManager.getSubscription()
      if (existing && Notification.permission === 'granted') setStatus('subscribed')
    }).catch(() => {})
  }, [])

  async function enable() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      alert('Push notifications are not configured yet (missing VAPID key).')
      return
    }
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        setWorking(false)
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) as any,
      })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setWorking(false); return }
      const json = sub.toJSON() as any
      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, { onConflict: 'endpoint' })
      setStatus('subscribed')
    } catch (e) {
      console.error(e)
      alert('Could not enable notifications on this device.')
    }
    setWorking(false)
  }

  function dismiss() {
    localStorage.setItem('push_dismissed', '1')
    setStatus('dismissed')
  }

  if (!supported || status === 'subscribed' || status === 'dismissed' || status === 'denied') return null

  return (
    <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-emerald-800">
        🔔 Get a notification 15 minutes before a dog arrives or departs.
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={enable} disabled={working} className="btn btn-primary text-xs py-1.5 px-3">
          {working ? 'Enabling…' : 'Enable alerts'}
        </button>
        <button onClick={dismiss} className="btn text-xs py-1.5 px-3">Not now</button>
      </div>
    </div>
  )
}
