#!/usr/bin/env python3
"""Generate the Jazz Quarter tile map. Same legend as gen_valley_map.py.
Usage: scripts/gen_jazz_map.py  (prints rows; paste into src/world/areas.ts)
"""
W, H = 60, 30
m = [['.'] * W for _ in range(H)]

def put(x, y, c): m[y][x] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, c)

rect(0, 0, W - 1, 0, '#'); rect(0, H - 1, W - 1, H - 1, '#')
rect(0, 0, 0, H - 1, '#'); rect(W - 1, 0, W - 1, H - 1, '#')

# One long street (rows 11..18) lined with buildings above and below.
rect(1, 1, W - 2, 10, '#'); rect(1, 19, W - 2, H - 2, '#')
# Doorsteps and stoops so the fronts read as buildings.
for x in (4, 9, 16, 19, 26, 29, 36, 39, 46, 54):
    rect(x, 9, x + 1, 10, '.'); rect(x, 19, x + 1, 20, '.')
# A rooftop garden here and there.
rect(13, 3, 14, 4, '.'); put(13, 3, 'T')
rect(33, 24, 34, 25, '.'); put(34, 25, 'T')

# Entrance from the hub, left edge.
put(0, 15, 'X')
# The club: wall across the street with the club door.
rect(12, 11, 12, 18, '#'); put(12, 15, 'D')
# The alley: the street narrows to one lane (rows 14..16) between two buildings.
rect(13, 11, 21, 13, '#'); rect(13, 17, 21, 18, '#')
put(22, 15, 'D'); rect(22, 11, 22, 14, '#'); rect(22, 16, 22, 18, '#')
rect(15, 14, 15, 14, 'T')
# The cellar: a sunken courtyard, pool, and the cellar door.
rect(26, 16, 29, 18, '~')
rect(32, 11, 32, 18, '#'); put(32, 15, 'D')
# The band stand: a round-ish stage in the square, door on its far wall.
rect(36, 12, 39, 13, '#'); rect(36, 17, 39, 18, '#')
rect(42, 11, 42, 18, '#'); put(42, 15, 'D')
# The boss: the last club at the end of the street.
rect(44, 11, 47, 12, 'T')
rect(50, 11, 50, 18, '#'); put(50, 15, 'D')
# Fragment and the way home.
put(59, 15, 'X')

for row in m: print("  '" + ''.join(row) + "',")
