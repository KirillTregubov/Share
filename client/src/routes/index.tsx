import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary, createFileRoute } from '@tanstack/react-router'

import { connect, useMessages } from '@/lib/data'
import { Suspense } from 'react'

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => {
    queryClient.prefetchQuery({ queryKey: ['socket'], queryFn: connect })
  },
  component: Index
})

function SocketMessages() {
  const messages = useMessages()

  return (
    <div>
      <h2>Messages:</h2>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </div>
  )
}

function SocketComponent() {
  const { data: socket } = useSuspenseQuery({
    queryKey: ['socket'],
    queryFn: connect
  })

  console.log('Socket:', socket)

  if (!socket) {
    return (
      <div>
        <h2>WebSocket connection closed.</h2>
        {/* TODO: Retry */}
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => socket?.send('New message')}>Send message</button>
      <SocketMessages />
    </div>
  )
}

function Index() {
  return (
    <div>
      <h1>Home page</h1>
      {/* CatchBoundary: https://tanstack.com/router/latest/docs/framework/react/api/router/catchBoundaryComponent */}
      <CatchBoundary getResetKey={() => 'reset'}>
        {/* Suspense: https://react.dev/reference/react/Suspense */}
        <Suspense fallback={<div>Connecting...</div>}>
          <SocketComponent />
        </Suspense>
      </CatchBoundary>
    </div>
  )
}
