import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SoloSpaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._pendingWindows = new Map();

        this._windowCreatedId = global.display.connect('window-created', (display, window) => {
            // Early-exit checks that are reliable at creation time
            if (window.window_type !== Meta.WindowType.NORMAL) {
                return;
            }

            if (window.is_skip_taskbar()) {
                return;
            }

            // Defer the workspace decision until WM_CLASS is available.
            // At window-created time, WM_CLASS and dimensions are not yet
            // set (null / 0x0), so we cannot distinguish clipboard helpers
            // (e.g. xclip spawned by Helix's space+y) from real app windows.
            this._deferWindowHandling(window);
        });
    }

    /**
     * Defers workspace management until the window's WM_CLASS property
     * is available.
     *
     * Uses notify::wm-class signal with a timeout fallback, and listens
     * for the unmanaged signal to cancel if the window is destroyed first
     * (common for short-lived clipboard helpers).
     */
    _deferWindowHandling(window) {
        let handled = false;
        const cleanup = {};

        const finish = () => {
            if (handled) return;
            handled = true;

            if (cleanup.classSignalId) {
                window.disconnect(cleanup.classSignalId);
                cleanup.classSignalId = null;
            }
            if (cleanup.unmanagedSignalId) {
                window.disconnect(cleanup.unmanagedSignalId);
                cleanup.unmanagedSignalId = null;
            }
            if (cleanup.timeoutId) {
                GLib.source_remove(cleanup.timeoutId);
                cleanup.timeoutId = null;
            }

            this._pendingWindows.delete(window);
        };

        const handleWindow = () => {
            finish();

            // Re-check skip_taskbar since it may have changed since creation
            if (window.is_skip_taskbar()) {
                return;
            }

            if (!this._isBlacklistedWindow(window)) {
                this._handleNewWindow(window);
            }
        };

        const cancelWindow = () => {
            // Window was destroyed before we could handle it — do nothing
            finish();
        };

        // Check if WM_CLASS is already available (rare but possible)
        const wmClass = window.get_wm_class();
        if (wmClass) {
            if (!this._isBlacklistedWindow(window)) {
                this._handleNewWindow(window);
            }
            return;
        }

        // Wait for WM_CLASS to be set by the X11/XWayland client
        cleanup.classSignalId = window.connect('notify::wm-class', () => {
            handleWindow();
        });

        // Cancel if window is destroyed before we handle it
        cleanup.unmanagedSignalId = window.connect('unmanaged', () => {
            cancelWindow();
        });

        // Timeout fallback in case WM_CLASS is never set (some rare windows)
        cleanup.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            cleanup.timeoutId = null; // Already fired, don't try to source_remove
            handleWindow();
            return GLib.SOURCE_REMOVE;
        });

        // Track for cleanup on disable()
        this._pendingWindows.set(window, cleanup);
    }

    /**
     * Checks if a window belongs to a known clipboard or utility helper
     * that should not trigger workspace management.
     */
    _isBlacklistedWindow(window) {
        const wmClass = (window.get_wm_class() || '').toLowerCase();
        const wmInstance = (window.get_wm_class_instance() || '').toLowerCase();

        const BLACKLIST = [
            'xclip',
            'xsel',
            'wl-copy',
            'wl-clipboard',
            'xdotool',
        ];

        if (BLACKLIST.some(name => wmClass.includes(name) || wmInstance.includes(name))) {
            return true;
        }

        return false;
    }

    /**
     * Handles workspace management for a confirmed application window.
     * Contains the core logic previously inline in the window-created handler.
     */
    _handleNewWindow(window) {
        const workspaceManager = global.workspace_manager;
        const position = this._settings.get_string('window-position');
        const fillEmptySpace = this._settings.get_boolean('fill-empty-space');

        // Check if Fill Empty Space is enabled and there is a half-tiled window
        // on the active workspace before applying the normal position logic.
        if (fillEmptySpace) {
            const activeWs = workspaceManager.get_active_workspace();
            const halfInfo = this._getHalfTiledInfo(activeWs, window);

            if (halfInfo) {
                // Tile the new window to the empty half on the same workspace
                this._tileToEmptyHalf(window, halfInfo);
                return;
            }
        }

        if (position === 'new-workspace') {
            // Default behavior: Find a workspace that is currently empty of normal windows
            let emptyWorkspace = null;
            
            for (let i = 0; i < workspaceManager.n_workspaces; i++) {
                let ws = workspaceManager.get_workspace_by_index(i);
                
                // Get all windows on this workspace that are NOT the new window
                let normalWindows = ws.list_windows().filter(w => {
                    return w !== window &&
                           w.window_type === Meta.WindowType.NORMAL && 
                           !w.is_skip_taskbar();
                });
                
                if (normalWindows.length === 0) {
                    emptyWorkspace = ws;
                    break;
                }
            }
            
            // If we found an empty workspace, move the window there
            if (emptyWorkspace) {
                window.change_workspace(emptyWorkspace);
                emptyWorkspace.activate(global.get_current_time());
            } else {
                // If there is no empty workspace, we append a new one
                workspaceManager.append_new_workspace(false, global.get_current_time());
                let newWsIndex = workspaceManager.n_workspaces - 1;
                let newWs = workspaceManager.get_workspace_by_index(newWsIndex);
                
                window.change_workspace(newWs);
                newWs.activate(global.get_current_time());
            }
        } else {
            // "To the Right" or "To the Left"
            const activeWs = workspaceManager.get_active_workspace();
            const activeIndex = activeWs.index();
            
            // Always create a new workspace for these options
            workspaceManager.append_new_workspace(false, global.get_current_time());
            const newWsIndex = workspaceManager.n_workspaces - 1;
            const newWs = workspaceManager.get_workspace_by_index(newWsIndex);
            
            // Move window to the new workspace first
            window.change_workspace(newWs);
            
            // Reorder the workspace
            if (position === 'right') {
                workspaceManager.reorder_workspace(newWs, activeIndex + 1);
            } else if (position === 'left') {
                workspaceManager.reorder_workspace(newWs, activeIndex);
            }
            
            // Activate the new workspace
            newWs.activate(global.get_current_time());
        }
    }

    /**
     * Checks whether there is exactly one normal window on the workspace that
     * occupies roughly half the monitor width (left or right half).
     *
     * Returns an object { monitor, side: 'left'|'right', workArea } when a
     * half-tiled window is found, or null otherwise.
     */
    _getHalfTiledInfo(workspace, newWindow) {
        const normalWindows = workspace.list_windows().filter(w => {
            return w !== newWindow &&
                   w.window_type === Meta.WindowType.NORMAL &&
                   !w.is_skip_taskbar();
        });

        // We only act when there is exactly one window on the workspace
        if (normalWindows.length !== 1) {
            return null;
        }

        const existing = normalWindows[0];
        const monitorIndex = existing.get_monitor();
        const workArea = workspace.get_work_area_for_monitor(monitorIndex);
        const frame = existing.get_frame_rect();

        const halfW = workArea.width / 2;
        // Allow ±10 % tolerance so snapped-but-not-pixel-perfect windows count
        const tolerance = workArea.width * 0.10;

        const isHalfWidth = Math.abs(frame.width - halfW) <= tolerance;
        const isFullHeight = Math.abs(frame.height - workArea.height) <= tolerance;
        const alignedTop = Math.abs(frame.y - workArea.y) <= tolerance;

        if (!isHalfWidth || !isFullHeight || !alignedTop) {
            return null;
        }

        // Determine which side the existing window is on
        const leftEdge = workArea.x;
        const midPoint = workArea.x + halfW;

        const isOnLeft = Math.abs(frame.x - leftEdge) <= tolerance;
        const isOnRight = Math.abs(frame.x - midPoint) <= tolerance;

        if (isOnLeft) {
            return { monitor: monitorIndex, side: 'right', workArea };
        } else if (isOnRight) {
            return { monitor: monitorIndex, side: 'left', workArea };
        }

        return null;
    }

    /**
     * Moves and resizes the new window to fill the specified empty half.
     */
    _tileToEmptyHalf(window, { monitor, side, workArea }) {
        const halfW = Math.floor(workArea.width / 2);

        const x = side === 'left' ? workArea.x : workArea.x + halfW;
        const y = workArea.y;
        const w = side === 'left' ? halfW : workArea.width - halfW;
        const h = workArea.height;

        // Un-maximize first so move_resize_frame works reliably
        window.unmaximize(Meta.MaximizeFlags.BOTH);

        // Use GLib timeout to let the window finish its initial map before resizing
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            window.move_resize_frame(false, x, y, w, h);
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }

        // Clean up any pending deferred handlers
        if (this._pendingWindows) {
            for (const [window, cleanup] of this._pendingWindows) {
                if (cleanup.classSignalId) {
                    window.disconnect(cleanup.classSignalId);
                }
                if (cleanup.unmanagedSignalId) {
                    window.disconnect(cleanup.unmanagedSignalId);
                }
                if (cleanup.timeoutId) {
                    GLib.source_remove(cleanup.timeoutId);
                }
            }
            this._pendingWindows.clear();
            this._pendingWindows = null;
        }
    }
}
