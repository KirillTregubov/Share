import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary, createFileRoute } from '@tanstack/react-router'

import { connect } from '@/lib/data'
import { peersQuery, socketQuery, userQuery } from '@/lib/queries'
import { Suspense } from 'react'

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery({ queryKey: ['socket'], queryFn: connect })
  },
  component: Index
})

function SocketMessages() {
  // const { data: socket } = useSuspenseQuery(socketQuery)
  // const messages = useMessages(socket)
  // console.log(messages)

  const { data: user } = useSuspenseQuery(userQuery)
  const { data: peers } = useSuspenseQuery(peersQuery)

  return (
    <div className="rounded-lg bg-neutral-100 p-4">
      <div className="mb-4">
        <h2>Connected as user:</h2>
        <pre>
          <code>{JSON.stringify(user, null, 2)}</code>
        </pre>
      </div>
      <div>
        <h2>Peers:</h2>
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
    <div className="flex flex-col gap-4">
      <button className="text-left" onClick={() => socket.send('New message')}>
        Send message
      </button>
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
