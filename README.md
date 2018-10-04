# rvl-pipe-express

A very small set of boilerplate functions to create an express server using [rvl-pipe](https://github.com/revelatio/rvl-pipe) async-style functions.

Abstracts some quirks of building a express server by only providing a set of path mappings to rvl-pipe async-style functions. You can also add an initializer (mostly to connect to resources like DB or MQ) and middlewares to support most use cases of them on individual paths.

Also includes a couple of very simple validation functions for request and response.

## API

API is comprised of only 3 functions.

### createServer & startListening

`createServer` returns an async function that can be started with the `startListening` function.

```javascript
const { createServer, startListening } = require('./index')
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
```

## Initializing external resources

Most backend/express apps will need some access to external resources, like databases, caches, message queues, etc. Since the `createServer` and `startListening` functions can be used in a async-pipe function composition. Is rather easy to first connect to resources like:

```javascript
const { createServer, startListening } = require('rvl-pipe-express')
const { connectMongoDB } = require('rvl-pipe-mongodb')
const { each, always } = require('rvl-pipe')

const statusQueryEndpoint = each(
  runQueryOne('status_collection', always({}), 'status'),
  prop('status')
)

const server = each(
  connectMongoDB(process.env.MONGO_URL, process.env.MONGO_DB),
  createServer(
    [
      { method: 'get', path: '/status', fn: statusQueryEndpoint }
    ]
  ),
  startListening()
)

server()
  .then(ctx => {
    console.log('Server started with mongodb')
  })
```


```
