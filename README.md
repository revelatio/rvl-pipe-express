# rvl-pipe-express

[![Build Status](https://travis-ci.com/revelatio/rvl-pipe-express.svg?branch=master)](https://travis-ci.com/revelatio/rvl-pipe-express)
[![Coverage Status](https://coveralls.io/repos/github/revelatio/rvl-pipe-express/badge.svg?branch=master)](https://coveralls.io/github/revelatio/rvl-pipe-express?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/github/revelatio/rvl-pipe-express/badge.svg)](https://snyk.io/test/github/revelatio/rvl-pipe-express)

A very small set of boilerplate functions to create an express server using [rvl-pipe](https://github.com/revelatio/rvl-pipe) async-style functions.

Abstracts some quirks of building a express server by only providing a set of path mappings to rvl-pipe async-style functions. You can add an initializer (mostly to connect to resources like DB or MQ) and middlewares to support most use cases of them on individual paths.

Also includes a couple of very simple validation functions for verifying requests and responses.

## API

API is comprised of only 4 functions. 2 for creating and starting a server and 2 helper function for validating request and response.

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

- `validateRequest(validator: (Object) => Boolean):AsyncPipeFunction`: This function return an async-pipe function that validates the context `body` property against the validator function passed as parameter. A validator function is a simple function that checks if an objects passes certains pre-conditions. If the validation fails it will raise an `InvalidRequest` exception causing an HTTP 400 response error.

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

- `validateResponse(validator: (Object) => Boolean):AsyncPipeFunction`: Same as `validateRequest` returns an async-pipe function, in this validates the whole context. Since the resulting context is what determines the endpoint handler output. If the validation fails it will raise an `InvalidResponse` exception causing an HTTP 400 response error.

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

Async-pipe functions are functions with the following syntax:

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

The `context` is a plain object that gets passed from function to function. What `createServers` internally does is to map the route paths to aync-pipe functions but first extracting relevant data from the HTTP request adding it to the `context` and passing it to the endpoint handler. Mapping back the result as HTTP response.

What's passed in the context from the HTTP Request:
  - `body`: Parsed JSON body of the request.
  - `headers`: As an object, please note that by default all header keys are lowercase.
  - `params`: URI path params (if specified)
  - `query`: URI query string as an parsed object
  - `user`: This is a placeholder for any authentication middleware you might want to add, if none will be undefined.

Of course anything added to the context in the server initialization phase will be also available to each endpoint handler. Like resources connections, DBs, etc.

Once the endpoint handler finishes the resulting `context` is mapped back as HTTP response. Some especial properties have different uses and they are processed in the following order:
  - `cookies`: This should be an object specifying cookies to be sent to the user. Notice that by default all cookies will be sent with HttpOnly and Secure flags. If any cookie key starts with an `-` it means to clear such cookie (value is not important in this case). Once processed the cookies the property is deleted from the context to continue processing
    - ```{ cookies: { session: '122345' } }``` Set `session` cookie to `122345`
    - ```{ cookies: { '-session': true } }``` Clear `session` cookie
  - `redirect`: This allows to make temporal redirects in the response. If this property is present the response processing will end here and make the redirect to the specified path
    - ```{ redirect: '/' }``` Redirect to `/`
    - ```{ cookies: { session: '123' }, redirect: '/dashboard' }``` Sets `session` cookie, redirects to `/dashboard`
    - ```{ cookies: { '-session': true }, redirect: '/welcome' }``` Clears `session` cookie, redirects to `/welcome`
  - Empty payload: If context is empty (also after removing the `cookies` property) it will return a simple HTTP 204
  - Otherwise the context is sent to the client as JSON payload.

### Errors

Error handling is simple too. If any endpoint handler function fails (is a promise remember) the resulting error is captured and processed according to the error message. Some words will trigger different HTTP error codes.
  - `Expectation`: HTTP 417
  - `NotFound`: HTTP 404, Ex: `PostNotFound` or `NotFoundPost`
  - `Unauthorized`: HTTP 401.
  - `Forbidden`: HTTP 403, Ex: `ForbiddenAccessToPost`
  - `Invalid`: HTTP 400, Ex: `InvalidPostNumberFormat`
  - If none of the previous cases applies then sadly we return an HTTP 500.

## Suggestion and feedback

If you use or plan to use `rvl-pipe-express` for your projects and need our help don't hesitate to file and issue here.

