const { createServer, startListening } = require('../build/index')
const { each, always } = require('rvl-pipe')

const statusEndpoint = each(
  always({
    status: 'ok',
    service: 'first-example'
  })
)

const server = each(
  createServer(
    [
      { method: 'get', path: '/status', fn: statusEndpoint }
    ]
  ),
  startListening()
)

server()
  .then(ctx => {
    console.log('Server started')
  })
