import { UserSchema } from 'schemas'
import crypto from 'crypto'

let user: { id: string }

const networkMap = new Map()

const server = Bun.serve({
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
      // is this the network?????
      const network = ws.remoteAddress

      const uuid = crypto.randomUUID()

      user = UserSchema.parse({
        id: uuid
      })


        if (networkMap.has(network)) {
          networkMap.get(network).push(user)
        }else{
          networkMap.set(network, [user])
        }

      ws.send(`Greetings new Client from the server!`)
      ws.subscribe('announcements')
      ws.publishText('announcements', `New client connected! User: ${user.id}`)
    },
    async message(ws, message) {
      // a message is received

      ws.send('I have sent a message')
      ws.publish('announcements', `${user.id} has sent: ${message}`)
    },
    close(ws, code, message) {
      // a socket is closed
      ws.unsubscribe('announcements')
    }
    // drain(ws) {}, // the socket is ready to receive more data
  }
})

console.log(`Server started at http://localhost:${server.port}`)
