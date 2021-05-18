import Sentry from './error'

// sentry 实例
let instance = null
// 是否上报开关
let isUpload = false

// 包装函数
const wrap = cb => {
  // console.log('454545')
  if (isUpload) {
    if (instance === null) {
      return console.error('需要先调用init方法初始化后，再调用该方法上报')
    } else {
      cb()
    }
  }
}

// 暴露初始化sentry方法
export const errorInit = option => {
  if (option.isUpload) {
    isUpload = true
    instance = new Sentry(option)
  }
}

// 手动上报错误的接口
// export const captureException = (err, {tag}={}) => {
//     // 未初始化实例就调用该方法异常处理
//     if (instance === null) {
//         return console.error('需要先调用init方法初始化后，再调用该方法上报')
//     }
//     instance.captureException(err, {tag})
// }
export const captureException = (err, { tag } = {}) => {
  wrap(() => instance.captureException(err, {tag}))
}

// 静态资源加载失败的接口
// export const captureStaticError = ({reqUrl, path, level}, {tag}={}) => {
//     if (instance === null) {
//         return console.error('需要先调用init方法初始化后，再调用该方法上报')
//     }
//     instance.staticUpload({reqUrl, path, level}, {tag})
// }
export const captureStaticError = ({reqUrl, path, level}, {tag}={}) => {
  wrap(() => instance.staticUpload({reqUrl, path, level}, {tag}))
}

// 网络请求失败接口
// export const captureNetworkError = ({method, reqUrl, resCode, level}, {tag}={}) => {
//     if (instance === null) {
//         return console.error('需要先调用init方法初始化后，再调用该方法上报')
//     }
//     instance.networkUpload({method, reqUrl, resCode, level}, {tag})
// }
export const captureNetworkError = ({method, reqUrl, resCode, level}, {tag}={}) => {
  wrap(() => instance.networkUpload({method, reqUrl, resCode, level}, {tag}))
}

/**
 * 手动添加用户行为记录
 */


// 向行为栈中添加一条用户点击记录
// export const addClick = (data) => {
//   if (instance === null) {
//     return console.error('需要先调用init方法初始化后，再调用该方法上报')
//   }
//   instance.addClick(data)
// }
export const addClick = (data) => {
  wrap(() => instance.addClick(data))
}

// 向行为栈中添加一条路由切换记录
// export const addRouterChange = url => {
//   if (instance === null) {
//     return console.error('需要先调用init方法初始化后，再调用该方法上报')
//   }
//   instance.addRouterChange(url)
// }
export const addRouterChange = url => {
  wrap(() => instance.addRouterChange(url))
}


// 自定义一种用户行为
// export const addCustomRecord = ({ type, data, message }) => {
//   if (instance === null) {
//     return console.error('需要先调用init方法初始化后，再调用该方法上报')
//   }
//   instance.addCustomRecord({ type, data, message })
// }
export const addCustomRecord = ({ type, data, message }) => {
  wrap(() => instance.addCustomRecord({ type, data, message }))
}
