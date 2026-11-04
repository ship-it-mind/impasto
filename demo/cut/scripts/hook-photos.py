# Her stage photos for the hooks: the finished canvas straightened to the plan's frame,
# and every stage turned the same way up (bands' arc at the bottom left) for the dealt prints.
# Run with the backend's Python: backend/.venv/bin/python demo/cut/scripts/hook-photos.py
import pathlib
import cv2, numpy as np

pub = pathlib.Path(__file__).resolve().parents[1] / 'public'
src = lambda n: cv2.imread(str(pub / f'photos/stage-{n}.jpg'))

# Corners of the canvas in the finished photo, as shares of its width and height: TL, TR, BR, BL.
im = src('12'); h, w = im.shape[:2]
q = np.float32([[.065, .098], [.855, .100], [.850, .845], [.095, .840]]) * [w, h]
W, H = 1704, 2000  # the plan's 852 x 1000, doubled
M = cv2.getPerspectiveTransform(q.astype(np.float32), np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
cv2.imwrite(str(pub / 'hook/finished-straight.jpg'), cv2.warpPerspective(im, M, (W, H), flags=cv2.INTER_CUBIC), [cv2.IMWRITE_JPEG_QUALITY, 92])

# Stages in the order the painting got there, each turned so its arc sits bottom left.
CCW, CW, R180 = cv2.ROTATE_90_COUNTERCLOCKWISE, cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180
deal = [('07', None), ('00', None), ('02', CCW), ('03', CCW), ('04', CW), ('06', None), ('05', None),
        ('13', None), ('08', None), ('09', R180), ('10', R180), ('11', CCW), ('12', None)]
for i, (n, rot) in enumerate(deal):
    im = src(n)
    if rot is not None: im = cv2.rotate(im, rot)
    h, w = im.shape[:2]; s = 1400 / max(h, w)
    cv2.imwrite(str(pub / f'hook/deal-{i:02d}.jpg'), cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])
print('ok', len(deal))
