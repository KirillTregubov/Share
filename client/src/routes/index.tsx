import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary, createFileRoute } from '@tanstack/react-router'

import Messages from '@/component/Messages'
import { connect, useMessages } from '@/lib/data'
import { socketQuery } from '@/lib/queries'
import { Suspense } from 'react'

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({ queryKey: ['socket'], queryFn: connect })
  },
  component: Index
})

function SocketMessages() {
  const { data: socket } = useSuspenseQuery(socketQuery)
  const messages = useMessages(socket)
  console.log(messages)
  return (
    <div>
      <h2>Messages:</h2>
      <ul>
        {messages.map((message, index) => (
          <div key={index}>
            <Messages message={message} />
          </div>
        ))}
      </ul>
    </div>
  )
}

function SocketComponent() {
  const { data: socket } = useSuspenseQuery(socketQuery)

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
      <button onClick={() => socket.send('New message')}>Send message</button>
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
