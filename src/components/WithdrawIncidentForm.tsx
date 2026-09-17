'use client'

import { useFormStatus } from 'react-dom'

function WithdrawButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? '撤回中…' : '撤回紀錄'}
    </button>
  )
}

export default function WithdrawIncidentForm({
  action,
  incidentId,
  publicCaseId,
}: {
  action: (formData: FormData) => void | Promise<void>
  incidentId: string
  publicCaseId: string
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          '確定要撤回這筆待審紀錄嗎？\n\n撤回後將不再進入管理員審核，也不會顯示於公開案例。'
        )

        if (!confirmed) {
          event.preventDefault()
        }
      }}
    >
      <input
        type="hidden"
        name="incident_id"
        value={incidentId}
      />

      <input
        type="hidden"
        name="public_case_id"
        value={publicCaseId}
      />

      <WithdrawButton />
    </form>
  )
}
