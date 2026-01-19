#!/bin/bash
set -e

echo "🚀 Building Umbra release for macOS..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Clean previous release
echo -e "${BLUE}Cleaning previous release...${NC}"
rm -rf release
mkdir -p release/umbra

# Build plugin
echo -e "${BLUE}Building plugin...${NC}"
npm run build

# Copy plugin files to release directory
echo -e "${BLUE}Copying plugin files...${NC}"
cp main.js release/umbra/
cp manifest.json release/umbra/
cp styles.css release/umbra/

# Build server
echo -e "${BLUE}Building server...${NC}"
cd server
npm run build
cd ..

# Copy server to release directory
echo -e "${BLUE}Copying server files...${NC}"
mkdir -p release/umbra/server
cp -r server/dist release/umbra/server/dist
cp server/package.json release/umbra/server/
cp server/package-lock.json release/umbra/server/

# Install production dependencies in release
echo -e "${BLUE}Installing production dependencies...${NC}"
cd release/umbra/server
npm ci --omit=dev --quiet
cd ../../..

# Get version from manifest
VERSION=$(node -p "require('./manifest.json').version")

# Create tarball
echo -e "${BLUE}Creating release archive...${NC}"
cd release
tar -czf "umbra-${VERSION}-macos.tar.gz" umbra
cd ..

# Calculate size
SIZE=$(du -sh "release/umbra-${VERSION}-macos.tar.gz" | cut -f1)

echo ""
echo -e "${GREEN}✅ Release build complete!${NC}"
echo -e "${GREEN}📦 Archive: release/umbra-${VERSION}-macos.tar.gz${NC}"
echo -e "${GREEN}📏 Size: ${SIZE}${NC}"
echo ""
echo "To test locally, extract and copy to your vault:"
echo "  tar -xzf release/umbra-${VERSION}-macos.tar.gz"
echo "  cp -r umbra /path/to/vault/.obsidian/plugins/"
