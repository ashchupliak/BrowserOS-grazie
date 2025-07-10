solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {
      "checkout_nacl": False,
      "checkout_android": False,
      "checkout_chromeos": False,
      "checkout_ios": False,
      "checkout_fuchsia": False,
    },
  },
]
target_os = ["mac"]
