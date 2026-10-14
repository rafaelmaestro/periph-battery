#!/usr/bin/env python3
import socket
import sys

SOM, EOM = 0xFD, 0xDD
STATUS, EXTENDED_STATUS = 0x60, 0x61


def parse(buf):
    i = 0
    while i + 3 <= len(buf):
        if buf[i] != SOM:
            i += 1
            continue
        size = int.from_bytes(buf[i + 1:i + 3], "little") & 0x3FF
        end = i + 3 + size
        if end >= len(buf):
            return None
        msg, payload = buf[i + 3], buf[i + 4:end - 2]
        if msg == EXTENDED_STATUS:
            return payload[2], payload[3], payload[7]
        if msg == STATUS:
            return payload[1], payload[2], payload[6]
        i = end + 1
    return None


def read(mac, channel=1):
    with socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM) as s:
        s.settimeout(5)
        s.connect((mac, channel))
        buf = b""
        while (status := parse(buf)) is None:
            chunk = s.recv(1024)
            if not chunk:
                raise ConnectionError("closed")
            buf += chunk
        return status


def selftest():
    payload = bytes([0x01, 0x00, 70, 72, 0x01, 0x00, 0x11, 55])
    frame = bytes([SOM]) + (len(payload) + 3).to_bytes(2, "little") + bytes([EXTENDED_STATUS]) + payload + b"\x00\x00" + bytes([EOM])
    assert parse(b"\x00" + frame) == (70, 72, 55)
    assert parse(frame[:-3]) is None
    print("ok")


if __name__ == "__main__":
    if sys.argv[1] == "--selftest":
        selftest()
    else:
        try:
            print(*read(sys.argv[1]))
        except OSError:
            sys.exit(1)
