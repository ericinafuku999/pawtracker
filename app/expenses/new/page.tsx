'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function NewExpensePage() {
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '', category: 'Supplies', amount: '', business_use_percentage: '100',
    payment_method: '', tax_deductible: true, notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const categories = ['Supplies', 'Food', 'Treats', 'Toys', 'Cleaning', 'Vet', 'Insurance', 'Marketing', 'Equipment', 'Other']

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save(addAnother = false) {
    if (!form.vendor || !form.amount) { alert('Vendor and amount are required'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const amount = parseFloat(form.amount) || 0
    const bizPct = parseFloat(form.business_use_percentage) || 100
    const deductible = form.tax_deductible ? (amount * bizPct / 100) : 0

    await supabase.from('expenses').insert({
      user_id: user.id,
      expense_date: form.expense_date,
      vendor: form.vendor,
      category: form.category,
      amount,
      business_use_percentage: bizPct,
      deductible_amount: deductible,
      payment_method: form.payment_method || null,
      tax_deductible: form.tax_deductible,
      notes: form.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    setSaving(false)

    if (addAnother) {
      setForm({
        expense_date: new Date().toISOString().split('T')[0],
        vendor: '', category: 'Supplies', amount: '', business_use_percentage: '100',
        payment_method: '', tax_deductible: true, notes: ''
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      router.push('/expenses')
    }
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">New Expense</h1>
        <p className="text-sm text-gray-500">Log a business expense</p>
      </div>

      {saved && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
          ✓ Expense saved! Fill in the form below to add another.
        </div>
      )}

      <div className="card max-w-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Date *</label>
            <input className="input text-base sm:text-sm" type="date" value={form.expense_date} onChange={set('expense_date')} />
          </div>
          <div>
            <label className="label">Vendor *</label>
            <input className="input text-base sm:text-sm" value={form.vendor} onChange={set('vendor')} placeholder="e.g. PetSmart" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Category</label>
            <select className="input text-base sm:text-sm" value={form.category} onChange={set('category')}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount ($) *</label>
            <input className="input text-base sm:text-sm" type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Payment Method</label>
            <input className="input text-base sm:text-sm" value={form.payment_method} onChange={set('payment_method')} placeholder="e.g. Visa, Axos" />
          </div>
          <div>
            <label className="label">Business Use %</label>
            <input className="input text-base sm:text-sm" type="number" min="0" max="100" value={form.business_use_percentage} onChange={set('business_use_percentage')} />
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.tax_deductible} onChange={e => setForm(f => ({ ...f, tax_deductible: e.target.checked }))} className="w-4 h-4 accent-emerald-500" />
            <span className="text-sm text-gray-700">Tax deductible</span>
          </label>
          {form.tax_deductible && form.amount && (
            <div className="text-xs text-emerald-600 mt-1 ml-6">
              Deductible amount: ${((parseFloat(form.amount) || 0) * (parseFloat(form.business_use_percentage) || 100) / 100).toFixed(2)}
            </div>
          )}
        </div>

        <div className="mb-5">
          <label className="label">Notes</label>
          <textarea className="input text-base sm:text-sm" rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => save(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Expense'}
          </button>
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={() => save(true)} disabled={saving}>
            {saving ? 'Saving…' : '+ Save & Add Another'}
          </button>
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => router.push('/expenses')}>
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  )
}