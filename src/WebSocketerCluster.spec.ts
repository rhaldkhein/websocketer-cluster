import jest from 'jest-mock'
import ReconWebSocket from 'reconnecting-websocket'
import { WebSocketer } from 'websocketer'
import { WebSocket, WebSocketServer } from 'ws'
import WebSocketerCluster from './WebSocketerCluster'
import WebSocketerClusterServer from './WebSocketerClusterServer'

describe('index', () => {

  const h = 'ws://localhost'
  // cluster server
  let wsrCS: WebSocketerClusterServer | undefined

  // cluster1, server1, client1
  let wsrCC1: WebSocketerCluster | undefined
  let wss1: WebSocketServer | undefined
  let wsserver1: WebSocket | undefined
  let wsclient1: WebSocket | undefined

  // cluster2, server2, client2
  let wsrCC2: WebSocketerCluster | undefined
  let wss2: WebSocketServer | undefined
  let wsserver2: WebSocket | undefined
  let wsclient2: WebSocket | undefined

  // websocketers
  let wsrServer10: WebSocketer | undefined
  let wsrClient10: WebSocketer | undefined
  let wsrServer20: WebSocketer | undefined
  let wsrClient20: WebSocketer | undefined

  beforeAll(async () => {

    // create cluster server
    await new Promise(resolve => {
      wsrCS = new WebSocketerClusterServer({ port: 6000 })
      wsrCS.server.once('listening', resolve)
    })

    // create cluster 1 & 2
    await new Promise(resolve => {
      wsrCC1 = new WebSocketerCluster({ origin: `${h}:6000` })
      wsrCC1.socketer.socket.addEventListener('open', resolve)
    })
    await new Promise(resolve => {
      wsrCC2 = new WebSocketerCluster({ origin: `${h}:6000` })
      wsrCC2.socketer.socket.addEventListener('open', resolve)
    })

    // create server and client 1 & 2
    wss1 = new WebSocketServer({ port: 5001 })
    wss1.once('connection', (ws) => {
      wsserver1 = ws
    })
    await new Promise(resolve => {
      wsclient1 = new ReconWebSocket(`${h}:5001`, undefined, { WebSocket }) as any
      wsclient1?.addEventListener('open', resolve)
    })
    wss2 = new WebSocketServer({ port: 5002 })
    wss2.once('connection', (ws) => {
      wsserver2 = ws
    })
    await new Promise(resolve => {
      wsclient2 = new ReconWebSocket(`${h}:5002`, undefined, { WebSocket }) as any
      wsclient2?.addEventListener('open', resolve)
    })

  })

  afterAll(async () => {

    wsclient1?.close()
    wsserver1?.close()
    wsclient2?.close()
    wsserver2?.close()

    // destroy server 1 & 2
    await new Promise(resolve => {
      if (!wss1) return resolve(undefined)
      wss1.close(resolve)
    })
    await new Promise(resolve => {
      if (!wss2) return resolve(undefined)
      wss2.close(resolve)
    })

    // destroy cluster 1 & 2
    wsrCC1?.destroy()
    wsrCC1 = undefined
    wsrCC2?.destroy()
    wsrCC2 = undefined

    // destroy cluster server
    await new Promise(resolve => {
      if (!wsrCS) return resolve(undefined)
      wsrCS.server.on('close', resolve)
      wsrCS.destroy()
    })
    wsrCS = undefined

  })

  beforeEach(() => {
    wsrServer10 = new WebSocketer(wsserver1, { cluster: wsrCC1 })
    wsrClient10 = new WebSocketer(wsclient1, { id: 'client10' })
    wsrServer20 = new WebSocketer(wsserver2, { cluster: wsrCC2 })
    wsrClient20 = new WebSocketer(wsclient2, { id: 'client20' })
  })
  afterEach(() => {
    wsrServer10?.destroy()
    wsrClient10?.destroy()
    wsrServer20?.destroy()
    wsrClient20?.destroy()
  })

  test('start', () => {

    expect(1).toBe(1)
  })

  test('should send and reply', async () => {

    wsrClient10?.on('foo', data => {
      expect(data).toBe('bar')
      return 'hi'
    })
    const payload = await wsrClient20?.send('foo', 'bar', 'client10')
    expect(payload).toBe('hi')
  })

  test('should send and reply to self', async () => {

    wsrClient20?.on('foo', data => {
      expect(data).toBe('bar')
      return 'hi'
    })
    const payload = await wsrClient20?.send('foo', 'bar', 'client20')
    expect(payload).toBe('hi')
  })

  test('should send and reply with multiple clients', async () => {

    // prepare
    let wsrServer11: WebSocketer | undefined
    let wsrClient11: WebSocketer | undefined
    wss1?.once('connection', (ws) => {
      wsrServer11 = new WebSocketer(ws, { cluster: wsrCC1 })
    })
    await new Promise(resolve => {
      wsrClient11 = new WebSocketer(
        new ReconWebSocket(`${h}:5001`, undefined, { WebSocket }),
        { id: 'client11' }
      )
      wsrClient11.socket.addEventListener('open', resolve)
    })
    const fnBar = jest.fn((data: any) => data)

    wsrClient10?.on('bar', fnBar)
    wsrClient10?.on('foo', data => {
      expect(data).toBe('foo10')
      return 'hi10'
    })

    wsrClient11?.on('bar', fnBar)
    wsrClient11?.on('foo', data => {
      expect(data).toBe('foo11')
      return 'hi11'
    })

    wsrClient20?.on('bar', fnBar)
    wsrClient20?.on('foo', data => {
      expect(data).toBe('foo20')
      return 'hi20'
    })

    const plFoo = await wsrClient20?.send('foo', 'foo11', 'client11')
    const plBar = await wsrClient20?.send('bar', 'barbar', 'client10')
    expect(plFoo).toBe('hi11')
    expect(plBar).toBe('barbar')
    expect(fnBar.mock.calls).toHaveLength(1)

    wsrClient11?.socket.close()
    wsrServer11?.socket.close()
    wsrClient11?.destroy()
    wsrServer11?.destroy()
  })

})
