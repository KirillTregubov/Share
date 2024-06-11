import { UserSchema } from 'schemas'

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

      // create user
      const user = UserSchema.parse({ id: '1' })
      console.log('User:', user)

      ws.send('Greeting from the server!')
      ws.subscribe('announcements')
      ws.publishText('announcements', 'New client connected!')
    },
    message(ws, message) {
      // a message is received
      console.log('Received: %s', message)
      ws.publish('announcements', message)
    },
    close(ws, code, message) {
      // a socket is closed
      ws.unsubscribe('announcements')
    }
    // drain(ws) {}, // the socket is ready to receive more data
  }
})

console.log(`Server started at http://localhost:${server.port}`)
