import EventEmitter from 'eventemitter3'
import {
  createClient
} from 'redis'
import {
  generateId,
  RequestData
} from 'websocketer'

const rxSpace = / /ig

export interface RedisClusterClientOptions {
  host?: string
  username?: string
  password?: string
  client?: any
  id?: string
  timeout?: number
  debug?: boolean
}

export interface SendOptions {
  noReply?: boolean
}

export interface BroadcastOptions extends SendOptions {
  continue?: boolean
}

export default class RedisClusterClient extends EventEmitter {

  private _options: RedisClusterClientOptions
  private _channel = 'websocketer'
  private _publisher?: any
  private _subscriber?: any
  private _id: string

  constructor(
    options?: RedisClusterClientOptions) {

    super()
    options = options || {}
    options.id = options.id || generateId(24)
    options.timeout = options.timeout || 60
    options.host = options.host || '127.0.0.1:6379'
    this._id = options.id
    this._options = options as RedisClusterClientOptions

    const parts = options.host.split(':')
    this._publisher = options.client || createClient({
      host: parts[0],
      port: parts[1] && parseInt(parts[1], 10),
      user: options.username || 'default',
      password: options.password || '',
      retry_strategy: (r: any) => Math.min(r.attempt * 100, 3000)
    })
    this._subscriber = createClient(this._publisher.options)
    this._subscriber.subscribe(this._channel)
    this._subscriber.on(
      'message',
      async (channel: string, message: string) => {
        try {
          if (channel !== this._channel) return
          const data: RequestData<any> = JSON.parse(message)
          if (data.ns !== this._channel) return
          this.emit('message', data)
        } catch (error) {
          // #TODO add handler
        }
      }
    )
    this._publisher.on('ready', () => this.emit('ready'))
    this._publisher.on('connect', () => this.emit('connect'))
    this._publisher.on('error', () => this.emit('error'))
    this._publisher.on('end', () => this.emit('end'))
    this.setId(this._id)
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

  get subscriber() {
    return this._subscriber
  }

  get redisOptions() {
    return this._options.client.options
  }

  destroy() {
    this.removeAllListeners()
    this._publisher.quit()
    this._subscriber.quit()
  }

  setId(
    id: string) {

    this._id = id
    this._publisher.client('setname', `${this._channel}:${this._id}`)
  }

  async clients() {
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

  async clientIds() {
    const clients = await this.clients()
    if (!clients) return []
    return clients.map<string>(c => c.name.split(':')[1])
  }

  sendRequest(
    request: RequestData) {

    this._publisher.publish(this._channel, JSON.stringify(request))
  }

}
