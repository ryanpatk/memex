import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/**
 * Local only: serves the photos the large fixture Library uses
 * (`VITE_MEMEX_FIXTURES=large`, @memex/core/memory bulkData) from
 * scripts/fixture-images, each after a made-up network delay (60–700ms,
 * fixed per URL), so image loading behaves like real link previews. Only
 * the local dev and preview servers run it; it is never part of a build.
 */
var serveFixtureImages = function (middlewares) {
    middlewares.use(function (req, res, next) {
        var _a, _b, _c;
        var url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '/', 'http://dev');
        var name = (_b = url.pathname.match(/^\/__fixture-images\/(photo-[\d.]+\.jpg)$/)) === null || _b === void 0 ? void 0 : _b[1];
        if (!name)
            return next();
        var body;
        try {
            body = readFileSync(new URL("./scripts/fixture-images/".concat(name), import.meta.url));
        }
        catch (_d) {
            return next();
        }
        var n = Number((_c = url.searchParams.get('n')) !== null && _c !== void 0 ? _c : 0);
        var delay = 60 + ((n * 7919) % 640);
        setTimeout(function () {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'max-age=3600');
            res.end(body);
        }, delay);
    });
};
var fixtureImages = function () { return ({
    name: 'memex-fixture-images',
    configureServer: function (server) {
        serveFixtureImages(server.middlewares);
    },
    // `vite preview` too, for measuring a production build locally
    configurePreviewServer: function (server) {
        serveFixtureImages(server.middlewares);
    },
}); };
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), fixtureImages()],
    server: {
        watch: {
            ignored: ['**/.impeccable/**'],
        },
    },
});
