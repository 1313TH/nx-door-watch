'use client'

import { useState } from 'react'

export default function AdminArchiveCaseForm({
  vehicleId,
  action,
}: {
  vehicleId: string
  action: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-900">管理員操作</p>
          <p className="mt-1 text-sm leading-6 text-red-800">
            下架後，此案例會立即從公開案例、首頁與公開統計中隱藏；資料仍會保留在管理後台的封存案件。
          </p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-700 hover:text-white">
          {open ? '取消下架' : '下架案例'}
        </button>
      </div>

      {open && (
        <form action={action} className="mt-5 border-t border-red-200 pt-5" onSubmit={(event) => {
          const confirmed = window.confirm('確定要下架這個案例嗎？下架後案例會從公開頁面隱藏，但資料仍保留在管理後台。')
          if (!confirmed) event.preventDefault()
        }}>
          <input type="hidden" name="vehicle_id" value={vehicleId} />
          <label className="block text-sm font-medium text-red-900">
            下架原因
            <textarea name="reason" required minLength={2} rows={4} placeholder="請填寫下架原因，例如：內容與實際案例不符、重複案例、需要補充重要資料等。" className="mt-2 w-full resize-y rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none focus:border-red-700" />
          </label>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-950 hover:text-white">取消</button>
            <button type="submit" className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-800">確認下架</button>
          </div>
        </form>
      )}
    </div>
  )
}
