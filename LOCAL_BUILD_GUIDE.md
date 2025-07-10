# Local Build Guide: BrowserOS with Grazie Integration

This guide will walk you through building BrowserOS with Grazie integration locally on macOS.

## Prerequisites

### System Requirements
- macOS 10.15 (Catalina) or later
- Xcode 12.0 or later
- At least 100GB free disk space
- 16GB RAM minimum (32GB recommended)
- 4+ CPU cores (8+ recommended)

### Install Dependencies

1. **Install Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **Install Homebrew** (if not already installed)
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Install Build Dependencies**
   ```bash
   brew install python@3.11 node ninja
   ```

## Build Steps

### 1. Clone the Repository
```bash
git clone https://github.com/ashchupliak/BrowserOS-grazie.git
cd BrowserOS-grazie
```

### 2. Setup Build Environment
```bash
# Create build directory
mkdir -p build
cd build

# Download depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PWD/depot_tools:$PATH"

# Add to your shell profile for persistent access
echo 'export PATH="$HOME/BrowserOS-grazie/build/depot_tools:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 3. Download Chromium Source
```bash
# This will take 30-60 minutes depending on your connection
fetch --nohooks chromium
cd src

# Check out the specific Chromium version we're building against
git checkout $(cat ../../CHROMIUM_VERSION)

# Download additional dependencies (this can take another 30-60 minutes)
gclient runhooks
```

### 4. Apply BrowserOS and Grazie Integration
```bash
# Copy BrowserOS files to Chromium source
cp -r ../../chrome ./
cp -r ../../chromium_src ./
cp -r ../../resources ./

# Apply all patches
echo "Applying BrowserOS patches..."
for patch in ../../patches/nxtscape/*.patch; do
  if [ -f "$patch" ]; then
    echo "Applying: $(basename "$patch")"
    git apply "$patch" || echo "Warning: Patch $(basename "$patch") failed"
  fi
done

echo "Applying Grazie integration patches..."
for patch in ../../patches/grazie/*.patch; do
  if [ -f "$patch" ]; then
    echo "Applying: $(basename "$patch")"
    git apply "$patch" || echo "Warning: Patch $(basename "$patch") failed"
  fi
done
```

### 5. Configure Build
```bash
# Generate build configuration
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
```

### 6. Build BrowserOS
```bash
# This is the longest step - can take 4-8 hours depending on your machine
# Use -j flag to control parallel jobs (default is CPU count)
ninja -C out/Release chrome

# If you want to monitor progress:
ninja -C out/Release chrome -v
```

### 7. Create Application Bundle
```bash
# Create the app bundle structure
mkdir -p BrowserOS-Grazie.app/Contents/MacOS
mkdir -p BrowserOS-Grazie.app/Contents/Resources

# Copy the built binary
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

# Copy icon file
cp ../../resources/icons/mac/app.icns BrowserOS-Grazie.app/Contents/Resources/

echo "✅ Build complete! BrowserOS-Grazie.app is ready."
```

### 8. Create DMG (Optional)
```bash
# Create a disk image for distribution
hdiutil create -volname "BrowserOS-Grazie" -srcfolder BrowserOS-Grazie.app -ov -format UDZO BrowserOS-Grazie.dmg
```

## Testing Your Build

1. **Run the Application**
   ```bash
   ./BrowserOS-Grazie.app/Contents/MacOS/BrowserOS
   ```

2. **Test Grazie Integration**
   - Open the browser
   - Go to `chrome://settings/grazie`
   - Enter your Grazie JWT token
   - Try the keyboard shortcuts:
     - `⌘⇧L` - Toggle AI chat panel
     - `⌘⇧;` - Cycle through models

3. **Verify Features**
   - Check that the Grazie settings page loads
   - Verify model discovery works with your token
   - Test chat functionality
   - Confirm copy-to-clipboard works

## Troubleshooting

### Common Issues

1. **Build Fails with "No such file or directory"**
   - Ensure you're in the correct directory (`build/src`)
   - Check that all patches applied successfully

2. **Python/Node.js Version Issues**
   ```bash
   # Use specific versions
   brew install python@3.11
   brew install node@18
   ```

3. **Disk Space Issues**
   - The build requires ~100GB of space
   - Monitor with `df -h`

4. **Memory Issues**
   - Reduce parallel jobs: `ninja -C out/Release chrome -j4`
   - Close other applications during build

5. **Patch Application Failures**
   - Check git status: `git status`
   - Manually apply failed patches if needed

### Performance Tips

1. **Faster Builds**
   - Use `is_debug=false` (already set)
   - Use `symbol_level=0` (already set)
   - Increase job count: `ninja -j8` (match your CPU cores)

2. **Incremental Builds**
   - After the first build, subsequent builds will be much faster
   - Only changed files will be recompiled

3. **Build Cache**
   - Consider using `ccache` for faster rebuilds:
   ```bash
   brew install ccache
   export CC="ccache clang"
   export CXX="ccache clang++"
   ```

## Build Time Estimates

- **Initial setup**: 1-2 hours
- **Source download**: 1-2 hours
- **First build**: 4-8 hours
- **Incremental builds**: 5-30 minutes

## Next Steps

After building successfully:
1. Install the app to `/Applications`
2. Configure your Grazie JWT token
3. Test all features
4. Report any issues on GitHub

## Getting Help

If you encounter issues:
1. Check the GitHub Issues page
2. Review the build logs carefully
3. Ensure all dependencies are installed
4. Try a clean build if needed:
   ```bash
   rm -rf out/
   gn gen out/Release --args='...'
   ninja -C out/Release chrome
   ```

---

**Note**: This is a complex build process. The first build will take several hours, but subsequent builds will be much faster. Be patient and ensure you have sufficient disk space and memory. 