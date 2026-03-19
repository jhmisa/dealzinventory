import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as postalCodesService from '@/services/postal-codes'

export function usePostalCodeLookup(code: string) {
  const normalized = code.replace(/-/g, '')
  return useQuery({
    queryKey: queryKeys.postalCodes.lookup(normalized),
    queryFn: () => postalCodesService.lookupPostalCode(normalized),
    enabled: normalized.length === 7,
    staleTime: Infinity, // Postal codes rarely change
  })
}

export function useReverseLookup(prefectureJa: string, cityJa: string, townJa: string) {
  return useQuery({
    queryKey: queryKeys.postalCodes.reverse(prefectureJa, cityJa, townJa),
    queryFn: () => postalCodesService.reverseLookupPostalCode(prefectureJa, cityJa, townJa),
    enabled: !!prefectureJa && !!cityJa,
    staleTime: Infinity,
  })
}
