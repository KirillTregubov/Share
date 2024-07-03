import { useEffect, useState, useSyncExternalStore } from 'react'

import { queryClient } from '@/main'
import { MessageSchema, type User } from 'schemas'

const WS_URL = import.meta.env.VITE_WS_URL

// NOTE: WebSocket connection singleton
let socket = null as WebSocket | null

let user: User | null = null
const userNotifiers = new Set<() => void>()
function subscribeToUser(notify: () => void) {
  userNotifiers.add(notify)
  return () => {
    userNotifiers.delete(notify)
  }
}

// NOTE: Temporary buffer messages before we track them in state
// TODO: Temporary solution until some sort of global state is implemented
const messageBuffer: string[] = []
function bufferMessages(event: MessageEvent) {
  if (typeof event.data !== 'string') return
  messageBuffer.push(event.data)
}

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
        case 'client_self':
          console.log('Connected as user', message.data)
          user = message.data
          break
        case 'client_connect':
          if (user && user.id === message.data.id) return
          console.log('Discovered peer', result.data)
          queryClient.setQueryData(['peers'], (oldPeers: User[] | null) => {
            if (!oldPeers) return [message.data]
            return [...oldPeers, message.data]
          })
          break
        case 'client_disconnect':
          console.log('Disconnected peer', message.data)
          queryClient.setQueryData(['peers'], (oldPeers: User[] | null) => {
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

      if (message.type === 'client_self') {
        console.log('Connected as user', message.data)
        user = message.data
      } else if (message.type === 'client_connect') {
        if (user && user.id === message.data.id) return
        console.log('Discovered peer', result.data)
        queryClient.setQueryData(['peers'], (oldPeers: User[] | null) => {
          if (!oldPeers) return [message.data]
          return [...oldPeers, message.data]
        })
      } else if (message.type === 'client_disconnect') {
        console.log('Disconnected peer', message.data)
        queryClient.setQueryData(['peers'], (oldPeers: User[] | null) => {
          if (!oldPeers) return []
          return oldPeers.filter((peer) => peer.id !== message.data.id)
        })
      } else if (message.type === 'message') {
        console.log('Received message', message.data)
      }
    }
    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    socket.onclose = () => {
      console.log('WebSocket closed')
      queryClient.setQueryData(['socket'], null)
      socket = null
    }
    window.addEventListener('beforeunload', () => {
      socket?.close()
    })

    // TODO: Temporary message buffer
    socket.addEventListener('message', bufferMessages)

    // Wait for the connection to be established
    await new Promise<void>((resolve, reject) => {
      function onOpen() {
        // async
        console.log('WebSocket connected')
        cleanUp()
        // TODO: Temporary delay to show loading state. This introduces lint errors!
        // await new Promise((resolve) => setTimeout(resolve, 1000))
        resolve()
      }
      function onError(error: Event) {
        console.error('WebSocket error:', error)
        cleanUp()
        reject(new Error('WebSocket connection failed! Is the server running?'))
      }
      function cleanUp() {
        socket!.removeEventListener('open', onOpen)
        socket!.removeEventListener('error', onError)
      }

      socket!.addEventListener('open', onOpen)
      socket!.addEventListener('error', onError)
    })
  }
  return socket as WebSocket | null
}

export function useUser() {
  const store = useSyncExternalStore(subscribeToUser, () => user)
  return store
}

export function useMessages(socket: WebSocket | null) {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    if (!socket) return

    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== 'string') return
      setMessages((prevMessages) => [...prevMessages, event.data as string])
    }
    socket.addEventListener('message', handleMessage)

    // TODO: Temporary message buffer
    socket.removeEventListener('message', bufferMessages)
    setMessages((prevMessages) => [...messageBuffer, ...prevMessages])

    return () => {
      if (!socket) return
      socket.removeEventListener('message', handleMessage)
      setMessages([])
    }
  }, [socket])

  return messages
}
