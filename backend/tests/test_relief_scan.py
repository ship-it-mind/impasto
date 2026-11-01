"""The relief scan against a surface whose shape is known. No models, no Node."""

import cv2
import numpy as np
import pytest

from impasto.rectify import linear_to_srgb, srgb_to_linear
from impasto.relief_scan import ReliefScanError, height_png, integrate, relit, scan

WIDTH, HEIGHT = 480, 360
AROUND = [15.0, 85.0, 160.0, 230.0, 305.0]


@pytest.fixture(scope="module")
def surface() -> np.ndarray:
    """Knife-like slabs: flat, with raised edges, running in several directions."""
    rng = np.random.default_rng(4)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    z = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    for _ in range(40):
        angle = rng.uniform(0, np.pi)
        cx, cy = rng.uniform(0, WIDTH), rng.uniform(0, HEIGHT)
        along = (xs - cx) * np.cos(angle) + (ys - cy) * np.sin(angle)
        across = -(xs - cx) * np.sin(angle) + (ys - cy) * np.cos(angle)
        slab = (np.abs(across) < rng.uniform(10, 30)) & (np.abs(along) < rng.uniform(40, 120))
        z = np.where(slab, z * 0.9 + rng.uniform(3, 8), z)
    return cv2.GaussianBlur(z, (0, 0), 2.0)


@pytest.fixture(scope="module")
def paint() -> np.ndarray:
    """Three bands of color, as sRGB BGR."""
    bands = np.array([[196, 220, 232], [138, 165, 143], [112, 107, 47]], dtype=np.float32)
    return bands[np.minimum((np.arange(WIDTH) * 3 / WIDTH).astype(int), 2)][None].repeat(HEIGHT, axis=0)


def photo(surface: np.ndarray, paint: np.ndarray, azimuth: float, seed: int = 0) -> np.ndarray:
    """A nearby torch at this azimuth, with exposure drift and sensor noise."""
    rng = np.random.default_rng(seed)
    reach = 1.5 * WIDTH
    az, el = np.radians(azimuth), np.radians(35)
    light = np.array([WIDTH / 2 + reach * np.cos(el) * np.cos(az), HEIGHT / 2 + reach * np.cos(el) * np.sin(az), reach * np.sin(el)])
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    zx, zy = np.gradient(surface, axis=1), np.gradient(surface, axis=0)
    lx, ly, lz = light[0] - xs, light[1] - ys, light[2] - surface
    r = np.sqrt(lx**2 + ly**2 + lz**2)
    lambert = np.maximum((-zx * lx - zy * ly + lz) / (r * np.sqrt(zx**2 + zy**2 + 1)), 0.0)
    image = srgb_to_linear(paint) * (lambert * (reach / r) ** 2 + 0.05)[..., None]
    image = image * rng.uniform(0.9, 1.1) * 0.6 + rng.normal(0, 0.003, image.shape)
    return linear_to_srgb(image)


def correlation(found: np.ndarray, surface: np.ndarray) -> float:
    truth = integrate(np.gradient(surface, axis=1), np.gradient(surface, axis=0))
    margin = 20
    return float(np.corrcoef(found[margin:-margin, margin:-margin].ravel(), truth[margin:-margin, margin:-margin].ravel())[0, 1])


def test_recovers_the_surface_and_the_torch(surface, paint):
    result = scan([photo(surface, paint, a, i) for i, a in enumerate(AROUND)])
    assert correlation(result.height, surface) > 0.85  # and the right way out, or it'd be negative
    assert result.quality.prediction > 0.5
    assert result.quality.warnings == []
    errors = [abs((found - true + 180) % 360 - 180) for found, true in zip(result.light_azimuths, AROUND)]
    assert max(errors) < 25


def test_takes_the_paint_color_out_of_the_shading(surface, paint):
    result = scan([photo(surface, paint, a, i) for i, a in enumerate(AROUND)])
    # Bands stay in order of brightness, and each is even once the torch's slope is divided out.
    band = WIDTH // 3
    means = [result.albedo[:, i * band + 20 : (i + 1) * band - 20].mean() for i in range(3)]
    assert means[0] > means[1] > means[2]
    left, right = result.albedo[:, 20:60].mean(), result.albedo[:, band - 60 : band - 20].mean()
    assert abs(left - right) < 12


def test_crops_to_the_canvas_when_given_its_corners(surface, paint):
    frame = []
    for i, azimuth in enumerate(AROUND):
        wall = np.full((HEIGHT + 200, WIDTH + 200, 3), 40, dtype=np.uint8)
        wall[100:100 + HEIGHT, 100:100 + WIDTH] = photo(surface, paint, azimuth, i)
        frame.append(wall)
    corners = np.array([[100, 100], [100 + WIDTH, 100], [100 + WIDTH, 100 + HEIGHT], [100, 100 + HEIGHT]], dtype=np.float32)
    result = scan(frame, corners)
    assert result.height.shape == (HEIGHT, WIDTH)
    assert correlation(result.height, surface) > 0.85


def test_torch_positions_can_be_told_rather_than_read(surface, paint):
    result = scan([photo(surface, paint, a, i) for i, a in enumerate(AROUND)], azimuths=AROUND)
    assert correlation(result.height, surface) > 0.85


def test_warns_when_the_photos_disagree_about_the_surface(surface, paint):
    photos = [photo(surface, paint, a, i) for i, a in enumerate(AROUND)]
    wrong = [AROUND[i] for i in (2, 0, 3, 1, 4)]
    result = scan(photos, azimuths=wrong)
    assert result.quality.prediction < 0.5
    assert any("Don't trust" in warning for warning in result.quality.warnings)


def test_refuses_photos_that_cant_give_a_relief(surface, paint):
    same = [photo(surface, paint, 15.0, i) for i in range(5)]
    with pytest.raises(ReliefScanError, match="where the torch was"):
        scan(same)
    with pytest.raises(ReliefScanError, match="at least 4"):
        scan(same[:3])
    with pytest.raises(ReliefScanError, match="different sizes"):
        scan([*same[:3], same[0][:-5]])
    with pytest.raises(ReliefScanError, match="torch positions"):
        scan(same, azimuths=[0.0, 90.0])


def test_outputs_a_height_map_and_a_relit_view(surface, paint):
    result = scan([photo(surface, paint, a, i) for i, a in enumerate(AROUND)])
    height16, (low, high) = height_png(result.height)
    assert height16.dtype == np.uint16 and height16.shape == (HEIGHT, WIDTH)
    assert high > low
    left, right = relit(result, 180), relit(result, 0)
    assert left.shape == (HEIGHT, WIDTH, 3)
    # The same surface under an opposite light looks different, and its ridges swap sides.
    assert np.abs(left.astype(int) - right.astype(int)).mean() > 1
