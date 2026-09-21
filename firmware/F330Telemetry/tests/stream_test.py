"""Run against the native stream_host harness on localhost:8781."""
import json, socket, time

def connect():
    c=socket.create_connection(('127.0.0.1',8781),timeout=2)
    c.sendall(b'GET /events HTTP/1.1\r\n')
    c.sendall(b'Host: localhost\r\n\r\n')
    return c
c=connect();data=b'';start=time.monotonic()
while time.monotonic()-start<1.2:
    data+=c.recv(65536)
assert b'200 OK' in data and b'text/event-stream' in data
messages=[json.loads(line[6:]) for line in data.splitlines() if line.startswith(b'data: ')]
assert 18<=len(messages)<=30, len(messages)
assert all('attitude' in m and 'channels' in m for m in messages)
c.close()
# Reconnect; malformed path must close promptly without allocating a stream.
c=connect();assert b'200 OK' in c.recv(65536);c.close()
bad=socket.create_connection(('127.0.0.1',8781),timeout=2)
bad.sendall(b'GET /wrong HTTP/1.1\r\n\r\n');assert bad.recv(1024)==b'';bad.close()
# An incomplete handshake cannot monopolize its slot indefinitely.
partial=socket.create_connection(('127.0.0.1',8781),timeout=3)
partial.sendall(b'GET /events');assert partial.recv(1024)==b'';partial.close()
print(f'PASS: {len(messages)} complete events in ~1.2 s; split request, reconnect, bad path and handshake timeout.')
