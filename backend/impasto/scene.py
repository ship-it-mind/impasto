"""What's in a photo, without anyone marking it: flat regions of color, which one can serve as white, and a good spot in each.

Measured from the pixels, with no model call. Regions come from clustering a small
copy of the photo mostly on hue, so the shadows and ridges of one paint or one cloth
stay together, then joining clusters of nearly the same hue. White is the brightest
near-neutral region (paper, a rag, a white bowl, bare canvas): it's never asked for,
so a photo can have none, and then its colors stand as the camera saw them.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# The side the photo is worked on at, and how many clusters it starts from.
WORK_SIDE = 400
CLUSTERS = 8
# L* counts for less than hue, since one paint runs from highlight to shadow.
L_WEIGHT = 0.5
# Clusters this close in a*b* and L* are the same stuff in different light.
SAME_HUE = 7.0
SAME_LIGHT = 25.0
# Regions under this share of the photo are specks, stray marks or highlights.
MIN_REGION = 0.015
# Near-neutral allowing for warm or cool light: channel spread as a share of the brightest,
# and how bright it has to read. Clipped pixels have lost their color, so they can't be white.
WHITE_SPREAD = 0.3
WHITE_MIN_L = 62.0
WHITE_MIN_AREA = 0.02
CLIPPED = 250
# The part of a white region a spot is taken from: all but its darkest share, leaving out folds and shadow.
# Not its very brightest: bare canvas in ordinary shade would then read as paint. Checked against white picked by hand on real canvases.
WHITE_ABOVE = 30


@dataclass
class Region:
    mask: np.ndarray  # on the small copy of the photo
    area: float  # share of the photo
    edge: float  # share of the photo's edge it touches
    center: float  # distance of its middle from the photo's middle, 0 to about 0.7
    lab: tuple[float, float, float]  # median, as cv2's float Lab
    whiteish: bool
    scale: float  # full-size pixels per pixel of the mask

    @property
    def chroma(self) -> float:
        return float(np.hypot(self.lab[1], self.lab[2]))

    def full_mask(self, shape: tuple[int, int]) -> np.ndarray:
        height, width = shape
        return cv2.resize(self.mask.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST).astype(bool)

    def contains(self, point: tuple[float, float]) -> bool:
        x, y = round(point[0] / self.scale), round(point[1] / self.scale)
        height, width = self.mask.shape
        return 0 <= x < width and 0 <= y < height and bool(self.mask[y, x])

    def spot(self) -> tuple[float, float]:
        """The point deepest inside the region, in full-size pixels."""
        return deepest(self.mask, self.scale)


def deepest(mask: np.ndarray, scale: float) -> tuple[float, float]:
    # The photo's edge counts as an edge of the region: light falls off there, and a patch would be cut short.
    framed = cv2.copyMakeBorder(mask.astype(np.uint8), 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    distance = cv2.distanceTransform(framed, cv2.DIST_L2, 5)[1:-1, 1:-1]
    y, x = np.unravel_index(int(np.argmax(distance)), distance.shape)
    return float(round(x * scale)), float(round(y * scale))


def lab_of(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def joined_clusters(labels: np.ndarray, centers: np.ndarray) -> np.ndarray:
    """Cluster labels with those of nearly the same hue and lightness made one.

    Every member of a group has to be close to every other: the blur at an edge between two colors
    makes clusters that would otherwise chain paper and pale paste into one region.
    """
    def close(i: int, j: int) -> bool:
        return (
            np.hypot(*(centers[i][1:] - centers[j][1:])) < SAME_HUE
            and abs(centers[i][0] - centers[j][0]) / L_WEIGHT < SAME_LIGHT
        )

    def gap(one: list[int], other: list[int]) -> float:
        return max(float(np.linalg.norm(centers[i] - centers[j])) for i in one for j in other)

    groups = [[i] for i in range(len(centers))]
    while True:
        pairs = [
            (gap(one, other), a, b)
            for a, one in enumerate(groups) for b, other in enumerate(groups)
            if a < b and all(close(i, j) for i in one for j in other)
        ]
        if not pairs:
            break
        _, a, b = min(pairs)
        groups[a] += groups.pop(b)
    joined = np.zeros(len(centers), dtype=np.int32)
    for number, group in enumerate(groups):
        joined[group] = number
    return joined[labels]


def regions(image: np.ndarray) -> list[Region]:
    """The photo's flat regions of color, biggest first. image: upright, sRGB, BGR."""
    height, width = image.shape[:2]
    shrink = min(1.0, WORK_SIDE / max(height, width))
    small = cv2.resize(image, None, fx=shrink, fy=shrink, interpolation=cv2.INTER_AREA)
    small = cv2.medianBlur(small, 7)
    lab = lab_of(small)
    points = (lab * np.array([L_WEIGHT, 1, 1], dtype=np.float32)).reshape(-1, 3)
    cv2.setRNGSeed(1)  # the same photo reads the same each time
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(points, CLUSTERS, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    labels = joined_clusters(labels.reshape(lab.shape[:2]), centers)

    h, w = labels.shape
    edge_length = 2 * (h + w)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    found = []
    for cluster in np.unique(labels):
        mask = cv2.morphologyEx((labels == cluster).astype(np.uint8), cv2.MORPH_CLOSE, kernel)
        count, parts, stats, middles = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for part in range(1, count):
            area = stats[part, cv2.CC_STAT_AREA] / (h * w)
            if area < MIN_REGION:
                continue
            own = parts == part
            edge = int(own[0].sum() + own[-1].sum() + own[:, 0].sum() + own[:, -1].sum()) / edge_length
            middle = middles[part] / np.array([w, h]) - 0.5
            blue, green, red = np.median(small[own], axis=0)
            top, bottom = max(red, green, blue), min(red, green, blue)
            median_lab = tuple(float(v) for v in np.median(lab[own], axis=0))
            found.append(Region(
                mask=own,
                area=float(area),
                edge=edge,
                center=float(np.hypot(*middle)),
                lab=median_lab,
                whiteish=median_lab[0] >= WHITE_MIN_L and top < CLIPPED and top - bottom <= WHITE_SPREAD * top,
                scale=1 / shrink,
            ))
    return sorted(found, key=lambda region: -region.area)


def whitest(found: list[Region]) -> Region | None:
    """The brightest near-neutral region big enough to trust, if the photo has one."""
    return max((r for r in found if r.whiteish and r.area >= WHITE_MIN_AREA), key=lambda r: r.lab[0], default=None)


def white_spot(region: Region, image: np.ndarray) -> tuple[float, float]:
    """A point in the evenly lit part of a white region, away from its folds and edges, in full-size pixels."""
    height, width = image.shape[:2]
    small = cv2.resize(image, region.mask.shape[::-1], interpolation=cv2.INTER_AREA)
    lightness = lab_of(small)[..., 0]
    lit = region.mask & (lightness >= np.percentile(lightness[region.mask], WHITE_ABOVE)) & (small.max(axis=2) < CLIPPED)
    x, y = deepest(lit if lit.any() else region.mask, region.scale)
    return min(x, width - 1.0), min(y, height - 1.0)
