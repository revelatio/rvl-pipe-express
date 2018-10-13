const test = require('ava')
const { createServer, startListening, validateRequest, validateResponse } = require('../')
const request = require('supertest')
const { each, always, should, props, equals, prop } = require('rvl-pipe')
const axios = require('axios')

const mockUserMiddleware = (req, res, next) => {
  req.user = { id: 1234 }
  next()
}

const createMockApp = (url, endpointHandler, middlewares) => [{
  method: 'use',
  path: url,
  fn: endpointHandler,
  middlewares
}]

const createMockAppWithRouters = () => [
  {
    path: '/api',
    handlers: [
      {
        method: 'get',
        path: '/status',
        fn: each(always({ status: 'ok', service: 'test' }))
      }
    ]
  }
]

const createMockServer = (url, endpointHandler, middlewares) => {
  return createServer(
    createMockApp(url, endpointHandler, middlewares)
  )
}

const createMockServerWithRouters = () => {
  return createServer(
    createMockAppWithRouters()
  )
}

const createMockServerWithInitializer = (initializer, url, endpointHandler, middlewares) => {
  return each(
    initializer,
    createServer(
      createMockApp(url, endpointHandler, middlewares)
    )
  )
}

const makeRequest = (method, url, payload) => ctx => {
  if (method === 'GET') {
    return request(ctx.app)
      .get(url)
      .then(response => Object.assign(ctx, { response }))
  }

  if (method === 'POST') {
    return request(ctx.app)
      .post(url)
      .send(payload)
      .then(response => Object.assign(ctx, { response }))
  }
}

const makeHttpRequest = (method, url) => ctx => {
  return axios({
    method,
    url
  })
    .then(response => Object.assign(ctx, { response }))
}

const checkResponse = (status) => ctx => {
  ctx.t.is(ctx.response.status, status)
  return ctx
}

const checkResponseBody = (body) => ctx => {
  ctx.t.deepEqual(ctx.response.body, body)
  return ctx
}

const checkHttpResponseBody = (body) => ctx => {
  ctx.t.deepEqual(ctx.response.data, body)
  return ctx
}

const checkResponseMessage = (message) => ctx => {
  ctx.t.is(ctx.response.text, message)
  return ctx
}

const checkHeader = (header, value) => ctx => {
  ctx.t.deepEqual(ctx.response.headers[header], value)
  return ctx
}

const createObjectKeysValidator = (keys) => obj => {
  return keys.every(key => key in obj)
}

test('GET 200', t => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeRequest('GET', '/status'),
    checkResponse(200),
    checkResponseBody({ hello: 'world' })
  )({ t })
})

test('middleware is applied', t => {
  return each(
    createMockServer(
      '/status',
      each(
        should(equals(prop('user.id'), always(1234)), 'InvalidMiddleware'),
        always({ hello: 'world' })
      ),
      [mockUserMiddleware]
    ),
    makeRequest('GET', '/status'),
    checkResponse(200),
    checkResponseBody({ hello: 'world' })
  )({ t })
})

test('initializer is applied', t => {
  return each(
    createMockServerWithInitializer(
      ctx => {
        ctx.mongo = { connection: true }
        return ctx
      },
      '/status',
      each(
        should(prop('mongo.connection'), 'NotInitialized'),
        always({ hello: 'world' })
      )
    ),
    makeRequest('GET', '/status'),
    checkResponse(200),
    checkResponseBody({ hello: 'world' })
  )({ t })
})

test('with routers', t => {
  return each(
    createMockServerWithRouters(),
    makeRequest('GET', '/api/status'),
    checkResponse(200),
    checkResponseBody({ status: 'ok', service: 'test' })
  )({ t })
})

test('GET 404 (middleware)', t => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeRequest('GET', '/statuses'),
    checkResponse(404)
  )({ t })
})

test('GET 404 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'NotFoundResource'))),
    makeRequest('GET', '/status'),
    checkResponse(404),
    checkResponseMessage('NotFoundResource')
  )({ t })
})

test('GET 401 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'UnauthorizedUser'))),
    makeRequest('GET', '/status'),
    checkResponse(401),
    checkResponseMessage('UnauthorizedUser')
  )({ t })
})

test('GET 403 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'ForbiddenAccess'))),
    makeRequest('GET', '/status'),
    checkResponse(403),
    checkResponseMessage('ForbiddenAccess')
  )({ t })
})

test('GET 400 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'InvalidRequest'))),
    makeRequest('GET', '/status'),
    checkResponse(400),
    checkResponseMessage('InvalidRequest')
  )({ t })
})

test('GET 417 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'ExpectationNotThere'))),
    makeRequest('GET', '/status'),
    checkResponse(417),
    checkResponseMessage('ExpectationNotThere')
  )({ t })
})

test('GET 500 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'JustFail'))),
    makeRequest('GET', '/status'),
    checkResponse(500),
    checkResponseMessage('JustFail')
  )({ t })
})

test('payload empty 204', t => {
  return each(
    createMockServer('/status', each(always({}))),
    makeRequest('GET', '/status'),
    checkResponse(204)
  )({ t })
})

test('redirects', t => {
  return each(
    createMockServer('/status', each(always({ redirect: '/other-page' }))),
    makeRequest('GET', '/status'),
    checkResponse(302),
    checkHeader('location', '/other-page')
  )({ t })
})

test('set cookie', t => {
  return each(
    createMockServer('/status', each(always({
      cookies: {
        session: {
          value: '1234',
          options: {
            httpOnly: true,
            secure: true,
            path: '/'
          }
        }
      }
    }))),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', ['session=1234; Path=/; HttpOnly; Secure'])
  )({ t })
})

test('reset cookie', t => {
  return each(
    createMockServer('/status', each(always({ cookies: { '-session': true } }))),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', ['session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])
  )({ t })
})

test('input validator success', t => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: ctx => `hello ${ctx.body.name}` })
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(200),
    checkResponseBody({ hello: 'hello John' })
  )({ t })
})

test('input validator failed', t => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: ctx => `hello ${ctx.body.name}` })
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { last: 'Doe' }),
    checkResponse(400),
    checkResponseMessage('InvalidRequest')
  )({ t })
})

test('output validator success', t => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: ctx => `hello ${ctx.body.name}` }),
    validateResponse(createObjectKeysValidator(['hello']))
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(200),
    checkResponseBody({ hello: 'hello John' })
  )({ t })
})

test('output validator failed', t => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ gretting: ctx => `hello ${ctx.body.name}` }),
    validateResponse(createObjectKeysValidator(['hello']))
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(400),
    checkResponseMessage('InvalidResponse')
  )({ t })
})

test('server listening', t => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    startListening(),
    makeHttpRequest('GET', 'http://localhost:3000/status'),
    checkResponse(200),
    checkHttpResponseBody({ hello: 'world' })
  )({ t })
})
