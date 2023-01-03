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
  let timeId
  let counter = 0
  ws.addEventListener('open', () => {
    console.log(ws.readyState)
    const send = async () => {
      try {
        const reply = await socketer.send('hello', counter, 'client1')
        console.log(reply)
        counter++
      } catch (error) {
        console.log(error.message)
      }
    }
    clearInterval(timeId)
    timeId = setInterval(send, 1000 * 2)
    // clearTimeout(timeId)
    // timeId = setTimeout(send, 1000 * 3)
  })

  socketer.on('hello', (data) => {
    return 'world ' + data
  })
  // ws.addEventListener('close', () => {
  //   console.log(ws.readyState)
  //   counter = 0
  //   clearInterval(intervalId)
  // })
}

start()
