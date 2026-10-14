# periph-battery

GNOME Shell 46 extension that shows the battery of wireless peripherals in the top bar:

- Mouse/keyboard (e.g. Logitech MX Master / MX Keys) via UPower
- Samsung Galaxy Buds Live via their RFCOMM protocol (`buds.py`, Python stdlib only)

## Install

```sh
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/periph-battery@rafael
# X11: Alt+F2, r, Enter  |  Wayland: log out and back in
gnome-extensions enable periph-battery@rafael
```

Set your Buds MAC in `BUDS_MAC` (`extension.js`). Test the helper with:

```sh
python3 buds.py --selftest
python3 buds.py <MAC>   # prints: left right case
```
