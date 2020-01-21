import { createServer, startListening } from '../src'
import { each, always } from 'rvl-pipe'

const statusEndpoint = each(
  always({
    status: 'ok',
    service: 'first-example'
  })
)

const server = each(
  createServer([{ method: 'get', path: '/status', fn: statusEndpoint }]),
  startListening()
)

server().then(ctx => {
  console.log('Server started')
  return Promise.resolve(ctx)
})
