import * as XLSX from 'xlsx'
import { Booking, Expense } from '@/lib/types'

function fmtDate(s: string) {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function getMonthKey(s: string) { return s.substr(0, 7) }
function totalAmount(b: Booking) { return b.amount_received + (b.tip_amount || 0) }

export function exportToExcel(bookings: Booking[], expenses: Expense[], filename = 'PawTracker') {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Monthly Summary ──────────────────────────────────
  const monthMap: Record<string, {
    bookings: number, dogDays: number,
    received: number, expected: number, projected: number, expenses: number
  }> = {}

  bookings.filter(b => b.status !== 'cancelled').forEach(b => {
    const mk = getMonthKey(b.departure_date)
    if (!monthMap[mk]) monthMap[mk] = { bookings: 0, dogDays: 0, received: 0, expected: 0, projected: 0, expenses: 0 }
    monthMap[mk].bookings++
    monthMap[mk].dogDays += b.dog_days
    monthMap[mk].projected += totalAmount(b)
    if (b.payment_status === 'paid') monthMap[mk].received += totalAmount(b)
    else monthMap[mk].expected += totalAmount(b)
  })

  expenses.forEach(e => {
    const mk = getMonthKey(e.expense_date)
    if (!monthMap[mk]) monthMap[mk] = { bookings: 0, dogDays: 0, received: 0, expected: 0, projected: 0, expenses: 0 }
    monthMap[mk].expenses += e.amount
  })

  const sortedMonths = Object.keys(monthMap).sort()

  const monthRows = sortedMonths.map(mk => {
    const [y, m] = mk.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const d = monthMap[mk]
    return {
      'Month': label,
      'Bookings': d.bookings,
      'Dog-Days': d.dogDays,
      'Revenue Received': d.received,
      'Expected Revenue': d.expected,
      'Projected Total': d.projected,
      'Expenses': d.expenses,
      'Net Profit': d.received - d.expenses,
    }
  })

  const totals = {
    'Month': 'TOTAL',
    'Bookings': monthRows.reduce((s, r) => s + r['Bookings'], 0),
    'Dog-Days': monthRows.reduce((s, r) => s + r['Dog-Days'], 0),
    'Revenue Received': monthRows.reduce((s, r) => s + r['Revenue Received'], 0),
    'Expected Revenue': monthRows.reduce((s, r) => s + r['Expected Revenue'], 0),
    'Projected Total': monthRows.reduce((s, r) => s + r['Projected Total'], 0),
    'Expenses': monthRows.reduce((s, r) => s + r['Expenses'], 0),
    'Net Profit': monthRows.reduce((s, r) => s + r['Net Profit'], 0),
  }

  const ws1 = XLSX.utils.json_to_sheet([...monthRows, totals])
  ws1['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Monthly Summary')

  // ── Sheet 2: Bookings ─────────────────────────────────────────
  const bookingRows = bookings
    .filter(b => b.status !== 'cancelled')
    .sort((a, b) => a.departure_date.localeCompare(b.departure_date))
    .map(b => ({
      'Arrival Date': fmtDate(b.arrival_date),
      'Departure Date': fmtDate(b.departure_date),
      'Dog': b.dog_names,
      'Owner': b.customer_name,
      'Days': b.number_of_days,
      'Dog-Days': b.dog_days,
      'Expected Amount': b.amount_received,
      'Tip': b.tip_amount || 0,
      'Total': totalAmount(b),
      'Payment Type': b.payment_type,
      'Payment Status': b.payment_status,
    }))

  const ws2 = XLSX.utils.json_to_sheet(bookingRows)
  ws2['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 8 }, { wch: 10 },
    { wch: 16 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Bookings')

  // ── Sheet 3: Expenses ─────────────────────────────────────────
  const expenseRows = expenses
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
    .map(e => ({
      'Date': fmtDate(e.expense_date),
      'Vendor': e.vendor,
      'Category': e.category,
      'Amount': e.amount,
      'Business Use %': e.business_use_percentage,
      'Deductible Amount': e.deductible_amount,
      'Payment Method': e.payment_method || '',
      'Tax Deductible': e.tax_deductible ? 'Yes' : 'No',
      'Notes': e.notes || '',
    }))

  const expTotals = {
    'Date': 'TOTAL',
    'Vendor': '',
    'Category': '',
    'Amount': expenses.reduce((s, e) => s + e.amount, 0),
    'Business Use %': '',
    'Deductible Amount': expenses.reduce((s, e) => s + e.deductible_amount, 0),
    'Payment Method': '',
    'Tax Deductible': '',
    'Notes': '',
  }

  const ws3 = XLSX.utils.json_to_sheet([...expenseRows, expTotals])
  ws3['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 14 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Expenses')

  // ── Sheet 4: Tax Summary ──────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const ytdBookings = bookings.filter(b =>
    b.status !== 'cancelled' &&
    b.departure_date.startsWith(String(currentYear))
  )
  const ytdExpenses = expenses.filter(e => e.expense_date.startsWith(String(currentYear)))

  const ytdReceived = ytdBookings.filter(b => b.payment_status === 'paid').reduce((s, b) => s + totalAmount(b), 0)
  const ytdExpected = ytdBookings.filter(b => b.payment_status !== 'paid').reduce((s, b) => s + totalAmount(b), 0)
  const ytdProjected = ytdBookings.reduce((s, b) => s + totalAmount(b), 0)
  const ytdTotalExp = ytdExpenses.reduce((s, e) => s + e.amount, 0)
  const ytdDeductible = ytdExpenses.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0)
  const ytdProfit = ytdReceived - ytdTotalExp

  const quarters = [1, 2, 3, 4].map(q => {
    const qMonths = [0, 1, 2].map(i => String((q - 1) * 3 + i + 1).padStart(2, '0'))
    const qBks = ytdBookings.filter(b => qMonths.includes(b.departure_date.substr(5, 2)))
    const qExps = ytdExpenses.filter(e => qMonths.includes(e.expense_date.substr(5, 2)))
    const qReceived = qBks.filter(b => b.payment_status === 'paid').reduce((s, b) => s + totalAmount(b), 0)
    const qExpTotal = qExps.reduce((s, e) => s + e.amount, 0)
    return {
      'Period': `Q${q} ${currentYear}`,
      'Revenue Received': qReceived,
      'Expenses': qExpTotal,
      'Net Profit': qReceived - qExpTotal,
      'Deductible Expenses': qExps.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0),
    }
  })

  const taxRows = [
    { 'Period': `${currentYear} Summary`, 'Revenue Received': '', 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Revenue Received (Paid)', 'Revenue Received': fmtCurrency(ytdReceived), 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Expected Revenue (Unpaid)', 'Revenue Received': fmtCurrency(ytdExpected), 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Projected Total', 'Revenue Received': fmtCurrency(ytdProjected), 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Total Expenses', 'Revenue Received': '', 'Expenses': fmtCurrency(ytdTotalExp), 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Total Deductible Expenses', 'Revenue Received': '', 'Expenses': fmtCurrency(ytdDeductible), 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Net Profit YTD', 'Revenue Received': '', 'Expenses': '', 'Net Profit': fmtCurrency(ytdProfit), 'Deductible Expenses': '' },
    { 'Period': '', 'Revenue Received': '', 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    { 'Period': 'Quarterly Breakdown', 'Revenue Received': '', 'Expenses': '', 'Net Profit': '', 'Deductible Expenses': '' },
    ...quarters.map(q => ({
      'Period': q['Period'],
      'Revenue Received': fmtCurrency(q['Revenue Received']),
      'Expenses': fmtCurrency(q['Expenses']),
      'Net Profit': fmtCurrency(q['Net Profit']),
      'Deductible Expenses': fmtCurrency(q['Deductible Expenses']),
    })),
  ]

  const ws4 = XLSX.utils.json_to_sheet(taxRows)
  ws4['!cols'] = [
    { wch: 28 }, { wch: 20 }, { wch: 16 },
    { wch: 16 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws4, 'Tax Summary')

  const year = new Date().getFullYear()
  XLSX.writeFile(wb, `${filename}-${year}.xlsx`)
}