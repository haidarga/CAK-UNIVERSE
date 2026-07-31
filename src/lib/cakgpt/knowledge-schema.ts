import { z } from 'zod'

export type KnowledgeSourceType = 'content_translator' | 'trend_radar' | 'manual' | 'file' | 'gdoc'

export type KnowledgeItem = {
  id: string
  created_by: string
  title: string
  content: string
  source_type: KnowledgeSourceType
  source_url?: string | null
  tags: string[]
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export const CreateKnowledgeSchema = z.object({
  title: z.string().min(1, 'Judul knowledge wajib diisi').max(200),
  content: z.string().min(1, 'Konten knowledge tidak boleh kosong'),
  source_type: z.enum(['content_translator', 'trend_radar', 'manual', 'file', 'gdoc']).default('manual'),
  source_url: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
})
