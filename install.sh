#!/bin/bash

EXT_UUID="solospace@denhafiz.github.com"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

echo "Installing Solo Space extension ($EXT_UUID)..."

# Create extension directory
mkdir -p "$EXT_DIR"

# Copy files
cp metadata.json "$EXT_DIR/"
cp extension.js "$EXT_DIR/"
cp prefs.js "$EXT_DIR/"

# Copy schemas
mkdir -p "$EXT_DIR/schemas"
cp schemas/*.xml "$EXT_DIR/schemas/"
glib-compile-schemas "$EXT_DIR/schemas/"

# Enable the extension
gnome-extensions enable "$EXT_UUID"

echo "Solo Space extension installed and enabled successfully!"
echo "--------------------------------------------------------"
echo "IMPORTANT: To apply the extension, you must restart GNOME Shell."
echo "If you are on Wayland (default on Arch), please LOG OUT and LOG BACK IN."
echo "If you are on X11, you can press Alt+F2, type 'r', and press Enter."
