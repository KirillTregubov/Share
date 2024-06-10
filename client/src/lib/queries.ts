import { queryOptions } from '@tanstack/react-query'
import { connect } from './data'

export const socketQuery = queryOptions({
  queryKey: ['socket'],
  queryFn: connect
})
