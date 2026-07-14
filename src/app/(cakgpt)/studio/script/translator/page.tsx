import { ContentTranslator } from '@/components/cakgpt/ContentTranslator'
import { Wand2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ContentTranslatorPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wand2 size={18} aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-text">Content Translator</h1>
          <p className="mt-0.5 text-sm text-mutedText">
            Upload gambar/screenshot konten (punya kompetitor, referensi viral, dll) — AI baca visualnya
            dan terjemahin jadi creative direction (hook, gaya visual, pacing, shot breakdown, cara adaptasi).
            Salin hasilnya, pakein di Arahan pas generate naskah.
          </p>
        </div>
      </div>

      <ContentTranslator />
    </div>
  )
}
