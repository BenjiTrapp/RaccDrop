# Tests

No dependencies beyond Python 3 and a JavaScript engine.

```bash
python3 test/run.py            # generator round-trip suite (31 tests)
python3 test/png_roundtrip.py  # PNG carrier against a real PNG codec (14 tests)
```

## `run.py` — generator round trip

Extracts the inline `<script>` from `index.html`, prepends browser stubs from
`stubs.js`, appends `driver.js` and runs the bundle. It picks the first available
engine among `node`, JavaScriptCore (`jsc`, preinstalled on macOS), `deno` and
`bun`; override with `--engine node`.

The driver calls the real `generateHTML()`, extracts the inline script from the
*generated* file, executes it against a fresh set of DOM stubs and compares the
delivered bytes with the original input. It covers:

- all 13 methods and three multi-layer chains
- both delivery triggers, with and without a configured delay
- 600 KB payloads through AES and the PNG carrier, which is where the old
  `String.fromCharCode(...bytes)` spread used to throw `RangeError`
- polymorphism: two builds of the same input must not be byte-identical
- tamper detection: a corrupted carrier must deliver nothing
- output size estimates, asserted within 1% of the real size
- a missing `crypto.subtle` producing a visible error rather than a dead UI

## `png_roundtrip.py` — PNG carrier

`run.py` stubs the canvas with a codec that is lossless by construction, so it
validates the byte packing but proves nothing about real PNG fidelity. This
script closes that gap: it mirrors `pngCarrier()` and `pngExtractor()` exactly,
writes a genuine PNG with `zlib` and CRC, reads it back and compares. It also
corrupts the magic, the length field, the checksum field and the first, middle
and last payload byte, asserting each is rejected, and asserts that trailing
padding is correctly ignored.

## What these tests do not cover

**Colour management.** If a browser applies a colour transform in `drawImage`,
pixel values change and the PNG carrier breaks. Neither harness can see this;
only a real browser can. The failure is loud — the checksum rejects it and the
landing page reports it — but the method should still be validated in Chrome,
Firefox and Safari before use.

**Real AES-GCM.** `stubs.js` replaces `crypto.subtle` with an involutive XOR, so
the suite validates the IV concatenation and splitting rather than the cipher.

**Engine-specific limits.** `String.fromCharCode(...arr)` throws in V8 and
SpiderMonkey past roughly 100k arguments, but JavaScriptCore tolerates far more.
Running the suite under `--engine node` exercises the stricter behaviour.
