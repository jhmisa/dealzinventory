import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as ticketsService from '@/services/tickets'
import type { TicketStatus, TicketPriority, TicketNoteType } from '@/lib/types'

// --- Query hooks ---

export function useTicketTypes() {
  return useQuery({
    queryKey: queryKeys.tickets.types(),
    queryFn: ticketsService.getTicketTypes,
  })
}

export function useTickets(filters: ticketsService.TicketFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tickets.list(filters),
    queryFn: () => ticketsService.getTickets(filters),
  })
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(id),
    queryFn: () => ticketsService.getTicket(id),
    enabled: !!id,
  })
}

export function useCustomerTickets(customerId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.customer(customerId),
    queryFn: () => ticketsService.getCustomerTickets(customerId),
    enabled: !!customerId,
  })
}

export function useOrderTickets(orderId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.order(orderId),
    queryFn: () => ticketsService.getOrderTickets(orderId),
    enabled: !!orderId,
  })
}

export function useConversationTickets(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.conversation(conversationId),
    queryFn: () => ticketsService.getConversationTickets(conversationId),
    enabled: !!conversationId,
  })
}

export function useTicketNotes(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.notes(ticketId),
    queryFn: () => ticketsService.getTicketNotes(ticketId),
    enabled: !!ticketId,
  })
}

export function useTicketMedia(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.media(ticketId),
    queryFn: () => ticketsService.getTicketMedia(ticketId),
    enabled: !!ticketId,
  })
}

// --- Mutation hooks ---

export function useCreateCustomerTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ticketsService.createCustomerTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ticketsService.createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}

export function useUpdateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; subject?: string; description?: string; priority?: TicketPriority; assigned_staff_id?: string | null }) =>
      ticketsService.updateTicket(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: TicketStatus; notes?: string }) =>
      ticketsService.updateTicketStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useAssignTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string | null }) =>
      ticketsService.assignTicket(id, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}

export function useResolveTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      ticketsService.resolveTicket(id, resolutionNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all })
    },
  })
}

export function useAddTicketNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, content, noteType, metadata }: {
      ticketId: string; content: string; noteType?: TicketNoteType; metadata?: Record<string, unknown>
    }) => ticketsService.addTicketNote(ticketId, content, noteType, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}

export function useUploadTicketMedia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, file, mediaType }: {
      ticketId: string; file: Blob | File; mediaType?: 'image' | 'video'
    }) => ticketsService.uploadTicketMedia(ticketId, file, mediaType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all })
    },
  })
}
