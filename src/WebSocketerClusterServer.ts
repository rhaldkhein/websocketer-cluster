import { RequestData, WebSocketer, WebSocketerError } from 'websocketer'
import { WebSocketServer, ServerOptions, WebSocket } from 'ws'

export default class WebSocketerClusterServer {

  private _wss: WebSocketServer
  private _clients: WebSocketer[] = []

  constructor(
    options?: ServerOptions) {

    this._wss = new WebSocketServer(options)
    this._handleServerEvents()
  }

  get server() {
    return this._wss
  }

  destroy() {
    this._wss.removeAllListeners()
    this._wss.close()
  }

  async broadcast(
    data: RequestData) {

    data.socket = undefined
    data.locals = undefined
    const requests = this._clients.map(socketer => {
      if (socketer.socket.readyState === WebSocket.OPEN) {
        return socketer.send('_forward_', data.pl)
      }
      return Promise.resolve(undefined)
    })
    const results = await Promise.all(requests)
    const result = results.find(v => v !== undefined)
    if (!result) {
      throw new WebSocketerError(
        'No listener',
        'ERR_WSR_NO_LISTENER'
      )
    }
    return result
  }

  private _handleServerEvents() {

    this._wss.on(
      'connection',
      (socket) => {
        const socketer = new WebSocketer(socket)
        // add socketer to set
        const clientSet = new Set(this._clients)
        clientSet.add(socketer)
        this._clients = Array.from(clientSet)
        // handle socket close and cleanup
        socket.on(
          'close',
          () => {
            socketer.destroy()
            const clientSet = new Set(this._clients)
            clientSet.delete(socketer)
            this._clients = Array.from(clientSet)
          }
        )
        // handle socketer events
        this._handleSocketerEvents(socketer)
      }
    )
  }

  private _handleSocketerEvents(
    socketer: WebSocketer) {

    socketer.listen(
      '_forward_',
      (data, request) => {
        return this.broadcast(request)
      }
    )
  }

}
