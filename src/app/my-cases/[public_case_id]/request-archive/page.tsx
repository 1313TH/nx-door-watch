import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requestArchive(formData: FormData) {
  'use server'

  const vehicleId = String(
    formData.get('vehicle_id') ?? ''
  )

  const publicCaseId = String(
    formData.get('public_case_id') ?? ''
  )

  const reason = String(
    formData.get('reason') ?? ''
  ).trim()

  if (!vehicleId || !publicCaseId || !reason) {
    redirect(
      `/my-cases/${publicCaseId}/request-archive?error=missing`
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.rpc(
    'request_case_archive',
    {
      p_vehicle_id: vehicleId,
      p_reason: reason,
    }
  )

  if (error) {
    console.error(
      'request_case_archive error:',
      error
    )

    redirect(
      `/my-cases/${publicCaseId}/request-archive?error=request`
    )
  }

  revalidatePath('/my-cases')
  revalidatePath(`/my-cases/${publicCaseId}`)
  revalidatePath('/admin')

  redirect(
    `/my-cases/${publicCaseId}?archive_requested=1`
  )
}

export default async function RequestArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ public_case_id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { public_case_id } = await params
  const query = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: vehicle, error } =
    await supabase
      .from('vehicles')
      .select(`
        id,
        owner_id,
        public_case_id,
        model,
        model_year,
        moderation_status,
        archived_at
      `)
      .eq('public_case_id', public_case_id)
      .eq('owner_id', user.id)
      .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!vehicle) {
    notFound()
  }

  if (
    vehicle.moderation_status !== 'approved' ||
    vehicle.archived_at
  ) {
    redirect(`/my-cases/${public_case_id}`)
  }

  const { data: existingRequest } =
    await supabase
      .from('case_archive_requests')
      .select('id, status')
      .eq('vehicle_id', vehicle.id)
      .eq('status', 'pending')
      .maybeSingle()

  if (existingRequest) {
    redirect(
      `/my-cases/${public_case_id}?archive_exists=1`
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href="/my-cases"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 回我的案件
        </Link>

        <div className="mt-6 rounded-3xl bg-white p-8 shadow-sm">
          <p className="text-sm text-gray-500">
            {vehicle.public_case_id}
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-gray-950">
            申請下架案件
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            {vehicle.model_year} {vehicle.model}
          </p>

          <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            下架申請核准後，案件會從公開案例中隱藏，
            但資料不會永久刪除，管理員仍可恢復。
          </div>

          {query.error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {query.error === 'missing'
                ? '請填寫申請下架原因。'
                : '下架申請送出失敗，可能已有申請正在處理。'}
            </div>
          )}

          <form
            action={requestArchive}
            className="mt-7"
          >
            <input
              type="hidden"
              name="vehicle_id"
              value={vehicle.id}
            />

            <input
              type="hidden"
              name="public_case_id"
              value={vehicle.public_case_id}
            />

            <label className="block text-sm font-medium text-gray-700">
              申請下架原因
              <textarea
                name="reason"
                required
                rows={6}
                placeholder="例如：資料填寫錯誤、不希望繼續公開、案件內容需要重新整理…"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-900"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <Link
                href="/my-cases"
                className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium"
              >
                取消
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-red-700 px-6 py-3 text-sm font-medium text-white hover:bg-red-800"
              >
                送出下架申請
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
