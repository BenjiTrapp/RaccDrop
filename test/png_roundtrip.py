#!/usr/bin/env python3
"""Validate RaccDrop's PNG pixel carrier against a real PNG codec.

Mirrors the byte packing from pngCarrier() / pngExtractor() exactly, writes a
genuine PNG (zlib + CRC), reads it back and compares. This proves the header,
length field and RGB packing survive a real lossless PNG round trip. It does not
cover browser colour management on drawImage -- only a real browser can.
"""
import zlib, struct, random, sys

MAGIC = [random.randrange(256) for _ in range(4)]


def fnv1a(data) -> int:
    h = 0x811c9dc5
    for b in data:
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return h


def pack(payload: str):
    raw = bytes(ord(c) & 255 for c in payload)
    n = len(raw)
    s = fnv1a(raw)
    need = 12 + n
    px = -(-need // 3)
    w = min(2048, max(1, px))
    h = -(-px // w)
    buf = bytearray(w * h * 3)
    buf[0:4] = bytes(MAGIC)
    buf[4] = (n >> 24) & 255
    buf[5] = (n >> 16) & 255
    buf[6] = (n >> 8) & 255
    buf[7] = n & 255
    buf[8] = (s >> 24) & 255
    buf[9] = (s >> 16) & 255
    buf[10] = (s >> 8) & 255
    buf[11] = s & 255
    buf[12:12 + n] = raw
    # expand to RGBA with opaque alpha, exactly as putImageData receives it
    rgba = bytearray(w * h * 4)
    b = 0
    for p in range(w * h):
        rgba[p * 4] = buf[b]; b += 1
        rgba[p * 4 + 1] = buf[b]; b += 1
        rgba[p * 4 + 2] = buf[b]; b += 1
        rgba[p * 4 + 3] = 255
    return w, h, bytes(rgba)


def write_png(w, h, rgba):
    raw = b''.join(b'\x00' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def read_png(blob):
    assert blob[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h = 8, b'', 0, 0
    while pos < len(blob):
        ln = struct.unpack('>I', blob[pos:pos + 4])[0]
        tag = blob[pos + 4:pos + 8]
        data = blob[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h = struct.unpack('>II', data[:8])
        elif tag == b'IDAT':
            idat += data
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * 4
    rgba = bytearray()
    prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        assert f == 0, f'unexpected filter {f}'
        rgba += line
        prev = line
    return w, h, bytes(rgba)


def unpack(w, h, rgba):
    b = bytearray()
    for p in range(w * h):
        b += rgba[p * 4:p * 4 + 3]
    if list(b[0:4]) != MAGIC:
        raise AssertionError('magic mismatch')
    n = (b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]
    if n == 0 or 12 + n > len(b):
        raise AssertionError(f'length out of range: {n}')
    want = (b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]
    data = bytes(b[12:12 + n])
    if fnv1a(data) != want:
        raise AssertionError('checksum mismatch')
    return ''.join(chr(c) for c in data)


cases = {
    'tiny': 'data:text/plain;base64,' + 'QUJD',
    'ascii edges': ''.join(chr(c) for c in range(32, 127)) * 40,
    'exact multiple of 3': 'A' * (3 * 500 - 12),
    'one over multiple': 'A' * (3 * 500 - 11),
    'multi-row (>2048px)': 'data:application/octet-stream;base64,' + 'Zm9vYmFy' * 3000,
    '600 KB': 'X' * 600_000,
}

fails = 0
for name, payload in cases.items():
    try:
        w, h, rgba = pack(payload)
        blob = write_png(w, h, rgba)
        w2, h2, rgba2 = read_png(blob)
        got = unpack(w2, h2, rgba2)
        assert (w2, h2) == (w, h), f'dims {w2}x{h2} != {w}x{h}'
        assert got == payload, f'payload mismatch ({len(got)} vs {len(payload)})'
        ratio = len(blob) / max(1, len(payload))
        print(f'pass  {name:22s} {w}x{h}px  png={len(blob):>8,}B  '
              f'{ratio:.2f}x payload')
    except AssertionError as e:
        fails += 1
        print(f'FAIL  {name:22s} {e}')

# The checksum exists so that corruption anywhere in the payload is caught, not
# just damage to the magic bytes. A colour transform on drawImage would perturb
# arbitrary pixels, so every offset has to be covered.
print()
payload = 'data:application/octet-stream;base64,' + 'Zm9vYmFy' * 2000
n = len(payload)
w, h, rgba = pack(payload)
w2, h2, clean = read_png(write_png(w, h, rgba))
assert unpack(w2, h2, clean) == payload
print(f'pass  {"clean round trip":28s} {w2}x{h2}px, payload {n}B, '
      f'padding {w2 * h2 * 3 - 12 - n}B')


def rgb_to_rgba(i):
    """RGB stream index -> offset in the RGBA pixel buffer."""
    return (i // 3) * 4 + (i % 3)


tamper = [
    ('magic byte 0', rgb_to_rgba(0)),
    ('length field', rgb_to_rgba(5)),
    ('checksum field', rgb_to_rgba(9)),
    ('first payload byte', rgb_to_rgba(12)),
    ('middle payload byte', rgb_to_rgba(12 + n // 2)),
    ('last payload byte', rgb_to_rgba(12 + n - 1)),
]
for name, off in tamper:
    t = bytearray(clean)
    t[off] = (t[off] + 1) & 255
    try:
        unpack(w2, h2, bytes(t))
        fails += 1
        print(f'FAIL  corrupted {name:22s} was accepted')
    except AssertionError as e:
        print(f'pass  corrupted {name:22s} rejected: {e}')

# Trailing padding is not part of the payload, so it must not be covered.
off = rgb_to_rgba(12 + n + 50)
t = bytearray(clean)
t[off] = (t[off] + 1) & 255
if unpack(w2, h2, bytes(t)) == payload:
    print(f'pass  {"padding byte ignored":28s}')
else:
    fails += 1
    print(f'FAIL  padding byte affected the payload')

total = len(cases) + 1 + len(tamper) + 1
print()
print(f'{total - fails} passed, {fails} failed')
sys.exit(1 if fails else 0)
