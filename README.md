# Solo Space

A GNOME Shell extension that automatically places every new application window on its own dedicated workspace, similar to macOS full-screen apps.

## Features

- **Automatic Workspace Isolation**: Moves newly opened normal windows to an empty workspace and switches to it automatically.
- **Flexible Placement**: Open new windows on the first available empty workspace, to the right of the current workspace, or to the left. Keeps the window in place if the current workspace is already empty.
- **Fill Empty Half-Space**: Optionally tiles a new window into the open half of the current workspace when a single half-width window is already present on that monitor.
- **Auto-Maximize**: Optionally maximizes new windows placed on a solo workspace.
- **Smart Filtering**: Ignores dialogs, transient popups, attached dialogs, sticky windows, and taskbar-skipped helpers. Includes a customizable `WM_CLASS` exclusion list in preferences (defaulting to clipboard/utility tools like `xclip`, `xsel`, `wl-copy`, `wl-clipboard`, `xdotool`).
- **Multi-Monitor Aware**: Respects GNOME's *Workspaces on primary display only* setting and evaluates half-tiling per monitor.

## Requirements

- GNOME Shell **45–51**
- `glib-compile-schemas` (from `glib2`)
- `curl` and `tar` (for the one-line installer)

## Installation

### Quick Install (`curl`)

```bash
TMP=$(mktemp -d) && \
curl -fsSL https://github.com/DenHafiz69/solospace/archive/refs/heads/master.tar.gz | tar -xz -C "$TMP" && \
(cd "$TMP/solospace-master" && bash install.sh) && \
rm -rf "$TMP"
```

### From Source (`git`)

```bash
git clone https://github.com/DenHafiz69/solospace.git
cd solospace
./install.sh
```

### Activate

Restart GNOME Shell after installing:
- **Wayland**: Log out and log back in.
- **X11**: Press `Alt+F2`, type `r`, and press `Enter`.

Then ensure the extension is enabled:

```bash
gnome-extensions enable solospace@denhafiz.my
```

## Configuration

Open the extension settings via the **Extensions** app or run:

```bash
gnome-extensions prefs solospace@denhafiz.my
```

Available options:
- **New Window Position**: `New Workspace (Default)`, `To the Right`, or `To the Left`.
- **Fill Empty Half-Space**: Tile new windows alongside an existing half-width window instead of opening a new workspace.
- **Auto-Maximize New Windows**: Automatically maximize new solo windows.
- **Excluded Apps**: Comma-separated `WM_CLASS` substrings to keep on the current workspace.

## Uninstall

```bash
gnome-extensions disable solospace@denhafiz.my
rm -rf ~/.local/share/gnome-shell/extensions/solospace@denhafiz.my
```

## License

MIT — see [LICENSE](LICENSE).
