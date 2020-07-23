import {
  createServer,
  Handler,
  startListening,
  stopListening,
  validateRequest,
  validateResponse
} from '../src'
import request from 'supertest'
import {
  each,
  always,
  should,
  props,
  equals,
  prop,
  AsyncFunction,
  Context
} from 'rvl-pipe'
import axios from 'axios'
import { SyncPredicate } from 'rvl-pipe/build'

const mockUserMiddleware = (req: any, __: any, next: any) => {
  req.user = { id: 1234 }
  next()
}

const createMockApp = (
  url: string,
  endpointHandler: AsyncFunction,
  middlewares?: any[]
): Array<Handler> => [
  {
    method: 'use',
    path: url,
    fn: endpointHandler,
    middlewares: middlewares
  }
]

const createMockAppWithRouters = (): Array<Handler> => {
  const inner: Handler = {
    method: 'get',
    path: '/status',
    fn: each(always({ status: 'ok', service: 'test' }))
  }

  return [
    {
      path: '/api',
      handlers: [inner]
    }
  ]
}

const createMockServer = (
  url: string,
  endpointHandler: AsyncFunction,
  middlewares?: any[]
) => {
  return createServer(createMockApp(url, endpointHandler, middlewares))
}

const createMockServerWithRouters = () => {
  return createServer(createMockAppWithRouters())
}

const createMockServerWithInitializer = (
  initializer: AsyncFunction,
  url: string,
  endpointHandler: AsyncFunction,
  middlewares?: any[]
) => {
  return each(
    initializer,
    createServer(createMockApp(url, endpointHandler, middlewares))
  )
}

const makeRequest = (
  method: 'GET' | 'POST',
  url: string,
  payload?: Context
) => (ctx: Context) => {
  if (method === 'GET') {
    return request(ctx.app)
      .get(url)
      .then(response =>
        Object.assign(ctx, {
          response
        })
      )
  }

  if (method === 'POST') {
    return request(ctx.app)
      .post(url)
      .send(payload)
      .then(response => Object.assign(ctx, { response }))
  }

  return Promise.resolve(ctx)
}

const makeHttpRequest = (url: string): AsyncFunction => (ctx: Context) => {
  return axios.get(url).then(response => Object.assign(ctx, { response }))
}

const checkResponse = (status: number): AsyncFunction => (ctx: Context) => {
  expect(ctx.response.status).toBe(status)
  return Promise.resolve(ctx)
}

const checkResponseBody = (body: Context): AsyncFunction => (ctx: Context) => {
  expect(ctx.response.body).toEqual(body)
  return Promise.resolve(ctx)
}

const checkHttpResponseBody = (body: Context): AsyncFunction => (
  ctx: Context
) => {
  expect(ctx.response.data).toEqual(body)
  return Promise.resolve(ctx)
}

const checkResponseMessage = (message: string): AsyncFunction => (
  ctx: Context
) => {
  expect(ctx.response.text).toBe(message)
  return Promise.resolve(ctx)
}

const checkHeader = (
  header: string,
  value: string | string[]
): AsyncFunction => (ctx: Context) => {
  expect(ctx.response.headers[header]).toEqual(value)
  return Promise.resolve(ctx)
}

const createObjectKeysValidator = (keys: string[]): SyncPredicate => (
  obj: Context
): boolean => {
  return keys.every(key => key in obj)
}

test('GET 200', () => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeRequest('GET', '/status'),
    checkResponse(200),
    checkResponseBody({ hello: 'world' })
  )()
})

test('GET 204', () => {
  return each(
    createMockServer('/status', each(always(null))),
    makeRequest('GET', '/status'),
    checkResponse(204)
    // checkResponseBody({ hello: 'world' })
  )()
})

test('middleware is applied', () => {
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
  )()
})

test('initializer is applied', () => {
  return each(
    createMockServerWithInitializer(
      (ctx: Context) => {
        ctx.mongo = { connection: true }
        return Promise.resolve(ctx)
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
  )()
})

test('with routers', () => {
  return each(
    createMockServerWithRouters(),
    makeRequest('GET', '/api/status'),
    checkResponse(200),
    checkResponseBody({ status: 'ok', service: 'test' })
  )()
})

test('GET 404 (middleware)', () => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeRequest('GET', '/statuses'),
    checkResponse(404)
  )()
})

test('GET 404 (function)', () => {
  return each(
    createMockServer(
      '/status',
      each(should(always(false), 'NotFoundResource'))
    ),
    makeRequest('GET', '/status'),
    checkResponse(404),
    checkResponseMessage('NotFoundResource')
  )()
})

test('GET 401 (function)', () => {
  return each(
    createMockServer(
      '/status',
      each(should(always(false), 'UnauthorizedUser'))
    ),
    makeRequest('GET', '/status'),
    checkResponse(401),
    checkResponseMessage('UnauthorizedUser')
  )()
})

test('GET 403 (function)', () => {
  return each(
    createMockServer('/status', each(should(always(false), 'ForbiddenAccess'))),
    makeRequest('GET', '/status'),
    checkResponse(403),
    checkResponseMessage('ForbiddenAccess')
  )()
})

test('GET 400 (function)', () => {
  return each(
    createMockServer('/status', each(should(always(false), 'InvalidRequest'))),
    makeRequest('GET', '/status'),
    checkResponse(400),
    checkResponseMessage('InvalidRequest')
  )()
})

test('GET 417 (function)', () => {
  return each(
    createMockServer(
      '/status',
      each(should(always(false), 'ExpectationNotThere'))
    ),
    makeRequest('GET', '/status'),
    checkResponse(417),
    checkResponseMessage('ExpectationNotThere')
  )()
})

test('GET 500 (function)', () => {
  return each(
    createMockServer('/status', each(should(always(false), 'JustFail'))),
    makeRequest('GET', '/status'),
    checkResponse(500),
    checkResponseMessage('JustFail')
  )()
})

test('payload empty 204', () => {
  return each(
    createMockServer('/status', each(always({}))),
    makeRequest('GET', '/status'),
    checkResponse(204)
  )()
})

test('redirects', () => {
  return each(
    createMockServer('/status', each(always({ redirect: '/other-page' }))),
    makeRequest('GET', '/status'),
    checkResponse(302),
    checkHeader('location', '/other-page')
  )()
})

test('set cookie', () => {
  return each(
    createMockServer(
      '/status',
      each(
        always({
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
        })
      )
    ),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', ['session=1234; Path=/; HttpOnly; Secure'])
  )()
})

test('reset cookie', () => {
  return each(
    createMockServer(
      '/status',
      each(always({ cookies: { '-session': true } }))
    ),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', [
      'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ]),

    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', [
      'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ])
  )()
})

test('input validator success', () => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: (ctx: Context) => `hello ${ctx.body.name}` })
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(200),
    checkResponseBody({ hello: 'hello John' })
  )()
})

test('input validator failed', () => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: (ctx: Context) => `hello ${ctx.body.name}` })
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { last: 'Doe' }),
    checkResponse(400),
    checkResponseMessage('InvalidRequest')
  )()
})

test('output validator success', () => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ hello: (ctx: Context) => `hello ${ctx.body.name}` }),
    validateResponse(createObjectKeysValidator(['hello']))
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(200),
    checkResponseBody({ hello: 'hello John' })
  )()
})

test('output validator failed', () => {
  const endpointHandler = each(
    validateRequest(createObjectKeysValidator(['name'])),
    props({ gretting: (ctx: Context) => `hello ${ctx.body.name}` }),
    validateResponse(createObjectKeysValidator(['hello']))
  )

  return each(
    createMockServer('/status', endpointHandler),
    makeRequest('POST', '/status', { name: 'John' }),
    checkResponse(400),
    checkResponseMessage('InvalidResponse')
  )()
})

test('server listening', () => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    startListening(),
    makeHttpRequest('http://localhost:3000/status'),
    checkResponse(200),
    checkHttpResponseBody({ hello: 'world' }),
    stopListening()
  )()
})
