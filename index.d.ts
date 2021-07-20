interface OP {
  tag?: object
}

interface Param {
  isUpload: boolean
  dsn: string
  release: string
  environment: string
  cElA?: string
  disableReqReport?: boolean
}
// export const errorInit: ({ isUpload: boolean, dsn: string, release: string, environment: string, cElA?: string }) => void
export const errorInit: (op: Param) => void

export const captureException: (err: Error, op?: OP) => void

export const captureStaticError: ({ reqUrl: string, path: string, level: string }, op?: OP) => void

export const captureNetworkError: ({ method: string, reqUrl: string, resCode: string, level: string }, op?: OP) => void

export const addClick: (data: object) => void

export const addScroll: (data: object) => void

export const addRouterChange: (url: string) => void

export const addCustomRecord: ({type: string, data: object, message: string}) => void