import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SoloSpaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._pendingWindows = new Map();
        this._pendingTiles = new Map();

        this._windowCreatedId = global.display.connect('window-created', (display, window) => {
            if (this._shouldIgnoreWindow(window)) {
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
     * Returns true for non-normal, taskbar-skipped, transient/dialog, or sticky windows
     * that should remain on their current workspace.
     */
    _shouldIgnoreWindow(window) {
        if (!window) return true;
        if (window.window_type !== Meta.WindowType.NORMAL) return true;
        if (window.is_skip_taskbar()) return true;
        if (window.get_transient_for() !== null) return true;
        if (window.is_attached_dialog()) return true;
        if (window.is_on_all_workspaces()) return true;
        return false;
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

            // Re-check properties since they may have changed since creation
            if (this._shouldIgnoreWindow(window)) {
                return;
            }

            if (!this._isBlacklistedWindow(window)) {
                this._handleNewWindow(window);
            }
        };

        const cancelWindow = () => {
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
            cleanup.timeoutId = null;
            handleWindow();
            return GLib.SOURCE_REMOVE;
        });

        // Track for cleanup on disable()
        this._pendingWindows.set(window, cleanup);
    }

    /**
     * Checks if a window matches any user-configured exclusion pattern.
     */
    _isBlacklistedWindow(window) {
        const wmClass = (window.get_wm_class() || '').toLowerCase();
        const wmInstance = (window.get_wm_class_instance() || '').toLowerCase();
        const excludedApps = this._settings.get_strv('excluded-apps');

        return excludedApps.some(raw => {
            const name = raw.trim().toLowerCase();
            return name.length > 0 && (wmClass.includes(name) || wmInstance.includes(name));
        });
    }

    /**
     * Returns normal, non-taskbar-skipped windows on a workspace (optionally filtered by monitor),
     * excluding `excludeWindow`.
     */
    _getOtherNormalWindows(workspace, excludeWindow, monitorIndex = null) {
        return workspace.list_windows().filter(w => {
            if (w === excludeWindow) return false;
            if (w.window_type !== Meta.WindowType.NORMAL) return false;
            if (w.is_skip_taskbar()) return false;
            if (monitorIndex !== null && w.get_monitor() !== monitorIndex) return false;
            return true;
        });
    }

    /**
     * Version-safe maximize/unmaximize helpers across GNOME Shell 45-51.
     */
    _maximizeWindow(window) {
        if (!window.can_maximize()) return;
        if (window.maximize.length > 0) {
            window.maximize(Meta.MaximizeFlags.BOTH);
        } else {
            window.maximize();
        }
    }

    _unmaximizeWindow(window) {
        if (window.unmaximize.length > 0) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        } else {
            window.unmaximize();
        }
    }

    /**
     * Handles workspace management for a confirmed application window.
     */
    _handleNewWindow(window) {
        const workspaceManager = global.workspace_manager;
        const position = this._settings.get_string('window-position');
        const fillEmptySpace = this._settings.get_boolean('fill-empty-space');
        const autoMaximize = this._settings.get_boolean('auto-maximize');
        const windowMonitor = window.get_monitor();

        // Check if Fill Empty Space is enabled and there is a half-tiled window
        // on the same monitor of the active workspace before moving workspaces.
        if (fillEmptySpace) {
            const activeWs = workspaceManager.get_active_workspace();
            const halfInfo = this._getHalfTiledInfo(activeWs, window);

            if (halfInfo) {
                this._tileToEmptyHalf(window, halfInfo);
                return;
            }
        }

        // Respect GNOME's "workspaces on primary display only" setting:
        // don't switch/create workspaces when a window opens on a secondary monitor.
        if (Meta.prefs_get_workspaces_only_on_primary() &&
            windowMonitor !== Main.layoutManager.primaryIndex) {
            return;
        }

        const monitorFilter = Meta.prefs_get_workspaces_only_on_primary()
            ? Main.layoutManager.primaryIndex
            : null;

        const activeWs = workspaceManager.get_active_workspace();
        const activeOtherWindows = this._getOtherNormalWindows(activeWs, window, monitorFilter);

        if (position === 'new-workspace') {
            // Find a workspace that is currently empty of normal windows
            let emptyWorkspace = null;

            // Prefer staying on the active workspace if it is already empty
            if (activeOtherWindows.length === 0) {
                emptyWorkspace = activeWs;
            } else {
                for (let i = 0; i < workspaceManager.n_workspaces; i++) {
                    const ws = workspaceManager.get_workspace_by_index(i);
                    if (this._getOtherNormalWindows(ws, window, monitorFilter).length === 0) {
                        emptyWorkspace = ws;
                        break;
                    }
                }
            }

            if (emptyWorkspace) {
                if (emptyWorkspace !== activeWs) {
                    window.change_workspace(emptyWorkspace);
                    emptyWorkspace.activate(global.get_current_time());
                }
            } else {
                workspaceManager.append_new_workspace(false, global.get_current_time());
                const newWs = workspaceManager.get_workspace_by_index(workspaceManager.n_workspaces - 1);
                window.change_workspace(newWs);
                newWs.activate(global.get_current_time());
            }
        } else {
            // "To the Right" or "To the Left"
            // If the current workspace is already empty, keep the new window here
            // instead of leaving an unused empty workspace behind.
            if (activeOtherWindows.length > 0) {
                const activeIndex = activeWs.index();

                workspaceManager.append_new_workspace(false, global.get_current_time());
                const newWs = workspaceManager.get_workspace_by_index(workspaceManager.n_workspaces - 1);

                window.change_workspace(newWs);

                if (position === 'right') {
                    workspaceManager.reorder_workspace(newWs, activeIndex + 1);
                } else if (position === 'left') {
                    workspaceManager.reorder_workspace(newWs, activeIndex);
                }

                newWs.activate(global.get_current_time());
            }
        }

        if (autoMaximize) {
            this._maximizeWindow(window);
        }
    }

    /**
     * Checks whether there is exactly one normal window on the same monitor of the workspace
     * that occupies roughly half the monitor width (left or right half).
     *
     * Returns an object { monitor, side: 'left'|'right', workArea } when a
     * half-tiled window is found, or null otherwise.
     */
    _getHalfTiledInfo(workspace, newWindow) {
        const targetMonitor = newWindow.get_monitor();
        const normalWindows = this._getOtherNormalWindows(workspace, newWindow, targetMonitor);

        // We only act when there is exactly one other window on this monitor
        if (normalWindows.length !== 1) {
            return null;
        }

        const existing = normalWindows[0];
        const workArea = workspace.get_work_area_for_monitor(targetMonitor);
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

        const leftEdge = workArea.x;
        const midPoint = workArea.x + halfW;

        const isOnLeft = Math.abs(frame.x - leftEdge) <= tolerance;
        const isOnRight = Math.abs(frame.x - midPoint) <= tolerance;

        if (isOnLeft) {
            return { monitor: targetMonitor, side: 'right', workArea };
        } else if (isOnRight) {
            return { monitor: targetMonitor, side: 'left', workArea };
        }

        return null;
    }

    /**
     * Moves and resizes the new window to fill the specified empty half,
     * tracking the timeout so it is cancelled if the window closes or the extension disables.
     */
    _tileToEmptyHalf(window, { side, workArea }) {
        const halfW = Math.floor(workArea.width / 2);

        const x = side === 'left' ? workArea.x : workArea.x + halfW;
        const y = workArea.y;
        const w = side === 'left' ? halfW : workArea.width - halfW;
        const h = workArea.height;

        // Cancel any previous pending tile for this window
        this._cancelPendingTile(window);

        // Un-maximize first so move_resize_frame works reliably
        this._unmaximizeWindow(window);

        const tileEntry = { timeoutId: null, unmanagedId: null };

        tileEntry.unmanagedId = window.connect('unmanaged', () => {
            this._cancelPendingTile(window);
        });

        tileEntry.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            tileEntry.timeoutId = null;
            this._cancelPendingTile(window);
            if (window.get_compositor_private()) {
                window.move_resize_frame(false, x, y, w, h);
            }
            return GLib.SOURCE_REMOVE;
        });

        this._pendingTiles.set(window, tileEntry);
    }

    _cancelPendingTile(window) {
        const entry = this._pendingTiles?.get(window);
        if (!entry) return;

        if (entry.timeoutId) {
            GLib.source_remove(entry.timeoutId);
            entry.timeoutId = null;
        }
        if (entry.unmanagedId) {
            window.disconnect(entry.unmanagedId);
            entry.unmanagedId = null;
        }
        this._pendingTiles.delete(window);
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

        // Clean up any pending tile timeouts
        if (this._pendingTiles) {
            for (const [window, entry] of this._pendingTiles) {
                if (entry.timeoutId) {
                    GLib.source_remove(entry.timeoutId);
                }
                if (entry.unmanagedId) {
                    window.disconnect(entry.unmanagedId);
                }
            }
            this._pendingTiles.clear();
            this._pendingTiles = null;
        }

        this._settings = null;
    }
}
