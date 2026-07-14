import { TrendSearch } from '@/components/cakgpt/TrendSearch'
import { TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function TrendsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <TrendingUp size={18} aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-text">Trend Radar</h1>
          <p className="mt-0.5 text-sm text-mutedText">
            Cari konten lagi trending di TikTok, Instagram, YouTube & SGE buat riset angle
            sebelum nulis naskah. Salin referensinya, terus pakein di brief atau arahan generate.
          </p>
        </div>
      </div>

      <TrendSearch />
    </div>
  )
}
