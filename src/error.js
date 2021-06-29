import {deflate} from 'pako'
// import * as deflate from 'pako/dist/pako_deflate.es5.js'
// import deflate from 'pako/dist/pako_deflate.js'

// console.log(deflate)

/* eslint-disable no-debugger */
class Sentry {
    constructor(option) {
        // 添加一个用户行为栈
        // 初始化项目
        this.record = []
        if (!(option.dsn && option.release)) {
            console.error('sentry init need dsn and release params')
        }
        // 添加一个黑名单，用于记录异常场景的错误以减少服务端压力，比如重复上报错误
        this.blackList = []
        this.dsn = option.dsn
        this.release = option.release
        this.environment = option.environment
        this.cElA = option.clickElementAttr
        // this.rewriteEvent()
        // 重写xhr和fetch api，拦截网络错误并上报
        if (!option.disableReqReport) {
            this.errorFetchInit()
            this.errorAjaxInit()
        }
        // 监听错误
        this.errorListen()
        // 监听用户行为
        this.collectMess()
    }
    // 初始化项目
    // init(option) {
    //     if (!(option.dsn && option.release)) {
    //         console.error('sentry init need dsn and release params')
    //     }
    //     this.dsn = option.dsn
    //     this.release = option.release
    //     this.environment = option.environment
    //     this.cElA = option.clickElementAttr
    //     // this.rewriteEvent()
    //     this.errorListen()
    // }

    // 重写fetch，来监听请求错误
    errorFetchInit () {
        if(!window.fetch) return;
        let _oldFetch = window.fetch;
        const _this = this
        window.fetch = function (...arg) {
            return _oldFetch.apply(this, arg)
            .then(res => {
                // debugger
                if (!res.ok) { // 当status不为2XX的时候，上报错误
                    /**
                     * 400 500 错误会经过这里
                    */
                    const op = arg[1]
                    let method = 'GET'
                    if (op && op.method) {
                        method = op.method.toUpperCase()
                    }
                    _this.networkUpload({message:res.statusText, method, reqUrl: arg[0], resCode: `${res.status}`})
                }
                return res;
            })
            // 当fetch方法错误时上报
            .catch((error) => {
                // debugger
                // console.log(error.message, '=====')
                // 服务连不上，跨域，断网请求错误会到这里
                // 断网不能正常上传成功
                // error.message,
                // error.stack
                // 抛出错误并且上报
                const op = arg[1]
                let method = 'GET'
                if (op && op.method) {
                    method = op.method.toUpperCase()
                }
                _this.networkUpload({message:error.message, method, reqUrl: arg[0], resCode: 0})
                /**
                 * fetch 错误虽然没有意思，但是不能吃掉，否则外层不能正常捕获错误。
                 * 但是ios上fetch错误不是failed to fetch错误，统一拦截，不产生新错误.
                 * 必须抛出错误，如果吞掉错误会导致，外层fetch的catch不能正常获取到错误
                 */
                // throw error;
                throw new Error('Failed to fetch')
            })
        }
    }

    // 重写xhr，来监听请求错误
    errorAjaxInit () {
        let protocol = window.location.protocol;
        if (protocol === 'file:') return;
        // 处理XMLHttpRequest
        if (!window.XMLHttpRequest) {
            return;
        }
        let xmlhttp = window.XMLHttpRequest;
        // 保存原生send方法
        let _oldSend = xmlhttp.prototype.send;
        let _oldOpen = xmlhttp.prototype.open;
        const _this = this
        let _handleEvent = function (event) {
            if (event && event.currentTarget && event.currentTarget.status !== 200) {
              if (event.type === 'error') {
                    // 服务器连不上，断网，跨域
                    console.log('断网,跨域')
                    /**
                     * 断网不能正常上传成功，所以能正常上传成功的是跨域或者服务器连接不上
                     */
                    // debugger
                    _this.networkUpload({message: 'interface cors or can not connect to server', method: this.method, reqUrl: this.url, resCode: 0})
              } else if (event.type === 'timeout') {
                  // 超时
                  console.log('超时')
                  // debugger
                  _this.networkUpload({message: 'interface timeout', method: this.method, reqUrl: this.url, resCode: 0})
              } else if (event.type === 'abort') {
                // 取消请求
                  console.log('取消请求')
                // debugger
                  _this.networkUpload({message: 'interface had been abort', method: this.method, reqUrl: this.url, resCode: 0})
              } else {
                    // 400， 500等状态错误
                    console.log('400,500')
                    _this.networkUpload({method: this.method, reqUrl: this.url, resCode: `${event.currentTarget.status}`})
              }
                // event.currentTarget 即为构建的xhr实例
                // event.currentTarget.response
                // event.currentTarget.responseURL || event.currentTarget.ajaxUrl
                // event.currentTarget.status
                // event.currentTarget.statusText
            }
        }
        xmlhttp.prototype.send = function (...arg) {
            this.addEventListener('error', _handleEvent); // 失败
            this.addEventListener('load', _handleEvent);  // 完成
            this.addEventListener('abort', _handleEvent); // 取消
            // 超时回调
            // TODO
            return _oldSend.apply(this, arg);
        }
        xmlhttp.prototype.open = function (...arg) {
            // console.log(arguments, '==method==', this)
            this.method = arg[0]
            this.url = arg[1]
            return _oldOpen.apply(this, arg)
        }
    }
    /**
     * 重写addEventListener方法
     * 因为js跨域报错，window.onerror 会将这类错误统一展示为 Script error
     * 但是try/catch 可以绕过
     */
    // rewriteEvent() {
    //     const originAddEventListener = EventTarget.prototype.addEventListener
    //     EventTarget.prototype.addEventListener = (type, listener, options) => {
    //         const wrappedListener = (...args) => {
    //             try {
    //                 return listener.apply(this, args)
    //             } catch(err) {
    //                 // 拿到err 信息 统一处理
    //                 throw err
    //             }
    //         }
    //         return originAddEventListener.call(this, type, wrappedListener, options)

    //     }
    // }
    /**
     * 错误监听,全局错误监听，和没有处理的promise错误监听
     */
    errorListen() {
        const _this = this
        // 全局js错误捕获
        window.onerror = function(message, source, lineno, colno, err) {
          // debugger
            // console.log('----window.onerror----', message, source, lineno, colno, err)
            // const s = source.split('/')
            // console.log(s, '====')
            /**
             * onerror 的参数source包含域名，比如：
             * http://baidu.com/js/app.0d18de06.js
             */
            if (err) {
              // 有正常的err错误对象
              if (_this.isError(err)) {
                const error = _this.parseError(err)
                _this.upload({message: error.message, name: error.name, source: error.sourceURL, stack: error.stack, colno: error.column, lineno: error.line})
              }
            } else {
              // 内部报错没有err对象
              // 内部报错source 为当前页面地址，没有意义，所以上传空，后端处理时跳过源码解析阶段
              // 比如：ResizeObserver loop limit exceeded， colno: 0, lineno: 0
              _this.upload({message, name: '', source: '',stack: 'null', colno, lineno})
            }
            // _this.upload(ob)
            // _this.upload({message, name: err.name, source, colno, lineno})
            // this.captureException({message,name: error.name, source, colno,lineno})
        }
        // 捕获没处理的promise错误
        /**
         * ios上跨域错误
         * Origin http://xx.xx.xx:3001 is not allowed by Access-Control-Allow-Origin.
         * Fetch API cannot load http://xx.xx.xx:8010/ due to access control checks.
         * Failed to load resource: Origin http://xx.xx.xx:3001 is not allowed by Access-Control-Allow-Origin.
         * 
         * The error you provided does not contain a stack trace.
         */
        window.addEventListener('unhandledrejection', event => {
            // debugger
            // failed to fetch 的promise错误没有任何有用信息，拦截上报。在fetch封装里上报能获取更详细的信息。
            if (event.reason.message === 'Failed to fetch') return
            // TODO
            // 未捕获的promise对象可以自定义错误信息，归为一个分类
            // console.log(event.reason)
            _this.captureException(event.reason)
            // this.captureException({message: error.message, name: error.name, source: error.sourceURL, colno: error.column,lineno: error.line})
        })
        // 资源加载错误捕获
        /**
         * 当一项资源（如<img>或<script>）加载失败，加载资源的元素会触发一个Event接口的error事件，
         * 并执行该元素上的onerror()处理函数。这些error事件不会向上冒泡到window，
         * 不过能被window.addEventListener在捕获阶段捕获。
         */
        window.addEventListener('error', event => {
            // 过滤js error
            let target = event.target || event.srcElement;
            let isElementTarget = target instanceof HTMLScriptElement || target instanceof HTMLLinkElement || target instanceof HTMLImageElement;
            // if (!isElementTarget) return false;
            if (isElementTarget) {
              // 资源报错
              // 上报资源地址
              let url = target.src || target.href;
              // console.log('===event====', event.path, url)
              const elePath = event.path || (event.composedPath && event.composedPath()) || this.composedPath(event.target);
              const path = elePath.map(item=>item.localName).filter(i=> Boolean(i))
              _this.staticUpload({reqUrl: url, path: path.reverse().join(',')})
            }
            // 上报资源地址
            // let url = target.src || target.href;
            // // console.log('===event====', event.path, url)
            // const path = event.path.map(item=>item.localName).filter(i=> Boolean(i))
            // _this.staticUpload({reqUrl: url, path: path.reverse().join(',')})

            // console.log(url);
            // return true
        }, true);
    }
    /**
     * 解析error对象，返回source，col，line，message， url等信息
     * react 错误边界里没有现成的这些信息，需要从error对象中解析
     */
    parseError(error) {
        if(error.sourceURL && error.line && error.column) {
            // mac 平台src裁剪成文件
            const s = error.sourceURL.split('/').pop()
            return {
                message: error.message,
                name: error.name,
                sourceURL: s,
                line: error.line,
                column: error.column,
                stack: error.stack
            }
        }
        if (!error.stack){
          return {
            message: error.message,
            name: error.name,
            sourceURL: '',
            line: 0,
            column: 0,
            stack: 'null'
          }
        }
        // ios直接拿得到column，line， soureUrl参数
        /**
         * 第一种类型错误
         * 0: "Error: 自定义错误"
         *  1: "    at r.value (http://localhost:3002/_next/static/erQN-y3_wsqT5FBdMKjv-/pages/test.js:1:982)"
         *  2: "    at $a (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:418831)"
         *   3: "    at za (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:421507)"
         *   4: "    at http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:434736"
         *   5: "    at Object.t.unstable_runWithPriority (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:3961)"
         *   6: "    at Ru (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:434671)"
         *   7: "    at Au (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:434447)"
         *   8: "    at Cu (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:433792)"
         *   9: "    at ku (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:432813)"
         *   10: "    at Qa (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:431687)"
         */

        /**
         * 第二种类型错误
         * 0: "Error: qqqqq"
         *   1: "    at http://localhost:3002/_next/static/erQN-y3_wsqT5FBdMKjv-/pages/test.js:1:889"
         *   2: "    at Object.<anonymous> (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:336943)"
         *   3: "    at d (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:336981)"
         *   4: "    at http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:337619"
         *   5: "    at E (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:337708)"
         *   6: "    at C (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:338144)"
         *   7: "    at O (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:337956)"
         *   8: "    at R (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:339044)"
         *   9: "    at kn (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:366470)"
         *   10: "    at Iu (http://localhost:3002/_next/static/chunks/vendors.9ec3ed5cd0924ed4d7b7.js:1:434861)"
         */

        /**
         * 第三种情况错误
         * 0: "Error: timeout of 6000ms exceeded"
         *   1: "    at createError (webpack-internal:///./node_modules/axios/lib/core/createError.js:16:15)"
         *   2: "    at XMLHttpRequest.handleTimeout (webpack-internal:///./node_modules/axios/lib/adapters/xhr.js:95:14)"
         */

        /**
         * 第一种错误最后有), 第二种错误最后没有), 所以解析时要考虑兼容性
         */

        /**
         * 生成的map文件没有路径，只有最后一个文件名.map
         * 所以截取时，只需要截取最后的文件名
         */
        const stackArr = error.stack.split('\n')
        let fileInfo = stackArr[1].split('/').pop()
        if (fileInfo.slice(-1) === ')') {
          fileInfo = fileInfo.slice(0, -1)
        }
        const [file, line, column] = fileInfo.split(':');
        // console.log(file, line, column, error.message, error.name);
        return {
            message: error.message,
            name: error.name,
            sourceURL: file,
            line: isNaN(+line) ? undefined : +line,
            column: isNaN(+column) ? undefined: +column,
            stack: error.stack
        }
    }
    // 对外暴露的接口，接收err对象
  captureException(err, { tag } = {}) {
      // console.log('1231233123')
        // debugger
        this.errorUpload(err, {tag})
    }
    // 错误日志上报, 解析error对象，生成name, message, source, col, line 等信息
    errorUpload(err, {tag} = {}) {
        if (this.isError(err)) {
            const error = this.parseError(err)
            this.upload({message: error.message, name: error.name, source: error.sourceURL, stack: error.stack, colno: error.column, lineno: error.line}, { tag })
        }
    }
    // 判断是否是error对象，不是error对象不上报
    isError(err) {
        if (typeof err !== 'object') return false
        if (err instanceof Error) return true
        return false
    }

    // js错误上报事件
    upload({message, name, source, colno, lineno, level='error'}, { tag } = {}) {
        // 读取当前页面url
        // const url = window.location.href
        const errId = this.getErrId('js', {message, name, source, colno, lineno})
        const bool = this.shouldUpload(errId)
        if (!bool) return
        const hashId = this.getHashId()
        const query = this.paramAssembly({type: 'js', message, name, source, colno, lineno, level, hashId}, {tag})
        this.addError(hashId, errId, 'j')
        this.requestImg(query)
    }
    // 静态资源加载错误事件上报
    staticUpload({reqUrl, path, level='error'}, {tag} ={}) {
        const errId = this.getErrId('static', {reqUrl, path})
        // console.log('====', errId)
        const bool = this.shouldUpload(errId)
        if (!bool) return
        const hashId = this.getHashId()
        const query = this.paramAssembly({type: 'static', message: `resource load error`, reqUrl, path, hashId, level}, {tag})
        this.addError(hashId, errId, 's')
        this.requestImg(query)
    }
    // 网络请求错误事件上报
    networkUpload({message="interface response error", method, reqUrl, resCode, level="error"}, {tag}={}) {
        const errId = this.getErrId('network', {message, method, reqUrl, resCode})
        // console.log('====', errId)
        const bool = this.shouldUpload(errId)
        if (!bool) return
        const hashId = this.getHashId()
        const query = this.paramAssembly({type: 'network', message, method, reqUrl, resCode, hashId, level}, {tag})
        this.addError(hashId, errId, 'n')
        this.requestImg(query)
    }
    // 参数组装
    paramAssembly(option, { tag }) {
        const url = window.location.href
        const op = {
          ...option,
          url,
          environment: this.environment,
          release: this.release,
          tags: tag
        }
        // let rUrl = `${this.dsn}/e.gif?environment=${this.environment}&release=${this.release}&url=${url}&tags=${JSON.stringify(tag || {})}`
        // for (const key in option) {
        //     rUrl += `&${key}=${option[key]}`
        // }
        // return rUrl
        return op
    }
    /**
     * 获取hash id
     */
    getHashId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36)
    }
    /**
     * 获取每一条记录的唯一id
     */
    getErrId(type, {message, name, source, colno, lineno, reqUrl, path, method, resCode}) {
        let errId = ''
        if (type === 'js') {
            errId = `${type}${message}${name}${source}${colno}${lineno}`
        } else if (type === 'static') {
            errId = `${type}${reqUrl}${path}`
        } else if (type === 'network') {
            errId = `${type}${message}${reqUrl}${method}${resCode}`
        }
        return errId
    }
    // 行为数据写入cookie
    /**
     * 行为数据的量可能很大，放在url上不太好，url get的参数长度比cookie小。
     */
    setCookie(cname, cvalue, exdays) {
        var d = new Date();
        d.setTime(d.getTime()+(exdays*24*60*60*1000));
        var expires = "expires="+d.toGMTString();
        document.cookie = cname + "=" + cvalue + "; " + expires;
    }

    // btoa base64编码方式
    btoa(string) {
      // const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const b64 = 'JqD9h1Q6OWFlHsBx5S8Et_UwXz3fKTkVYGLdAa-oRpIjyC0eNg4ZicMrm72vnuPb';
      string = String(string);
        var bitmap, a, b, c,
            result = "", i = 0,
            rest = string.length % 3; // To determine the final padding

        for (; i < string.length;) {
            if ((a = string.charCodeAt(i++)) > 255
                    || (b = string.charCodeAt(i++)) > 255
                    || (c = string.charCodeAt(i++)) > 255)
                throw new TypeError("Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.");

            bitmap = (a << 16) | (b << 8) | c;
            result += b64.charAt(bitmap >> 18 & 63) + b64.charAt(bitmap >> 12 & 63)
                    + b64.charAt(bitmap >> 6 & 63) + b64.charAt(bitmap & 63);
        }

        // If there's need of padding, replace the last 'A's with equal signs
        return rest ? result.slice(0, rest - 3) : result;
    }

    Uint8ToString(u8a){
      var CHUNK_SZ = 0x8000;
      var c = [];
      for (var i=0; i < u8a.length; i+=CHUNK_SZ) {
        // console.log(i, '=====iiii=====', u8a.length)
        c.push(String.fromCharCode.apply(null, u8a.subarray(i, i+CHUNK_SZ)));
      }
      return c.join("");
    }
    // 发起带参数的请求
    requestImg(query) {
        // this.setCookie('user-record', JSON.stringify(this.record))
        const r = this.record.map(i => {
          const ob = {
            t: i.type,
            d: i.data,
            c: i.createTime
          }
          if (i.message) {
            ob.m = i.message
          }
          return ob
        })
        // 只记录最近的200次记录
        query.record = r.slice(-200)
        // console.log(query, '909090')
        // var output = window.pako.deflate(JSON.stringify(query));
        var output = deflate(JSON.stringify(query));
        // console.log(output, '===output===')
        // var ascii = new Uint8Array(output);
        // console.log(ascii)
        // const a = String.fromCharCode.apply(null, output)
        const a = this.Uint8ToString(output)
        // console.log(a, '====aaaaaaaaa====', a.length, a.length % 3)
        var b64encoded = this.btoa(a);
        // console.log(output);
        // console.log('90909090909', b64encoded, b64encoded.length)
        // const b = this.atob(b64encoded)
        // console.log(b, '====bbbbbbb=====', b.length, b.length % 3)

        // this.base64ToArrayBuffer(b64encoded);
        // const arr = this.base64ToArrayBuffer(b64encoded);
        // console.log('arr', arr)
        // const w = window.pako.inflate(arr, { to: "string" });
        // console.log(w, '121212121212')

        // const str = `${queryString}&record=${JSON.stringify(r)}`
        const str = `${this.dsn}/e.gif?p=${b64encoded}`
        const img = new Image()
        img.src = str
    }
    // 防止代码问题导致用户端一个错误不停地重复抛出。
    /**
     * 由于会上传用户行为（包含错误行为），所以对于循环报错的错误不应该上传给服务端（给服务端压力，每个用户，同一个错误不停上报，服务压力很大）
     * 对于记录用户行为，同一个错误记录太多对其他行为有干扰，因为受到cookie和http get长度限制，用户行为数据不能太大。
     * 所以用户行为数据暂定200条，如果超过200条则截取，只能截取最新的记录（因为如果前200条记录没有发生错误的话，这样错误记录就被截掉，用户记录就没意义了）
     * 对于同一个错误的定义是，下面所有参数的值都相同，所以根据下面这些值拼接成一个字符串就行。
     * 又要防止多个错误交替重复上报，所以这里策略是统计行为数据里所有的错误记录。对于用一个用户，同一个错误上报次数大于10次，则不在上报该错误。
     * 有的多个错误和短时间内触发，所以不能搞简单的节流，可能会漏掉需要上报的错误。
     * 所以对用户行为栈反向遍历，如果发现之前上报的错误与本次错误相同且上报时间差在1s以内，我们认为是重复上报；
     * 同时如果最近的三条记录都是与本次错误相同，可以认为可能是用户定时器里不停的报错，或者用户连续点击同一个按钮报错，获取页面公共方法报错。此时可以忽略
     */
    shouldUpload(errId) {
        // console.log('23242424')
        // 如果被黑名单记录的错误，直接拦截
        if (this.blackList.includes(errId)) return false
        // 最近1s内的三次错误行为与本次行为相同
        const r = this.record.slice(0)
        // 记录当前遍历的index值
        let mapIndex = r.length
        // 记录相同错误的列表
        const re = []
        while(r.length > 0 && re.length < 2) {
          const item = r.pop()
          // 如果是错误的类型, 且错误类型相同
          if (item.type === 'e' && item.errId === errId) {
            re.unshift({data: item, index: mapIndex - 1})
          }
          mapIndex = mapIndex - 1
        }
        // 之前发生的相同错误小于两次直接放行
        if (re.length < 2) return true

        // 一秒内触发3次相同错误被认为是异常的，应该拦截以减少服务器压力
        if ((Date.now() - re[0].data.createTime) <=1000) {
          // 拦截的错误类型加入黑名单
          this.blackList.push(errId)
          // 给record里这一类错误类型打上循环异常报错的标签
          re.forEach(rr => {
            this.record[rr.index].data.isCycle = true
          })
          return false
        }
        return true
    }

    composedPath (el) {
      var path = [];      
      while (el) {     
          path.push(el);      
          if (el.tagName === 'HTML') {      
              path.push(document);
              path.push(window);      
              return path;  
          }
        el = el.parentElement;
      }
    }

    // 搜集用户行为数据
    collectMess() {
      document.addEventListener('click', (evt) => {
          const el = evt.target
          const tn = el.tagName
          const attr = el.getAttribute(this.cElA)
          // console.log(tn, '===tagname===', attr)
          /**
           * 并不是所有的元素点击都进行点击监听
           * 否则用户随意点击会产生许多无用的点击链接
           * 只对a标签和button标签的点击进行监听
           */
          if (tn !== 'A' && tn !== 'BUTTON' && attr === null) return
          const pl = el.parentElement
          let index = 0
          if (pl) {
              // index = [].indexOf.call(pl.children, el)
              for (let i = 0,l=pl.children.length; i< l; i++) {
                if (el === pl.children[i]) {
                  break;
                }
                if (pl.children[i].nodeName === tn) {
                  index += 1
                }
              }
          }
          // console.log(el, '=======', evt.path, index)
          // function composedPath (el) {
          //   var path = [];      
          //   while (el) {     
          //       path.push(el);      
          //       if (el.tagName === 'HTML') {      
          //           path.push(document);
          //           path.push(window);      
          //           return path;  
          //       }
          //     el = el.parentElement;
          //   }
          // }
          const elePath = evt.path || (evt.composedPath && evt.composedPath()) || this.composedPath(evt.target);
          let select = ''
          if (elePath) {
            const path = elePath.map(item=>item.localName).filter(i=> Boolean(i))
            // debugger
            // console.log(path, '78787877878')
            path.splice(-2, 2)
            // path.shift()
            /**
             * querySelect 方法在nth-child 使用时用问题，
             * 比如 ul里含有li和button，li:nth-child(1)正常
             * button:nth-child(1) 有问题，既子元素中含有不同的节点类型时会有问题。所以返回的select
             * 只能作为参考，不能直接作为选择器使用
             *
             */
            select = `${path.reverse().join('>')}:${index+1}`
          }
          
          // console.log(select, '====a=====')
          this.addClick(select)
      }, true)
  }

    // 发生错误时记录
    addError(hashId, errId, type) {
        this.record.push(
          /**
           * 为了缩短上传数据大小，字符串都使用简写，在响应时做数据转换
           * message 在响应接口时添加
           * Date.now() 返回的是毫秒，这里没必要返回毫秒数
          //  */
          // {
          //   t: 'e',
          //   d: hashId,
          //   errId,
          //   c: Date.now()
          // }
          {

            type: 'e',
            data: {h: hashId, t: type},
            errId,
            createTime: Date.now(),
            // message: '发生了一条错误'
          }
        )
    }

    // 向行为栈中添加一条用户点击记录
    addClick(data) {
        this.record.push(
          /**
           * 为了缩短上传数据大小，字符串都使用简写，在响应时做数据转换
           * message 在响应接口时添加
           */
          // {
          //   t: 'c',
          //   d: data,
          //   c: Date.now()
          // }
            {
                type: 'c',
                data: data,
                createTime: Date.now(),
                // message: '执行了一条点击记录'
            }
        )
    }

    // 向行为栈中添加一条页面路由跳转记录
    addRouterChange(url) {
        this.record.push(
          /**
           * 为了缩短上传数据大小，字符串都使用简写，在响应时做数据转换,
           * message 在响应接口时添加
           */
          {
            type: 'r',
            data: url,
            createTime: Date.now(),
            // message: '路由切换了'
          }
        )
    }
    // 自定义一种用户行为
    addCustomRecord({type, data, message}) {
        this.record.push(
          {
            type,
            data,
            createTime: Date.now(),
            message
          }
        )
    }
}

export default Sentry
