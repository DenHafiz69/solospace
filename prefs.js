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
            description: 'Configure how SoloSpace manages new windows',
        });
        page.add(group);

        const row = new Adw.ComboRow({
            title: 'New Window Position',
            subtitle: 'Where should new application windows be placed?',
            model: new Gtk.StringList({
                strings: ['New Workspace (Default)', 'To the Right', 'To the Left'],
            }),
        });

        // Bind the 'selected' property of the ComboRow to the 'window-position' setting
        // Since our enum values match the indices 0, 1, 2, this works directly.
        settings.bind(
            'window-position',
            row,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );

        group.add(row);
        window.add(page);
    }
}
