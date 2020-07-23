import express, { Router } from 'express'
import cookieParser from 'cookie-parser'
import bodyParser from 'body-parser'
import { isEmpty, omit, forEachObjIndexed } from 'ramda'
import {
  Context,
  AsyncFunction,
  each,
  ContextError,
  SyncPredicate
} from 'rvl-pipe'

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

const createHandler = (handlers: Handler[]): AsyncFunction => (
  ctx: Context
) => {
  const addHandlers = (router: Router, handlers: Handler[]) => {
    handlers.forEach((handler: Handler) => {
      if (handler.handlers) {
        const pathRouter = ctx.express.Router()
        addHandlers(pathRouter, handler.handlers)
        router.use(
          handler.path,
          ...[
            ...(handler.middlewares || []),
            ...(handler.ctxMiddlewares || []).map(f => f(ctx)),
            pathRouter
          ]
        )
      } else if (handler.method && handler.fn) {
        router[handler.method](
          handler.path,
          ...[
            ...(handler.middlewares || []),
            ...(handler.ctxMiddlewares || []).map(f => f(ctx)),
            wrap(handler.fn)
          ]
        )
      }
    })
  }

  addHandlers(ctx.app, handlers)

  return Promise.resolve(ctx)
}

export const createServer = (handlers: Array<Handler>) =>
  each(createApp(), createHandler(handlers))

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

const sendErrorResponse = (__: any, res: any) => (err: ContextError) => {
  if (err.message.includes('Expectation')) {
    return res
      .status(417)
      .send(err.message)
      .end()
  }

  if (err.message.includes('NotFound')) {
    return res
      .status(404)
      .send(err.message)
      .end()
  }

  if (err.message.includes('Unauthorized')) {
    return res
      .status(401)
      .send(err.message)
      .end()
  }

  if (err.message.includes('Forbidden')) {
    return res
      .status(403)
      .send(err.message)
      .end()
  }

  if (err.message.includes('Invalid')) {
    return res
      .status(400)
      .send(err.message)
      .end()
  }

  return res
    .status(500)
    .send(err.message)
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
    .catch(err => sendErrorResponse(req, res)(err))
}

const validateIO = (errorType: string, propName?: string) => (
  validator: SyncPredicate
): AsyncFunction => (ctx: Context) => {
  const valid = propName ? validator(ctx[propName]) : validator(ctx)

  if (!valid) {
    return Promise.reject(new ContextError(errorType, ctx))
  }

  return Promise.resolve(ctx)
}

export const validateRequest = validateIO('InvalidRequest', 'body')
export const validateResponse = validateIO('InvalidResponse')
export const entrypoint = wrap
