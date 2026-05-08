'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const isEdit = !!expenseId
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '', amount: '', category: 'Treats', payment_method: '',
    business_use_percentage: '100', tax_deductible: 'true', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (expenseId) {
      supabase.from('expenses').select('*').eq('id', expenseId).single().then(({ data }) => {
        if (data) setForm({
          expense_date: data.expense_date, vendor: data.vendor, amount: String(data.amount),
          category: data.category, payment_method: data.payment_method || '',
          business_use_percentage: String(data.business_use_percentage),
          tax_deductible: String(data.tax_deductible), notes: data.notes || ''
        })
      })
    }
  }, [expenseId])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.vendor || !form.amount || !form.expense_date) { alert('Fill required fields'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amt = parseFloat(form.amount) || 0
    const bp = parseFloat(form.business_use_percentage) || 100
    const taxDed = form.tax_deductible === 'true'
    const payload = {
      user_id: user.id, expense_date: form.expense_date, vendor: form.vendor,
      amount: amt, category: form.category, payment_method: form.payment_method || null,
      business_use_percentage: bp, tax_deductible: taxDed,
      deductible_amount: taxDed ? amt * (bp / 100) : 0,
      notes: form.notes || null, updated_at: new Date().toISOString()
    }
    if (isEdit) await supabase.from('expenses').update(payload).eq('id', expenseId)
    else await supabase.from('expenses').insert({ ...payload, created_at: new Date().toISOString() })
    setSaving(false)
    router.push('/expenses')
  }

  async function deleteExpense() {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', expenseId)
    router.push('/expenses')
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Expense' : 'New Expense'}</h1>
        <p className="text-sm text-gray-500">Log an operational cost</p>
      </div>
      <div className="card max-w-lg">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="label">Date *</label><input className="input" type="date" value={form.expense_date} onChange={set('expense_date')} /></div>
          <div><label className="label">Vendor *</label><input className="input" value={form.vendor} onChange={set('vendor')} placeholder="e.g. PetSmart" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="label">Amount ($) *</label><input className="input" type="number" step="0.01" value={form.amount} onChange={set('amount')} /></div>
          <div><label className="label">Category *</label>
            <select className="input" value={form.category} onChange={set('category')}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div><label className="label">Payment Method</label><input className="input" value={form.payment_method} onChange={set('payment_method')} placeholder="e.g. Visa" /></div>
          <div><label className="label">Business Use %</label><input className="input" type="number" min="0" max="100" value={form.business_use_percentage} onChange={set('business_use_percentage')} /></div>
          <div><label className="label">Tax Deductible</label>
            <select className="input" value={form.tax_deductible} onChange={set('tax_deductible')}>
              <option value="true">Yes</option><option value="false">No</option>
            </select>
          </div>
        </div>
        <div className="mb-4"><label className="label">Notes</label><input className="input" value={form.notes} onChange={set('notes')} placeholder="Optional" /></div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Expense'}</button>
          <button className="btn" onClick={() => router.push('/expenses')}>Cancel</button>
          {isEdit && <button className="btn btn-danger ml-auto" onClick={deleteExpense}>Delete</button>}
        </div>
      </div>
    </AppShell>
  )
}
