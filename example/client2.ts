import { WebSocketer } from 'websocketer'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { WebSocket } from 'ws'

function start() {
  const ws = new ReconnectingWebSocket(
    'ws://localhost:3002',
    undefined,
    { WebSocket }
  )
  const socketer = new WebSocketer(ws, { id: 'client2', debug: true })
  socketer.on('hello', async (data) => {
    const res = await socketer.send('hey', data, 'server1')
    return res
  })
  ws.addEventListener('open', () => {
    // socketer.send('hello', undefined, 'client1')
  })
}

start()
