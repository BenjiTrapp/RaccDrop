// ---- Minimal browser stubs for jsc ----
var CAPTURE = { blobs: [], downloads: [], nextId: 1 };

// jsc exposes print() but no console; node exposes console but no print.
if (typeof globalThis.console === 'undefined') {
  globalThis.console = { error: function () {}, log: function () {}, warn: function () {} };
}
var __print = (typeof print === 'function') ? print : console.log.bind(console);

function TextEncoder() {}
TextEncoder.prototype.encode = function (s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return new Uint8Array(out);
};
function TextDecoder() {}
TextDecoder.prototype.decode = function (b) {
  var a = b instanceof Uint8Array ? b : new Uint8Array(b);
  var s = '', i = 0;
  while (i < a.length) {
    var c = a[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (a[i++] & 63));
    else s += String.fromCharCode(((c & 15) << 12) | ((a[i++] & 63) << 6) | (a[i++] & 63));
  }
  return s;
};

var _seed = 0x9e3779b9;
var crypto = {
  getRandomValues: function (arr) {
    for (var i = 0; i < arr.length; i++) {
      _seed ^= _seed << 13; _seed |= 0;
      _seed ^= _seed >>> 17;
      _seed ^= _seed << 5; _seed |= 0;
      arr[i] = _seed & 0xff;
    }
    return arr;
  },
  // Fake AES-GCM: an involutive XOR. Not real crypto -- it exists only to verify
  // that RaccDrop's iv||ciphertext assembly and splitting are exact inverses.
  subtle: {
    importKey: function (fmt, bytes) { return Promise.resolve({ k: bytes }); },
    encrypt: function (alg, key, data) { return Promise.resolve(_xorGcm(alg.iv, key.k, data)); },
    decrypt: function (alg, key, data) { return Promise.resolve(_xorGcm(alg.iv, key.k, data)); },
  },
};
function _xorGcm(iv, k, data) {
  var d = data instanceof Uint8Array ? data : new Uint8Array(data);
  var out = new Uint8Array(d.length);
  for (var i = 0; i < d.length; i++) out[i] = d[i] ^ k[i % k.length] ^ iv[i % iv.length];
  return out.buffer;
}

function Blob(parts, opts) {
  this.parts = parts;
  this.type = (opts && opts.type) || '';
}
var URL = {
  createObjectURL: function (b) {
    var u = 'blob:' + (CAPTURE.nextId++);
    CAPTURE.blobs.push({ url: u, blob: b });
    return u;
  },
  revokeObjectURL: function () {},
};
function blobFor(url) {
  for (var i = 0; i < CAPTURE.blobs.length; i++) if (CAPTURE.blobs[i].url === url) return CAPTURE.blobs[i].blob;
  return null;
}

// ---- DOM ----
// ---- Canvas stub with a lossless fake image codec ----
// Real PNG encode/decode is out of scope for jsc, so toDataURL() serialises the
// raw RGBA buffer instead. This validates the byte packing, header and length
// handling -- it does NOT prove that a real browser's PNG round trip is lossless.
function _encodeFakeImg(w, h, px) {
  var s = String.fromCharCode((w >> 8) & 255, w & 255, (h >> 8) & 255, h & 255);
  for (var i = 0; i < px.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.prototype.slice.call(px.subarray(i, i + 0x8000)));
  }
  return 'data:image/png;base64,' + btoa(s);
}
function _decodeFakeImg(url) {
  var raw = atob(url.slice(url.indexOf(',') + 1));
  var w = (raw.charCodeAt(0) << 8) | raw.charCodeAt(1);
  var h = (raw.charCodeAt(2) << 8) | raw.charCodeAt(3);
  var px = new Uint8Array(raw.length - 4);
  for (var i = 4; i < raw.length; i++) px[i - 4] = raw.charCodeAt(i);
  return { w: w, h: h, px: px };
}

function Ctx(canvas) { this.c = canvas; }
Ctx.prototype.createImageData = function (w, h) {
  return { width: w, height: h, data: new Uint8Array(w * h * 4) };
};
Ctx.prototype.putImageData = function (img) {
  this.c._px = img.data;
  this.c._w = img.width;
  this.c._h = img.height;
};
Ctx.prototype.drawImage = function (img) {
  var d = _decodeFakeImg(img.src);
  this.c._px = d.px; this.c._w = d.w; this.c._h = d.h;
};
Ctx.prototype.getImageData = function () {
  return { data: this.c._px };
};

function El(id) {
  this.id = id; this.value = ''; this.checked = false; this.textContent = '';
  this.innerHTML = ''; this.style = {}; this.dataset = {}; this.files = [];
  this.href = ''; this.download = ''; this.src = ''; this.complete = true;
  this.width = 0; this.height = 0;
}
Object.defineProperty(El.prototype, 'naturalWidth', {
  get: function () { return this.src ? _decodeFakeImg(this.src).w : 0; },
});
Object.defineProperty(El.prototype, 'naturalHeight', {
  get: function () { return this.src ? _decodeFakeImg(this.src).h : 0; },
});
El.prototype.getContext = function () { this._ctx = this._ctx || new Ctx(this); return this._ctx; };
El.prototype.toDataURL = function () { return _encodeFakeImg(this._w, this._h, this._px); };
El.prototype.addEventListener = function (ev, fn) { this._handlers = this._handlers || {}; this._handlers[ev] = fn; };
El.prototype.appendChild = function () {};
El.prototype.remove = function () {};
El.prototype.click = function () {
  CAPTURE.downloads.push({ name: this.download, blob: blobFor(this.href), href: this.href });
};
El.prototype.closest = function () { return null; };
El.prototype.querySelector = function () { return null; };

function makeDocument(cfg) {
  cfg = cfg || {};
  var els = {};
  function get(id) { if (!els[id]) els[id] = new El(id); return els[id]; }
  return {
    _els: els,
    body: new El('body'),
    getElementById: get,
    createElement: function (t) { return new El('created:' + t); },
    querySelector: function (sel) {
      if (sel === '#method option:checked') { var e = new El('opt'); e.textContent = cfg.methodLabel || ''; return e; }
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '.multiCb:checked') {
        return (cfg.layers || []).map(function (v) { var e = new El('cb'); e.value = v; return e; });
      }
      return [];
    },
  };
}

function FileReader() {}
FileReader.prototype.readAsDataURL = function (file) {
  this.result = file._dataURL;
  this._p = this.onload();
};
