#!/bin/bash

# BrowserOS with Grazie Integration - Local Build Script
# This script automates the build process for BrowserOS with Grazie integration

set -e  # Exit on any error

echo "🚀 BrowserOS with Grazie Integration - Local Build Script"
echo "========================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check system requirements
print_status "Checking system requirements..."

# Check macOS version
MACOS_VERSION=$(sw_vers -productVersion)
print_status "macOS version: $MACOS_VERSION"

# Check available disk space
AVAILABLE_SPACE=$(df -h . | tail -1 | awk '{print $4}')
print_status "Available disk space: $AVAILABLE_SPACE"

# Check available memory
TOTAL_MEMORY=$(system_profiler SPHardwareDataType | grep "Memory:" | awk '{print $2, $3}')
print_status "Total memory: $TOTAL_MEMORY"

# Check if Xcode command line tools are installed
if ! xcode-select -p &> /dev/null; then
    print_error "Xcode command line tools not found. Please install them first:"
    print_error "  xcode-select --install"
    exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    print_error "Homebrew not found. Please install it first:"
    print_error "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
brew install python@3.11 node ninja || print_warning "Some dependencies may already be installed"

# Get the current directory
BUILD_ROOT=$(pwd)
print_status "Build root: $BUILD_ROOT"

# Create build directory
print_status "Setting up build environment..."
mkdir -p build
cd build

# Download depot_tools if not already present
if [ ! -d "depot_tools" ]; then
    print_status "Downloading depot_tools..."
    git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
fi

# Set up PATH
export PATH="$BUILD_ROOT/build/depot_tools:$PATH"
print_status "depot_tools added to PATH"

# Download Chromium source if not already present
if [ ! -d "src" ]; then
    print_status "Downloading Chromium source... (this may take 30-60 minutes)"
    fetch --nohooks chromium
    cd src
    
    # Check out specific version
    print_status "Parsing Chromium version from CHROMIUM_VERSION file..."
    
    # Read version components from CHROMIUM_VERSION file
    MAJOR=$(grep "MAJOR=" ../../CHROMIUM_VERSION | cut -d'=' -f2)
    MINOR=$(grep "MINOR=" ../../CHROMIUM_VERSION | cut -d'=' -f2)
    BUILD=$(grep "BUILD=" ../../CHROMIUM_VERSION | cut -d'=' -f2)
    PATCH=$(grep "PATCH=" ../../CHROMIUM_VERSION | cut -d'=' -f2)
    
    # Construct version string
    CHROMIUM_VERSION="$MAJOR.$MINOR.$BUILD.$PATCH"
    print_status "Checking out Chromium version: $CHROMIUM_VERSION"
    
    # Try to checkout the version tag
    if git checkout "$CHROMIUM_VERSION" 2>/dev/null; then
        print_success "Successfully checked out version $CHROMIUM_VERSION"
    else
        print_warning "Version tag $CHROMIUM_VERSION not found, trying with refs/tags/ prefix..."
        if git checkout "refs/tags/$CHROMIUM_VERSION" 2>/dev/null; then
            print_success "Successfully checked out version $CHROMIUM_VERSION"
        else
            print_warning "Exact version not found, using latest release branch..."
            git checkout "origin/release/$MAJOR.$MINOR.$BUILD" || git checkout "origin/main"
        fi
    fi
    
    # Run hooks
    print_status "Running gclient hooks... (this may take another 30-60 minutes)"
    gclient runhooks
else
    print_status "Chromium source already exists, skipping download"
    cd src
fi

# Apply BrowserOS and Grazie patches
print_status "Applying BrowserOS and Grazie integration..."

# Copy files
print_status "Copying BrowserOS files..."
cp -r ../../chrome ./
cp -r ../../chromium_src ./
cp -r ../../resources ./

# Apply patches
print_status "Applying BrowserOS patches..."
for patch in ../../patches/nxtscape/*.patch; do
    if [ -f "$patch" ]; then
        echo "  Applying: $(basename "$patch")"
        git apply "$patch" || print_warning "Patch $(basename "$patch") failed, continuing..."
    fi
done

print_status "Applying Grazie integration patches..."
for patch in ../../patches/grazie/*.patch; do
    if [ -f "$patch" ]; then
        echo "  Applying: $(basename "$patch")"
        git apply "$patch" || print_warning "Patch $(basename "$patch") failed, continuing..."
    fi
done

# Configure build
print_status "Configuring build..."
gn gen out/Release --args='
  is_debug=false
  is_component_build=false
  symbol_level=0
  enable_nacl=false
  remove_webcore_debug_symbols=true
  proprietary_codecs=true
  ffmpeg_branding="Chrome"
  is_official_build=true
  chrome_pgo_phase=0
  use_thin_lto=false
  target_cpu="x64"
  mac_deployment_target="10.15"
  enable_grazie_integration=true
'

# Start the build
print_status "Starting build... (this will take 4-8 hours depending on your machine)"
print_status "You can monitor progress with: tail -f build.log"

# Determine number of parallel jobs
CPU_COUNT=$(sysctl -n hw.ncpu)
JOBS=$((CPU_COUNT - 1))  # Leave one CPU free
print_status "Using $JOBS parallel jobs (CPU count: $CPU_COUNT)"

# Build with logging
ninja -C out/Release chrome -j$JOBS 2>&1 | tee build.log

# Check if build succeeded
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Build completed successfully!"
    
    # Create application bundle
    print_status "Creating application bundle..."
    mkdir -p BrowserOS-Grazie.app/Contents/MacOS
    mkdir -p BrowserOS-Grazie.app/Contents/Resources
    
    # Copy built binary
    cp out/Release/Chromium BrowserOS-Grazie.app/Contents/MacOS/BrowserOS
    
    # Copy resources
    cp -r out/Release/Chromium.app/Contents/Resources/* BrowserOS-Grazie.app/Contents/Resources/ 2>/dev/null || true
    
    # Create Info.plist
    cat > BrowserOS-Grazie.app/Contents/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>BrowserOS-Grazie</string>
  <key>CFBundleIdentifier</key>
  <string>com.ashchupliak.browseros-grazie</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>BrowserOS</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>CFBundleIconFile</key>
  <string>app.icns</string>
</dict>
</plist>
EOF
    
    # Copy icon
    cp ../../resources/icons/mac/app.icns BrowserOS-Grazie.app/Contents/Resources/
    
    print_success "Application bundle created: BrowserOS-Grazie.app"
    
    # Create DMG
    print_status "Creating DMG..."
    hdiutil create -volname "BrowserOS-Grazie" -srcfolder BrowserOS-Grazie.app -ov -format UDZO BrowserOS-Grazie.dmg
    
    print_success "DMG created: BrowserOS-Grazie.dmg"
    
    # Final instructions
    echo ""
    echo "🎉 Build Complete!"
    echo "=================="
    echo "Your BrowserOS with Grazie integration is ready!"
    echo ""
    echo "📦 Application: $(pwd)/BrowserOS-Grazie.app"
    echo "💿 DMG File: $(pwd)/BrowserOS-Grazie.dmg"
    echo ""
    echo "To test your build:"
    echo "1. Run: ./BrowserOS-Grazie.app/Contents/MacOS/BrowserOS"
    echo "2. Go to: chrome://settings/grazie"
    echo "3. Enter your Grazie JWT token"
    echo "4. Test keyboard shortcuts:"
    echo "   - ⌘⇧L: Toggle AI chat panel"
    echo "   - ⌘⇧;: Cycle through models"
    echo ""
    echo "📋 Build log saved to: build.log"
    
else
    print_error "Build failed! Check build.log for details."
    exit 1
fi 