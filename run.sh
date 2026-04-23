#!/bin/bash

set -e  # Exit on any error

# Create directory structure
mkdir -p out/baroda-forex-tracker

# Copy required files
cp index.html inr-rates.json targets.json manifest.json sw.js icon-192.png \
  out/baroda-forex-tracker/

# Move into the directory
cd out

# Start local server
npx http-server -p 8080