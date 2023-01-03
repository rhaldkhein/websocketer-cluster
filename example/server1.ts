import { WebSocketer } from 'websocketer'
import { WebSocketServer } from 'ws'
import { WebSocketerCluster } from '../src'

function start() {
  const wss = new WebSocketServer({
    port: 3001
  })
  const cluster = new WebSocketerCluster({
    origin: 'ws://localhost:6000'
  })
  wss.on('connection', ws => {
    console.log('connection')
    const socketer = new WebSocketer(ws, { cluster, id: 'server1', debug: true })
    socketer.on('hey', (data) => {
      // throw new Error('Something went wrong!')
      return 'from server ' + data
    })
    ws.on('close', () => {
      console.log('close')
      socketer.destroy()
    })
  })
}

start()
