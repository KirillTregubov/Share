import { queryClient } from '@/main'
import { MessageSchema } from 'schemas'
import {
  dangerouslySetUser,
  peersQuery,
  userLoaded,
  userQuery
} from './queries'

const WS_URL = import.meta.env.VITE_WS_URL

// NOTE: WebSocket connection singleton
let socket = null as WebSocket | null

function assertUnreachable(x: never): never {
  console.error('Reached unreachable code', x)
  throw new Error('Reached unreachable code')
}

export async function connect() {
  if (!socket) {
    console.log('Creating WebSocket connection...')
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      console.log('WebSocket connected')
    }
    socket.onmessage = (event) => {
      console.log(event)
      console.log('Received:', event.data)

      if (typeof event.data !== 'string') {
        console.error('Received non-string message', event.data)
        return
      }

      const result = MessageSchema.safeParse(JSON.parse(event.data))
      if (result.error) {
        console.error(
          'Invalid message received',
          event.data,
          'with error:',
          result.error
        )
        return
      }

      const message = result.data
      switch (message.type) {
        case 'client_self': {
          console.log('Connected as user', message.data)
          const user = message.data
          dangerouslySetUser(user)
          queryClient.setQueryData(peersQuery.queryKey, (oldPeers) => {
            return oldPeers?.filter((peer) => peer.id !== user.id) ?? []
          })
          break
        }
        case 'client_connect': {
          const user = queryClient.getQueryData(userQuery.queryKey)
          if (user && user.id === message.data.id) break

          console.log('Discovered peer', result.data)
          queryClient.setQueryData(peersQuery.queryKey, (oldPeers) => {
            if (!oldPeers) return [message.data]
            return [...oldPeers, message.data]
          })
          break
        }
        case 'client_disconnect':
          console.log('Disconnected peer', message.data)
          queryClient.setQueryData(peersQuery.queryKey, (oldPeers) => {
            if (!oldPeers) return []
            return oldPeers.filter((peer) => peer.id !== message.data.id)
          })
          break
        case 'message':
          console.log('Received message', message.data)
          break
        default:
          return assertUnreachable(message)
      }
    }
    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    socket.onclose = (event) => {
      if (event.code === 4000) return //
      queryClient.setQueryData(['socket'], null)
      socket = null
    }
    window.addEventListener('beforeunload', () => {
      socket?.close(4000) // from https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.2
    })

    // Wait for the connection to be established
    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        function onOpen() {
          console.log('WebSocket connected')
          cleanUp()
          resolve()
        }
        function onError(error: Event) {
          console.error('WebSocket error:', error)
          cleanUp()
          reject(
            new Error('WebSocket connection failed! Is the server running?')
          )
        }
        function cleanUp() {
          socket!.removeEventListener('open', onOpen)
          socket!.removeEventListener('error', onError)
        }

        socket!.addEventListener('open', onOpen)
        socket!.addEventListener('error', onError)
      }),
      userLoaded
    ])
  }
  console.log('return from connect')
  return socket as WebSocket | null
}
