import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Persist filter/search state in URL search params + sessionStorage.
 * When navigating back to a page with no URL params, restores from sessionStorage.
 */
export function usePersistedFilters(storageKey: string) {
  const [searchParams, setSearchParams] = useSearchParams()

  // Restore saved filters when navigating back with no params
  useEffect(() => {
    if (searchParams.toString() === '') {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        setSearchParams(new URLSearchParams(saved), { replace: true })
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist current filters to sessionStorage
  useEffect(() => {
    const params = searchParams.toString()
    if (params) {
      sessionStorage.setItem(storageKey, params)
    } else {
      sessionStorage.removeItem(storageKey)
    }
  }, [searchParams, storageKey])

  const getParam = useCallback(
    (key: string, defaultValue = '') => searchParams.get(key) ?? defaultValue,
    [searchParams],
  )

  const setParam = useCallback(
    (key: string, value: string, defaultValue = '') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === defaultValue) {
            next.delete(key)
          } else {
            next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setParams = useCallback(
    (updates: Record<string, { value: string; defaultValue?: string }>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, { value, defaultValue = '' }] of Object.entries(updates)) {
            if (value === defaultValue) {
              next.delete(key)
            } else {
              next.set(key, value)
            }
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { searchParams, setSearchParams, getParam, setParam, setParams }
}
