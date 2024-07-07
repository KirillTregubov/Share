import { UserSchema, type MessageType, type UserType } from 'schemas'
import crypto from 'crypto'
import type { ServerWebSocket } from 'bun'
import {
  animals,
  colors,
  uniqueNamesGenerator,
  type Config
} from 'unique-names-generator'
import DeviceDetector from 'device-detector-js'

const deviceDetector = new DeviceDetector()
const nameConfig: Config = {
  dictionaries: [colors, animals],
  style: 'capital',
  separator: ' ',
  length: 2
}

// Based on https://www.rfc-editor.org/rfc/rfc1918#section-3
function isPrivateIP(ip: string): boolean {
  const ipParts = ip.split('.').map(Number)
  if (ipParts.length !== 4) return false

  const [first, second] = ipParts
  return (
    first === 10 || // 10.0.0.0/8
    (first === 192 && second === 168) || // 192.168.0.0/16
    (first === 172 && second >= 16 && second <= 31) // 172.16.0.0/12
  )
}

function getDeviceName(userAgent: string | null) {
  if (userAgent) {
    const ua = deviceDetector.parse(userAgent)

    let name = ''
    if (ua.device?.model) {
      name += ua.device.model
    } else if (ua.os?.name) {
      name += ua.os.name
    }
    if (ua.client?.name) {
      name += ` (${ua.client.name
        .replace('Chrome Mobile', 'Chrome')
        .replace('Mobile Safari', 'Safari')})`
    }

    if (name.length > 0) {
      return name
    }
  }

  return 'Unknown Device'
}

const networkMap: Map<string, Set<UserType>> = new Map()
const connectionMap: Map<
  ServerWebSocket<unknown>,
  { user: UserType; network: string }
> = new Map()

type Data = { device: string }

const server = Bun.serve<Data>({
  hostname: '0.0.0.0',
  port: 3000,
  //   serverName: 'Share/1.0',
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (
      server.upgrade(req, {
        data: { device: getDeviceName(req.headers.get('user-agent')) }
      })
    ) {
      return // do not return a Response
    }
    return new Response('Upgrade failed', { status: 500 })
  },

  websocket: {
    open(ws) {
      // a socket is opened
      console.log('Client connected')
      const network = isPrivateIP(ws.remoteAddress) ? 'local' : ws.remoteAddress

      const user = UserSchema.parse({
        id: crypto.randomUUID(),
        name: uniqueNamesGenerator(nameConfig),
        device: ws.data.device,
        network // for debugging
      })
      console.log('Connecting', user, network)

      if (networkMap.has(network)) {
        networkMap.get(network)!.add(user)
      } else {
        networkMap.set(network, new Set([user]))
      }

      connectionMap.set(ws, { user, network })

      // subscribe to ip channel
      ws.subscribe(network)

      ws.send(
        JSON.stringify({
          type: 'client_self',
          data: user
        } satisfies MessageType)
      )

      // publish client information with channel
      server.publish(
        network,
        JSON.stringify({
          type: 'client_connect',
          data: user
        } satisfies MessageType)
      )

      // send all existing users to client
      networkMap.get(network)!.forEach((networkUser) => {
        if (networkUser.id === user.id) return
        ws.send(
          JSON.stringify({
            type: 'client_connect',
            data: networkUser
          } satisfies MessageType)
        )
      })
    },
    message(ws, message) {
      // a message is received
      ws.send('I have sent a message')
      ws.publish('announcements', `someone has sent: ${message}`)
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
        JSON.stringify({ type: 'message', data: message } satisfies MessageType)
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
        } satisfies MessageType)
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
