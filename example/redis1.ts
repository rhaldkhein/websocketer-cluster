import RedisClusterClient from '../src/RedisClusterClient'

async function start() {
  const client = new RedisClusterClient({ id: 'client1', timeout: 8 })

  try {

    await new Promise(resolve => client.once('ready', resolve))

    client.on('hey', (data) => {
      console.log('receive 1', data)
      return data + '1'
    })
    const clients = await client.clients
    console.log(clients)

  } catch (error) {
    console.error(error)
  }

  // client.destroy()
}

start()
