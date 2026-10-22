"""Screen-edge geometry and easing without GUI dependencies."""
TAB_EXPOSURE = 56  # Same visible peeking-head width as WPF.
def ease_out(t):
    t = max(0, min(1, t))
    return 1 - (1-t) ** 3


def snap(x, y, width, height, area, threshold=36):
    """Snap to a side while preserving height unless the window is off-screen."""
    left, top, right, bottom = area
    distances = {'left': abs(x-left), 'right': abs(right-x-width)}
    edge = min(distances, key=distances.get)
    if distances[edge] > threshold:
        return None
    x = left if edge == 'left' else max(left, right-width)
    y = max(top, min(max(top, bottom-height), y))
    return edge, x, y


def hidden_position(edge, x, y, width, height, area, tab=TAB_EXPOSURE):
    left, top, right, bottom = area
    if edge == 'left': x = left-width+tab
    elif edge == 'right': x = right-tab
    return x, y
