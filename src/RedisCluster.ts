import EventEmitter from 'eventemitter3'
import RedisClusterClient from './RedisClusterClient'
import {
  RequestData,
  Cluster as ICluster,
  Client as IClient,
  Payload,
  RequestManyOptions
} from 'websocketer'

export interface RedisClusterOptions {
  host: string
  id: string
  client: any
  debug?: boolean
}

export default class RedisCluster extends EventEmitter implements ICluster {

  private _clusterClient: RedisClusterClient
  private _clients = new Set<IClient>()

  constructor(
    options: Partial<RedisClusterOptions>) {

    super()
    this._clusterClient = new RedisClusterClient({
      id: options.id,
      client: options.client,
      host: options.host,
      debug: options.debug
    })
    this._handleEvents()
  }

  get cluster() {
    return this._clusterClient
  }

  get socketers() {
    return this._clients
  }

  get clients() {
    return this._clients
  }

  destroy(): void {
    this.removeAllListeners()
    this._clients.clear()
    this._clusterClient.destroy()
  }

  register(
    client: IClient): void {

    this._clients.add(client)
  }

  unregister(
    client: IClient): void {

    this._clients.delete(client)
  }

  handleRequest(
    request: RequestData<any>): void {

    this._clusterClient.sendRequest(request)
  }

  private _handleEvents() {

    this._clusterClient.on(
      'ready',
      () => this.emit('ready')
    )

    this._clusterClient.on(
      'message',
      async (data: RequestData) => {
        let reply: Payload
        let targetClient: IClient | undefined
        let targetIsHere: boolean | undefined
        // check server or client matches the destination id
        for (const client of this._clients) {
          if (client.id === data.to) {
            targetClient = client
            targetIsHere = true
            break
          } else if (data.to && client.remotes.has(data.to)) {
            targetClient = client
            targetIsHere = false
            break
          }
        }
        if (targetIsHere === true) {
          // server, handle here
          reply = await targetClient?.handleMessage(data)
        } else if (targetIsHere === false) {
          // client, forward to user client, reply should be a RequestData
          reply = await targetClient?.request('_request_', data)
        }
        if (reply && data.rq) this.handleRequest(reply)
      }
    )

  }

}
