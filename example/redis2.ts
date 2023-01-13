import RedisClusterClient from '../src/RedisClusterClient'

async function start() {
  const client = new RedisClusterClient({ id: 'client2', timeout: 8 })

  try {

    await new Promise(resolve => client.once('ready', resolve))

    client.on('hey', (data) => {
      console.log('receive 2', data)
      return data + '2'
    })

  } catch (error) {
    console.error(error)
  }

  // client.destroy()
}

start()
