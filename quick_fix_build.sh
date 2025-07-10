#!/bin/bash

# Quick Fix for NaCl Build Configuration Issue
# Run this script to immediately fix the build configuration

set -e

echo "🔧 Quick Fix for NaCl Build Configuration Issue"
echo "=============================================="

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

cd "$(dirname "$0")"
BUILD_ROOT=$(pwd)

print_status "Navigating to build source directory..."
cd build/src

# Set up PATH
export PATH="$BUILD_ROOT/build/depot_tools:$PATH"

print_status "Attempting build configuration with explicit NaCl settings..."

# Try the build configuration with explicit checkout_nacl=false
gn gen out/Release --args='
  is_debug=false
  is_component_build=false
  symbol_level=0
  enable_nacl=false
  checkout_nacl=false
  remove_webcore_debug_symbols=true
  proprietary_codecs=true
  ffmpeg_branding="Chrome"
  is_official_build=true
  chrome_pgo_phase=0
  use_thin_lto=false
  target_cpu="x64"
  mac_deployment_target="10.15"
  enable_grazie_integration=true
  
  # Additional stability configurations
  treat_warnings_as_errors=false
  use_goma=false
  use_remoteexec=false
  
  # Disable problematic features for local builds
  enable_widevine=false
  enable_hangout_services_extension=false
  enable_google_now=false
'

if [ $? -eq 0 ]; then
    print_success "✅ Build configuration successful!"
    print_status "🚀 Starting compilation..."
    
    # Determine number of parallel jobs
    CPU_COUNT=$(sysctl -n hw.ncpu)
    JOBS=$((CPU_COUNT - 1))  # Leave one CPU free
    print_status "Using $JOBS parallel jobs (CPU count: $CPU_COUNT)"
    
    # Start the build
    print_status "Building BrowserOS with Grazie integration..."
    ninja -C out/Release chrome -j$JOBS 2>&1 | tee build.log
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "🎉 Build completed successfully!"
        print_status "Application will be available at: build/src/BrowserOS-Grazie.app"
    else
        print_error "❌ Build failed! Check build.log for details."
        exit 1
    fi
else
    print_error "❌ Build configuration failed!"
    print_status "💡 The gclient sync is still running in the background."
    print_status "Wait for it to complete, then try running ./continue_build.sh again."
    exit 1
fi 