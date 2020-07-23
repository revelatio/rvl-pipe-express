import { Context, AsyncFunction, SyncPredicate } from 'rvl-pipe';
export declare const startListening: () => AsyncFunction;
export declare const stopListening: () => AsyncFunction;
export interface RequestInput {
    body?: any;
    headers: any;
    params?: any;
    user?: any;
    query?: any;
    req: any;
    res: any;
}
export interface CookieSetter {
    value: string;
    options: {
        [key: string]: string;
    };
}
export interface RequestOutput {
    cookies?: {
        [key: string]: CookieSetter | null;
    };
    redirect?: string;
}
export interface Handler {
    handlers?: Handler[];
    path: string;
    middlewares?: any[];
    ctxMiddlewares?: Array<(ctx: Context) => any>;
    method?: 'get' | 'post' | 'patch' | 'put' | 'delete' | 'use';
    fn?: (inputContext: RequestInput) => Promise<RequestOutput>;
}
export declare const createServer: (handlers: Array<Handler>) => AsyncFunction;
export declare const validateRequest: (validator: SyncPredicate) => AsyncFunction;
export declare const validateResponse: (validator: SyncPredicate) => AsyncFunction;
export declare const entrypoint: (fn: AsyncFunction) => (req: any, res: any) => Promise<any>;
