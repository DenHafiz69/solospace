import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SoloSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'General Settings',
            description: 'Configure how Solo Space manages new windows',
        });
        page.add(group);

        const row = new Adw.ComboRow({
            title: 'New Window Position',
            subtitle: 'Where should new application windows be placed?',
            model: new Gtk.StringList({
                strings: ['New Workspace (Default)', 'To the Right', 'To the Left'],
            }),
        });

        // Bind the 'selected' property manually since Adw.ComboRow:selected is a guint
        // and GSettings enum bindings expect a gint. settings.bind silently fails.
        row.selected = settings.get_enum('window-position');

        row.connect('notify::selected', () => {
            settings.set_enum('window-position', row.selected);
        });

        group.add(row);

        // Fill Empty Space toggle
        const fillRow = new Adw.SwitchRow({
            title: 'Fill Empty Half-Space',
            subtitle: 'If the current workspace has a half-width window, place new windows in the empty half instead of a new workspace',
        });

        settings.bind('fill-empty-space', fillRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        group.add(fillRow);
        window.add(page);
    }
}
