import { WebSocketer } from 'websocketer'
import { WebSocketServer } from 'ws'
import { WebSocketerCluster } from '../src'

function start() {
  const wss = new WebSocketServer({
    port: 3002
  })
  const cluster = new WebSocketerCluster({
    origin: 'ws://localhost:6000'
  })
  wss.on('connection', ws => {
    console.log('connection')
    const socketer = new WebSocketer(ws, { cluster, debug: true })
    ws.on('close', () => {
      console.log('close')
      socketer.destroy()
    })
  })
}

start()
