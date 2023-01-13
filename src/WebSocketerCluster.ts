import { nanoid } from 'nanoid'
import { WebSocket } from 'ws'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { RequestData, WebSocketer, Cluster, WebSocketerError } from 'websocketer'

export interface ClusterOptions {
  origin: string
}

export default class WebSocketerCluster implements Cluster {

  /** a client socketer connected to cluster server */
  private _socketer: WebSocketer
  /** set of server socketers connected to its client */
  private _socketers = new Set<WebSocketer>()

  constructor(
    options: ClusterOptions) {

    const url = new URL(options.origin)
    url.searchParams.set('websocketer', '1')
    this._socketer = new WebSocketer(
      new ReconnectingWebSocket(
        url.toString(),
        undefined,
        {
          WebSocket
        }
      ),
      {
        id: '_wsrc:c:' + nanoid()
      }
    )
    this._handleEvents()
  }

  get socketer() {
    return this._socketer
  }

  get socketers() {
    return this._socketers
  }

  destroy() {
    this._socketer.socket.close()
    this._socketer.destroy()
    this._socketers.clear()
  }

  register(
    socketer: WebSocketer) {

    this._socketers.add(socketer)
  }

  unregister(
    socketer: WebSocketer) {

    this._socketers.delete(socketer)
  }

  async handleRequest<T>(
    request: RequestData<any>) {
    try {
      if (this._socketer.socket.readyState !== 1) {
        throw new WebSocketerError(
          'Cluster server disconnected',
          'ERR_WSR_NO_CLUSTER_SERVER'
        )
      }
      return await this._socketer.send<T>('_forward_', request)
    } catch (error: any) {
      return this._socketer.endRequestData(request, {
        error: {
          name: error.name,
          code: error.code || 'ERR_WSR_INTERNAL_CLUSTER',
          message: error.message,
          payload: error.payload
        }
      })
    }
  }

  private _handleEvents() {

    this._socketer.listen(
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
