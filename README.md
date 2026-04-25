# SoloSpace

SoloSpace is a GNOME Shell extension that automatically opens every new application window on its own dedicated workspace. This provides a focused, single-tasking experience similar to macOS full-screen apps.

## ✨ Features

- **Automatic Isolation**: Every new window is moved to an empty workspace.
- **Dynamic Workspace Creation**: If no empty workspaces are available, a new one is created automatically.
- **Auto-Activation**: The new workspace is activated immediately so you can start working right away.
- **Minimalist**: Lightweight and does not interfere with your existing workflow.

## 🚀 Installation

### Using the install script

1. Clone the repository:
   ```bash
   git clone https://github.com/DenHafiz69/solospace.git
   cd solospace
   ```

2. Run the installation script:
   ```bash
   ./install.sh
   ```

3. **Restart GNOME Shell**:
   - **Wayland**: Log out and log back in.
   - **X11**: Press `Alt+F2`, type `r`, and press `Enter`.

### Manual Installation

1. Create the extension directory:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/solospace@denhafiz.github.com
   ```

2. Copy the files:
   ```bash
   cp extension.js metadata.json ~/.local/share/gnome-shell/extensions/solospace@denhafiz.github.com/
   ```

3. Enable the extension:
   ```bash
   gnome-extensions enable solospace@denhafiz.github.com
   ```

## 🛠 Compatibility

Supported GNOME versions:
- GNOME 45
- GNOME 46
- GNOME 47
- GNOME 50
