import { describe, test, expect } from 'vitest';
import { formatKnowledgeAsSourceText } from '@/lib/cakgpt/brief-extract';

describe('Knowledge Base Brief Extraction', () => {
  test('formats single knowledge item as primary source text', () => {
    const items = [
      {
        id: 'k1',
        title: 'Referensi AceKid Pattern Interrupt',
        content: 'HOOK: Pattern Interrupt with close up of baby bottle.\nVISUAL: High contrast studio lighting.',
        source_type: 'content_translator',
      },
    ];

    const result = formatKnowledgeAsSourceText(items);

    expect(result).toContain('=== KNOWLEDGE REFERENCE 1: Referensi AceKid Pattern Interrupt');
    expect(result).toContain('HOOK: Pattern Interrupt with close up of baby bottle.');
    expect(result).toContain('[Source: content_translator]');
  });

  test('formats multiple knowledge items combined', () => {
    const items = [
      {
        id: 'k1',
        title: 'Hook Formula 1',
        content: 'Pattern interrupt opening',
        source_type: 'content_translator',
      },
      {
        id: 'k2',
        title: 'Trend Ref 2',
        content: 'Susu formula viral video breakdown',
        source_type: 'trend_radar',
      },
    ];

    const result = formatKnowledgeAsSourceText(items);

    expect(result).toContain('=== KNOWLEDGE REFERENCE 1: Hook Formula 1');
    expect(result).toContain('=== KNOWLEDGE REFERENCE 2: Trend Ref 2');
    expect(result).toContain('Pattern interrupt opening');
    expect(result).toContain('Susu formula viral video breakdown');
  });

  test('returns empty string if knowledge items list is empty', () => {
    expect(formatKnowledgeAsSourceText([])).toBe('');
  });
});
