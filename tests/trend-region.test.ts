import { describe, test, expect } from 'vitest';
import { SUPPORTED_REGIONS, getRegionLabel } from '@/lib/research/regions';

describe('Trend Radar Region Support', () => {
  test('includes default regions (ID, US, MY, SG, JP, GB, ALL)', () => {
    const codes = SUPPORTED_REGIONS.map((r) => r.code);
    expect(codes).toContain('ID');
    expect(codes).toContain('US');
    expect(codes).toContain('MY');
    expect(codes).toContain('SG');
    expect(codes).toContain('JP');
    expect(codes).toContain('GB');
    expect(codes).toContain('ALL');
  });

  test('returns correct region labels with flag emojis', () => {
    expect(getRegionLabel('ID')).toBe('🇮🇩 Indonesia');
    expect(getRegionLabel('US')).toBe('🇺🇸 United States');
    expect(getRegionLabel('ALL')).toBe('🌐 Global');
    expect(getRegionLabel('UNKNOWN')).toBe('🌐 Global');
  });
});
