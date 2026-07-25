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

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on'

export default function PushSetup() {
  const [state, setState] = useState<State>('checking')
  const [working, setWorking] = useState(false)
  const supabase = createClient()

  async function refreshStatus() {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!ok) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('blocked'); return }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const existing = await reg.pushManager.getSubscription()
      setState(existing && Notification.permission === 'granted' ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }

  useEffect(() => { refreshStatus() }, [])

  async function enable() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      alert('Push notifications are not configured yet (missing VAPID key).')
      return
    }
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        await refreshStatus()
        setWorking(false)
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) as any,
        })
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setWorking(false); return }
      const json = sub.toJSON() as any
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, { onConflict: 'endpoint' })
      if (error) {
        alert(`Couldn't save this device's subscription: ${error.message}\n\nIf this mentions "push_subscriptions" not existing, that database migration hasn't been run yet in Supabase.`)
        setWorking(false)
        return
      }
      setState('on')
    } catch (e) {
      console.error(e)
      alert('Could not enable notifications on this device.')
    }
    setWorking(false)
  }

  async function disable() {
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const existing = reg && await reg.pushManager.getSubscription()
      if (existing) {
        const endpoint = existing.endpoint
        await existing.unsubscribe()
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
      setState('off')
    } catch (e) {
      console.error(e)
      alert('Could not disable notifications on this device.')
    }
    setWorking(false)
  }

  if (state === 'checking') return null

  if (state === 'unsupported') {
    return (
      <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
        🔔 Arrival/departure alerts need PawTracker added to your home screen (Share → Add to Home Screen), then opened from that icon — a regular browser tab can't receive them on iOS.
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        🔕 Notifications are blocked for this app in your phone/browser settings. Enable them there (Settings → Notifications → PawTracker, or your browser's site settings) to turn alerts back on.
      </div>
    )
  }

  const isOn = state === 'on'

  return (
    <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-emerald-800">
        🔔 Get notified 15 minutes before a dog arrives or departs.
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-emerald-700 font-medium">{isOn ? 'On' : 'Off'}</span>
        <button
          onClick={() => (isOn ? disable() : enable())}
          disabled={working}
          role="switch"
          aria-checked={isOn}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${isOn ? 'bg-emerald-500' : 'bg-gray-300'} ${working ? 'opacity-60' : ''}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </div>
  )
}
