import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Booking } from '@/lib/types'
import { toDateTime, formatTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const REMINDER_MINUTES_BEFORE = 15
// Grace window so a booking is never missed even if a run is late or skipped,
// but also never fires more than a few minutes after the ideal moment.
const EARLY_WINDOW_MIN = REMINDER_MINUTES_BEFORE // fire any time from 15 min before...
const LATE_WINDOW_MIN = -5 // ...up to 5 min after, in case a cron run was delayed

function minutesUntil(target: Date, now: Date) {
  return (target.getTime() - now.getTime()) / 60000
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) {
    throw new Error('Twilio env vars not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)')
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio send failed (${res.status}): ${text}`)
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const numbers = (process.env.NOTIFY_PHONE_NUMBERS || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)

  if (numbers.length === 0) {
    return NextResponse.json({ error: 'NOTIFY_PHONE_NUMBERS not configured' }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Only bother looking at bookings touching today — reminders are same-day only.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .neq('status', 'cancelled')
    .or(`arrival_date.eq.${todayStr},departure_date.eq.${todayStr}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sent: string[] = []
  const errors: string[] = []

  for (const booking of (bookings || []) as Booking[]) {
    // Arrival reminder
    if (booking.arrival_time && !booking.arrival_reminder_sent && booking.arrival_date === todayStr) {
      const target = toDateTime(booking.arrival_date, booking.arrival_time, 0, 0)
      const mins = minutesUntil(target, now)
      if (mins <= EARLY_WINDOW_MIN && mins > LATE_WINDOW_MIN) {
        const label = booking.dog_names || booking.customer_name || 'A dog'
        const body = `🐾 PawTracker: ${label} (${booking.customer_name}) arrives in ${Math.max(0, Math.round(mins))} min, at ${formatTime(booking.arrival_time)}.`
        try {
          for (const to of numbers) await sendSms(to, body)
          await supabase.from('bookings').update({ arrival_reminder_sent: true }).eq('id', booking.id)
          sent.push(`arrival:${booking.id}`)
        } catch (e: any) {
          errors.push(`arrival:${booking.id}: ${e.message}`)
        }
      }
    }

    // Departure reminder
    if (booking.departure_time && !booking.departure_reminder_sent && booking.departure_date === todayStr) {
      const target = toDateTime(booking.departure_date, booking.departure_time, 23, 59)
      const mins = minutesUntil(target, now)
      if (mins <= EARLY_WINDOW_MIN && mins > LATE_WINDOW_MIN) {
        const label = booking.dog_names || booking.customer_name || 'A dog'
        const body = `🐾 PawTracker: ${label} (${booking.customer_name}) departs in ${Math.max(0, Math.round(mins))} min, at ${formatTime(booking.departure_time)}.`
        try {
          for (const to of numbers) await sendSms(to, body)
          await supabase.from('bookings').update({ departure_reminder_sent: true }).eq('id', booking.id)
          sent.push(`departure:${booking.id}`)
        } catch (e: any) {
          errors.push(`departure:${booking.id}: ${e.message}`)
        }
      }
    }
  }

  return NextResponse.json({ checked: (bookings || []).length, sent, errors })
}
