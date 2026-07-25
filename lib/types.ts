export type BookingStatus = 'active' | 'completed' | 'cancelled'
export type PaymentType = 'Rover' | 'Venmo'
export type PaymentStatus = 'unpaid' | 'partially paid' | 'paid'

export interface MonthAllocation {
  monthKey: string
  days: number
  dogDays: number
  revenue: number
}

export interface Booking {
  id: string
  user_id: string
  customer_name: string
  dog_names: string
  number_of_dogs: number
  arrival_date: string
  arrival_time: string | null
  arrival_reminder_sent: boolean
  departure_date: string
  departure_time: string | null
  departure_reminder_sent: boolean
  number_of_days: number
  dog_days: number
  dog_days_override: number | null
  rate_per_dog_day: number
  total_revenue: number
  payment_type: PaymentType
  payment_status: PaymentStatus
  amount_received: number
  status: BookingStatus
  cancellation_reason: string | null
  notes: string | null
  tip_amount: number | null
  month_allocations: MonthAllocation[]
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  user_id: string
  expense_date: string
  vendor: string
  amount: number
  category: string
  payment_method: string | null
  tax_deductible: boolean
  business_use_percentage: number
  deductible_amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export const EXPENSE_CATEGORIES = [
  'Treats', 'Dog food', 'Diapers', 'Toys', 'Cleaning materials',
  'Poop bags', 'Leashes/collars', 'Crates/gates/beds', 'Repairs/maintenance',
  'Insurance', 'Marketing', 'Software/subscriptions', 'Mileage/vehicle',
  'Bank/payment fees', 'Professional services', 'Other'
]
