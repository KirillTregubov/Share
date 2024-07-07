import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary, createFileRoute } from '@tanstack/react-router'

import { Peer, User } from '@/components/User'
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
  const { data: user } = useSuspenseQuery(userQuery)
  const { data: peers } = useSuspenseQuery(peersQuery)

  return (
    <div className="w-full">
      <div className="mb-4 overflow-auto">
        <h2>Connected as:</h2>
        <User user={user} />
      </div>
      <div className="rounded-lg bg-neutral-100 p-4">
        <h2 className="font-medium">Peers</h2>
        {Array.from(peers).map((peer) => (
          <Peer key={peer.id} peer={peer} />
        ))}
      </div>
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
    <>
      {/* <button className="text-left" onClick={() => socket.send('New message')}>
        Send message
      </button> */}
      <SocketMessages />
    </>
  )
}

function Index() {
  return (
    <div className="w-full p-4">
      <div className="mb-4 w-full text-center text-xl font-bold">
        <h1>Share</h1>
      </div>
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
