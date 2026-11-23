import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SoloSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

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
            if (settings.get_enum('window-position') !== row.selected) {
                settings.set_enum('window-position', row.selected);
            }
        });

        const posChangedId = settings.connect('changed::window-position', () => {
            const val = settings.get_enum('window-position');
            if (row.selected !== val) {
                row.selected = val;
            }
        });

        group.add(row);

        // Fill Empty Space toggle
        const fillRow = new Adw.SwitchRow({
            title: 'Fill Empty Half-Space',
            subtitle: 'If the current workspace has a half-width window, place new windows in the empty half instead of a new workspace',
        });
        settings.bind('fill-empty-space', fillRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(fillRow);

        // Auto-maximize toggle
        const autoMaximizeRow = new Adw.SwitchRow({
            title: 'Auto-Maximize New Windows',
            subtitle: 'Automatically maximize new windows placed on their own workspace',
        });
        settings.bind('auto-maximize', autoMaximizeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(autoMaximizeRow);

        // Excluded applications group
        const exclusionGroup = new Adw.PreferencesGroup({
            title: 'Exclusions',
            description: 'Applications matching these WM_CLASS substrings will stay on the current workspace',
        });
        page.add(exclusionGroup);

        const excludedRow = new Adw.EntryRow({
            title: 'Excluded Apps (comma-separated)',
            show_apply_button: true,
        });

        const formatList = (list) => list.join(', ');
        const parseList = (text) => text
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);

        excludedRow.set_text(formatList(settings.get_strv('excluded-apps')));

        excludedRow.connect('apply', () => {
            settings.set_strv('excluded-apps', parseList(excludedRow.get_text()));
        });

        const excludedChangedId = settings.connect('changed::excluded-apps', () => {
            const formatted = formatList(settings.get_strv('excluded-apps'));
            if (excludedRow.get_text() !== formatted) {
                excludedRow.set_text(formatted);
            }
        });

        exclusionGroup.add(excludedRow);

        window.connect('close-request', () => {
            settings.disconnect(posChangedId);
            settings.disconnect(excludedChangedId);
        });

        window.add(page);
    }
}
