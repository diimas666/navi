#!/bin/sh
# Builds the trust and dead-reckoning engines for macOS and runs the РЕБ scenarios.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
out=$(mktemp -d)
swiftc -O \
  "$root/ios/NativeModules/Support/NeivJSON.swift" \
  "$root/ios/NativeModules/LocationManager/LocationTrustEngine.swift" \
  "$root/ios/NativeModules/DeadReckoningEngine/DeadReckoningEngine.swift" \
  "$root/ios/NativeTests/main.swift" \
  -o "$out/native-tests"
"$out/native-tests"
