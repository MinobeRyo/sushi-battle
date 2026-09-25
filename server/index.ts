import { createGameServer } from './gameServer'

const configuredOrigins = process.env.SUSHI_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean)
const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535')

const server = await createGameServer({
  port, host: process.env.HOST ?? '127.0.0.1',
  allowedOrigins: configuredOrigins?.length ? configuredOrigins : undefined,
})
console.log(`Sushi Battle room server: ${server.url}`)

const shutdown = async () => {
  await server.close()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
