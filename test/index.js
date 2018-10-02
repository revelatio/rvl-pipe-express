const test = require('ava')
const { createServer, wrap, validateRequest, validateResponse } = require('../')
const request = require('supertest')
const { noop, each, always, should, props } = require('rvl-pipe')
const axios = require('axios')

const createMockApp = (url, endpointHandler) => ctx => {
  ctx.app.use(url, wrap(endpointHandler))
  ctx.app.post('/quit', (req, res) => {
    res.send('closing..')
    ctx.app.close()
  })
  return ctx
}

const createMockServer = (url, endpointHandler) => {
  return createServer(
    noop(),
    createMockApp(url, endpointHandler)
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
    .catch(err => {
      console.log(err)
    })
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
  )({ noStart: true, t })
})

test('GET 404 (middleware)', t => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeRequest('GET', '/statuses'),
    checkResponse(404)
  )({ noStart: true, t })
})

test('GET 404 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'NotFoundResource'))),
    makeRequest('GET', '/status'),
    checkResponse(404),
    checkResponseMessage('NotFoundResource')
  )({ noStart: true, t })
})

test('GET 401 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'UnauthorizedUser'))),
    makeRequest('GET', '/status'),
    checkResponse(401),
    checkResponseMessage('UnauthorizedUser')
  )({ noStart: true, t })
})

test('GET 403 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'ForbiddenAccess'))),
    makeRequest('GET', '/status'),
    checkResponse(403),
    checkResponseMessage('ForbiddenAccess')
  )({ noStart: true, t })
})

test('GET 400 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'InvalidRequest'))),
    makeRequest('GET', '/status'),
    checkResponse(400),
    checkResponseMessage('InvalidRequest')
  )({ noStart: true, t })
})

test('GET 417 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'ExpectationNotThere'))),
    makeRequest('GET', '/status'),
    checkResponse(417),
    checkResponseMessage('ExpectationNotThere')
  )({ noStart: true, t })
})

test('GET 500 (function)', t => {
  return each(
    createMockServer('/status', each(should(always(false), 'JustFail'))),
    makeRequest('GET', '/status'),
    checkResponse(500),
    checkResponseMessage('JustFail')
  )({ noStart: true, t })
})

test('payload empty 204', t => {
  return each(
    createMockServer('/status', each(always({}))),
    makeRequest('GET', '/status'),
    checkResponse(204)
  )({ noStart: true, t })
})

test('redirects', t => {
  return each(
    createMockServer('/status', each(always({ redirect: '/other-page' }))),
    makeRequest('GET', '/status'),
    checkResponse(302),
    checkHeader('location', '/other-page')
  )({ noStart: true, t })
})

test('set cookie', t => {
  return each(
    createMockServer('/status', each(always({ cookies: { session: '1234' } }))),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', ['session=1234; Path=/; HttpOnly; Secure'])
  )({ noStart: true, t })
})

test('reset cookie', t => {
  return each(
    createMockServer('/status', each(always({ cookies: { '-session': true } }))),
    makeRequest('GET', '/status'),
    checkResponse(204),
    checkHeader('set-cookie', ['session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])
  )({ noStart: true, t })
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
  )({ noStart: true, t })
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
  )({ noStart: true, t })
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
  )({ noStart: true, t })
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
  )({ noStart: true, t })
})


test('server listening', t => {
  return each(
    createMockServer('/status', each(always({ hello: 'world' }))),
    makeHttpRequest('GET', 'http://localhost:3001/status'),
    checkResponse(200),
    checkHttpResponseBody({ hello: 'world' })
  )({ t })
})
