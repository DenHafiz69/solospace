import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class SoloSpaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
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
            const position = this._settings.get_string('window-position');
            
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
        });
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
    }
}
