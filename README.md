# rvl-pipe-express

A very small set of boilerplate functions to create an express server using [rvl-pipe](https://github.com/revelatio/rvl-pipe) async-style functions.

Abstracts some quirks of building a express server by only providing a set of path mappings to rvl-pipe async-style functions. You can also add an initializer (mostly to connect to resources like DB or MQ) and middlewares to support most use cases of them on individual paths.

Also includes a couple of very simple validation functions for request and response.

## API

API is comprised of only 4 functions. 2 for creating and starting a server and 2 helper function for validating input and output.

- `createServer(routes: [Endpoint | Route]): AsyncPipeFunction`: Creates an async-pipe function that adds a pair of context properties: `app` and `express` (for extensibility). `app` will be initialized with all the routes described in the functions parameters
```javascript
type Endpoint = {
  method: 'get' | 'post' | 'patch' | 'delete',
  path: String,
  middlewares?: [Middleware]
  fn: AsyncPipeFunction
}

type Route = {
  path: String,
  handlers: [Endpoint | Route]
}

type AsyncPipeFunction = (ctx: Object) => Promise(Object)

const server = createServer([
  { method: 'get', path: '/post', fn: getPosts },
  { method: 'post', path: '/post', fn: createPost },
  { method: 'patch', path: '/post/:id', fn: updatePost },
  { method: 'delete', path: '/post/:id', fn: deletePost }
])

// With nested routes.
// Since this hierarchy is very common,
// a simple helper function can bootstrap it.

const server = createServer([
  {
    path: '/post',
    handlers: [
      { method: 'get', path: '/', fn: getPosts },
      { method: 'post', path: '/', fn: createPost },
      {
        path: '/:id',
        handlers: [
          { method: 'get', path: '/', fn: getPost },
          { method: 'patch', path: '/', fn: updatePost },
          { method: 'delete', path: '/', fn: deletePost }
        ]
      }
    ]
  }
])
```

- `startListening(): AsyncPipeFunction`: Returns an async-pipe function that starts a server in the context on the port defined by `process.env.PORT` or 3000 if none especified.

```javascript
const server = each(
  createServer(...),
  startListening()
)

server()
```

- `validateRequest(validator: (Object) => Boolean):AsyncPipeFunction`: This function return an async-pipe function that validates the context `body` property against the validator function passed as parameter. A validator function is a simple function that checks if an objects passes certains pre-conditions.

A simple validator function could be just check that an object has, at least, all the properties we need.

```javascript
const createObjectKeysValidator = (keys) => obj => {
  return keys.every(key => key in obj)
}

const createPostRequestValidator = createObjectKeysValidator(['title', 'content', 'author', 'tags'])

const createPost = each(
  validateRequest(createPostRequestValidator),

  // Do some logic here...

  // returns nothig
  always({})
)
```

- `validateResponse(validator: (Object) => Boolean):AsyncPipeFunction`: Same as `validateRequest` returns an async-pipe function, in this validates the whole context. Since the resulting context is what determines the endpoint handler output.

```javascript
const getPostResponseValidator = createObjectKeysValidator(['title', 'content', 'author', 'tags', 'updated', 'readCount'])

const getPost = each(

  // Retrieve post here...

  prop('post'),
  validateResponse(getPostResponseValidator)
)
```

## Simple Server Example

`createServer` returns an async function that can be started with the `startListening` function.

```javascript
const { createServer, startListening } = require('rvl-pipe-express')
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

Most backend/express apps will eventually need some access to external resources, like databases, caches, message queues, etc. Since the `createServer` and `startListening` functions can be used in a async-pipe function composition.

Using [rvl-pipe-mongodb](https://github.com/revelatio/rvl-pipe-mongodb) for example is rather easy to first connect to DB resources like:

```javascript
const { createServer, startListening } = require('rvl-pipe-express')
const { connectMongoDB, runQueryOne } = require('rvl-pipe-mongodb')
const { each, always, prop } = require('rvl-pipe')

const statusQueryEndpoint = each(
  runQueryOne(              // Uses mongodb connection on the context
    'status_collection',    // Runs a mongodb query on status_collection
    always({}),             // No filter
    'status'                // stores on status prop
  ),
  prop('status')
)

const server = each(
  connectMongoDB(           // Adds a mongodb connection to the context
    process.env.MONGO_URL,
    process.env.MONGO_DB
  ),
  createServer(
    [
      {
        method: 'get',            // This function will receive access to the context
        path: '/status',          // where mongodb is connected
        fn: statusQueryEndpoint
      }
    ]
  ),
  startListening()
)

server()
  .then(ctx => {
    console.log('Server started with mongodb')
  })
```

## How the context works?

Async-pipe functions are a functions with the following syntax:

```javascript
type AsyncPipeFunction = (ctx: Object) => Promise(Object)


const doSomething = ctx => {
  // do anything here with ctx.
  // sync or async promises
  return ctx
}

doSomething({})
```

Usually we use HOC functions that return async-pipe functions so we can compose them in a reusable way.

```javascript
const takeAPeek = ctx => {
  console.log(ctx)
  return ctx
}

const server = each(
  createServer([...]),
  startListening(),
  takeAPeek               // No need to call the function here since is already a async-pipe
)

// We can also write it like:
const takeAPeek = () => ctx => {
  console.log(ctx)
  return ctx
}

const server = each(
  createServer([...]),
  startListening(),
  takeAPeek()           // Looks more consistent, helps maintain sanity around so many functions
)
```

So, now you now how the context works, simply put, is an Object that gets passed down from function to function.



