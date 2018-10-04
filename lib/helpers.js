const { each } = require('rvl-pipe')
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { isEmpty } = require('ramda')

const withContext = ctx => (req, res, next) => {
  res.ctx = {...ctx}
  next()
}

const createApp = () => ctx => {
  const app = express()
  app.use(bodyParser.json())
  app.use(cookieParser())
  app.use(withContext(ctx))
  return Object.assign(ctx, { app, express })
}

module.exports.startListening = () => ctx => {
  const port = process.env.PORT || '3000'
  return new Promise((resolve, reject) => {
    ctx.app.listen(port, () => resolve(ctx))
  })
}

const createHandler = handlers => ctx => {
  const addHandlers = (router, handlers) => {
    handlers.forEach(handler => {
      if ('handlers' in handler) {
        const pathRouter = ctx.express.Router()
        addHandlers(pathRouter, handler.handlers)
        router.use(handler.path, pathRouter)
      } else {
        router[handler.method](handler.path, ...[...handler.middlewares || [], wrap(handler.fn)])
      }
    })
  }

  addHandlers(ctx.app, handlers)

  return ctx
}

module.exports.createServer = (handlers) => each(
  createApp(),
  createHandler(handlers)
)

const sendResponse = (req, res) => payload => {
  if ('cookies' in payload) {
    Object.keys(payload.cookies).forEach(cookieName => {
      if (cookieName[0] === '-') {
        res.clearCookie(cookieName.substring(1))
      } else {
        res.cookie(
          cookieName,
          payload.cookies[cookieName],
          { httpOnly: true, secure: process.env.ENV_CHANNEL !== 'local' }
        )
      }
    })

    delete payload['cookies']
  }

  if (isEmpty(payload)) {
    return res.status(204).end()
  }

  if ('redirect' in payload) {
    return res.redirect(payload.redirect)
  }

  res.json(payload)
  return payload
}

const sendErrorResponse = (req, res) => err => {
  if (err.message.includes('Expectation')) {
    return res.status(417).send(err.message).end()
  }

  if (err.message.includes('NotFound')) {
    return res.status(404).send(err.message).end()
  }

  if (err.message.includes('Unauthorized')) {
    return res.status(401).send(err.message).end()
  }

  if (err.message.includes('Forbidden')) {
    return res.status(403).send(err.message).end()
  }

  if (err.message.includes('Invalid')) {
    return res.status(400).send(err.message).end()
  }

  return res.status(500).send(err.message).end()
}

const wrap = fn =>
  (req, res) => {
    return fn(
      Object.assign(res.ctx, {
        body: req.body,
        headers: req.headers,
        params: req.params,
        user: req.user,
        query: req.query
      })
    )
    .then(sendResponse(req, res))
    .catch(err => sendErrorResponse(req, res)(err))
  }

const validateIO = (errorType, propName) => validator => ctx => {
  const valid = (propName)
    ? validator(ctx[propName])
    : validator(ctx)

  if (!valid) {
    return Promise.reject(new Error(errorType))
  }

  return Promise.resolve(ctx)
}

module.exports.validateRequest = validateIO('InvalidRequest', 'body')
module.exports.validateResponse = validateIO('InvalidResponse')
