import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import UPowerGlib from 'gi://UPowerGlib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const BUDS_MAC = 'A0:AC:69:09:0F:35';
const BUDS_INTERVAL_SECONDS = 300;
const BUDS_RETRY_SECONDS = 5;
const BUDS_RETRIES = 6;
const LOW = 20;

const ICONS = {
    [UPowerGlib.DeviceKind.MOUSE]: '🖱',
    [UPowerGlib.DeviceKind.KEYBOARD]: '⌨',
    [UPowerGlib.DeviceKind.HEADSET]: '🎧',
    [UPowerGlib.DeviceKind.HEADPHONES]: '🎧',
};

// UPower reports some Logitech HID++ mice (e.g. MX Master 3S) as KEYBOARD.
function iconFor(device) {
    if (/master|mouse|anywhere/i.test(device.model))
        return ICONS[UPowerGlib.DeviceKind.MOUSE];
    return ICONS[device.kind];
}

export default class PeripheralBatteryExtension extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, this.metadata.name, true);
        this._box = new St.BoxLayout();
        this._button.add_child(this._box);
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._buds = null;
        this._client = UPowerGlib.Client.new();
        this._deviceSignals = new Map();
        this._clientSignals = [
            this._client.connect('device-added', () => this._watchDevices()),
            this._client.connect('device-removed', () => this._watchDevices()),
        ];
        this._watchDevices();

        this._budsProxy = Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            'org.bluez', `/org/bluez/hci0/dev_${BUDS_MAC.replaceAll(':', '_')}`, 'org.bluez.Device1', null);
        this._budsSignal = this._budsProxy.connect('g-properties-changed', (_p, changed) => {
            if (changed.lookup_value('Connected', null))
                this._refreshBuds(BUDS_RETRIES);
        });
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, BUDS_INTERVAL_SECONDS, () => {
            this._refreshBuds();
            return GLib.SOURCE_CONTINUE;
        });
        this._refreshBuds();
    }

    disable() {
        GLib.source_remove(this._timer);
        this._cancelRetry();
        this._budsProxy.disconnect(this._budsSignal);
        this._clientSignals.forEach(id => this._client.disconnect(id));
        this._deviceSignals.forEach((id, device) => device.disconnect(id));
        this._button.destroy();
        this._button = this._box = this._client = this._budsProxy = this._deviceSignals = null;
    }

    _watchDevices() {
        this._deviceSignals.forEach((id, device) => device.disconnect(id));
        this._deviceSignals.clear();
        for (const device of this._client.get_devices()) {
            if (device.kind in ICONS)
                this._deviceSignals.set(device, device.connect('notify', () => this._render()));
        }
        this._render();
    }

    _cancelRetry() {
        if (this._retry)
            GLib.source_remove(this._retry);
        this._retry = 0;
    }

    _refreshBuds(retries = 0) {
        this._cancelRetry();
        if (!this._budsProxy.get_cached_property('Connected')?.unpack()) {
            this._buds = null;
            this._render();
            return;
        }
        const proc = Gio.Subprocess.new(['python3', GLib.build_filenamev([this.path, 'buds.py']), BUDS_MAC],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            const [, out] = p.communicate_utf8_finish(res);
            if (!this._button)
                return;
            if (p.get_successful()) {
                const [left, right, box] = out.trim().split(' ').map(Number);
                this._buds = {left, right, box};
            } else if (retries > 0) {
                // The Buds refuse RFCOMM for a few seconds right after connecting.
                this._retry = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, BUDS_RETRY_SECONDS, () => {
                    this._retry = 0;
                    this._refreshBuds(retries - 1);
                    return GLib.SOURCE_REMOVE;
                });
            }
            this._render();
        });
    }

    _render() {
        this._box.destroy_all_children();
        for (const device of this._deviceSignals.keys()) {
            if (device.is_present)
                this._addItem(`${iconFor(device)} ${Math.round(device.percentage)}%`, device.percentage, device.model);
        }
        if (this._buds) {
            const {left, right, box} = this._buds;
            this._addItem(`🎧 ${left}/${right}%`, Math.min(left, right), `Galaxy Buds — case ${box}%`);
        }
        this._button.visible = this._box.get_n_children() > 0;
    }

    _addItem(text, percentage, name) {
        const label = new St.Label({text, y_align: Clutter.ActorAlign.CENTER, style: 'margin: 0 4px;', accessible_name: name});
        if (percentage < LOW)
            label.add_style_class_name('periph-battery-low');
        this._box.add_child(label);
    }
}
