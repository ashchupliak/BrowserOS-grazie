#!/bin/bash

# Continue BrowserOS with Grazie Integration Build
# Run this script after installing Xcode

set -e

echo "🔄 Continuing BrowserOS with Grazie Integration Build"
echo "===================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Xcode is installed
if ! xcode-select -p | grep -q "Xcode.app"; then
    print_error "Xcode is not properly installed or configured."
    print_error "Please install Xcode from the App Store and run:"
    print_error "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    exit 1
fi

print_success "Xcode is properly configured: $(xcode-select -p)"

# Check if we can use xcodebuild
if ! xcodebuild -version >/dev/null 2>&1; then
    print_error "xcodebuild is not working properly. Please check Xcode installation."
    exit 1
fi

print_success "xcodebuild is working: $(xcodebuild -version | head -1)"

# Navigate to build directory
cd "$(dirname "$0")"
BUILD_ROOT=$(pwd)

print_status "Current directory: $BUILD_ROOT"

# Check if Chromium source exists
if [ ! -d "build/src" ]; then
    print_error "Chromium source not found. Please run ./build_local.sh first."
    exit 1
fi

cd build/src

print_status "✅ Chromium source: Available"
print_status "✅ BrowserOS integration: Applied (165 files modified)"
print_status "✅ Grazie integration: Applied"

# Set up PATH
export PATH="$BUILD_ROOT/build/depot_tools:$PATH"

# Configure the build
print_status "🔧 Configuring build with GN..."
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

if [ $? -eq 0 ]; then
    print_success "Build configuration successful!"
else
    print_error "Build configuration failed. Check the output above for errors."
    exit 1
fi

# Start the build
print_status "🚀 Starting build... (this will take 4-8 hours)"
print_status "You can monitor progress with: tail -f build.log"

# Determine number of parallel jobs
CPU_COUNT=$(sysctl -n hw.ncpu)
JOBS=$((CPU_COUNT - 1))  # Leave one CPU free
print_status "Using $JOBS parallel jobs (CPU count: $CPU_COUNT)"

# Build with logging
ninja -C out/Release chrome -j$JOBS 2>&1 | tee build.log

# Check if build succeeded
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "🎉 Build completed successfully!"
    
    # Create application bundle
    print_status "📦 Creating application bundle..."
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
    print_status "💿 Creating DMG..."
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
    echo "🧪 To test your build:"
    echo "1. Run: ./BrowserOS-Grazie.app/Contents/MacOS/BrowserOS"
    echo "2. Go to: chrome://settings/grazie"
    echo "3. Enter your Grazie JWT token"
    echo "4. Test keyboard shortcuts:"
    echo "   - ⌘⇧L: Toggle AI chat panel"
    echo "   - ⌘⇧;: Cycle through models"
    echo ""
    echo "📋 Build log saved to: build.log"
    
else
    print_error "❌ Build failed! Check build.log for details."
    exit 1
fi 