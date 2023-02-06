import EventEmitter from 'eventemitter3'
import RedisClusterClient from './RedisClusterClient'
import {
  RequestData,
  Cluster as ICluster,
  Client as IClient,
  Payload,
  WebSocketerError
} from 'websocketer'

export interface RedisClusterOptions {
  host?: string
  username?: string
  password?: string
  id?: string
  client?: any
  timeout?: number
  debug?: boolean
}

export default class RedisCluster extends EventEmitter implements ICluster {

  private _clusterClient: RedisClusterClient
  private _clients = new Set<IClient>()
  private _timeout: number
  /** <request_id, number_clusters_registered> */
  private _requests = new Map<string, {
    clients: Set<string>,
    timeout: any
  }>()

  constructor(
    options: RedisClusterOptions) {

    super()
    this._clusterClient = new RedisClusterClient({
      id: options.id,
      client: options.client,
      host: options.host,
      username: options.username,
      password: options.password,
      debug: options.debug
    })
    this._timeout = options.timeout || 60
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

  get requests() {
    return this._requests
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

  async handleRequest(
    request: RequestData<any>): Promise<void> {

    const _request = { ...request }
    if (_request.rq) {
      const clients = await this._clusterClient.clientIds()
      this._requests.set(_request.id, {
        clients: new Set(clients),
        timeout: setTimeout(() => {
          this._requests.delete(_request.id)
        }, 1000 * this._timeout)
      })
    }
    this._clusterClient.sendRequest(_request)
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
        try {
          const request = this._requests.get(data.id)
          // request if present if sending to itself
          if (request && !data.rq) {
            // filter and skip for no destination error from each clusters
            if (data.er?.code === 'ERR_WSR_NO_DESTINATION') {
              request.clients.delete(data.er.payload)
              if (request.clients.size) return
              // if size is 0, all clusters replied with no destination error
            }
            // here should receive reply with success or other error
            clearTimeout(request.timeout)
            this._requests.delete(data.id)
          }
          if (targetIsHere === true) {
            // server, handle here
            reply = await targetClient?.handleMessage(data)
          } else if (targetIsHere === false) {
            // client, forward to user client, reply should be a RequestData
            reply = await targetClient?.request('_request_', data)
          } else if (data.rq) {
            // cluster can not process request, send no destination receipt
            const error = new WebSocketerError(
              'No destination in cluster',
              'ERR_WSR_NO_DESTINATION',
              this._clusterClient.id
            )
            reply = this._endRequestData(data, {
              error: {
                name: error.name,
                code: error.code || 'ERR_WSR_INTERNAL',
                message: error.message,
                payload: error.payload
              }
            })
          }
        } catch (error: any) {
          reply = this._endRequestData(data, {
            error: {
              name: error.name,
              code: error.code || 'ERR_WSR_INTERNAL',
              message: error.message,
              payload: error.payload
            }
          })
        }
        if (reply && data.rq) this.handleRequest(reply)
      }
    )

  }

  private _endRequestData(
    request: RequestData,
    opt?: {
      error?: any
      payload?: any
      from?: string
      to?: string
    }):
    RequestData {

    // do not change request data if it's already a response
    if (!request.rq) return request
    // update request data
    return {
      ns: request.ns,
      id: request.id,
      nm: request.nm,
      rq: false,
      pl: opt?.payload,
      er: opt?.error,
      fr: opt?.from || (request.rq ? request.to : request.fr) || '',
      to: opt?.to || (request.rq ? request.fr : request.to) || '',
      ic: request.ic
    }
  }

}
