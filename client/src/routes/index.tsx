import { createFileRoute } from '@tanstack/react-router'
import useSocket from '../lib/data'

export const Route = createFileRoute('/')({
  component: Index
})

function Index() {
  const socket = useSocket()
  console.log(socket)
  return (
    <div>
      <h1>Home page</h1>
      <button onClick={() => socket?.send('New message')}>Send message</button>
    </div>
  )
}
