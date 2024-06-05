import WebSocket, { WebSocketServer } from 'ws';

const port = 3000

const server = new WebSocketServer({ port });

console.log(`Server started on port ${port}.`);

server.on('connection', function connection(ws) {
  console.log('Client connected');

  ws.on('error', console.error);

  ws.on('message', function message(data, isBinary) {
    console.log('Received: %s', data);

    // Broadcast to all other clients
    server.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.send('Greeting from server!');
  // Broadcast to all other clients
  server.clients.forEach(function each(client) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send('New client connected!');
    }
  });
});
