<p align="center">
  <img src="static/raccdrop_logo_transparent.png" alt="RaccDrop Logo" width="200"/>
</p>

<h1 align="center">RaccDrop</h1>

<p align="center">
  <strong>Your Payload. Our Drop.</strong><br>
  <sub>A self-contained HTML smuggling payload generator. Zero dependencies. Pure client-side.</sub>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/encoding_methods-12-00ff00?style=flat-square&labelColor=0a0a0a" alt="Methods"></a>
  <a href="#"><img src="https://img.shields.io/badge/dependencies-0-00ff00?style=flat-square&labelColor=0a0a0a" alt="Dependencies"></a>
  <a href="#"><img src="https://img.shields.io/badge/build-none_required-00ff00?style=flat-square&labelColor=0a0a0a" alt="Build"></a>
  <a href="#"><img src="https://img.shields.io/badge/deployment-GitHub_Pages-00ff00?style=flat-square&labelColor=0a0a0a" alt="Deployment"></a>
</p>

---

## What is RaccDrop?

RaccDrop generates **self-contained HTML files** that embed arbitrary files using various encoding and encryption techniques. When the generated HTML is opened in a browser, it automatically decodes the payload and triggers a download — no server required.

This is a technique known as [HTML Smuggling](https://attack.mitre.org/techniques/T1027/006/), commonly used in red team engagements and security research to deliver payloads through web-based channels that bypass network-level inspection.

## Features

| Method | Description |
|--------|-------------|
| **CSS** | Hides Base64 payload in a hidden `<div>` data attribute |
| **XOR** | XOR cipher with random key, output Base64-encoded |
| **AES** | AES-GCM encryption via Web Crypto API (256-bit, 12-byte IV) |
| **RC4** | RC4 stream cipher with random key |
| **Base64** | Simple Base64 encoding |
| **Hex** | Hex-encoded string |
| **Reverse** | Reversed string |
| **CharCode** | JSON array of character codes |
| **Decimal** | Decimal dot-separated char codes |
| **Custom B64** | Custom shuffled Base64 alphabet |
| **SVG** | Payload hidden in an SVG `data-` attribute |
| **Multi-layer** | Chain any combination of the above methods |

## How It Works

![](/static/raccdrop_flow.png)

1. **Select** any file you want to deliver
2. **Choose** an encoding/encryption method (or chain multiple)
3. **Execute** the drop to generate a standalone HTML file
4. The generated HTML decodes and delivers the original file when opened

## Usage

No installation needed. Just open `index.html` in any modern browser.

Or visit the hosted version on GitHub Pages.

## Tech Stack

- Pure vanilla JavaScript (no frameworks, no libraries)
- Web Crypto API for AES-GCM encryption
- FileReader & Blob APIs for file handling
- Zero external dependencies
- No build step required

## Disclaimer

This tool is intended for **authorized security testing and research purposes only**. Misuse of this tool for unauthorized access or malicious activities is strictly prohibited. Always obtain proper authorization before conducting security assessments.

---

<p align="center">
  <sub>Built with raccoon energy</sub>
</p>
