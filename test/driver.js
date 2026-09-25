// ---- Test driver ----
// Round-trips a payload through the real generateHTML(), then executes the inline
// script of the *generated* file and checks the delivered bytes byte-for-byte.

var ORIGINAL = 'Hello RaccDrop \u0000\u0001\u00ff binary-ish payload 1234567890 '
  + new Array(400).join('AB\u00c3\u00a9');
var ORIG_B64 = (function () {
  var s = '';
  for (var i = 0; i < ORIGINAL.length; i++) s += ORIGINAL[i];
  return btoa(s);
})();
var DATA_URL = 'data:application/octet-stream;base64,' + ORIG_B64;

function flush(n) {
  var p = Promise.resolve();
  for (var i = 0; i < n; i++) p = p.then(function () {});
  return p;
}
function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}
function settle(ms) {
  return sleep(ms).then(function () { return flush(30); });
}

function runGenerated(genHTML, delayMs) {
  // Extract the inline delivery script
  var m = genHTML.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error('no inline script found in generated HTML');
  var code = m[1];

  // Rebuild a document containing the DOM-based payload carriers
  var doc = makeDocument({});
  var re = /id="(_[a-z]+)"[^>]*data-(file|payload)="([^"]*)"/g, mm;
  while ((mm = re.exec(genHTML)) !== null) {
    var el = doc.getElementById(mm[1]);
    el.dataset[mm[2] === 'file' ? 'file' : 'payload'] = mm[3];
  }
  var reImg = /<img id="(_[a-z]+)"[^>]*src="(data:image\/png;base64,[^"]*)"/g, mi;
  while ((mi = reImg.exec(genHTML)) !== null) {
    doc.getElementById(mi[1]).src = mi[2];
  }

  CAPTURE.downloads = [];
  var savedDoc = document;
  document = doc;
  var fn = new Function('document', 'crypto', 'TextEncoder', 'TextDecoder', 'Blob', 'URL', 'CAPTURE', 'setTimeout', 'console', code);
  fn(doc, crypto, TextEncoder, TextDecoder, Blob, URL, CAPTURE, setTimeout, console);

  // Click trigger: fire the handler the payload registered
  Object.keys(doc._els).forEach(function (id) {
    var e = doc._els[id];
    if (e._handlers && e._handlers.click) e._handlers.click();
  });
  // The delivery chain is async (await on AES / canvas decode) and may sit behind
  // a configured delay, so wait real time and then let microtasks settle.
  return settle((delayMs || 0) + 80).then(function () {
    document = savedDoc;
    return CAPTURE.downloads;
  });
}

function bytesToStr(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
function domBased(m) { return m === 'css' || m === 'svg' || m === 'canvas'; }

var results = [];
function test(name, method, layers, trigger, manifest, delayMs) {
  delayMs = delayMs || 0;
  var doc = makeDocument({ methodLabel: 'label(' + method + ')', layers: layers || [] });
  document = doc;
  doc.getElementById('method').value = method;
  doc.getElementById('trigger').value = trigger;
  doc.getElementById('manifestCb').checked = !!manifest;
  doc.getElementById('pageTitle').value = 'Secure File Download';
  doc.getElementById('delay').value = String(delayMs);
  var f = { name: 'report.xlsx', _dataURL: DATA_URL };
  doc.getElementById('fileInput').files = [f];

  CAPTURE.downloads = [];
  CAPTURE.blobs = [];

  var p = generateHTML();
  return Promise.resolve(p).then(function () {
    return flush(30);
  }).then(function () {
    // Outer download = the generated HTML file
    var outer = CAPTURE.downloads[CAPTURE.downloads.length - 1];
    if (!outer || !outer.blob) throw new Error('generator produced no file');
    var genHTML = outer.blob.parts[0];
    return runGenerated(genHTML, delayMs).then(function (dl) { return [genHTML, dl]; });
  }).then(function (pair) {
    var genHTML = pair[0], dl = pair[1];
    if (dl.length !== 1) throw new Error('expected 1 delivered file, got ' + dl.length);
    if (dl[0].name !== 'report.xlsx') throw new Error('bad filename: ' + dl[0].name);
    var got = bytesToStr(dl[0].blob.parts[0]);
    var want = atob(ORIG_B64);
    if (got !== want) throw new Error('payload mismatch (len ' + got.length + ' vs ' + want.length + ')');

    var checks = {
      chunked: /\]\.join\(''\)/.test(genHTML) || domBased(method),
      usesBlob: /new Blob\(/.test(genHTML),
      revokes: /revokeObjectURL/.test(genHTML),
      manifestAbsent: manifest ? true : !/raccdrop-/.test(genHTML),
      noDoubleEmbed: domBased(method)
        ? (genHTML.indexOf(ORIG_B64.slice(0, 60)) === genHTML.lastIndexOf(ORIG_B64.slice(0, 60)))
        : true,
      delayEmitted: delayMs > 0 ? genHTML.indexOf('setTimeout(r,' + delayMs + ')') !== -1 : true,
      pixelCarrier: method === 'canvas' ? /<img id="_[a-z]+"[^>]*src="data:image\/png;base64,/.test(genHTML) : true,
      noPayloadInScript: method === 'canvas' ? !/let _[a-z]+=\["/.test(genHTML) : true,
    };
    results.push({ name: name, ok: true, size: genHTML.length, checks: checks });
  }).catch(function (e) {
    results.push({ name: name, ok: false, error: String(e && e.message || e) });
  });
}

var suite = [
  ['base64 / click', 'base64', [], 'click', false],
  ['base64 / auto', 'base64', [], 'auto', false],
  ['xor', 'xor', [], 'click', false],
  ['aes', 'aes', [], 'click', false],
  ['rc4', 'rc4', [], 'click', false],
  ['hex', 'hex', [], 'click', false],
  ['reverse', 'reverse', [], 'click', false],
  ['charcode', 'charcode', [], 'click', false],
  ['decimal', 'decimal', [], 'click', false],
  ['customb64', 'customb64', [], 'click', false],
  ['css', 'css', [], 'click', false],
  ['svg', 'svg', [], 'auto', false],
  ['canvas / click', 'canvas', [], 'click', false],
  ['canvas / auto', 'canvas', [], 'auto', false],
  ['multi xor>b64>rev', 'multi', ['xor', 'base64', 'reverse'], 'click', false],
  ['multi aes>hex', 'multi', ['aes', 'hex'], 'click', false],
  ['multi rc4>customb64>decimal', 'multi', ['rc4', 'customb64', 'decimal'], 'auto', false],
  ['base64 + manifest', 'base64', [], 'click', true],
  ['delay 150ms / auto', 'base64', [], 'auto', false, 150],
  ['delay 150ms / click', 'xor', [], 'click', false, 150],
  ['canvas + delay / auto', 'canvas', [], 'auto', false, 120],
];

var chain = Promise.resolve();
suite.forEach(function (t) {
  chain = chain.then(function () { return test(t[0], t[1], t[2], t[3], t[4], t[5]); });
});

// Large payload: the old String.fromCharCode(...bytes) spread threw RangeError
// past ~65k arguments, so AES was unusable above ~100 KB.
chain = chain.then(function () {
  var big = new Array(600001).join('X');          // 600 KB
  ORIGINAL = big;
  ORIG_B64 = btoa(big);
  DATA_URL = 'data:application/octet-stream;base64,' + ORIG_B64;
  return test('600 KB via aes', 'aes', [], 'click', false);
}).then(function () {
  return test('600 KB via multi aes>base64', 'multi', ['aes', 'base64'], 'auto', false);
}).then(function () {
  return test('600 KB via canvas (multi-row)', 'canvas', [], 'click', false);
});

// Polymorphism: two builds of the same input must not be byte-identical.
chain = chain.then(function () {
  ORIGINAL = 'poly'; ORIG_B64 = btoa('poly');
  DATA_URL = 'data:application/octet-stream;base64,' + ORIG_B64;
  var outs = [];
  function build() {
    var doc = makeDocument({ methodLabel: 'x', layers: [] });
    document = doc;
    doc.getElementById('method').value = 'xor';
    doc.getElementById('trigger').value = 'click';
    doc.getElementById('pageTitle').value = '';
    doc.getElementById('fileInput').files = [{ name: 'a.bin', _dataURL: DATA_URL }];
    CAPTURE.downloads = []; CAPTURE.blobs = [];
    return Promise.resolve(generateHTML()).then(flush.bind(null, 20)).then(function () {
      outs.push(CAPTURE.downloads[CAPTURE.downloads.length - 1].blob.parts[0]);
    });
  }
  return build().then(build).then(function () {
    var same = outs[0] === outs[1];
    var reused = /\brc4\b|\bcustomB64Dec\b|\baesDec\b/.test(outs[0]);
    results.push({
      name: 'polymorphic output', ok: true, size: outs[0].length,
      checks: { differsBetweenBuilds: !same, noStaticFunctionNames: !reused },
    });
  });
});

// Corruption detection: the point of the checksum is that a flipped byte anywhere
// in the payload is caught, not just damage to the 4 magic bytes.
function tamperTest(name, mutate, expectRe) {
  return function () {
    ORIG_B64 = btoa(new Array(5000).join('Q'));
    DATA_URL = 'data:application/octet-stream;base64,' + ORIG_B64;
    var doc = makeDocument({ methodLabel: 'png', layers: [] });
    document = doc;
    doc.getElementById('method').value = 'canvas';
    doc.getElementById('trigger').value = 'auto';
    doc.getElementById('pageTitle').value = '';
    doc.getElementById('delay').value = '0';
    doc.getElementById('fileInput').files = [{ name: 'a.bin', _dataURL: DATA_URL }];
    CAPTURE.downloads = []; CAPTURE.blobs = [];
    return Promise.resolve(generateHTML()).then(flush.bind(null, 20)).then(function () {
      var genHTML = CAPTURE.downloads[CAPTURE.downloads.length - 1].blob.parts[0];
      var m = /src="(data:image\/png;base64,[^"]*)"/.exec(genHTML);
      var img = _decodeFakeImg(m[1]);
      var px = new Uint8Array(img.px);
      mutate(px);
      var bad = genHTML.replace(m[1], _encodeFakeImg(img.w, img.h, px));

      var errs = [], origErr = console.error;
      console.error = function (e) { errs.push(String((e && e.message) || e)); };
      return runGenerated(bad, 0).then(function (dl) {
        console.error = origErr;
        results.push({
          name: name, ok: true, size: bad.length,
          checks: {
            noDelivery: dl.length === 0,
            errorReported: errs.some(function (e) { return expectRe.test(e); }),
          },
        });
      });
    });
  };
}

// RGBA offset 60 -> pixel 15 -> payload byte ~33, well past the 12-byte header
chain = chain.then(tamperTest('flipped payload byte rejected', function (px) {
  px[60] = (px[60] + 1) & 255;
}, /checksum mismatch/));

// Header bytes 4..7 hold the length; byte 4 sits at pixel 1, channel G
chain = chain.then(tamperTest('bogus length rejected', function (px) {
  px[1 * 4 + 1] = 255; px[1 * 4 + 2] = 255;
}, /length out of range|checksum mismatch/));

// Magic still has to be checked first
chain = chain.then(tamperTest('wrong magic rejected', function (px) {
  px[0] = (px[0] + 1) & 255;
}, /magic mismatch/));

// Estimate accuracy: refreshEstimate() is the number the operator plans with, so
// it must track the real output rather than being decorative.
chain = chain.then(function () {
  var RAW = 100000;
  var body = '';
  for (var i = 0; i < RAW; i++) body += String.fromCharCode(i * 7 % 256);
  var du = 'data:application/octet-stream;base64,' + btoa(body);
  var rows = [], worst = 0;
  var ms = ['base64', 'hex', 'reverse', 'charcode', 'decimal', 'customb64', 'xor', 'rc4', 'aes', 'css', 'svg', 'canvas'];
  var c = Promise.resolve();
  ms.forEach(function (m) {
    c = c.then(function () {
      var doc = makeDocument({ methodLabel: m, layers: [] });
      document = doc;
      doc.getElementById('method').value = m;
      doc.getElementById('trigger').value = 'click';
      doc.getElementById('pageTitle').value = '';
      doc.getElementById('delay').value = '0';
      doc.getElementById('fileInput').files = [{ name: 'f.bin', size: RAW, type: 'application/octet-stream', _dataURL: du }];
      CAPTURE.downloads = []; CAPTURE.blobs = [];
      var est = estimateOutput(doc.getElementById('fileInput').files[0], m, []);
      return Promise.resolve(generateHTML()).then(flush.bind(null, 20)).then(function () {
        var real = CAPTURE.downloads[CAPTURE.downloads.length - 1].blob.parts[0].length;
        var err = Math.abs(est - real) / real;
        if (err > worst) worst = err;
        rows.push(m + ' est=' + est + ' real=' + real + ' err=' + (err * 100).toFixed(1) + '%');
      });
    });
  });
  return c.then(function () {
    results.push({
      name: 'size estimate within 1%', ok: true, size: 0,
      checks: { worstCase: worst < 0.01 },
      note: worst > 0.01 ? rows.join(' | ') : undefined,
    });
  });
});

// A missing crypto.subtle must produce a visible message, not a dead UI.
chain = chain.then(function () {
  var doc = makeDocument({ methodLabel: 'aes', layers: [] });
  document = doc;
  doc.getElementById('method').value = 'aes';
  doc.getElementById('trigger').value = 'click';
  doc.getElementById('pageTitle').value = '';
  doc.getElementById('delay').value = '0';
  doc.getElementById('fileInput').files = [{ name: 'f.bin', size: 3, type: '', _dataURL: 'data:text/plain;base64,' + btoa('abc') }];
  CAPTURE.downloads = []; CAPTURE.blobs = [];
  var saved = crypto.subtle;
  crypto.subtle = undefined;
  return Promise.resolve(generateHTML()).then(flush.bind(null, 20)).then(function () {
    crypto.subtle = saved;
    var status = doc.getElementById('status').innerHTML;
    results.push({
      name: 'missing Web Crypto reported', ok: true, size: 0,
      checks: {
        noFileProduced: CAPTURE.downloads.length === 0,
        statusShown: /Drop failed/.test(status),
        hintShown: /secure context/i.test(status),
      },
    });
  });
});

// toHex must refuse input it cannot round-trip instead of desyncing the decoder.
chain = chain.then(function () {
  var threw = false;
  try { toHex('\u0100'); } catch (e) { threw = /exceeds one byte/.test(e.message); }
  var ok = toHex('AB') === '4142';
  results.push({
    name: 'toHex guards multi-byte input', ok: true, size: 0,
    checks: { rejectsWideChar: threw, stillEncodesAscii: ok },
  });
});

chain.then(function () {
  var pass = 0, fail = 0;
  results.forEach(function (r) {
    if (r.ok) {
      var bad = Object.keys(r.checks).filter(function (k) { return !r.checks[k]; });
      if (bad.length) {
        fail++;
        __print('FAIL  ' + r.name + '  -> checks failed: ' + bad.join(', '));
        if (r.note) __print('      ' + r.note);
      } else { pass++; __print('pass  ' + r.name + (r.size ? '  (' + r.size + ' bytes)' : '')); }
    } else {
      fail++;
      __print('FAIL  ' + r.name + '  -> ' + r.error);
    }
  });
  __print('');
  __print(pass + ' passed, ' + fail + ' failed');
});
