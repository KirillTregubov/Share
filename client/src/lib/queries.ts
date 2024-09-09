import { queryClient } from '@/main'
import { queryOptions } from '@tanstack/react-query'
import { type UserIDType, type UserType } from 'schemas'
import { connect } from './data'
import type { ClientUserType } from './schemas'

export const socketQuery = queryOptions({
  queryKey: ['socket'],
  queryFn: connect
})

let resolveUserPromise: () => void
export const userLoaded = new Promise<void>((resolve, reject) => {
  resolveUserPromise = resolve
  setTimeout(
    () =>
      reject(new Error('Connected to server, but failed to receive identity.')),
    5000
  )
})

export function dangerouslySetUser(user: UserType) {
  queryClient.setQueryData(userQuery.queryKey, user)
  resolveUserPromise()
}

export const userQuery = queryOptions({
  queryKey: ['user'],
  queryFn: async () => {
    await userLoaded
    return queryClient.getQueryData(['user'])! satisfies UserType
  },
  staleTime: Infinity
})

export const peersQuery = queryOptions({
  queryKey: ['peers'],
  initialData: new Map<UserIDType, ClientUserType>(),
  staleTime: Infinity
})
