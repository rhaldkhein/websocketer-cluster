import WebSocketerClusterServer from '../src/WebSocketerClusterServer'

const cluster = new WebSocketerClusterServer({ port: 6000 })
console.log('WebSocketerClusterServer')
