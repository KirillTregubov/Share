import { useEffect, useState } from 'react'

import { queryClient } from '@/main'

const WS_URL = import.meta.env.VITE_WS_URL

// NOTE: WebSocket connection singleton
let socket = null as WebSocket | null

// NOTE: Temporary buffer messages before we track them in state
// TODO: Temporary solution until some sort of global state is implemented
let messageBuffer: string[] = []
function bufferMessages(event: MessageEvent) {
  messageBuffer.push(event.data)
}

export async function connect() {
  if (!socket) {
    console.log('Creating WebSocket connection...')
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      console.log('WebSocket connected')
    }
    socket.onmessage = (event) => {
      console.log('Received:', event.data)
    }
    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
    socket.onclose = () => {
      console.log('WebSocket closed')
      queryClient.setQueryData(['socket'], null)
      socket = null
    }

    // TODO: Temporary message buffer
    socket.addEventListener('message', bufferMessages)

    // Wait for the connection to be established
    await new Promise<void>((resolve, reject) => {
      async function onOpen() {
        console.log('WebSocket connected')
        cleanUp()
        // TODO: Temporary delay to show loading state. This introduces lint errors!
        await new Promise((resolve) => setTimeout(resolve, 1000))
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

export function useMessages() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    if (!socket) return

    function handleMessage(event: MessageEvent) {
      setMessages((prevMessages) => [...prevMessages, event.data])
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
