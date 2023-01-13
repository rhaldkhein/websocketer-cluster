import RedisClusterClient from '../src/RedisClusterClient'

async function start() {
  const client = new RedisClusterClient({ id: 'client4', timeout: 8 })

  try {

    await new Promise(resolve => client.once('ready', resolve))

    client.on('hey', (data) => {
      console.log('receive 4', data)
      return data + '4'
    })

    const results = await client.broadcast('hey', 'erryayo', { continue: true })
    console.log(results)

  } catch (error) {
    console.error(error)
  }

  client.destroy()
}

start()
