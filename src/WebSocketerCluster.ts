import { WebSocket } from 'ws'
import ReconnectingWebSocket, { UrlProvider } from 'reconnecting-websocket'
import { RequestData, WebSocketer, Cluster } from 'websocketer'

export interface ClusterOptions {
  origin: UrlProvider
}

export default class WebSocketerCluster implements Cluster {

  /** a client socketer connected to cluster server */
  private _socketer: WebSocketer
  /** set of server socketers connected to its client */
  private _socketers = new Set<WebSocketer>()

  constructor(
    options: ClusterOptions) {

    this._socketer = new WebSocketer(
      new ReconnectingWebSocket(
        options.origin,
        undefined,
        {
          WebSocket
        }
      )
    )
    this._handleSocketerEvents()
  }

  destroy() {
    this._socketer.socket.close()
    this._socketer.destroy()
  }

  register(
    socketer: WebSocketer) {

    this._socketers.add(socketer)
  }

  unregister(
    socketer: WebSocketer) {

    this._socketers.delete(socketer)
  }

  async send<T>(
    request: RequestData) {

    request.socket = undefined
    request.locals = undefined
    return this._socketer.send<T>('_forward_', request)
  }

  private _handleSocketerEvents() {

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
