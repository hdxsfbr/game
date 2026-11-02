#!/usr/bin/env python3
"""Generate the Valley of Intervals tile map as TypeScript string rows.
Legend: # wall, . ground, ~ water, T tree, = bridge, D door tile (wall until solved), X exit tile.
Usage: scripts/gen_valley_map.py  (prints the rows; paste into src/world/areas.ts)
"""
import random

W, H = 60, 34
m = [['.'] * W for _ in range(H)]

def put(x, y, c):
    m[y][x] = c

def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(x, y, c)

# Borders
rect(0, 0, W - 1, 0, '#'); rect(0, H - 1, W - 1, H - 1, '#')
rect(0, 0, 0, H - 1, '#'); rect(W - 1, 0, W - 1, H - 1, '#')

# Region A (east meadow) is open: cols 40-58. River cols 36-38, bridge row 16.
rect(36, 1, 38, 32, '~')
rect(36, 16, 38, 16, '=')
put(38, 16, 'D')  # door 1: Bridge of Echoes (octave)

# Cliffs shape region A: a ridge north and south so it reads as a valley floor.
rect(39, 1, 58, 8, '#'); rect(39, 26, 58, 32, '#')
rect(40, 9, 58, 9, '.')
# Entrance from hub on the east edge, rows 16-17.
put(59, 16, 'X'); put(59, 17, 'X')

# Region B: cols 20-35, rows 8-26. Cliffs outside that.
rect(1, 1, 35, 7, '#'); rect(1, 27, 35, 32, '#')
rect(20, 8, 35, 26, '.')
rect(1, 8, 19, 26, '#')
# Fifth gate: wall column 28 across region B, door 2 at (28,16).
rect(28, 8, 28, 26, '#'); put(28, 16, 'D')
# Fourth gate: passage north out of B2 (cols 20-27) through the cliff at row 7, door 3 at (24,7).
put(24, 7, 'D')
# Region C: north strip cols 14-35, rows 1-6.
rect(14, 1, 35, 6, '.')
# Thirds grove: two serial tree-doors across the strip at cols 18 and 16 (col 17 open between them).
rect(18, 1, 18, 6, 'T'); put(18, 3, 'D')  # door 4: major third
rect(16, 1, 16, 6, 'T'); put(16, 4, 'D')  # door 5: minor third
# Region D: west side cols 1-13, rows 1-32, open.
rect(1, 1, 13, 32, '.')
# Serpent river across region D at rows 19-21; segments at col 7.
rect(1, 19, 13, 21, '~')
put(7, 19, 'D')  # door 6: the Chord Serpent (sequence). Segments drawn at (7,19..21).
put(7, 20, 'D'); put(7, 21, 'D')
# Island south of the river: fragment pedestal and the song stone that returns to the hub.
put(7, 27, 'X')  # exit back to hub, only reachable after the serpent

# Trees for texture, deterministic.
rng = random.Random(7)
for _ in range(90):
    x, y = rng.randrange(1, W - 1), rng.randrange(1, H - 1)
    if m[y][x] == '.' and not (14 <= x <= 27 and 1 <= y <= 8) and not (abs(y - 16) <= 1 and x >= 30):
        # keep the main corridors clear
        if not (5 <= x <= 9 and 7 <= y <= 30):
            put(x, y, 'T')

for row in m:
    print("  '" + ''.join(row) + "',")
