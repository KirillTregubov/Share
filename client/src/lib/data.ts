import { useEffect, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL

let socket = null as WebSocket | null

// NOTE: Temporary buffer messages before we track them in state
// Temporary solution until some sort of global state is implemented
// NOTE: The greeting will be duplicated because React Strict Mode mounts every component twice in development
let messageBuffer: string[] = []
function bufferMessages(event: MessageEvent) {
  messageBuffer.push(event.data)
}

export async function connect() {
  if (!socket) {
    console.log('new socket')
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
      socket = null
      // TODO: rerender dependent components when socket is closed
      // TODO: notify and retry
    }
    // TODO: Temporary
    socket.addEventListener('message', bufferMessages)

    // Wait for the connection to be established
    await new Promise<void>((resolve, reject) => {
      const onOpen = async () => {
        console.log('WebSocket connected')
        cleanUp()
        // TODO: Temporary delay to show loading state. This introduces lint errors!
        // await new Promise((resolve) => setTimeout(resolve, 1000))
        resolve()
      }
      const onError = (error: Event) => {
        console.error('WebSocket error:', error)
        cleanUp()
        reject(new Error('WebSocket connection failed! Is the server running?'))
      }
      const cleanUp = () => {
        socket!.removeEventListener('open', onOpen)
        socket!.removeEventListener('error', onError)
      }

      socket!.addEventListener('open', onOpen)
      socket!.addEventListener('error', onError)
    })
  }
  return socket
}

export function useMessages() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    if (!socket) {
      throw new Error('Socket is not connected!')
    }

    const handleMessage = (event: MessageEvent) => {
      setMessages((prevMessages) => [...prevMessages, event.data])
    }
    socket.addEventListener('message', handleMessage)

    // TODO: Temporary
    socket.removeEventListener('message', bufferMessages)
    setMessages((prevMessages) => [...messageBuffer, ...prevMessages])

    return () => {
      if (!socket) return
      socket.removeEventListener('message', handleMessage)
    }
  }, [socket])

  return messages
}
