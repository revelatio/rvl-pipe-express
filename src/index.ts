import express, { Router } from 'express'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import { isEmpty, omit, forEachObjIndexed } from 'ramda'
import { Context, AsyncFunction, each, SyncPredicate } from 'rvl-pipe'

const withContext = (ctx: Context) => (__: any, res: any, next: any) => {
  res.ctx = { ...ctx }
  next()
}

const createApp = (): AsyncFunction => (ctx: Context) => {
  const app: express.Application = express()
  app.use(bodyParser.json())
  app.use(cookieParser())
  app.use(withContext(ctx))
  return Promise.resolve({ ...ctx, app, express })
}

export const startListening = (): AsyncFunction => (ctx: Context) => {
  const port = process.env.PORT || '3000'
  return Promise.resolve({ ...ctx, server: ctx.app.listen(port) })
}

export const stopListening = (): AsyncFunction => (ctx: Context) => {
  ctx.server.close()
  return Promise.resolve(ctx)
}

export interface RequestInput {
  body?: any
  headers: any
  params?: any
  user?: any
  query?: any
  req: any
  res: any
}
export interface CookieSetter {
  value: string
  options: { [key: string]: string }
}
export interface RequestOutput {
  cookies?: { [key: string]: CookieSetter | null }
  redirect?: string
}
export interface Handler {
  handlers?: Handler[]
  path: string
  middlewares?: any[]
  ctxMiddlewares?: Array<(ctx: Context) => any>
  method?: 'get' | 'post' | 'patch' | 'put' | 'delete' | 'use'
  fn?: (inputContext: RequestInput) => Promise<RequestOutput>
}

const createHandler = (handlers: Handler[]): AsyncFunction => (ctx: Context) => {
  const addHandlers = (router: Router, handlers: Handler[]) => {
    handlers.forEach((handler: Handler) => {
      if (handler.handlers) {
        const pathRouter = ctx.express.Router()
        addHandlers(pathRouter, handler.handlers)
        router.use(
          handler.path,
          ...[
            ...(handler.ctxMiddlewares || []).map(f => f(ctx)),
            ...(handler.middlewares || []),
            pathRouter
          ]
        )
      } else if (handler.method && handler.fn) {
        router[handler.method](
          handler.path,
          ...[
            ...(handler.ctxMiddlewares || []).map(f => f(ctx)),
            ...(handler.middlewares || []),
            wrap(handler.fn)
          ]
        )
      }
    })
  }

  addHandlers(ctx.app, handlers)

  return Promise.resolve(ctx)
}

export const createServer = (handlers: Array<Handler>) => each(createApp(), createHandler(handlers))

const sendResponse = (__: any, res: any) => (rawPayload: RequestOutput) => {
  if (!rawPayload) {
    return res.status(204).end()
  }

  let payload = rawPayload

  if (payload.cookies) {
    forEachObjIndexed((cookieValue, cookieName) => {
      if (cookieName[0] === '-') {
        res.clearCookie(cookieName.toString().substring(1), cookieValue)
      } else if (cookieValue) {
        res.cookie(cookieName, cookieValue.value, cookieValue.options)
      }
    }, payload.cookies)

    payload = omit(['cookies'], rawPayload)
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

export class HttpError extends Error {
  code: number
  extra?: string

  constructor(code: number, message: string, extra?: string) {
    super()
    this.name = 'HttpError'
    this.message = message
    this.code = code
    this.extra = extra
  }
}

const isHttpError = (err: Error): err is HttpError => err.name === 'HttpError'

const sendErrorResponse = (__: any, res: any) => (err: Error | HttpError) => {
  if (isHttpError(err)) {
    return res.status(err.code).json({
      status: 'error',
      message: err.message,
      ...(err.extra && { extra: err.extra })
    })
  }

  if (err.message.includes('Expectation')) {
    return res
      .status(417)
      .json({
        status: 'error',
        message: err.message
      })
      .end()
  }

  if (err.message.includes('NotFound')) {
    return res
      .status(404)
      .json({
        status: 'error',
        message: err.message
      })
      .end()
  }

  if (err.message.includes('Unauthorized')) {
    return res
      .status(401)
      .json({
        status: 'error',
        message: err.message
      })
      .end()
  }

  if (err.message.includes('Forbidden')) {
    return res
      .status(403)
      .json({
        status: 'error',
        message: err.message
      })
      .end()
  }

  if (err.message.includes('Invalid')) {
    return res
      .status(400)
      .json({
        status: 'error',
        message: err.message
      })
      .end()
  }

  return res
    .status(500)
    .json({
      status: 'error',
      message: err.message
    })
    .end()
}

const wrap = (fn: AsyncFunction) => (req: any, res: any) => {
  return fn({
    ...res.ctx,
    body: req.body,
    headers: req.headers,
    params: req.params,
    user: req.user,
    query: req.query,
    req,
    res
  })
    .then(sendResponse(req, res))
    .catch(sendErrorResponse(req, res))
}

const validateIO = (errorType: string, propName?: string) => (
  validator: SyncPredicate
): AsyncFunction => (ctx: Context) => {
  const valid = propName ? validator(ctx[propName]) : validator(ctx)

  if (!valid) {
    return Promise.reject(new HttpError(400, errorType))
  }

  return Promise.resolve(ctx)
}

export const validateRequest = validateIO('InvalidRequest', 'body')
export const validateResponse = validateIO('InvalidResponse')
export const entrypoint = wrap
