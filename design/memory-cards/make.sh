#!/bin/sh
# Concatenate the Memory Cards sources into one module, regenerate the tokens, and render HTML + PNGs.
# Usage: ./make.sh            (every item)
#        ./make.sh d01 m01    (just those ids)
cd "$(dirname "$0")"
(cat mc_css.ts mc_lib.ts mc_sheets.ts mc_screens.ts; echo 'export { ITEMS };') > mc.mts
node tokens.mjs
node build.mjs "$@"
