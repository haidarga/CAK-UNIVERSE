import { createServerClient } from '@/lib/cakgpt/supabase/server'
import { requirePageUser } from '@/lib/cakgpt/auth'
import { SettingsForm } from '@/components/cakgpt/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerClient()
  const user = await requirePageUser(supabase)
  const { data } = await supabase.from('user_settings').select('gemini_api_key').eq('created_by', user.id).maybeSingle()

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="mt-0.5 text-sm text-mutedText">Keys are entered here and stored in your own Supabase project — never shared in chat/terminal.</p>
      </div>
      <SettingsForm initialGeminiConfigured={!!data?.gemini_api_key} />
    </div>
  )
}
