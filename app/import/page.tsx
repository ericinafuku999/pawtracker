'use client'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'

interface PreviewBooking {
  dog_names: string
  customer_name: string
  arrival_date: string
  departure_date: string
  number_of_dogs: number
  rate_per_dog_day: number
  payment_type: string
  amount_received: number
  payment_status: string
  action: 'import' | 'replace' | 'skip'
  existingId?: string
  duplicate: boolean
}

interface PreviewExpense {
  expense_date: string
  vendor: string
  category: string
  amount: number
  business_use_percentage: number
  tax_deductible: boolean
  payment_method: string
  notes: string
  action: 'import' | 'replace' | 'skip'
  existingId?: string
  duplicate: boolean
}

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findCol(headers: string[], ...options: string[]) {
  const normalized = headers.map(normalizeHeader)
  for (const opt of options) {
    const idx = normalized.indexOf(normalizeHeader(opt))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function parseDate(val: any): string {
  if (!val) return ''
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val)
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    }
  }
  const s = String(val).trim()
  // Try MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    const y = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3]
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  // Try YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  return s
}

function detectType(headers: string[]): 'bookings' | 'expenses' | 'unknown' {
  const norm = headers.map(normalizeHeader)
  const hasArrival = norm.some(h => h.includes('arrival'))
  const hasDeparture = norm.some(h => h.includes('departure'))
  const hasVendor = norm.some(h => h.includes('vendor'))
  const hasCategory = norm.some(h => h.includes('category'))
  if (hasArrival && hasDeparture) return 'bookings'
  if (hasVendor || hasCategory) return 'expenses'
  return 'unknown'
}

export default function ImportPage() {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [bookings, setBookings] = useState<PreviewBooking[]>([])
  const [expenses, setExpenses] = useState<PreviewExpense[]>([])
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState({ imported: 0, replaced: 0, skipped: 0 })
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const processFile = useCallback(async (file: File) => {
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: existingBookings } = await supabase.from('bookings').select('*').eq('user_id', user.id)
      const { data: existingExpenses } = await supabase.from('expenses').select('*').eq('user_id', user.id)

      const allBookings: PreviewBooking[] = []
      const allExpenses: PreviewExpense[] = []

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[]
        if (rows.length === 0) continue

        const headers = Object.keys(rows[0])
        const type = detectType(headers)

        if (type === 'bookings') {
          const dogCol = findCol(headers, 'dog', 'dog name', 'dog names', 'dogs')
          const ownerCol = findCol(headers, 'owner', 'customer', 'customer name', 'owner name')
          const arrivalCol = findCol(headers, 'arrival', 'arrival date', 'check in', 'checkin')
          const departureCol = findCol(headers, 'departure', 'departure date', 'check out', 'checkout')
          const numDogsCol = findCol(headers, 'number of dogs', 'num dogs', 'dogs', '# dogs')
          const rateCol = findCol(headers, 'rate', 'rate per day', 'rate per dog day', 'daily rate')
          const payTypeCol = findCol(headers, 'payment type', 'pay type', 'payment', 'type')
          const amountCol = findCol(headers, 'amount received', 'amount', 'received', 'paid')
          const payStatusCol = findCol(headers, 'payment status', 'pay status', 'status')

          for (const row of rows) {
            const dogName = dogCol ? String(row[dogCol] || '').trim() : ''
            const ownerName = ownerCol ? String(row[ownerCol] || '').trim() : 'Imported'
            const arrival = arrivalCol ? parseDate(row[arrivalCol]) : ''
            const departure = departureCol ? parseDate(row[departureCol]) : ''
            if (!dogName || !arrival || !departure) continue

            const numDogs = numDogsCol ? parseInt(row[numDogsCol]) || 1 : 1
            const rate = rateCol ? parseFloat(row[rateCol]) || 45 : 45
            const payType = payTypeCol ? String(row[payTypeCol] || '').trim() : 'Rover'
            const amount = amountCol ? parseFloat(row[amountCol]) || 0 : 0
            const rawStatus = payStatusCol ? String(row[payStatusCol] || '').toLowerCase().trim() : ''
            const payStatus = rawStatus.includes('paid') && !rawStatus.includes('un') ? 'paid'
              : rawStatus.includes('partial') ? 'partially paid' : 'unpaid'

            // Check for duplicate
            const existing = (existingBookings || []).find(b =>
              b.dog_names?.toLowerCase() === dogName.toLowerCase() &&
              b.arrival_date === arrival &&
              b.departure_date === departure
            )

            allBookings.push({
              dog_names: dogName,
              customer_name: ownerName,
              arrival_date: arrival,
              departure_date: departure,
              number_of_dogs: numDogs,
              rate_per_dog_day: rate,
              payment_type: payType.includes('enmo') ? 'Venmo' : 'Rover',
              amount_received: amount,
              payment_status: payStatus,
              action: existing ? 'skip' : 'import',
              existingId: existing?.id,
              duplicate: !!existing,
            })
          }
        }

        if (type === 'expenses') {
          const dateCol = findCol(headers, 'date', 'expense date', 'transaction date')
          const vendorCol = findCol(headers, 'vendor', 'merchant', 'description', 'payee')
          const categoryCol = findCol(headers, 'category', 'type', 'expense type')
          const amountCol = findCol(headers, 'amount', 'cost', 'price', 'total')
          const bizPctCol = findCol(headers, 'business use', 'biz pct', 'business use %', 'business%')
          const taxCol = findCol(headers, 'tax deductible', 'deductible', 'tax')
          const payMethodCol = findCol(headers, 'payment method', 'payment', 'method', 'card')
          const notesCol = findCol(headers, 'notes', 'note', 'description', 'memo')

          for (const row of rows) {
            const date = dateCol ? parseDate(row[dateCol]) : ''
            const vendor = vendorCol ? String(row[vendorCol] || '').trim() : ''
            const amount = amountCol ? parseFloat(row[amountCol]) || 0 : 0
            if (!date || !vendor || amount === 0) continue

            const category = categoryCol ? String(row[categoryCol] || '').trim() || 'Other' : 'Other'
            const bizPct = bizPctCol ? parseFloat(row[bizPctCol]) || 100 : 100
            const rawTax = taxCol ? String(row[taxCol] || '').toLowerCase() : 'yes'
            const taxDeductible = rawTax.includes('yes') || rawTax.includes('true') || rawTax === '1'
            const payMethod = payMethodCol ? String(row[payMethodCol] || '').trim() : ''
            const notes = notesCol ? String(row[notesCol] || '').trim() : ''

            // Check for duplicate
            const existing = (existingExpenses || []).find(e =>
              e.expense_date === date &&
              e.vendor?.toLowerCase() === vendor.toLowerCase() &&
              Math.abs(e.amount - amount) < 0.01
            )

            allExpenses.push({
              expense_date: date,
              vendor,
              category,
              amount,
              business_use_percentage: bizPct,
              tax_deductible: taxDeductible,
              payment_method: payMethod,
              notes,
              action: existing ? 'skip' : 'import',
              existingId: existing?.id,
              duplicate: !!existing,
            })
          }
        }
      }

      setBookings(allBookings)
      setExpenses(allExpenses)
      setStep('preview')
    } catch (err) {
      setError('Could not read file. Make sure it is a valid .xlsx or .csv file.')
    }
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function setBookingAction(idx: number, action: 'import' | 'replace' | 'skip') {
    setBookings(prev => prev.map((b, i) => i === idx ? { ...b, action } : b))
  }

  function setExpenseAction(idx: number, action: 'import' | 'replace' | 'skip') {
    setExpenses(prev => prev.map((e, i) => i === idx ? { ...e, action } : e))
  }

  function setAllBookingDuplicates(action: 'replace' | 'skip') {
    setBookings(prev => prev.map(b => b.duplicate ? { ...b, action } : b))
  }

  function setAllExpenseDuplicates(action: 'replace' | 'skip') {
    setExpenses(prev => prev.map(e => e.duplicate ? { ...e, action } : e))
  }

  async function runImport() {
    setImporting(true)
    setStep('importing')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let imported = 0, replaced = 0, skipped = 0

    for (const b of bookings) {
      if (b.action === 'skip') { skipped++; continue }
      const { days, dogDays } = calcDogDays(b.arrival_date, b.departure_date, b.number_of_dogs)
      const ma = splitRevenueByMonth(b.arrival_date, b.departure_date, b.number_of_dogs, b.rate_per_dog_day)
      const payload = {
        user_id: user.id,
        dog_names: b.dog_names,
        customer_name: b.customer_name,
        number_of_dogs: b.number_of_dogs,
        arrival_date: b.arrival_date,
        departure_date: b.departure_date,
        number_of_days: days,
        dog_days: dogDays,
        dog_days_override: null,
        rate_per_dog_day: b.rate_per_dog_day,
        total_revenue: dogDays * b.rate_per_dog_day,
        payment_type: b.payment_type as any,
        payment_status: b.payment_status as any,
        amount_received: b.amount_received,
        status: 'active' as any,
        month_allocations: ma,
        updated_at: new Date().toISOString(),
      }
      if (b.action === 'replace' && b.existingId) {
        await supabase.from('bookings').update(payload).eq('id', b.existingId)
        replaced++
      } else {
        await supabase.from('bookings').insert({ ...payload, created_at: new Date().toISOString() })
        imported++
      }
    }

    for (const e of expenses) {
      if (e.action === 'skip') { skipped++; continue }
      const deductible = e.tax_deductible ? (e.amount * e.business_use_percentage / 100) : 0
      const payload = {
        user_id: user.id,
        expense_date: e.expense_date,
        vendor: e.vendor,
        category: e.category,
        amount: e.amount,
        business_use_percentage: e.business_use_percentage,
        deductible_amount: deductible,
        tax_deductible: e.tax_deductible,
        payment_method: e.payment_method || null,
        notes: e.notes || null,
        updated_at: new Date().toISOString(),
      }
      if (e.action === 'replace' && e.existingId) {
        await supabase.from('expenses').update(payload).eq('id', e.existingId)
        replaced++
      } else {
        await supabase.from('expenses').insert({ ...payload, created_at: new Date().toISOString() })
        imported++
      }
    }

    setResults({ imported, replaced, skipped })
    setImporting(false)
    setStep('done')
  }

  const totalBookings = bookings.length
  const totalExpenses = expenses.length
  const dupBookings = bookings.filter(b => b.duplicate).length
  const dupExpenses = expenses.filter(e => e.duplicate).length
  const toImport = [...bookings, ...expenses].filter(r => r.action !== 'skip').length

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Import Data</h1>
        <p className="text-sm text-gray-500">Import bookings and expenses from Excel or CSV</p>
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div className="card max-w-lg">
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-emerald-200 rounded-xl p-10 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-input')?.click()}>
            <div className="text-4xl mb-3">📊</div>
            <div className="font-semibold text-gray-700 mb-1">Drop your file here</div>
            <div className="text-sm text-gray-400 mb-3">or click to browse</div>
            <div className="text-xs text-gray-300">Supports .xlsx, .xls, .csv</div>
            <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </div>
          {error && <div className="mt-3 text-sm text-red-500 text-center">{error}</div>}

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500 mb-2">Expected column headers</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600 mb-1">📅 Bookings sheet</div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div>Dog Name, Owner Name</div>
                  <div>Arrival Date, Departure Date</div>
                  <div>Number of Dogs, Rate</div>
                  <div>Payment Type, Amount Received</div>
                  <div>Payment Status</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600 mb-1">🧾 Expenses sheet</div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div>Date, Vendor</div>
                  <div>Category, Amount</div>
                  <div>Business Use %</div>
                  <div>Tax Deductible</div>
                  <div>Payment Method, Notes</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-sm">
                Found {totalBookings} booking{totalBookings !== 1 ? 's' : ''}
                {totalExpenses > 0 && ` and ${totalExpenses} expense${totalExpenses !== 1 ? 's' : ''}`}
              </div>
              {(dupBookings > 0 || dupExpenses > 0) && (
                <div className="text-xs text-amber-600 mt-0.5">
                  ⚠️ {dupBookings + dupExpenses} duplicate{dupBookings + dupExpenses !== 1 ? 's' : ''} found — choose to replace or skip below
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn text-xs" onClick={() => setStep('upload')}>← Back</button>
              <button
                className="btn btn-primary text-xs"
                onClick={runImport}
                disabled={toImport === 0}>
                Import {toImport} record{toImport !== 1 ? 's' : ''} →
              </button>
            </div>
          </div>

          {/* Bookings preview */}
          {bookings.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm">📅 Bookings ({totalBookings})</h2>
                {dupBookings > 0 && (
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-500">{dupBookings} duplicates:</span>
                    <button className="text-xs text-emerald-600 underline" onClick={() => setAllBookingDuplicates('replace')}>Replace all</button>
                    <button className="text-xs text-gray-400 underline" onClick={() => setAllBookingDuplicates('skip')}>Skip all</button>
                  </div>
                )}
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Dog</th>
                      <th className="th">Owner</th>
                      <th className="th">Arrival</th>
                      <th className="th">Departure</th>
                      <th className="th">Rate</th>
                      <th className="th">Payment</th>
                      <th className="th">Action</th>
                    </tr></thead>
                    <tbody>
                      {bookings.map((b, i) => (
                        <tr key={i} className={`${b.duplicate ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                          <td className="td font-medium">{b.dog_names}</td>
                          <td className="td text-gray-500">{b.customer_name}</td>
                          <td className="td text-xs">{b.arrival_date}</td>
                          <td className="td text-xs">{b.departure_date}</td>
                          <td className="td">${b.rate_per_dog_day}/day</td>
                          <td className="td">
                            <span className={`badge text-xs ${b.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{b.payment_type}</span>
                          </td>
                          <td className="td">
                            {b.duplicate ? (
                              <div className="flex gap-1">
                                <button onClick={() => setBookingAction(i, 'replace')}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${b.action === 'replace' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 font-medium' : 'border-gray-200 text-gray-400'}`}>
                                  Replace
                                </button>
                                <button onClick={() => setBookingAction(i, 'skip')}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${b.action === 'skip' ? 'bg-gray-100 border-gray-300 text-gray-600 font-medium' : 'border-gray-200 text-gray-400'}`}>
                                  Skip
                                </button>
                              </div>
                            ) : (
                              <span className="badge badge-green text-xs">New</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Expenses preview */}
          {expenses.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm">🧾 Expenses ({totalExpenses})</h2>
                {dupExpenses > 0 && (
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-500">{dupExpenses} duplicates:</span>
                    <button className="text-xs text-emerald-600 underline" onClick={() => setAllExpenseDuplicates('replace')}>Replace all</button>
                    <button className="text-xs text-gray-400 underline" onClick={() => setAllExpenseDuplicates('skip')}>Skip all</button>
                  </div>
                )}
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="th">Date</th>
                      <th className="th">Vendor</th>
                      <th className="th">Category</th>
                      <th className="th">Amount</th>
                      <th className="th">Tax</th>
                      <th className="th">Action</th>
                    </tr></thead>
                    <tbody>
                      {expenses.map((e, i) => (
                        <tr key={i} className={`${e.duplicate ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                          <td className="td text-xs">{e.expense_date}</td>
                          <td className="td font-medium">{e.vendor}</td>
                          <td className="td"><span className="badge badge-gray text-xs">{e.category}</span></td>
                          <td className="td font-semibold">${e.amount.toFixed(2)}</td>
                          <td className="td">
                            <span className={`badge text-xs ${e.tax_deductible ? 'badge-green' : 'badge-red'}`}>
                              {e.tax_deductible ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="td">
                            {e.duplicate ? (
                              <div className="flex gap-1">
                                <button onClick={() => setExpenseAction(i, 'replace')}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${e.action === 'replace' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 font-medium' : 'border-gray-200 text-gray-400'}`}>
                                  Replace
                                </button>
                                <button onClick={() => setExpenseAction(i, 'skip')}
                                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${e.action === 'skip' ? 'bg-gray-100 border-gray-300 text-gray-600 font-medium' : 'border-gray-200 text-gray-400'}`}>
                                  Skip
                                </button>
                              </div>
                            ) : (
                              <span className="badge badge-green text-xs">New</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {totalBookings === 0 && totalExpenses === 0 && (
            <div className="card text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">🤔</div>
              <div className="font-medium">No data found</div>
              <div className="text-sm mt-1">Make sure your file has the right column headers</div>
              <button className="btn mt-3 text-xs" onClick={() => setStep('upload')}>Try another file</button>
            </div>
          )}
        </div>
      )}

      {/* Importing step */}
      {step === 'importing' && (
        <div className="card max-w-sm mx-auto text-center py-10">
          <div className="text-4xl mb-3 animate-pulse">📊</div>
          <div className="font-semibold text-gray-700">Importing…</div>
          <div className="text-sm text-gray-400 mt-1">Please wait</div>
        </div>
      )}

      {/* Done step */}
      {step === 'done' && (
        <div className="card max-w-sm mx-auto text-center py-10">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-semibold text-gray-700 text-lg">Import Complete!</div>
          <div className="grid grid-cols-3 gap-3 mt-4 mb-5">
            <div className="bg-emerald-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-emerald-600">{results.imported}</div>
              <div className="text-xs text-gray-500">Imported</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-blue-600">{results.replaced}</div>
              <div className="text-xs text-gray-500">Replaced</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-gray-400">{results.skipped}</div>
              <div className="text-xs text-gray-500">Skipped</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary justify-center" onClick={() => router.push('/bookings')}>
              View Bookings →
            </button>
            <button className="btn justify-center" onClick={() => { setStep('upload'); setBookings([]); setExpenses([]) }}>
              Import Another File
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}