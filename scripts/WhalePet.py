#!/usr/bin/env python3
"""Optional macOS / Linux desktop window. Uses Python 3 + Tk (no pip dependencies)."""
import argparse
import json
import os
import random
import sys
import time
import tkinter as tk
from animation_runtime import frame_at

p = argparse.ArgumentParser()
p.add_argument('--image', required=True)
p.add_argument('--state', required=True)
p.add_argument('--size', type=int, default=190)
p.add_argument('--parent', type=int, default=0)
a = p.parse_args()

phrases = ['在呢～', '摸摸头，继续加油！', '今天也要写出漂亮的代码～', '呼噜呼噜～', '你写代码，我负责卖萌！']
size = max(100, min(320, a.size))
root = tk.Tk()
root.title('Kiro 鲸鱼娘桌宠')
root.attributes('-topmost', True)
root.resizable(False, False)
root.configure(bg='#e4f3fa')
root.overrideredirect(True)
try:
    if sys.platform == 'darwin':
        root.attributes('-transparent', True)
        root.configure(bg='systemTransparent')
    elif os.environ.get('XDG_SESSION_TYPE', '').lower() != 'wayland':
        root.wm_attributes('-transparentcolor', '#e4f3fa')
except tk.TclError:
    pass

animation_dir = os.path.join(os.path.dirname(a.image), 'animations')
with open(os.path.join(animation_dir, 'manifest.json'), encoding='utf-8') as file:
    manifest = json.load(file)
frame_cache = {}

def frames_for(name):
    if name not in frame_cache:
        frames = []
        for relative in manifest['clips'][name]['frames']:
            # Pre-sized PNGs keep native Tk dependency-free and avoid integer zoom artifacts.
            filename = os.path.join(animation_dir, 'tk', str(size), relative)
            if not os.path.isfile(filename):
                filename = os.path.join(animation_dir, relative)
            raw = tk.PhotoImage(file=filename)
            factor = max(1, round(max(raw.width(), raw.height()) / size))
            frames.append(raw.subsample(factor, factor))
        frame_cache[name] = frames
    return frame_cache[name]

photo = frames_for('idle')[0]
W, H = max(size, photo.width() + 18), photo.height() + 48
screenw, screenh = root.winfo_screenwidth(), root.winfo_screenheight()
x, y = screenw-W-32, screenh-H-95
root.geometry(f'{W}x{H}+{x}+{y}')
canvas = tk.Canvas(root, width=W, height=H, bg='#e4f3fa', bd=0, highlightthickness=0)
canvas.pack()
img = canvas.create_image(W // 2, H // 2 + 13, image=photo)
text_id = canvas.create_text(W // 2, 15, text='', fill='#225a81', font=('Arial', 10, 'bold'), width=W-4)

state = 'idle'
last_state = None
bubble_end = 0.0
start_time = time.monotonic()
clip_start = start_time
reaction_start = None
last_frame = None
drag = None
mute = False

def say(msg, sec=3):
    global bubble_end
    if mute: return
    canvas.itemconfigure(text_id, text=msg)
    bubble_end = time.monotonic() + sec

def close(_=None): root.destroy()
def click(e):
    global drag
    drag = (e.x_root, e.y_root, root.winfo_x(), root.winfo_y())
def move(e):
    if drag:
        dx, dy = e.x_root-drag[0], e.y_root-drag[1]
        root.geometry(f'+{drag[2]+dx}+{drag[3]+dy}')
def release(e):
    global drag, reaction_start
    if drag and abs(e.x_root-drag[0]) + abs(e.y_root-drag[1]) < 8:
        reaction_start = time.monotonic()
        say(random.choice(phrases))
    drag = None

def menu(e):
    try: popup.tk_popup(e.x_root, e.y_root)
    finally: popup.grab_release()

popup = tk.Menu(root, tearoff=False)
popup.add_command(label='🐋 摸摸鲸鱼娘', command=lambda: say(random.choice(phrases)))
popup.add_command(label='退出桌宠（可在 Kiro 中重开）', command=close)
canvas.bind('<ButtonPress-1>', click)
canvas.bind('<B1-Motion>', move)
canvas.bind('<ButtonRelease-1>', release)
canvas.bind('<Button-3>', menu)
canvas.bind('<Button-2>', menu)

def parent_alive(pid):
    if not pid: return True
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True

def monitor():
    global state, last_state, clip_start, reaction_start
    if not parent_alive(a.parent): close(); return
    try:
        with open(a.state, encoding='utf-8') as f:
            payload = json.load(f)
        current = (payload.get('state', 'idle'), payload.get('at'))
        if current != last_state:
            last_state = current
            next_state = current[0] if current[0] in manifest['clips'] else 'idle'
            if next_state != state or next_state == 'done':
                state = next_state
                clip_start = time.monotonic()
                reaction_start = None
            msg = {'working':'Kiro 正在处理…', 'tool':'Kiro 正在调用工具…',
                   'editing':'Kiro 更新了文件～', 'done':'任务完成啦！', 'idle':'休息一会儿～', 'sleep':'呼噜呼噜～'}.get(state)
            if msg: say(msg, 2)
    except (OSError, ValueError, TypeError):
        pass
    root.after(700, monitor)

def animate():
    global reaction_start, last_frame
    now = time.monotonic()
    if reaction_start is not None and (now - reaction_start) * 1000 >= sum(manifest['clips']['hug']['durations']):
        reaction_start = None
    name = 'hug' if reaction_start is not None else state
    elapsed = (now - (reaction_start if reaction_start is not None else clip_start)) * 1000
    index = frame_at(manifest['clips'][name], elapsed)
    if root.winfo_viewable() and (name, index) != last_frame:
        canvas.itemconfigure(img, image=frames_for(name)[index])
        last_frame = (name, index)
    if time.monotonic() >= bubble_end: canvas.itemconfigure(text_id, text='')
    root.after(80, animate)

say('嗨～一起写代码吧！')
root.after(150, animate)
root.after(100, monitor)
root.mainloop()
