import jest from 'jest-mock'
import ReconWebSocket from 'reconnecting-websocket'
import { WebSocketer } from 'websocketer'
import { WebSocket, WebSocketServer } from 'ws'
import { RedisCluster } from './'
import { createClient } from 'redis'
import RedisClusterClient from './RedisClusterClient'
import Client from './Client'
// import WebSocketerClusterServer from './WebSocketerClusterServer'

describe('RedisCluster', () => {

  const h = 'ws://localhost'
  const r = '127.0.0.1:6379'
  // cluster server
  // let wsrCS: WebSocketerClusterServer | undefined

  // cluster1, server1, client1
  let wsrCC1: RedisCluster | undefined
  let wss1: WebSocketServer | undefined
  let wsserver1: WebSocket | undefined
  let wsclient1: WebSocket | undefined

  // cluster2, server2, client2
  let wsrCC2: RedisCluster | undefined
  let wss2: WebSocketServer | undefined
  let wsserver2: WebSocket | undefined
  let wsclient2: WebSocket | undefined

  let wsrCC3: RedisCluster | undefined
  let wsrCC4: RedisCluster | undefined

  // websocketers
  let wsrServer10: WebSocketer | undefined
  let wsrClient10: WebSocketer | undefined
  let wsrServer20: WebSocketer | undefined
  let wsrClient20: WebSocketer | undefined

  let rccServer30: Client | undefined
  let rccServer40: Client | undefined

  beforeAll(async () => {

    wsrCC1 = new RedisCluster({ host: r, debug: true, id: 'cluster1' })
    wsrCC2 = new RedisCluster({ host: r, debug: true, id: 'cluster2' })
    wsrCC3 = new RedisCluster({ host: r, debug: true, id: 'cluster3' })
    wsrCC4 = new RedisCluster({ host: r, debug: true, id: 'cluster4' })

    await Promise.all([
      new Promise(resolve => wsrCC1?.once('ready', resolve)),
      new Promise(resolve => wsrCC2?.once('ready', resolve))
    ])

    // create server and client 1 & 2
    wss1 = new WebSocketServer({ port: 5003 })
    wss1.once('connection', (ws) => {
      wsserver1 = ws
    })
    await new Promise(resolve => {
      wsclient1 = new ReconWebSocket(`${h}:5003`, undefined, { WebSocket }) as any
      wsclient1?.addEventListener('open', resolve)
    })
    wss2 = new WebSocketServer({ port: 5004 })
    wss2.once('connection', (ws) => {
      wsserver2 = ws
    })
    await new Promise(resolve => {
      wsclient2 = new ReconWebSocket(`${h}:5004`, undefined, { WebSocket }) as any
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
    wsrCC3?.destroy()
    wsrCC3 = undefined
    wsrCC4?.destroy()
    wsrCC4 = undefined

  })

  beforeEach(() => {
    wsrServer10 = new WebSocketer(wsserver1, { debug: true, id: 'server10', cluster: wsrCC1 })
    wsrClient10 = new WebSocketer(wsclient1, { debug: true, id: 'client10' })
    wsrServer20 = new WebSocketer(wsserver2, { debug: true, id: 'server20', cluster: wsrCC2 })
    wsrClient20 = new WebSocketer(wsclient2, { debug: true, id: 'client20' })
    rccServer30 = new Client({ debug: true, cluster: wsrCC3, id: 'client30' })
    rccServer40 = new Client({ debug: true, cluster: wsrCC4, id: 'client40' })
  })
  afterEach(() => {
    wsrServer10?.destroy()
    wsrClient10?.destroy()
    wsrServer20?.destroy()
    wsrClient20?.destroy()
    rccServer30?.destroy()
    rccServer40?.destroy()
  })

  test('start', () => {

    expect(1).toBe(1)
  })

  test('should send and reply', async () => {

    wsrClient10?.on('foo', data => {
      expect(data).toBe('bar')
      return 'hi'
    })
    const payload = await wsrClient20?.request('foo', 'bar', 'client10')
    expect(payload).toBe('hi')
  })

  test('should send and reply to self', async () => {

    wsrClient20?.on('foo', data => {
      expect(data).toBe('bar')
      return 'hi'
    })
    const payload = await wsrClient20?.request('foo', 'bar', 'client20')
    expect(payload).toBe('hi')
  })

  test('should send and reply from redis client to user client', async () => {

    wsrClient10?.on('redis_foo', data => {
      expect(data).toBe('redis_foo_data')
      return 'redis_foo_reply'
    })
    const reply = await rccServer30?.request('redis_foo', 'redis_foo_data', 'client10')
    expect(reply).toBe('redis_foo_reply')
  })

  test('should send and reply from user client to redis client', async () => {

    rccServer40?.on('redis_bar', data => {
      expect(data).toBe('redis_bar_data')
      return 'redis_bar_reply'
    })
    const reply = await wsrClient20?.request('redis_bar', 'redis_bar_data', 'client40')
    expect(reply).toBe('redis_bar_reply')
  })

  test('should send and reply from websocketer server to redis client', async () => {

    rccServer40?.on('redis_baz', data => {
      expect(data).toBe('redis_baz_data')
      return 'redis_baz_reply'
    })
    const reply = await wsrServer20?.request('redis_baz', 'redis_baz_data', 'client40')
    expect(reply).toBe('redis_baz_reply')
  })

  test('should send and reply from redis clients', async () => {

    rccServer40?.on('redis_fox', data => {
      expect(data).toBe('redis_fox_data')
      return 'redis_fox_reply'
    })
    const reply = await rccServer30?.request('redis_fox', 'redis_fox_data', 'client40')
    expect(reply).toBe('redis_fox_reply')
  })

  test('should send and reply from websocketer clients', async () => {

    wsrServer20?.on('redis_yay', data => {
      expect(data).toBe('redis_yay_data')
      return 'redis_yay_reply'
    })
    const reply = await wsrServer10?.request('redis_yay', 'redis_yay_data', 'server20')
    expect(reply).toBe('redis_yay_reply')
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
        new ReconWebSocket(`${h}:5003`, undefined, { WebSocket }),
        { id: 'client11' }
      )
      wsrClient11.client.addEventListener('open', resolve)
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

    const plFoo = await wsrClient20?.request('foo', 'foo11', 'client11')
    const plBar = await wsrClient20?.request('bar', 'barbar', 'client10')
    expect(plFoo).toBe('hi11')
    expect(plBar).toBe('barbar')
    expect(fnBar.mock.calls).toHaveLength(1)

    wsrClient11?.client.close()
    wsrServer11?.client.close()
    wsrClient11?.destroy()
    wsrServer11?.destroy()
  })

  test('should create from existing client', async () => {

    const options = {
      host: '127.0.0.1',
      port: 6379,
      retry_strategy: (r: any) => Math.min(r.attempt * 100, 3000)
    }
    const redisClient = createClient(options)
    const client = new RedisClusterClient({ client: redisClient })
    expect(client.redisOptions.host).toBe(options.host)
    expect(client.redisOptions.port).toBe(options.port)
    expect(client.redisOptions.retry_strategy).toBe(options.retry_strategy)
    client.destroy()
  })

})
