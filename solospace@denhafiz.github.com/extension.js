import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SoloSpaceExtension extends Extension {
    enable() {
        this._windowCreatedId = global.display.connect('window-created', (display, window) => {
            // We only care about normal application windows
            if (window.window_type !== Meta.WindowType.NORMAL) {
                return;
            }

            // Skip internal windows or taskbar hidden windows
            if (window.is_skip_taskbar()) {
                return;
            }
            
            const workspaceManager = global.workspace_manager;
            
            // Find a workspace that is currently empty of normal windows
            // The newly created window might already be on one of these, but we don't count it yet
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
        });
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
    }
}
