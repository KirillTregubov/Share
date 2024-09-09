import {
  ClientMessageSchema,
  UserSchema,
  type UserIDType,
  type ServerMessageType,
  type UserType
} from 'schemas'
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

const networkMap: Map<string, Map<UserIDType, UserType>> = new Map()
const connectionMap: Map<
  string,
  { user: UserType; network: string; ws: ServerWebSocket<unknown> }
> = new Map()

type Data = { id: string; device: string }

const server = Bun.serve<Data>({
  hostname: '0.0.0.0',
  port: 3000,
  //   serverName: 'Share/1.0',
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (
      server.upgrade(req, {
        data: {
          id: crypto.randomUUID(),
          device: getDeviceName(req.headers.get('user-agent'))
        }
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
        id: ws.data.id,
        name: uniqueNamesGenerator(nameConfig),
        device: ws.data.device,
        network // for debugging
      })
      console.log('Connecting', user, network)

      if (networkMap.has(network)) {
        networkMap.get(network)!.set(user.id, user)
      } else {
        networkMap.set(network, new Map([[user.id, user]]))
      }

      connectionMap.set(ws.data.id, { user, network, ws })

      // subscribe to ip channel
      ws.subscribe(network)

      ws.send(
        JSON.stringify({
          type: 'client_self',
          data: user
        } satisfies ServerMessageType)
      )

      // publish client information with channel
      server.publish(
        network,
        JSON.stringify({
          type: 'client_connect',
          data: user
        } satisfies ServerMessageType)
      )

      // send all existing users to client
      networkMap.get(network)!.forEach((networkUser) => {
        if (networkUser.id === user.id) return
        ws.send(
          JSON.stringify({
            type: 'client_connect',
            data: networkUser
          } satisfies ServerMessageType)
        )
      })
    },
    message(ws, message) {
      // a message is received
      // console.log('Received message', message)

      if (typeof message !== 'string') {
        console.error('Received non-string message', message)
        return
      }

      try {
        message = JSON.parse(message)
      } catch (e) {
        console.log('Received unknown message:', message)
        return // TODO: handle malformed JSON
      }

      const result = ClientMessageSchema.safeParse(message)
      if (!result.success) {
        console.error(
          'Received invalid message',
          message,
          'with error:',
          result.error
        )
        return
      }
      const clientMessage = result.data as any
      console.log(
        'Received message',
        clientMessage.type,
        'to:',
        clientMessage.to
      )

      // handle disconnect

      if (!clientMessage.to) return
      const recipientConnection = connectionMap.get(clientMessage.to)
      if (!recipientConnection) return

      delete clientMessage.to
      clientMessage.sender = ws.data.id

      recipientConnection.ws.send(JSON.stringify(clientMessage))
      return

      // ws.send('I have sent a message')
      // ws.publish('announcements', `someone has sent: ${message}`)
      // if (typeof message !== 'string') {
      //   console.error('Received non-string message', message)
      //   return
      // }

      // const connectionInfo = connectionMap.get(ws)
      // if (!connectionInfo) {
      //   // TODO: triggered on outdated tab, cancel socket
      //   console.error('Connection info not found for message', message)
      //   return
      // }
      // const { network } = connectionInfo

      // server.publish(
      //   network,
      //   JSON.stringify({
      //     type: 'message',
      //     data: message
      //   } satisfies ServerMessageType)
      // )
    },
    close(ws, code, message) {
      // a socket is closed
      console.log('Client disconnected')

      const id = ws.data.id
      const connectionInfo = connectionMap.get(id)
      if (!connectionInfo) return
      const { user, network } = connectionInfo
      console.log('Disconnecting', user)

      server.publish(
        network,
        JSON.stringify({
          type: 'client_disconnect',
          data: user
        } satisfies ServerMessageType)
      )

      ws.unsubscribe(network)
      if (networkMap.has(network)) {
        networkMap.get(network)!.delete(id)
      } else {
        console.error('Network not found in map')
      }
    }
    // drain(ws) {}, // the socket is ready to receive more data
  }
})

console.log(`Server started at http://localhost:${server.port}`)
