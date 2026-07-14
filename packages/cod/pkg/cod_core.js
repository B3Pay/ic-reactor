/* @ts-self-types="./cod_core.d.ts" */

export class WasmCandidProgram {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr
    this.__wbg_ptr = 0
    WasmCandidProgramFinalization.unregister(this)
    return ptr
  }
  free() {
    const ptr = this.__destroy_into_raw()
    wasm.__wbg_wasmcandidprogram_free(ptr, 0)
  }
  /**
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  decodeInitArgs(bytes) {
    let deferred3_0
    let deferred3_1
    try {
      const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc)
      const len0 = WASM_VECTOR_LEN
      const ret = wasm.wasmcandidprogram_decodeInitArgs(
        this.__wbg_ptr,
        ptr0,
        len0
      )
      var ptr2 = ret[0]
      var len2 = ret[1]
      if (ret[3]) {
        ptr2 = 0
        len2 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred3_0 = ptr2
      deferred3_1 = len2
      return getStringFromWasm0(ptr2, len2)
    } finally {
      wasm.__wbindgen_free(deferred3_0, deferred3_1, 1)
    }
  }
  /**
   * @param {string} method
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  decodeMethodArgs(method, bytes) {
    let deferred4_0
    let deferred4_1
    try {
      const ptr0 = passStringToWasm0(
        method,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc
      )
      const len0 = WASM_VECTOR_LEN
      const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc)
      const len1 = WASM_VECTOR_LEN
      const ret = wasm.wasmcandidprogram_decodeMethodArgs(
        this.__wbg_ptr,
        ptr0,
        len0,
        ptr1,
        len1
      )
      var ptr3 = ret[0]
      var len3 = ret[1]
      if (ret[3]) {
        ptr3 = 0
        len3 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred4_0 = ptr3
      deferred4_1 = len3
      return getStringFromWasm0(ptr3, len3)
    } finally {
      wasm.__wbindgen_free(deferred4_0, deferred4_1, 1)
    }
  }
  /**
   * @param {string} method
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  decodeMethodReply(method, bytes) {
    let deferred4_0
    let deferred4_1
    try {
      const ptr0 = passStringToWasm0(
        method,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc
      )
      const len0 = WASM_VECTOR_LEN
      const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc)
      const len1 = WASM_VECTOR_LEN
      const ret = wasm.wasmcandidprogram_decodeMethodReply(
        this.__wbg_ptr,
        ptr0,
        len0,
        ptr1,
        len1
      )
      var ptr3 = ret[0]
      var len3 = ret[1]
      if (ret[3]) {
        ptr3 = 0
        len3 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred4_0 = ptr3
      deferred4_1 = len3
      return getStringFromWasm0(ptr3, len3)
    } finally {
      wasm.__wbindgen_free(deferred4_0, deferred4_1, 1)
    }
  }
  /**
   * @param {string} args_text
   * @returns {Uint8Array}
   */
  encodeInitArgs(args_text) {
    const ptr0 = passStringToWasm0(
      args_text,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len0 = WASM_VECTOR_LEN
    const ret = wasm.wasmcandidprogram_encodeInitArgs(
      this.__wbg_ptr,
      ptr0,
      len0
    )
    if (ret[3]) {
      throw takeFromExternrefTable0(ret[2])
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice()
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1)
    return v2
  }
  /**
   * @param {string} method
   * @param {string} args_text
   * @returns {Uint8Array}
   */
  encodeMethodArgs(method, args_text) {
    const ptr0 = passStringToWasm0(
      method,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len0 = WASM_VECTOR_LEN
    const ptr1 = passStringToWasm0(
      args_text,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len1 = WASM_VECTOR_LEN
    const ret = wasm.wasmcandidprogram_encodeMethodArgs(
      this.__wbg_ptr,
      ptr0,
      len0,
      ptr1,
      len1
    )
    if (ret[3]) {
      throw takeFromExternrefTable0(ret[2])
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice()
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1)
    return v3
  }
  /**
   * @returns {string}
   */
  irJson() {
    let deferred2_0
    let deferred2_1
    try {
      const ret = wasm.wasmcandidprogram_irJson(this.__wbg_ptr)
      var ptr1 = ret[0]
      var len1 = ret[1]
      if (ret[3]) {
        ptr1 = 0
        len1 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred2_0 = ptr1
      deferred2_1 = len1
      return getStringFromWasm0(ptr1, len1)
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1)
    }
  }
  /**
   * @param {string} source
   */
  constructor(source) {
    const ptr0 = passStringToWasm0(
      source,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len0 = WASM_VECTOR_LEN
    const ret = wasm.wasmcandidprogram_new(ptr0, len0)
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1])
    }
    this.__wbg_ptr = ret[0]
    WasmCandidProgramFinalization.register(this, this.__wbg_ptr, this)
    return this
  }
  /**
   * @returns {string}
   */
  serviceDid() {
    let deferred2_0
    let deferred2_1
    try {
      const ret = wasm.wasmcandidprogram_serviceDid(this.__wbg_ptr)
      var ptr1 = ret[0]
      var len1 = ret[1]
      if (ret[3]) {
        ptr1 = 0
        len1 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred2_0 = ptr1
      deferred2_1 = len1
      return getStringFromWasm0(ptr1, len1)
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1)
    }
  }
  /**
   * @returns {string}
   */
  summaryJson() {
    let deferred2_0
    let deferred2_1
    try {
      const ret = wasm.wasmcandidprogram_summaryJson(this.__wbg_ptr)
      var ptr1 = ret[0]
      var len1 = ret[1]
      if (ret[3]) {
        ptr1 = 0
        len1 = 0
        throw takeFromExternrefTable0(ret[2])
      }
      deferred2_0 = ptr1
      deferred2_1 = len1
      return getStringFromWasm0(ptr1, len1)
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1)
    }
  }
}
if (Symbol.dispose)
  WasmCandidProgram.prototype[Symbol.dispose] = WasmCandidProgram.prototype.free

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeDynamicArgs(bytes) {
  let deferred3_0
  let deferred3_1
  try {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc)
    const len0 = WASM_VECTOR_LEN
    const ret = wasm.decodeDynamicArgs(ptr0, len0)
    var ptr2 = ret[0]
    var len2 = ret[1]
    if (ret[3]) {
      ptr2 = 0
      len2 = 0
      throw takeFromExternrefTable0(ret[2])
    }
    deferred3_0 = ptr2
    deferred3_1 = len2
    return getStringFromWasm0(ptr2, len2)
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1)
  }
}

/**
 * @param {string} args_text
 * @returns {Uint8Array}
 */
export function encodeDynamicArgs(args_text) {
  const ptr0 = passStringToWasm0(
    args_text,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc
  )
  const len0 = WASM_VECTOR_LEN
  const ret = wasm.encodeDynamicArgs(ptr0, len0)
  if (ret[3]) {
    throw takeFromExternrefTable0(ret[2])
  }
  var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice()
  wasm.__wbindgen_free(ret[0], ret[1] * 1, 1)
  return v2
}

/**
 * @param {string} source
 * @returns {string}
 */
export function generateTypescript(source) {
  let deferred3_0
  let deferred3_1
  try {
    const ptr0 = passStringToWasm0(
      source,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len0 = WASM_VECTOR_LEN
    const ret = wasm.generateTypescript(ptr0, len0)
    var ptr2 = ret[0]
    var len2 = ret[1]
    if (ret[3]) {
      ptr2 = 0
      len2 = 0
      throw takeFromExternrefTable0(ret[2])
    }
    deferred3_0 = ptr2
    deferred3_1 = len2
    return getStringFromWasm0(ptr2, len2)
  } finally {
    wasm.__wbindgen_free(deferred3_0, deferred3_1, 1)
  }
}

/**
 * @param {string} source
 * @param {string} canister_name
 * @returns {string}
 */
export function generateTypescriptForCanister(source, canister_name) {
  let deferred4_0
  let deferred4_1
  try {
    const ptr0 = passStringToWasm0(
      source,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len0 = WASM_VECTOR_LEN
    const ptr1 = passStringToWasm0(
      canister_name,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc
    )
    const len1 = WASM_VECTOR_LEN
    const ret = wasm.generateTypescriptForCanister(ptr0, len0, ptr1, len1)
    var ptr3 = ret[0]
    var len3 = ret[1]
    if (ret[3]) {
      ptr3 = 0
      len3 = 0
      throw takeFromExternrefTable0(ret[2])
    }
    deferred4_0 = ptr3
    deferred4_1 = len3
    return getStringFromWasm0(ptr3, len3)
  } finally {
    wasm.__wbindgen_free(deferred4_0, deferred4_1, 1)
  }
}

export function start() {
  wasm.start()
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg___wbindgen_throw_344f42d3211c4765: function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1))
    },
    __wbg_error_a6fa202b58aa1cd3: function (arg0, arg1) {
      let deferred0_0
      let deferred0_1
      try {
        deferred0_0 = arg0
        deferred0_1 = arg1
        console.error(getStringFromWasm0(arg0, arg1))
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1)
      }
    },
    __wbg_new_227d7c05414eb861: function () {
      const ret = new Error()
      return ret
    },
    __wbg_stack_3b0d974bbf31e44f: function (arg0, arg1) {
      const ret = arg1.stack
      const ptr1 = passStringToWasm0(
        ret,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc
      )
      const len1 = WASM_VECTOR_LEN
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true)
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true)
    },
    __wbindgen_cast_0000000000000001: function (arg0, arg1) {
      // Cast intrinsic for `Ref(String) -> Externref`.
      const ret = getStringFromWasm0(arg0, arg1)
      return ret
    },
    __wbindgen_init_externref_table: function () {
      const table = wasm.__wbindgen_externrefs
      const offset = table.grow(4)
      table.set(0, undefined)
      table.set(offset + 0, undefined)
      table.set(offset + 1, null)
      table.set(offset + 2, true)
      table.set(offset + 3, false)
    },
  }
  return {
    __proto__: null,
    "./cod_core_bg.js": import0,
  }
}

const WasmCandidProgramFinalization =
  typeof FinalizationRegistry === "undefined"
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) =>
        wasm.__wbg_wasmcandidprogram_free(ptr, 1)
      )

function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len)
}

let cachedDataViewMemory0 = null
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer)
  }
  return cachedDataViewMemory0
}

function getStringFromWasm0(ptr, len) {
  return decodeText(ptr >>> 0, len)
}

let cachedUint8ArrayMemory0 = null
function getUint8ArrayMemory0() {
  if (
    cachedUint8ArrayMemory0 === null ||
    cachedUint8ArrayMemory0.byteLength === 0
  ) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)
  }
  return cachedUint8ArrayMemory0
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0
  getUint8ArrayMemory0().set(arg, ptr / 1)
  WASM_VECTOR_LEN = arg.length
  return ptr
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg)
    const ptr = malloc(buf.length, 1) >>> 0
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf)
    WASM_VECTOR_LEN = buf.length
    return ptr
  }

  let len = arg.length
  let ptr = malloc(len, 1) >>> 0

  const mem = getUint8ArrayMemory0()

  let offset = 0

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset)
    if (code > 0x7f) break
    mem[ptr + offset] = code
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset)
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len)
    const ret = cachedTextEncoder.encodeInto(arg, view)

    offset += ret.written
    ptr = realloc(ptr, len, offset, 1) >>> 0
  }

  WASM_VECTOR_LEN = offset
  return ptr
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx)
  wasm.__externref_table_dealloc(idx)
  return value
}

let cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
})
cachedTextDecoder.decode()
const MAX_SAFARI_DECODE_BYTES = 2146435072
let numBytesDecoded = 0
function decodeText(ptr, len) {
  numBytesDecoded += len
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", {
      ignoreBOM: true,
      fatal: true,
    })
    cachedTextDecoder.decode()
    numBytesDecoded = len
  }
  return cachedTextDecoder.decode(
    getUint8ArrayMemory0().subarray(ptr, ptr + len)
  )
}

const cachedTextEncoder = new TextEncoder()

if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg)
    view.set(buf)
    return {
      read: arg.length,
      written: buf.length,
    }
  }
}

let WASM_VECTOR_LEN = 0

let wasmModule, wasmInstance, wasm
function __wbg_finalize_init(instance, module) {
  wasmInstance = instance
  wasm = instance.exports
  wasmModule = module
  cachedDataViewMemory0 = null
  cachedUint8ArrayMemory0 = null
  wasm.__wbindgen_start()
  return wasm
}

async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports)
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type)

        if (
          validResponse &&
          module.headers.get("Content-Type") !== "application/wasm"
        ) {
          console.warn(
            "`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",
            e
          )
        } else {
          throw e
        }
      }
    }

    const bytes = await module.arrayBuffer()
    return await WebAssembly.instantiate(bytes, imports)
  } else {
    const instance = await WebAssembly.instantiate(module, imports)

    if (instance instanceof WebAssembly.Instance) {
      return { instance, module }
    } else {
      return instance
    }
  }

  function expectedResponseType(type) {
    switch (type) {
      case "basic":
      case "cors":
      case "default":
        return true
    }
    return false
  }
}

function initSync(module) {
  if (wasm !== undefined) return wasm

  if (module !== undefined) {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ;({ module } = module)
    } else {
      console.warn(
        "using deprecated parameters for `initSync()`; pass a single object instead"
      )
    }
  }

  const imports = __wbg_get_imports()
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module)
  }
  const instance = new WebAssembly.Instance(module, imports)
  return __wbg_finalize_init(instance, module)
}

async function __wbg_init(module_or_path) {
  if (wasm !== undefined) return wasm

  if (module_or_path !== undefined) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ;({ module_or_path } = module_or_path)
    } else {
      console.warn(
        "using deprecated parameters for the initialization function; pass a single object instead"
      )
    }
  }

  if (module_or_path === undefined) {
    module_or_path = new URL("cod_core_bg.wasm", import.meta.url)
  }
  const imports = __wbg_get_imports()

  if (
    typeof module_or_path === "string" ||
    (typeof Request === "function" && module_or_path instanceof Request) ||
    (typeof URL === "function" && module_or_path instanceof URL)
  ) {
    module_or_path = fetch(module_or_path)
  }

  const { instance, module } = await __wbg_load(await module_or_path, imports)

  return __wbg_finalize_init(instance, module)
}

export { initSync, __wbg_init as default }
