import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary, createFileRoute } from '@tanstack/react-router'

import { connect, useUser } from '@/lib/data'
import { peersQuery, socketQuery } from '@/lib/queries'
import { Suspense } from 'react'

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({ queryKey: ['socket'], queryFn: connect })
  },
  component: Index
})

function SocketMessages() {
  // const { data: socket } = useSuspenseQuery(socketQuery)
  const user = useUser()
  const { data: peers } = useSuspenseQuery(peersQuery)
  console.log('Peers:', peers)
  // const messages = useMessages(socket)
  // console.log(messages)
  return (
    <div>
      <div>
        <h2>This is user:</h2>
        <pre>
          <code>{JSON.stringify(user, null, 2)}</code>
        </pre>
      </div>
      <div>
        <h2>These are the peers:</h2>
        {Array.from(peers).map((peer) => (
          <div key={peer.id}>
            <pre>
              <code>{JSON.stringify(peer, null, 2)}</code>
            </pre>
          </div>
        ))}
      </div>

      {/* <h2>Messages:</h2> */}
      {/* <ul>
        {messages.map((message, index) => (
          <div key={index}>
            <Message message={message} />
          </div>
        ))}
      </ul> */}
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
