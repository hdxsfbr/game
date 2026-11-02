#!/usr/bin/env python3
"""Generate the Tonic Town tile map. Same legend as gen_valley_map.py.
Usage: scripts/gen_town_map.py  (prints rows; paste into src/world/areas.ts)
"""
W, H = 44, 36
m = [['.'] * W for _ in range(H)]

def put(x, y, c): m[y][x] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, c)

rect(0, 0, W - 1, 0, '#'); rect(0, H - 1, W - 1, H - 1, '#')
rect(0, 0, 0, H - 1, '#'); rect(W - 1, 0, W - 1, H - 1, '#')

# Houses line both sides; the street runs up the middle (cols 10..33).
rect(1, 1, 9, H - 2, '#'); rect(34, 1, 42, H - 2, '#')
# Doorsteps: carve little alcoves so the houses read as buildings, not cliffs.
for y in (5, 11, 17, 24, 31):
    rect(8, y, 9, y + 1, '.'); rect(34, y, 35, y + 1, '.')

# Entrance square rows 29..34, X on the bottom edge.
put(22, 35, 'X')
# Town bell: wall row 28 with the bell gate.
rect(10, 28, 33, 28, '#'); put(22, 28, 'D')
# Market: three stall walls at rows 26, 23, 20.
for y in (26, 23, 20):
    rect(10, y, 33, y, '#'); put(22, y, 'D')
# Trees and a pool in the market lanes for texture.
rect(12, 21, 13, 22, 'T'); rect(30, 24, 31, 25, 'T')
# Well square rows 14..19, pool at the side, well door in wall row 13.
rect(27, 15, 31, 17, '~')
rect(12, 15, 13, 16, 'T')
rect(10, 13, 33, 13, '#'); put(22, 13, 'D')
# Clock square rows 8..12, clock tower door in wall row 7.
rect(28, 9, 30, 11, '#')  # the tower itself
rect(10, 7, 33, 7, '#'); put(22, 7, 'D')
# Choir hall rows 1..6: door at row 4, fragment and song stone inside.
rect(10, 4, 33, 4, '#'); put(22, 4, 'D')
put(24, 2, 'X')  # song stone back to the hub

for row in m: print("  '" + ''.join(row) + "',")
