import { createClient } from 'redis'
import EventEmitter from 'eventemitter3'
import { customAlphabet } from 'nanoid'
import {
  Payload,
  RequestData,
  ResponseHandler,
  WebSocketerError
} from 'websocketer'

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const nanoid = customAlphabet(chars)
const rxSpace = / /ig

export interface RedisClusterClientOptions {
  host: string
  client: any
  id: string
  timeout: number
}

export interface SendOptions {
  noReply?: boolean
}

export interface BroadcastOptions extends SendOptions {
  continue?: boolean
}

export default class RedisClusterClient extends EventEmitter {

  private _options: RedisClusterClientOptions
  private _requests = new Map<string, RequestData>()
  private _channel = 'websocketer'
  private _publisher?: any
  private _subscriber?: any
  private _id: string

  constructor(
    options?: Partial<RedisClusterClientOptions>) {

    super()
    options = options || {}
    options.id = options.id || nanoid(24)
    options.timeout = options.timeout || 60
    options.host = options.host || '127.0.0.1:6379'
    this._id = options.id
    this._options = options as RedisClusterClientOptions

    const parts = this._options.host.split(':')
    const clientOptions = options?.client?.options || {
      host: parts[0],
      port: parts[1] && parseInt(parts[1], 10),
      retry_strategy: (r: any) => Math.min(r.attempt * 100, 3000)
    }
    this._publisher = options?.client || createClient(clientOptions)
    this._subscriber = createClient(clientOptions)
    this._publisher.client('setname', `${this._channel}:${this._id}`)
    this._subscriber.subscribe(this._channel)
    this._subscriber.on(
      'message',
      async (channel: string, message: string) => {
        if (channel !== this._channel) return
        const data: RequestData<any> = JSON.parse(message)
        if (data.ns !== this._channel) return
        if (data.to && data.to !== this._id) return
        if (data.rq) {
          const reply = await this._handleRequest(data)
          this.sendRequest(reply, { noReply: true })
        } else {
          this._handleResponse(data)
        }
      }
    )
    this._publisher.on('ready', () => this.emit('ready'))
    this._publisher.on('connect', () => this.emit('connect'))
    this._publisher.on('error', () => this.emit('error'))
    this._publisher.on('end', () => this.emit('end'))
  }

  get options() {
    return this._options
  }

  get id() {
    return this._id
  }

  get channel() {
    return this._channel
  }

  get client() {
    return this._publisher
  }

  get clients() {
    return new Promise<Record<string, any>[]>((resolve, reject) => {
      this._publisher.client('list', (err: any, data: string) => {
        if (err) return reject(err)
        const _clients = data
          .split('\n')
          .map((c: string) => {
            return Object.fromEntries(new URLSearchParams(c.replace(rxSpace, '&')))
          })
          .filter((c: Record<string, any>) => {
            return c.name?.startsWith(this._channel + ':')
          })
        resolve(_clients)
      })
    })
  }

  get redisOptions() {
    return this._options.client.options
  }

  destroy() {
    this.removeAllListeners()
    this._requests.forEach(data => clearTimeout(data.ti))
    this._requests.clear()
    this._publisher.quit()
    this._subscriber.quit()
  }

  endRequestData(
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
      to: opt?.to || (request.rq ? request.fr : request.to) || ''
    }
  }

  async send(
    name: string,
    payload?: Payload,
    to?: string,
    opt?: SendOptions) {

    return this.sendRequest(
      {
        ns: this._channel,
        id: nanoid(24),
        nm: name,
        rq: true,
        pl: payload,
        fr: this._id,
        to
      },
      opt
    )
  }

  async sendRequest(
    request: RequestData,
    opt?: SendOptions):
    Promise<RequestData> {

    return new Promise((resolve, reject) => {
      const message = JSON.stringify(request)
      this._publisher.publish(this._channel, message)
      // this._subscriber.emit(this._channel, message)
      if (!opt?.noReply) {
        const response: ResponseHandler = (err, resPayload) => {
          if (err) {
            return reject(
              new WebSocketerError(
                err.message,
                err.code,
                err.payload,
                'RemoteWebSocketerError'
              )
            )
          }
          resolve(resPayload)
        }
        request.rs = response
        request.ti = setTimeout(
          () => {
            request.ti = null
            this._requests.delete(request.id)
            response(
              new WebSocketerError(
                'Timeout reached',
                'ERR_WSR_TIMEOUT'
              ),
              undefined,
              request
            )
          },
          1000 * this._options.timeout
        )
        this._requests.set(`${request.id}`, request)
      } else {
        request.rs = undefined
        resolve({} as RequestData)
      }
    })
  }

  async broadcast(
    name: string,
    payload?: Payload,
    opt?: BroadcastOptions) {

    const clients = await this.clients
    if (!clients) return []
    const clientIds = clients.map(c => c.name.split(':')[1])
    const requests = clientIds.map(id => this.send(name, payload, id, opt))
    const results = await Promise.allSettled(requests)
    return results.map(result => {
      if (result.status === 'rejected' && !opt?.continue) throw result.reason
      // @ts-ignore
      return result.value
    })
  }

  private async _handleRequest(
    data: RequestData):
    Promise<RequestData> {

    try {
      let payload
      // get the listeners
      const listeners = this.listeners(data.nm)
      if (!listeners || !listeners.length) {
        // if no listeners, reply with error
        throw new WebSocketerError(
          'No listener',
          'ERR_WSR_NO_LISTENER'
        )
      }
      // trigger listeners
      for (let i = 0; i < listeners.length; i++) {
        payload = await listeners[i](data.pl, data)
      }
      // end request data
      return this.endRequestData(
        data,
        {
          payload,
          from: this._id,
          to: data.fr
        }
      )
    } catch (error: any) {
      // attach any error and end request data
      return this.endRequestData(
        data,
        {
          error: {
            name: error.name,
            code: error.code || 'ERR_WSR_INTERNAL',
            message: error.message,
            payload: error.payload
          },
          from: this._id,
          to: data.fr
        }
      )
    }
  }

  private _handleResponse(
    data: RequestData) {

    // get the request object
    const request = this._requests.get(data.id)
    if (!request) return
    // handle the response data
    if (typeof request.rs === 'function') {
      request.rs(
        data.er || null,
        data.pl,
        request
      )
    }
    // delete the request and timeout because it's already handled
    this._requests.delete(request.id)
    clearTimeout(request.ti)
    request.ti = null
  }

}
