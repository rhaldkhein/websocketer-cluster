import {
  Client as ClientBase,
  Options,
  RequestData
} from 'websocketer'
import RedisCluster from './RedisCluster'

export default class Client extends ClientBase<any, any, RedisCluster> {

  constructor(
    options?: Partial<Options>) {

    super(undefined, options)
  }

  protected _send(
    data: RequestData): void {

    this._cluster?.handleRequest(data)
  }

}
