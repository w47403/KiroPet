"""Screen-edge geometry and easing without GUI dependencies."""
TAB_EXPOSURE = 56  # Same visible peeking-head width as WPF.
def ease_out(t):
    t = max(0, min(1, t))
    return 1 - (1-t) ** 3


def snap(x, y, width, height, area, threshold=36):
    left, top, right, bottom = area
    distances = {'left': abs(x-left), 'right': abs(right-x-width),
                 'top': abs(y-top), 'bottom': abs(bottom-y-height)}
    edge = min(distances, key=distances.get)
    if distances[edge] > threshold:
        return None
    x = max(left, min(right-width, x))
    y = max(top, min(bottom-height, y))
    if distances['left'] <= threshold: x = left
    elif distances['right'] <= threshold: x = right-width
    if distances['top'] <= threshold: y = top
    elif distances['bottom'] <= threshold: y = bottom-height
    return edge, x, y


def hidden_position(edge, x, y, width, height, area, tab=TAB_EXPOSURE):
    left, top, right, bottom = area
    if edge == 'left': x = left-width+tab
    elif edge == 'right': x = right-tab
    elif edge == 'top': y = top-height+tab
    elif edge == 'bottom': y = bottom-tab
    return x, y
