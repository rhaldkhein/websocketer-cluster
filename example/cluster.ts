import { WebSocketerClusterServer } from '../src'

const cluster = new WebSocketerClusterServer({ port: 6000 })
console.log('WebSocketerClusterServer')
