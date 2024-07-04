import { UserSchema, type Message, type User } from 'schemas'
import crypto from 'crypto'
import type { ServerWebSocket } from 'bun'

const networkMap: Map<string, Set<User>> = new Map()
const connectionMap: Map<
  ServerWebSocket<unknown>,
  { user: User; network: string }
> = new Map()

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: 3000,
  //   serverName: 'Share/1.0',
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (server.upgrade(req)) {
      return // do not return a Response
    }
    return new Response('Upgrade failed', { status: 500 })
  },

  websocket: {
    open(ws) {
      // a socket is opened
      console.log('Client connected')
      const network = ws.remoteAddress

      const uuid = crypto.randomUUID()

      const user = UserSchema.parse({
        id: uuid
      })
      console.log('Connecting', user)

      if (networkMap.has(network)) {
        networkMap.get(network)!.add(user)
      } else {
        networkMap.set(network, new Set([user]))
      }

      connectionMap.set(ws, { user, network })

      // subscribe to ip channel
      ws.subscribe(network)

      ws.send(
        JSON.stringify({ type: 'client_self', data: user } satisfies Message)
      )

      // publish client information with channel
      server.publish(
        network,
        JSON.stringify({ type: 'client_connect', data: user } satisfies Message)
      )

      // send all existing users to client
      networkMap.get(network)!.forEach((networkUser) => {
        if (networkUser.id === user.id) return
        ws.send(
          JSON.stringify({
            type: 'client_connect',
            data: networkUser
          } satisfies Message)
        )
      })
    },
    message(ws, message) {
      // a message is received
      if (typeof message !== 'string') {
        console.error('Received non-string message', message)
        return
      }

      const connectionInfo = connectionMap.get(ws)
      if (!connectionInfo) {
        // TODO: triggered on outdated tab, cancel socket
        console.error('Connection info not found for message', message)
        return
      }
      const { network } = connectionInfo

      server.publish(
        network,
        JSON.stringify({ type: 'message', data: message } satisfies Message)
      )
    },
    close(ws, code, message) {
      // a socket is closed
      console.log('Client disconnected')

      const connectionInfo = connectionMap.get(ws)
      if (!connectionInfo) return
      const { user, network } = connectionInfo
      console.log('Disconnecting', user)

      server.publish(
        network,
        JSON.stringify({
          type: 'client_disconnect',
          data: user
        } satisfies Message)
      )

      ws.unsubscribe(network)
      if (networkMap.has(network)) {
        networkMap.get(network)!.delete(user)
      } else {
        console.error('Network not found in map')
      }
    }
    // drain(ws) {}, // the socket is ready to receive more data
  }
})

console.log(`Server started at http://localhost:${server.port}`)
