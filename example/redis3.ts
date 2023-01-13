import RedisClusterClient from '../src/RedisClusterClient'

async function start() {
  const client = new RedisClusterClient({ id: 'client3', timeout: 8 })

  try {

    await new Promise(resolve => client.once('ready', resolve))

    client.on('hey', async (data) => {
      console.log('receive 3', data)
      // if (data === 'yay') throw new Error('hehe')
      return await new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          if (data.startsWith('err')) return reject(new Error(data + '3'))
          resolve(data + '3')
        }, 1000 * 3)
      })
    })

  } catch (error) {
    console.error(error)
  }

  // client.destroy()
}

start()
