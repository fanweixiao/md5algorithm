# md5algorithm

MD5 algorithm explained online step by step visually [md5algorithm.com](https://md5algorithm.com/)
This website will help you understand how a md5 hash is calculated from start to finish.

This project is inspired by [sha256algorithm](https://github.com/dmarman/sha256algorithm), but focuses on MD5 with a cleaner code structure and step-by-step round tracing.

## Features

- Input as UTF-8 text or hex bytes
- Full MD5 preprocessing visualization (padding, bit-length append, chunk split)
- Per-round trace for all 64 rounds in each chunk
- Interactive step controls: back/forward, jump, autoplay, speed slider
- Live view of message words `M[0..15]`, constants `K[i]`, shifts `s[i]`, and register updates

## Development

Install dependencies:

```bash
npm install
```

Run local dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```
