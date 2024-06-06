const WS_URL = import.meta.env.VITE_WS_URL

let socket = null as WebSocket | null

function connect() {
  if (!socket) {
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
      // TODO: notify and retry
    }
  }
  return socket
}

export default function useSocket() {
  const socket = connect()
  return socket
}
