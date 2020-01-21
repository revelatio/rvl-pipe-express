import { AsyncFunction, SyncPredicate } from 'rvl-pipe'
export declare const startListening: () => AsyncFunction
export declare const stopListening: () => AsyncFunction
export declare const createServer: (handlers: any[]) => AsyncFunction
export declare const validateRequest: (
  validator: SyncPredicate
) => AsyncFunction
export declare const validateResponse: (
  validator: SyncPredicate
) => AsyncFunction
export declare const entrypoint: (
  fn: AsyncFunction
) => (req: any, res: any) => Promise<any>
