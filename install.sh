#!/bin/bash

EXT_UUID="solospace@denhafiz.my"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

echo "Installing Solo Space extension ($EXT_UUID)..."

# Create extension directory
mkdir -p "$EXT_DIR"

# Copy files
cp --remove-destination metadata.json "$EXT_DIR/"
cp --remove-destination extension.js "$EXT_DIR/"
cp --remove-destination prefs.js "$EXT_DIR/"

# Copy schemas (compile in a temp dir then move atomically so mmap'd gschemas.compiled isn't overwritten in-place)
mkdir -p "$EXT_DIR/schemas"
cp --remove-destination schemas/*.xml "$EXT_DIR/schemas/"
TMP_SCHEMA_DIR="$(mktemp -d)"
cp schemas/*.xml "$TMP_SCHEMA_DIR/"
glib-compile-schemas "$TMP_SCHEMA_DIR"
mv -f "$TMP_SCHEMA_DIR/gschemas.compiled" "$EXT_DIR/schemas/gschemas.compiled"
rm -rf "$TMP_SCHEMA_DIR"

# Enable the extension
gnome-extensions enable "$EXT_UUID"

echo "Solo Space extension installed and enabled successfully!"
echo "--------------------------------------------------------"
echo "IMPORTANT: To apply the extension, you must restart GNOME Shell."
echo "If you are on Wayland (default on Arch), please LOG OUT and LOG BACK IN."
echo "If you are on X11, you can press Alt+F2, type 'r', and press Enter."
