# The example piece's band map as vector paths, for the hooks: each band's outline as a fill,
# and its pencil lines (the edges inside the canvas) in the order it draws them.
# Run with the backend's Python: backend/.venv/bin/python demo/cut/scripts/hook-sketch.py
import json, pathlib, shutil
import cv2, numpy as np
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[3]
ex = root / 'example'
d = json.loads((ex / 'piece.json').read_text())
band = np.array(Image.open(ex / 'images/concepts-1098fb52/concept-1-layout.png'))[:, :, 0]
H, W = band.shape
recipe = d['tables']['recipes'][0]['record']['bands']
order_names = ['Muted Plum', 'Olive Taupe', 'Sage Grey', 'Warm Linen Beige', 'Deep Burgundy Brown', 'Dusty Rose']
names = [b['name'] for b in recipe]

def d_of(pts, closed):
    s = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return s + (' Z' if closed else '')

out = []
for i, b in enumerate(recipe):
    m = (band == i).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    fills, lines = [], []
    for c in cs:
        if cv2.contourArea(c) < 400: continue
        p = c[:, 0, :].astype(float)
        k = np.ones(9) / 9  # smooth the stair steps
        sm = np.stack([np.convolve(np.r_[p[-4:, j], p[:, j], p[:4, j]], k, 'valid') for j in (0, 1)], 1)
        fills.append(d_of(cv2.approxPolyDP(sm.astype(np.float32), 0.6, True)[:, 0, :], True))
        inside = (sm[:, 0] > 3) & (sm[:, 0] < W - 4) & (sm[:, 1] > 3) & (sm[:, 1] < H - 4)
        # Split into runs that stay inside the canvas: those are the pencil lines.
        runs, cur = [], []
        for pt, ok in zip(sm, inside):
            if ok: cur.append(pt)
            elif cur: runs.append(cur); cur = []
        if cur: runs.append(cur)
        if len(runs) > 1 and inside[0] and inside[-1]: runs[0] = runs.pop() + runs[0]
        for r in runs:
            if len(r) < 30: continue
            a = cv2.approxPolyDP(np.array(r, np.float32), 0.6, False)[:, 0, :]
            lines.append({'d': d_of(a, False), 'len': float(np.sum(np.linalg.norm(np.diff(np.array(r), axis=0), axis=1)))})
    out.append({'name': b['name'], 'hex': b['target_hex'], 'fills': fills, 'lines': lines})

data = {'w': W, 'h': H, 'bands': out, 'order': [names.index(n) for n in order_names]}
pub = root / 'demo/cut/public/hook'
(pub / 'sketch.json').write_text(json.dumps(data))
shutil.copy(ex / 'images/concepts-1098fb52/concept-1-exact.png', pub / 'concept.png')
print(W, H, [(b['name'], len(b['fills']), len(b['lines'])) for b in out])
