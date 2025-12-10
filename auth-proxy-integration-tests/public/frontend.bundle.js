// ../../node_modules/xhook/es/main.js
var slice = (o, n) => Array.prototype.slice.call(o, n);
var result = null;
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  result = self;
} else if (typeof global !== "undefined") {
  result = global;
} else if (window) {
  result = window;
}
var windowRef = result;
var documentRef = result.document;
var UPLOAD_EVENTS = ["load", "loadend", "loadstart"];
var COMMON_EVENTS = ["progress", "abort", "error", "timeout"];
var depricatedProp = (p) => ["returnValue", "totalSize", "position"].includes(p);
var mergeObjects = function (src, dst) {
  for (let k in src) {
    if (depricatedProp(k)) {
      continue;
    }
    const v = src[k];
    try {
      dst[k] = v;
    } catch (error) {}
  }
  return dst;
};
var proxyEvents = function (events, src, dst) {
  const p = (event) =>
    function (e) {
      const clone = {};
      for (let k in e) {
        if (depricatedProp(k)) {
          continue;
        }
        const val = e[k];
        clone[k] = val === src ? dst : val;
      }
      return dst.dispatchEvent(event, clone);
    };
  for (let event of Array.from(events)) {
    if (dst._has(event)) {
      src[`on${event}`] = p(event);
    }
  }
};
var fakeEvent = function (type) {
  if (documentRef && documentRef.createEventObject != null) {
    const msieEventObject = documentRef.createEventObject();
    msieEventObject.type = type;
    return msieEventObject;
  }
  try {
    return new Event(type);
  } catch (error) {
    return { type };
  }
};
var EventEmitter = function (nodeStyle) {
  let events = {};
  const listeners = (event) => events[event] || [];
  const emitter = {};
  emitter.addEventListener = function (event, callback, i) {
    events[event] = listeners(event);
    if (events[event].indexOf(callback) >= 0) {
      return;
    }
    i = i === void 0 ? events[event].length : i;
    events[event].splice(i, 0, callback);
  };
  emitter.removeEventListener = function (event, callback) {
    if (event === void 0) {
      events = {};
      return;
    }
    if (callback === void 0) {
      events[event] = [];
    }
    const i = listeners(event).indexOf(callback);
    if (i === -1) {
      return;
    }
    listeners(event).splice(i, 1);
  };
  emitter.dispatchEvent = function () {
    const args = slice(arguments);
    const event = args.shift();
    if (!nodeStyle) {
      args[0] = mergeObjects(args[0], fakeEvent(event));
      Object.defineProperty(args[0], "target", {
        writable: false,
        value: this,
      });
    }
    const legacylistener = emitter[`on${event}`];
    if (legacylistener) {
      legacylistener.apply(emitter, args);
    }
    const iterable = listeners(event).concat(listeners("*"));
    for (let i = 0; i < iterable.length; i++) {
      const listener = iterable[i];
      listener.apply(emitter, args);
    }
  };
  emitter._has = (event) => !!(events[event] || emitter[`on${event}`]);
  if (nodeStyle) {
    emitter.listeners = (event) => slice(listeners(event));
    emitter.on = emitter.addEventListener;
    emitter.off = emitter.removeEventListener;
    emitter.fire = emitter.dispatchEvent;
    emitter.once = function (e, fn) {
      var fire = function () {
        emitter.off(e, fire);
        return fn.apply(null, arguments);
      };
      return emitter.on(e, fire);
    };
    emitter.destroy = () => (events = {});
  }
  return emitter;
};
var CRLF = "\r\n";
var objectToString = function (headersObj) {
  const entries = Object.entries(headersObj);
  const headers2 = entries.map(([name, value]) => {
    return `${name.toLowerCase()}: ${value}`;
  });
  return headers2.join(CRLF);
};
var stringToObject = function (headersString, dest) {
  const headers2 = headersString.split(CRLF);
  if (dest == null) {
    dest = {};
  }
  for (let header of headers2) {
    if (/([^:]+):\s*(.+)/.test(header)) {
      const name = RegExp.$1 != null ? RegExp.$1.toLowerCase() : void 0;
      const value = RegExp.$2;
      if (dest[name] == null) {
        dest[name] = value;
      }
    }
  }
  return dest;
};
var convert = function (headers2, dest) {
  switch (typeof headers2) {
    case "object": {
      return objectToString(headers2);
    }
    case "string": {
      return stringToObject(headers2, dest);
    }
  }
  return [];
};
var headers = { convert };
var hooks = EventEmitter(true);
var nullify = (res) => (res === void 0 ? null : res);
var Native$1 = windowRef.XMLHttpRequest;
var Xhook$1 = function () {
  const ABORTED = -1;
  const xhr = new Native$1();
  const request = {};
  let status = null;
  let hasError = void 0;
  let transiting = void 0;
  let response = void 0;
  var currentState = 0;
  const readHead = function () {
    response.status = status || xhr.status;
    if (status !== ABORTED) {
      response.statusText = xhr.statusText;
    }
    if (status !== ABORTED) {
      const object = headers.convert(xhr.getAllResponseHeaders());
      for (let key in object) {
        const val = object[key];
        if (!response.headers[key]) {
          const name = key.toLowerCase();
          response.headers[name] = val;
        }
      }
      return;
    }
  };
  const readBody = function () {
    if (!xhr.responseType || xhr.responseType === "text") {
      response.text = xhr.responseText;
      response.data = xhr.responseText;
      try {
        response.xml = xhr.responseXML;
      } catch (error) {}
    } else if (xhr.responseType === "document") {
      response.xml = xhr.responseXML;
      response.data = xhr.responseXML;
    } else {
      response.data = xhr.response;
    }
    if ("responseURL" in xhr) {
      response.finalUrl = xhr.responseURL;
    }
  };
  const writeHead = function () {
    facade.status = response.status;
    facade.statusText = response.statusText;
  };
  const writeBody = function () {
    if ("text" in response) {
      facade.responseText = response.text;
    }
    if ("xml" in response) {
      facade.responseXML = response.xml;
    }
    if ("data" in response) {
      facade.response = response.data;
    }
    if ("finalUrl" in response) {
      facade.responseURL = response.finalUrl;
    }
  };
  const emitFinal = function () {
    if (!hasError) {
      facade.dispatchEvent("load", {});
    }
    facade.dispatchEvent("loadend", {});
    if (hasError) {
      facade.readyState = 0;
    }
  };
  const emitReadyState = function (n) {
    while (n > currentState && currentState < 4) {
      facade.readyState = ++currentState;
      if (currentState === 1) {
        facade.dispatchEvent("loadstart", {});
      }
      if (currentState === 2) {
        writeHead();
      }
      if (currentState === 4) {
        writeHead();
        writeBody();
      }
      facade.dispatchEvent("readystatechange", {});
      if (currentState === 4) {
        if (request.async === false) {
          emitFinal();
        } else {
          setTimeout(emitFinal, 0);
        }
      }
    }
  };
  const setReadyState = function (n) {
    if (n !== 4) {
      emitReadyState(n);
      return;
    }
    const afterHooks = hooks.listeners("after");
    var process = function () {
      if (afterHooks.length > 0) {
        const hook = afterHooks.shift();
        if (hook.length === 2) {
          hook(request, response);
          process();
        } else if (hook.length === 3 && request.async) {
          hook(request, response, process);
        } else {
          process();
        }
      } else {
        emitReadyState(4);
      }
      return;
    };
    process();
  };
  var facade = EventEmitter();
  request.xhr = facade;
  xhr.onreadystatechange = function (event) {
    try {
      if (xhr.readyState === 2) {
        readHead();
      }
    } catch (error) {}
    if (xhr.readyState === 4) {
      transiting = false;
      readHead();
      readBody();
    }
    setReadyState(xhr.readyState);
  };
  const hasErrorHandler = function () {
    hasError = true;
  };
  facade.addEventListener("error", hasErrorHandler);
  facade.addEventListener("timeout", hasErrorHandler);
  facade.addEventListener("abort", hasErrorHandler);
  facade.addEventListener("progress", function (event) {
    if (currentState < 3) {
      setReadyState(3);
    } else if (xhr.readyState <= 3) {
      facade.dispatchEvent("readystatechange", {});
    }
  });
  if ("withCredentials" in xhr) {
    facade.withCredentials = false;
  }
  facade.status = 0;
  for (let event of Array.from(COMMON_EVENTS.concat(UPLOAD_EVENTS))) {
    facade[`on${event}`] = null;
  }
  facade.open = function (method, url, async, user, pass) {
    currentState = 0;
    hasError = false;
    transiting = false;
    request.headers = {};
    request.headerNames = {};
    request.status = 0;
    request.method = method;
    request.url = url;
    request.async = async !== false;
    request.user = user;
    request.pass = pass;
    response = {};
    response.headers = {};
    setReadyState(1);
  };
  facade.send = function (body) {
    let k, modk;
    for (k of ["type", "timeout", "withCredentials"]) {
      modk = k === "type" ? "responseType" : k;
      if (modk in facade) {
        request[k] = facade[modk];
      }
    }
    request.body = body;
    const send = function () {
      proxyEvents(COMMON_EVENTS, xhr, facade);
      if (facade.upload) {
        proxyEvents(COMMON_EVENTS.concat(UPLOAD_EVENTS), xhr.upload, facade.upload);
      }
      transiting = true;
      xhr.open(request.method, request.url, request.async, request.user, request.pass);
      for (k of ["type", "timeout", "withCredentials"]) {
        modk = k === "type" ? "responseType" : k;
        if (k in request) {
          xhr[modk] = request[k];
        }
      }
      for (let header in request.headers) {
        const value = request.headers[header];
        if (header) {
          xhr.setRequestHeader(header, value);
        }
      }
      xhr.send(request.body);
    };
    const beforeHooks = hooks.listeners("before");
    var process = function () {
      if (!beforeHooks.length) {
        return send();
      }
      const done = function (userResponse) {
        if (
          typeof userResponse === "object" &&
          (typeof userResponse.status === "number" || typeof response.status === "number")
        ) {
          mergeObjects(userResponse, response);
          if (!("data" in userResponse)) {
            userResponse.data = userResponse.response || userResponse.text;
          }
          setReadyState(4);
          return;
        }
        process();
      };
      done.head = function (userResponse) {
        mergeObjects(userResponse, response);
        setReadyState(2);
      };
      done.progress = function (userResponse) {
        mergeObjects(userResponse, response);
        setReadyState(3);
      };
      const hook = beforeHooks.shift();
      if (hook.length === 1) {
        done(hook(request));
      } else if (hook.length === 2 && request.async) {
        hook(request, done);
      } else {
        done();
      }
      return;
    };
    process();
  };
  facade.abort = function () {
    status = ABORTED;
    if (transiting) {
      xhr.abort();
    } else {
      facade.dispatchEvent("abort", {});
    }
  };
  facade.setRequestHeader = function (header, value) {
    const lName = header != null ? header.toLowerCase() : void 0;
    const name = (request.headerNames[lName] = request.headerNames[lName] || header);
    if (request.headers[name]) {
      value = request.headers[name] + ", " + value;
    }
    request.headers[name] = value;
  };
  facade.getResponseHeader = (header) => nullify(response.headers[header ? header.toLowerCase() : void 0]);
  facade.getAllResponseHeaders = () => nullify(headers.convert(response.headers));
  if (xhr.overrideMimeType) {
    facade.overrideMimeType = function () {
      xhr.overrideMimeType.apply(xhr, arguments);
    };
  }
  if (xhr.upload) {
    let up = EventEmitter();
    facade.upload = up;
    request.upload = up;
  }
  facade.UNSENT = 0;
  facade.OPENED = 1;
  facade.HEADERS_RECEIVED = 2;
  facade.LOADING = 3;
  facade.DONE = 4;
  facade.response = "";
  facade.responseText = "";
  facade.responseXML = null;
  facade.readyState = 0;
  facade.statusText = "";
  return facade;
};
Xhook$1.UNSENT = 0;
Xhook$1.OPENED = 1;
Xhook$1.HEADERS_RECEIVED = 2;
Xhook$1.LOADING = 3;
Xhook$1.DONE = 4;
var XMLHttpRequest = {
  patch() {
    if (Native$1) {
      windowRef.XMLHttpRequest = Xhook$1;
    }
  },
  unpatch() {
    if (Native$1) {
      windowRef.XMLHttpRequest = Native$1;
    }
  },
  Native: Native$1,
  Xhook: Xhook$1,
};
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i])) t[p[i]] = s[p[i]];
    }
  return t;
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P
      ? value
      : new P(function (resolve) {
          resolve(value);
        });
  }
  return new (P || (P = Promise))(function (resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result2) {
      result2.done ? resolve(result2.value) : adopt(result2.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
var Native = windowRef.fetch;
function copyToObjFromRequest(req) {
  const copyedKeys = [
    "method",
    "headers",
    "body",
    "mode",
    "credentials",
    "cache",
    "redirect",
    "referrer",
    "referrerPolicy",
    "integrity",
    "keepalive",
    "signal",
    "url",
  ];
  let copyedObj = {};
  copyedKeys.forEach((key) => (copyedObj[key] = req[key]));
  return copyedObj;
}
function covertHeaderToPlainObj(headers2) {
  if (headers2 instanceof Headers) {
    return covertTDAarryToObj([...headers2.entries()]);
  }
  if (Array.isArray(headers2)) {
    return covertTDAarryToObj(headers2);
  }
  return headers2;
}
function covertTDAarryToObj(input) {
  return input.reduce((prev, [key, value]) => {
    prev[key] = value;
    return prev;
  }, {});
}
var Xhook = function (input, init = { headers: {} }) {
  let options = Object.assign(Object.assign({}, init), { isFetch: true });
  if (input instanceof Request) {
    const requestObj = copyToObjFromRequest(input);
    const prevHeaders = Object.assign(
      Object.assign({}, covertHeaderToPlainObj(requestObj.headers)),
      covertHeaderToPlainObj(options.headers),
    );
    options = Object.assign(Object.assign(Object.assign({}, requestObj), init), {
      headers: prevHeaders,
      acceptedRequest: true,
    });
  } else {
    options.url = input;
  }
  const beforeHooks = hooks.listeners("before");
  const afterHooks = hooks.listeners("after");
  return new Promise(function (resolve, reject) {
    let fullfiled = resolve;
    const processAfter = function (response) {
      if (!afterHooks.length) {
        return fullfiled(response);
      }
      const hook = afterHooks.shift();
      if (hook.length === 2) {
        hook(options, response);
        return processAfter(response);
      } else if (hook.length === 3) {
        return hook(options, response, processAfter);
      } else {
        return processAfter(response);
      }
    };
    const done = function (userResponse) {
      if (userResponse !== void 0) {
        const response = new Response(userResponse.body || userResponse.text, userResponse);
        resolve(response);
        processAfter(response);
        return;
      }
      processBefore();
    };
    const processBefore = function () {
      if (!beforeHooks.length) {
        send();
        return;
      }
      const hook = beforeHooks.shift();
      if (hook.length === 1) {
        return done(hook(options));
      } else if (hook.length === 2) {
        return hook(options, done);
      }
    };
    const send = () =>
      __awaiter(this, void 0, void 0, function* () {
        const { url, isFetch, acceptedRequest } = options,
          restInit = __rest(options, ["url", "isFetch", "acceptedRequest"]);
        if (input instanceof Request && restInit.body instanceof ReadableStream) {
          restInit.body = yield new Response(restInit.body).text();
        }
        return Native(url, restInit)
          .then((response) => processAfter(response))
          .catch(function (err) {
            fullfiled = reject;
            processAfter(err);
            return reject(err);
          });
      });
    processBefore();
  });
};
var fetch = {
  patch() {
    if (Native) {
      windowRef.fetch = Xhook;
    }
  },
  unpatch() {
    if (Native) {
      windowRef.fetch = Native;
    }
  },
  Native,
  Xhook,
};
var xhook = hooks;
xhook.EventEmitter = EventEmitter;
xhook.before = function (handler, i) {
  if (handler.length < 1 || handler.length > 2) {
    throw "invalid hook";
  }
  return xhook.on("before", handler, i);
};
xhook.after = function (handler, i) {
  if (handler.length < 2 || handler.length > 3) {
    throw "invalid hook";
  }
  return xhook.on("after", handler, i);
};
xhook.enable = function () {
  XMLHttpRequest.patch();
  fetch.patch();
};
xhook.disable = function () {
  XMLHttpRequest.unpatch();
  fetch.unpatch();
};
xhook.XMLHttpRequest = XMLHttpRequest.Native;
xhook.fetch = fetch.Native;
xhook.headers = headers.convert;
xhook.enable();

// ../auth-proxy-frontend/src/index.ts
var config = null;
var defaultGetAuthToken = () => {
  const match = document.cookie.match(new RegExp("(^| )_oauth2_proxy=([^;]+)"));
  if (match) return match[2];
  return null;
};
function configureAuthProxy(userConfig) {
  console.log("Configuring Auth Proxy", userConfig);
  config = {
    ...userConfig,
    getAuthToken: userConfig.getAuthToken || defaultGetAuthToken,
  };
  enableInterception();
}
function shouldProxy(url) {
  if (!config) return false;
  try {
    const parsedUrl = new URL(url, window.location.origin);
    return config.domains.some(
      (domain) =>
        parsedUrl.host === domain || parsedUrl.hostname === domain || parsedUrl.hostname.endsWith("." + domain),
    );
  } catch (e) {
    return false;
  }
}
function enableInterception() {
  if (!config) return;
  xhook.before(async function (request, callback) {
    if (shouldProxy(request.url)) {
      const originalUrl = request.url;
      request.url = config.proxyUrl;
      const token = await Promise.resolve(config.getAuthToken());
      if (token) {
        request.headers["Authorization"] = `Bearer ${token}`;
      }
      request.headers["X-Proxy-Target-Url"] = originalUrl;
      request.withCredentials = true;
    }
    callback();
  });
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = input instanceof Request ? input.url : input.toString();
    if (shouldProxy(url)) {
      const originalUrl = url;
      url = config.proxyUrl;
      const token = await Promise.resolve(config.getAuthToken());
      const headers2 = new Headers(init?.headers || {});
      if (token) {
        headers2.set("Authorization", `Bearer ${token}`);
      }
      headers2.set("X-Proxy-Target-Url", originalUrl);
      const newInit = {
        ...init,
        headers: headers2,
        credentials: "include",
      };
      if (input instanceof Request) {
        return originalFetch(url, newInit);
      }
      return originalFetch(url, newInit);
    }
    return originalFetch(input, init);
  };
}
export { configureAuthProxy };
