import { WebSocketer } from 'websocketer'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { WebSocket } from 'ws'

function start() {
  const ws = new ReconnectingWebSocket(
    'ws://localhost:3001',
    undefined,
    { WebSocket }
  )
  const socketer = new WebSocketer(ws, { id: 'client1', debug: true })

  ws.addEventListener('open', () => {
    const send = async () => {
      const reply = await socketer.send('hello', 'world', 'client2')
      console.log(reply)
    }
    send()
  })
}

start()
