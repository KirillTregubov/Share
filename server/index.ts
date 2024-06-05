import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3000 });

console.log('Server started on port 3000');

wss.on('connection', function connection(ws) {
  console.log('connected', ws);
  ws.on('error', console.error);

  ws.on('message', function message(data) {
    console.log('received: %s', data);
  });

  ws.send('Greeting from server!');
});
