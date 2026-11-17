#!/bin/sh
# Concatenate the Memory Cards sources into one module and render HTML + PNGs.
# Usage: ./make.sh            (all 64 items)
#        ./make.sh d01 m01    (just those ids)
cd "$(dirname "$0")"
(cat mc_css.ts mc_lib.ts mc_sheets.ts mc_screens.ts; echo 'export { ITEMS };') > mc.mts
node build.mjs "$@"
