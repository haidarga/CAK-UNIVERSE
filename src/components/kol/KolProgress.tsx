'use client'

import type { KolProgressStage } from '@/lib/kol/search'

// The wait is the feature's biggest UX liability: a full sweep runs ~90-100s.
//
// So the wait is treated as content, not as a gap to cover with a spinner. Every
// line here is driven by a real stage event streamed from the server, and the
// running clock is the actual elapsed time — nothing is animated to look busier
// than it is. A reader who leaves and comes back can see exactly where it got to.

const STAGES: { id: KolProgressStage; label: string; detail: string }[] = [
  { id: 'discover', label: 'Nyisir', detail: 'Ngumpulin kandidat dari hashtag & pencarian' },
  { id: 'resolve', label: 'Baca akun', detail: 'Ambil follower, negara, dan bio' },
  { id: 'filter', label: 'Saring', detail: 'Buang yang gak masuk tier & negara' },
  { id: 'enrich', label: 'Ukur', detail: 'Performa asli dari feed masing-masing' },
  { id: 'niche', label: 'Nilai niche', detail: 'Cek konsistensi topik per akun' },
]

export interface KolProgressState {
  stage: KolProgressStage
  message: string
  current?: number
  total?: number
}

export function KolProgress({ state, seconds }: { state: KolProgressState | null; seconds: number }) {
  const activeIndex = state ? STAGES.findIndex((s) => s.id === state.stage) : -1
  // 'done' is not in STAGES, so a finished sweep lights every row.
  const reached = state?.stage === 'done' ? STAGES.length : activeIndex

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="kol-panel relative overflow-hidden rounded-xl border border-border/60 bg-surface p-5 shadow-[0_2px_16px_-6px_rgba(24,24,27,0.12)]"
    >
      {/* A single slow sweep of light. One moving element, GPU-composited, so a
          90-second wait costs nothing in frame budget. */}
      <div className="kol-sweep pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden />

      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">
            {state?.message ?? 'Menyiapkan pencarian…'}
          </p>
          <p className="mt-0.5 text-[11px] text-mutedText">
            Nyari KOL itu makan waktu — biasanya 1–2 menit. Hasilnya di-cache, jadi pencarian
            berikutnya di niche yang sama bakal jauh lebih cepat.
          </p>
        </div>
        <span className="shrink-0 font-data text-2xl font-semibold tabular-nums text-text/90">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>

      <ol className="space-y-1.5">
        {STAGES.map((stage, i) => {
          const done = i < reached
          const active = i === reached
          return (
            <li
              key={stage.id}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors duration-300 ${
                active ? 'bg-primary/[0.07]' : ''
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold transition-colors duration-300 ${
                  done
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-600'
                    : active
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border/70 text-transparent'
                }`}
                aria-hidden
              >
                {done ? '✓' : active ? <span className="kol-pulse block h-1.5 w-1.5 rounded-full bg-primary" /> : ''}
              </span>
              <span
                className={`text-xs font-medium transition-colors duration-300 ${
                  done ? 'text-text/70' : active ? 'text-text' : 'text-mutedText/60'
                }`}
              >
                {stage.label}
              </span>
              <span className={`truncate text-[11px] transition-colors duration-300 ${active ? 'text-mutedText' : 'text-mutedText/45'}`}>
                {stage.detail}
              </span>
              {active && state?.total ? (
                <span className="ml-auto shrink-0 font-data text-[11px] tabular-nums text-primary/90">{state.total}</span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
