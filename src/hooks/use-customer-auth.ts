import { createContext, useContext, useState, useCallback } from 'react'
import type { Customer } from '@/lib/types'
import * as customersService from '@/services/customers'
import type { ShippingAddress } from '@/lib/address-types'

interface CustomerAuthState {
  customer: Customer | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (lastName: string, emailOrPhone: string, pin: string) => Promise<void>
  register: (params: {
    last_name: string; first_name?: string; email?: string; phone?: string; pin: string; shipping_address?: ShippingAddress | null
  }) => Promise<void>
  logout: () => void
  refreshCustomer: () => Promise<void>
}

const STORAGE_KEY = 'dealz_customer'

function loadStoredCustomer(): { customer: Customer; token: string } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

function saveCustomer(customer: Customer, token: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ customer, token }))
}

function clearCustomer() {
  localStorage.removeItem(STORAGE_KEY)
}

export const CustomerAuthContext = createContext<CustomerAuthState | null>(null)

export function useCustomerAuthProvider(): CustomerAuthState {
  const [customer, setCustomer] = useState<Customer | null>(
    () => loadStoredCustomer()?.customer ?? null
  )
  const [token, setToken] = useState<string | null>(
    () => loadStoredCustomer()?.token ?? null
  )
  const [isLoading, setIsLoading] = useState(false)

  const login = useCallback(async (lastName: string, emailOrPhone: string, pin: string) => {
    setIsLoading(true)
    try {
      const result = await customersService.customerLogin(lastName, emailOrPhone, pin)
      setCustomer(result.customer)
      setToken(result.token)
      saveCustomer(result.customer, result.token)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (params: {
    last_name: string; first_name?: string; email?: string; phone?: string; pin: string; shipping_address?: ShippingAddress | null
  }) => {
    setIsLoading(true)
    try {
      const result = await customersService.customerRegister(params)
      setCustomer(result.customer)
      setToken(result.token)
      saveCustomer(result.customer, result.token)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setCustomer(null)
    setToken(null)
    clearCustomer()
  }, [])

  const refreshCustomer = useCallback(async () => {
    if (!customer) return
    try {
      const updated = await customersService.getCustomer(customer.id)
      setCustomer(updated as Customer)
      if (token) saveCustomer(updated as Customer, token)
    } catch {}
  }, [customer, token])

  return {
    customer,
    token,
    isAuthenticated: !!customer,
    isLoading,
    login,
    register,
    logout,
    refreshCustomer,
  }
}

export function useCustomerAuth(): CustomerAuthState {
  const ctx = useContext(CustomerAuthContext)
  if (!ctx) {
    throw new Error('useCustomerAuth must be used within CustomerAuthProvider')
  }
  return ctx
}
