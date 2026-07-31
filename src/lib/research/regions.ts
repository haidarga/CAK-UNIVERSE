export interface RegionOption {
  code: string
  label: string
  flag: string
}

export const SUPPORTED_REGIONS: RegionOption[] = [
  { code: 'ID', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'MY', label: 'Malaysia', flag: '🇲🇾' },
  { code: 'SG', label: 'Singapore', flag: '🇸🇬' },
  { code: 'JP', label: 'Japan', flag: '🇯🇵' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'ALL', label: 'Global', flag: '🌐' },
]

export function getRegionLabel(code?: string): string {
  if (!code) return '🌐 Global'
  const match = SUPPORTED_REGIONS.find((r) => r.code.toUpperCase() === code.toUpperCase())
  return match ? `${match.flag} ${match.label}` : '🌐 Global'
}
