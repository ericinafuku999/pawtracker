import ExpenseForm from '@/components/ExpenseForm'
export default function EditExpensePage({ params }: { params: { id: string } }) {
  return <ExpenseForm expenseId={params.id} />
}
