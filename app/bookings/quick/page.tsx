'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function QuickAddPage() {
  const [form, setForm] = useState({
    dog_name: '',
    owner_name: '',
    arrival_date: '',
    departure_date: '',
    rate: '45',
    payment_type: 'Rover',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Default to today
  useEffect(() => {
    const today = new Date()
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setForm(f => ({ ...f, arrival_date: str, departure_date: str }))
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const calc = form.arrival_date && form.departure_date
    ? (() => {
        const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, 1)
        const revenue = dogDays * (parseFloat(form.rate) || 0)
        return { days, dogDays, revenue }
      })()
    : null

  async function save(addAnother = false) {
    if (!form.dog_name || !form.arrival_date || !form.departure_date) {
      alert('Dog name and dates are required')
      return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const rate = parseFloat(form.rate) || 45
    const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, 1)
    const ma = splitRevenueByMonth(form.arrival_date, form.departure_date, 1, rate)

    await supabase.from('bookings').insert({
      user_id: session.user.id,
      customer_name: form.owner_name || 'Imported',
      dog_names: form.dog_name,
      number_of_dogs: 1,
      arrival_date: form.arrival_date,
      departure_date: form.departure_date,
      number_of_days: days,
      dog_days: dogDays,
      dog_days_override: null,
      rate_per_dog_day: rate,
      total_revenue: dogDays * rate,
      payment_type: form.payment_type,
      payment_status: 'unpaid',
      amount_received: 0,
      status: 'active',
      month_allocations: ma,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    setSaving(false)

    if (addAnother) {
      const today = new Date()
      const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setForm(f => ({ ...f, dog_name: '', owner_name: '', arrival_date: str, departure_date: str }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      router.push('/bookings')
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="btn py-1.5 px-2 text-xs">← Back</button>
        <div>
          <h1 className="text-xl font-semibold">⚡ Quick Add Booking</h1>
          <p className="text-xs text-gray-400">Just the essentials</p>
        </div>
      </div>

      {saved && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
          ✓ Booking saved! Ready for another.
        </div>
      )}

      <div className="card max-w-lg">
        {/* Dog name */}
        <div className="mb-4">
          <label className="label text-sm">Dog Name *</label>
          <input
            className="input text-base py-3"
            value={form.dog_name}
            onChange={set('dog_name')}
            placeholder="e.g. Charlie"
            autoFocus
          />
        </div>

        {/* Owner name */}
        <div className="mb-4">
          <label className="label text-sm">Owner Name <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            className="input text-base py-3"
            value={form.owner_name}
            onChange={set('owner_name')}
            placeholder="e.g. Shae"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label text-sm">Arrival</label>
            <input className="input text-base py-3" type="date" value={form.arrival_date} onChange={set('arrival_date')} />
          </div>
          <div>
            <label className="label text-sm">Departure</label>
            <input className="input text-base py-3" type="date" value={form.departure_date} onChange={set('departure_date')} />
          </div>
        </div>

        {/* Rate */}
        <div className="mb-4">
          <label className="label text-sm">Rate ($/day)</label>
          <input className="input text-base py-3" type="number" value={form.rate} onChange={set('rate')} />
        </div>

        {/* Payment type */}
        <div className="mb-5">
          <label className="label text-sm">Payment Type</label>
          <div className="grid grid-cols-2 gap-3">
            {['Rover', 'Venmo'].map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, payment_type: t }))}
                className={`py-3 rounded-xl border-2 font-semibold text-base transition-all ${
                  form.payment_type === t
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Revenue preview */}
        {calc && calc.revenue > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-5 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-emerald-700">{calc.days}</div>
              <div className="text-xs text-gray-500">Days</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-700">{calc.dogDays}</div>
              <div className="text-xs text-gray-500">Dog-Days</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-700">${calc.revenue}</div>
              <div className="text-xs text-gray-500">Revenue</div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary w-full justify-center py-4 text-base font-semibold"
            onClick={() => save(false)}
            disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Booking'}
          </button>
          <button
            className="btn w-full justify-center py-4 text-base bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            onClick={() => save(true)}
            disabled={saving}>
            {saving ? 'Saving…' : '+ Save & Add Another'}
          </button>
          <button
            className="btn w-full justify-center py-3 text-sm text-gray-500"
            onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  )
}