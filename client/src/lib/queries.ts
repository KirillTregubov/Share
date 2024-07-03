import { queryOptions } from '@tanstack/react-query'
import type { User } from 'schemas'
import { connect } from './data'

export const socketQuery = queryOptions({
  queryKey: ['socket'],
  queryFn: connect
})

export const peersQuery = queryOptions({
  queryKey: ['peers'],
  queryFn: () => [] as User[],
  staleTime: Infinity
})
