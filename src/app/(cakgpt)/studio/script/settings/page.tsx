import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { SettingsForm } from '@/components/cakgpt/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const { data } = await supabase
    .from('sw_user_settings')
    .select('gemini_api_key, studio_api_key, studio_api_url')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="mt-0.5 text-sm text-mutedText">
          Manage your AI keys and platform integrations securely.
        </p>
      </div>
      <SettingsForm
        initialGeminiConfigured={!!data?.gemini_api_key}
        initialStudioConfigured={!!(data?.studio_api_key && data?.studio_api_url)}
        initialStudioUrl={data?.studio_api_url || ''}
      />
    </div>
  )
}
