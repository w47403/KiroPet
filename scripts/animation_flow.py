"""Build-time dense motion interpolation using a shared intermediate flow field.

Unlike two independent inverse warps, projected correspondences give both
drawings the same intermediate geometry. Colour is always premultiplied before
resampling. This module has no dependency on the asset compiler.
"""

import hashlib

import cv2
import numpy as np


def _premultiply(image):
    result = image.astype(np.float32) / 255
    result[:, :, :3] *= result[:, :, 3:4]
    return result


def _unpremultiply(image):
    result = image.copy()
    result[:, :, :3] /= np.maximum(result[:, :, 3:4], 1 / 255)
    result = np.uint8(np.clip(np.rint(result * 255), 0, 255))
    result[result[:, :, 3] < 2] = 0
    result[:3] = 0
    result[-3:] = 0
    result[:, :3] = 0
    result[:, -3:] = 0
    return result


def _grid(shape):
    yy, xx = np.mgrid[:shape[0], :shape[1]].astype(np.float32)
    return xx, yy


def _gray(image):
    alpha = image[:, :, 3:4].astype(np.float32) / 255
    visible = image[:, :, :3] * alpha + 216 * (1 - alpha)
    return cv2.cvtColor(np.uint8(visible), cv2.COLOR_RGB2GRAY)


def _remap(image, mx, my, border=cv2.BORDER_REPLICATE):
    return cv2.remap(image, mx, my, cv2.INTER_LINEAR, borderMode=border)


def _confidence(flow, reverse):
    xx, yy = _grid(flow.shape)
    residual = flow + _remap(reverse, xx + flow[:, :, 0], yy + flow[:, :, 1])
    error2 = np.sum(residual * residual, axis=2)
    confidence = 1 / (1 + error2 / 4)
    # A soft, spatially continuous confidence mask avoids torn-paper seams.
    return cv2.GaussianBlur(confidence, (0, 0), 1.2)


def motion_pair(a, b):
    """Return two reusable flow/confidence records for an RGBA keyframe pair."""
    canonical = hashlib.sha256(a.tobytes()).digest() <= hashlib.sha256(b.tobytes()).digest()
    if not canonical:
        forward, backward = motion_pair(b, a)
        return backward, forward
    ag, bg = _gray(a), _gray(b)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    # One coarse level avoids fitting individual antialiasing pixels as motion.
    dis.setFinestScale(1)
    dis.setGradientDescentIterations(32)
    dis.setVariationalRefinementIterations(8)
    forward = cv2.GaussianBlur(dis.calc(ag, bg, None), (0, 0), 1.2)
    backward = cv2.GaussianBlur(dis.calc(bg, ag, None), (0, 0), 1.2)
    return ({'flow': forward, 'confidence': _confidence(forward, backward), 'canonical': True},
            {'flow': backward, 'confidence': _confidence(backward, forward), 'canonical': False})


def _project_flow(forward, backward, t):
    """Splat correspondences, then sample colours through a shared geometry.

    Projecting RGB itself leaves holes whenever the motion expands. Here only
    displacement is projected, with bilinear weights; any uncovered displacement
    is extended from its nearest valid neighbour before resampling the images.
    This also avoids fixed-point inverse iteration at steep flow gradients.
    """
    height, width = forward['flow'].shape[:2]
    xx, yy = _grid((height, width))
    total = np.zeros((height * width, 2), np.float32)
    weights = np.zeros(height * width, np.float32)
    for record, distance, sign in ((forward, t, 1), (backward, 1 - t, -1)):
        flow = record['flow']
        x = xx + distance * flow[:, :, 0]
        y = yy + distance * flow[:, :, 1]
        x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
        confidence = np.maximum(record['confidence'], .025)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            xi, yi = x0 + dx, y0 + dy
            coefficient = (1 - np.abs(x - xi)) * (1 - np.abs(y - yi)) * confidence
            valid = (xi >= 0) & (xi < width) & (yi >= 0) & (yi < height)
            indices = yi[valid] * width + xi[valid]
            local_weights = coefficient[valid]
            np.add.at(total, indices, flow[valid] * (local_weights * sign)[:, None])
            np.add.at(weights, indices, local_weights)
    projected = (total / np.maximum(weights[:, None], 1e-6)).reshape(height, width, 2)
    holes = np.uint8(weights.reshape(height, width) < 1e-5)
    if holes.any():
        if holes.all():
            return np.zeros_like(projected)
        _, labels = cv2.distanceTransformWithLabels(
            holes, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        known = projected[holes == 0]
        projected[holes > 0] = known[labels[holes > 0] - 1]
    return projected


def interpolate(a, b, forward, backward, t):
    """Interpolate an RGBA pair at 0 <= t <= 1 without independent warp drift."""
    if t <= 0:
        return a.copy()
    if t >= 1:
        return b.copy()
    if not forward.get('canonical', True):
        return interpolate(b, a, backward, forward, round(1 - t, 10))
    t = round(float(t), 10)
    displacement = _project_flow(forward, backward, t)
    xx, yy = _grid(a.shape)
    ax, ay = xx - t * displacement[:, :, 0], yy - t * displacement[:, :, 1]
    bx = xx + (1 - t) * displacement[:, :, 0]
    by = yy + (1 - t) * displacement[:, :, 1]
    left = _remap(_premultiply(a), ax, ay, cv2.BORDER_CONSTANT)
    right = _remap(_premultiply(b), bx, by, cv2.BORDER_CONSTANT)
    # At disocclusions, prefer the side with a trustworthy correspondence. A
    # confidence floor and spatial smoothing keep the choice continuous.
    lc = np.maximum(_remap(forward['confidence'], ax, ay), .025)
    rc = np.maximum(_remap(backward['confidence'], bx, by), .025)
    lw, rw = (1 - t) * lc, t * rc
    mix = rw / np.maximum(lw + rw, 1e-6)
    return _unpremultiply(left * (1 - mix[:, :, None]) + right * mix[:, :, None])
