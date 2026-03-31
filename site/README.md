# drift landing page

React + Vite landing page isolated inside `site/` so the CLI architecture stays untouched.

## Local run

From the repository root:

```bash
npm install --prefix site
npm run dev --prefix site
```

Open the local Vite URL printed in the terminal.

## Preview production bundle locally

```bash
npm run build --prefix site
npm run preview --prefix site
```

## Deploy

- Build output target is `dist/` from `npm run build --prefix site`.
- Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
- On Vercel, set project root to `site/` and run default Vite build.
