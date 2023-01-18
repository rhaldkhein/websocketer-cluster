import { Cluster, RequestData, WebSocketer, WebSocketerError } from 'websocketer'
import EventEmitter from 'eventemitter3'
import RedisClusterClient from './RedisClusterClient'

export interface RedisClusterOptions {
  host: string
  client: any
}

export default class WebSocketerRedisCluster extends EventEmitter implements Cluster {

  private _client: RedisClusterClient
  private _socketers = new Set<WebSocketer>()

  constructor(
    options: Partial<RedisClusterOptions>) {

    super()
    this._client = new RedisClusterClient({
      client: options.client,
      host: options.host
    })
    this._handleEvents()
  }

  get client() {
    return this._client
  }

  get socketers() {
    return this._socketers
  }

  destroy(): void {
    this.removeAllListeners()
    this._socketers.clear()
    this._client.destroy()
  }

  register(
    socketer: WebSocketer): void {

    this._socketers.add(socketer)
  }

  unregister(
    socketer: WebSocketer): void {

    this._socketers.delete(socketer)
  }

  async handleRequest<T>(
    request: RequestData<any>): Promise<RequestData<T>> {

    const results = await this._client.broadcast<RequestData<T>>('_forward_', request)
    const result = results.find(v => v !== undefined)
    if (!result) {
      throw new WebSocketerError(
        'No cluster route',
        'ERR_WSR_NO_CLUSTER_ROUTE'
      )
    }
    return result
  }

  private _handleEvents() {

    this._client.on('ready', () => this.emit('ready'))

    this._client.on(
      '_forward_',
      async (data, request) => {
        // `request.to` should be `undefined`, but `request.pl.to` should exist
        const origRequest: RequestData = request.pl
        let targetSocketer: WebSocketer | undefined
        let targetIsHere: boolean | undefined
        // check server or client matches the destination id
        for (const socketer of this._socketers) {
          if (socketer.id === origRequest.to) {
            targetSocketer = socketer
            targetIsHere = true
            break
          } else if (origRequest.to && socketer.remotes.has(origRequest.to)) {
            targetSocketer = socketer
            targetIsHere = false
            break
          }
        }
        if (targetIsHere === true) {
          // server, handle here
          return targetSocketer?.handleRequest(origRequest)
        } else if (targetIsHere === false) {
          // client, forward to client
          return targetSocketer?.send('_request_', origRequest)
        } else {
          // message doesn't belong to this cluster client
          return undefined
        }
      }

    )

  }

}
