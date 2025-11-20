#!/bin/bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-minimal \
  --load-extension=/Users/ali/GHOST \
  --no-first-run \
  --no-default-browser-check \
  > /tmp/chrome-minimal.log 2>&1 &
echo $! > .chrome_minimal.pid
echo "Launched minimal Chrome (pid $(cat .chrome_minimal.pid))"
