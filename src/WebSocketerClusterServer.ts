import { nanoid } from 'nanoid'
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
    this._clients.forEach(c => c.destroy())
    this._clients = []
    this._wss.close(() => {
      this._wss.removeAllListeners()
      // @ts-ignore
      this._wss = undefined
    })
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
        'No cluster route',
        'ERR_WSR_NO_CLUSTER_ROUTE'
      )
    }
    return result
  }

  private _handleServerEvents() {

    this._wss.on(
      'connection',
      (socket) => {
        const socketer = new WebSocketer(
          socket,
          {
            id: '_wsrc:s:' + nanoid()
          }
        )
        // add socketer to set
        this._clients.push(socketer)
        // handle socket close and cleanup
        socket.on(
          'close',
          () => {
            socketer.destroy()
            this._clients.splice(this._clients.indexOf(socketer), 1)
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
