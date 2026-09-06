import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { Booking, MeetGreet } from '@/lib/types'
import { toDateTimeInZone, formatTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Vercel functions run in UTC regardless of where the business actually is, so
// booking times ("7:07 PM") must be explicitly interpreted in the business's
// real timezone rather than the server's — otherwise every time is off by
// several hours. Update this if PawTracker is ever used outside Eastern time.
const BUSINESS_TIMEZONE = 'America/New_York'

const REMINDER_MINUTES_BEFORE = 15
// Small grace window so a booking is never missed even if a cron run lands a
// few minutes off, without firing so early/late that it stops feeling like a
// "15 minutes before" reminder. cron-job.org runs reliably every 5 minutes.
const EARLY_WINDOW_MIN = 18 // fire any time from 18 min before...
const LATE_WINDOW_MIN = -5 // ...up to 5 min after, in case a cron run was delayed

function minutesUntil(target: Date, now: Date) {
  return (target.getTime() - now.getTime()) / 60000
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date()
  // Compute "today" in the business's timezone, not the server's (UTC) — otherwise
  // this silently rolls over to tomorrow's date every evening around 8pm Eastern.
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now) // en-CA gives YYYY-MM-DD directly
  const todayStr = todayParts

  // Only bother looking at bookings touching today — reminders are same-day only.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .neq('status', 'cancelled')
    .or(`arrival_date.eq.${todayStr},departure_date.eq.${todayStr}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Meet & Greets scheduled today (not yet reminded) — same 15-min-before push as bookings.
  // Don't hard-fail the whole route if this table/migration isn't there yet; just skip it.
  const { data: meetGreets, error: mgError } = await supabase
    .from('meet_greets')
    .select('*')
    .eq('status', 'scheduled')
    .eq('scheduled_date', todayStr)

  // Cache subscriptions per user_id since a household typically shares one login
  // across a couple of devices/phones.
  const subsByUser = new Map<string, any[]>()
  async function getSubs(userId: string) {
    if (!subsByUser.has(userId)) {
      const { data } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)
      subsByUser.set(userId, data || [])
    }
    return subsByUser.get(userId)!
  }

  async function pushToUser(userId: string, title: string, body: string, url: string) {
    const subs = await getSubs(userId)
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url })
        )
      } catch (e: any) {
        // Expired/invalid subscription (device unsubscribed, browser data cleared, etc.) — remove it.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          throw e
        }
      }
    }
  }

  const sent: string[] = []
  const errors: string[] = []

  if (mgError) errors.push(`meet_greets query: ${mgError.message}`)

  for (const booking of (bookings || []) as Booking[]) {
    // Arrival reminder
    if (booking.arrival_time && !booking.arrival_reminder_sent && booking.arrival_date === todayStr) {
      const target = toDateTimeInZone(booking.arrival_date, booking.arrival_time, BUSINESS_TIMEZONE, 0, 0)
      const mins = minutesUntil(target, now)
      if (mins <= EARLY_WINDOW_MIN && mins > LATE_WINDOW_MIN) {
        const label = booking.dog_names || booking.customer_name || 'A dog'
        const body = `${label} (${booking.customer_name}) arrives in ${Math.max(0, Math.round(mins))} min, at ${formatTime(booking.arrival_time)}.`
        try {
          await pushToUser(booking.user_id, '🟢 Arriving soon', body, `/bookings/${booking.id}`)
          await supabase.from('bookings').update({ arrival_reminder_sent: true }).eq('id', booking.id)
          sent.push(`arrival:${booking.id}`)
        } catch (e: any) {
          errors.push(`arrival:${booking.id}: ${e.message}`)
        }
      }
    }

    // Departure reminder
    if (booking.departure_time && !booking.departure_reminder_sent && booking.departure_date === todayStr) {
      const target = toDateTimeInZone(booking.departure_date, booking.departure_time, BUSINESS_TIMEZONE, 23, 59)
      const mins = minutesUntil(target, now)
      if (mins <= EARLY_WINDOW_MIN && mins > LATE_WINDOW_MIN) {
        const label = booking.dog_names || booking.customer_name || 'A dog'
        const body = `${label} (${booking.customer_name}) departs in ${Math.max(0, Math.round(mins))} min, at ${formatTime(booking.departure_time)}.`
        try {
          await pushToUser(booking.user_id, '🔴 Departing soon', body, `/bookings/${booking.id}`)
          await supabase.from('bookings').update({ departure_reminder_sent: true }).eq('id', booking.id)
          sent.push(`departure:${booking.id}`)
        } catch (e: any) {
          errors.push(`departure:${booking.id}: ${e.message}`)
        }
      }
    }
  }

  for (const mg of (meetGreets || []) as MeetGreet[]) {
    if (!mg.scheduled_time || mg.reminder_sent) continue
    const target = toDateTimeInZone(mg.scheduled_date, mg.scheduled_time, BUSINESS_TIMEZONE, 0, 0)
    const mins = minutesUntil(target, now)
    if (mins <= EARLY_WINDOW_MIN && mins > LATE_WINDOW_MIN) {
      const label = mg.dog_names || mg.customer_name || 'A meet & greet'
      const body = `${label} (${mg.customer_name}) meet & greet in ${Math.max(0, Math.round(mins))} min, at ${formatTime(mg.scheduled_time)}.`
      try {
        await pushToUser(mg.user_id, '🤝 Meet & Greet soon', body, `/meet-greets/${mg.id}`)
        await supabase.from('meet_greets').update({ reminder_sent: true }).eq('id', mg.id)
        sent.push(`meet_greet:${mg.id}`)
      } catch (e: any) {
        errors.push(`meet_greet:${mg.id}: ${e.message}`)
      }
    }
  }

  return NextResponse.json({ checked: (bookings || []).length + (meetGreets || []).length, sent, errors })
}
