import { readFileSync } from 'node:fs'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Local only: serves the photos the large fixture Library uses
 * (`VITE_MEMEX_FIXTURES=large`, @memex/core/memory bulkData) from
 * scripts/fixture-images, each after a made-up network delay (60–700ms,
 * fixed per URL), so image loading behaves like real link previews. Only
 * the local dev and preview servers run it; it is never part of a build.
 */
const serveFixtureImages = (middlewares: Connect.Server) => {
  middlewares.use((req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://dev')
    const name = url.pathname.match(/^\/__fixture-images\/(photo-[\d.]+\.jpg)$/)?.[1]
    if (!name) return next()
    let body: Buffer
    try {
      body = readFileSync(new URL(`./scripts/fixture-images/${name}`, import.meta.url))
    } catch {
      return next()
    }
    const n = Number(url.searchParams.get('n') ?? 0)
    const delay = 60 + ((n * 7919) % 640)
    setTimeout(() => {
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'max-age=3600')
      res.end(body)
    }, delay)
  })
}

const fixtureImages = (): Plugin => ({
  name: 'memex-fixture-images',
  configureServer(server) {
    serveFixtureImages(server.middlewares)
  },
  // `vite preview` too, for measuring a production build locally
  configurePreviewServer(server) {
    serveFixtureImages(server.middlewares)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), fixtureImages()],
  server: {
    watch: {
      ignored: ['**/.impeccable/**'],
    },
  },
})
