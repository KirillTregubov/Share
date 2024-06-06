import {
  Await,
  CatchBoundary,
  createFileRoute,
  defer
} from '@tanstack/react-router'
import { connect, useMessages } from '../lib/data'

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => {
    return {
      socket: defer(connect())
    }
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

function Index() {
  const { socket } = Route.useLoaderData()

  return (
    <div>
      <h1>Home page</h1>
      {/* Catch component: https://tanstack.com/router/latest/docs/framework/react/api/router/catchBoundaryComponent */}
      <CatchBoundary getResetKey={() => 'reset'}>
        {/* Await component: https://tanstack.com/router/latest/docs/framework/react/api/router/awaitComponent */}
        <Await promise={socket} fallback={<div>Connecting...</div>}>
          {/* The promise resolved, so we have a socket */}
          {(socket) => (
            <div>
              <button onClick={() => socket?.send('New message')}>
                Send message
              </button>
              <SocketMessages />
            </div>
          )}
        </Await>
      </CatchBoundary>
    </div>
  )
}
