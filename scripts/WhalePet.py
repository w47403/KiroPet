#!/usr/bin/env python3
"""Optional macOS / Linux desktop window. Uses Python 3 + Tk (no pip dependencies)."""
import argparse
import json
import os
import random
import sys
import time
import tkinter as tk
from animation_runtime import frame_at, IdleDirector, WorkDirector, DragDirector
from dock_runtime import snap, hidden_position, ease_out

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
W, H = max(size, photo.width() + 18), photo.height() + 76
screenw, screenh = root.winfo_screenwidth(), root.winfo_screenheight()
x, y = screenw-W-32, screenh-H-95
root.geometry(f'{W}x{H}+{x}+{y}')
canvas = tk.Canvas(root, width=W, height=H, bg='#e4f3fa', bd=0, highlightthickness=0)
canvas.pack()
img = canvas.create_image(W // 2, H-photo.height()//2, image=photo)
text_id = canvas.create_text(W // 2, 34, text='', fill='#225a81', font=('Arial', 10, 'bold'), width=W-12)

state = 'idle'
last_state = None
bubble_end = 0.0
start_time = time.monotonic()
clip_start = start_time
reaction_start = None
idle = IdleDirector(manifest, start_time*1000)
work = WorkDirector(manifest)
interaction = DragDirector(manifest)
def animation_now(): return interaction.timeline(time.monotonic()*1000)/1000
activity_detail = ''
last_frame = None
drag = None
mute = False
popup_open = False
dock_enabled = True
dock_edge = None
folded = False
dock_position = None
motion_job = None
hide_job = None
tab_id = canvas.create_rectangle(0, 0, 0, 0, fill='#347cab', outline='', state='hidden')
tab_text = canvas.create_text(0, 0, text='鲸', fill='white', state='hidden')

def position(x, y):
    # Use the WM's absolute-position form; '-20' otherwise means right-relative in Tk.
    root.tk.call('wm', 'geometry', root._w, f'+{round(x)}+{round(y)}')

def smooth_to(x, y):
    global motion_job
    if motion_job is not None: root.after_cancel(motion_job)
    sx, sy, began = root.winfo_x(), root.winfo_y(), time.monotonic()
    def step():
        global motion_job
        t = min(1, (time.monotonic()-began)/.34)
        eased = ease_out(t)
        position(sx+(x-sx)*eased, sy+(y-sy)*eased)
        motion_job = root.after(16, step) if t < 1 else None
        if t == 1 and folded: canvas.itemconfigure(img, state='hidden')
    step()

def unfold(_=None):
    global folded, hide_job
    if hide_job is not None: root.after_cancel(hide_job); hide_job = None
    if not folded: return
    folded = False
    canvas.itemconfigure(tab_id, state='hidden'); canvas.itemconfigure(tab_text, state='hidden')
    canvas.itemconfigure(img, state='normal')
    smooth_to(*dock_position)

def fold():
    global folded, hide_job
    hide_job = None
    if not dock_edge or not dock_enabled or drag is not None or popup_open: return
    px, py = root.winfo_pointerxy()
    if root.winfo_x() <= px < root.winfo_x()+W and root.winfo_y() <= py < root.winfo_y()+H: return
    folded = True
    canvas.itemconfigure(text_id, text='')
    bounds = {'left':(W-26,(H-64)//2,W,(H+64)//2), 'right':(0,(H-64)//2,26,(H+64)//2),
              'top':((W-64)//2,H-26,(W+64)//2,H), 'bottom':((W-64)//2,0,(W+64)//2,26)}[dock_edge]
    canvas.coords(tab_id,*bounds); canvas.coords(tab_text,(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2)
    canvas.itemconfigure(tab_id,state='normal'); canvas.itemconfigure(tab_text,state='normal')
    smooth_to(*hidden_position(dock_edge,*dock_position,W,H,(0,0,screenw,screenh)))

def schedule_hide(_=None):
    global hide_job
    if dock_edge and not folded:
        if hide_job is not None: root.after_cancel(hide_job)
        hide_job = root.after(1200,fold)

def toggle_dock():
    global dock_enabled, dock_edge
    unfold(); dock_enabled = not dock_enabled
    if not dock_enabled: dock_edge = None
    say('边缘吸附已开启' if dock_enabled else '边缘吸附已关闭')

def say(msg, sec=3):
    global bubble_end
    if mute or folded: return
    canvas.itemconfigure(text_id, text=msg)
    bubble_end = time.monotonic() + sec

def close(_=None): root.destroy()
def click(e):
    global drag, motion_job
    unfold()
    if motion_job is not None: root.after_cancel(motion_job); motion_job=None
    drag = (e.x_root, e.y_root, root.winfo_x(), root.winfo_y())
    canvas.grab_set()
def move(e):
    if drag:
        dx, dy = e.x_root-drag[0], e.y_root-drag[1]
        if interaction.started is None and abs(dx)+abs(dy)<8: return
        interaction.begin(time.monotonic()*1000)
        position(drag[2]+dx,drag[3]+dy)
def release(e):
    global drag, reaction_start, dock_edge, dock_position
    moved = interaction.started is not None
    interaction.end(time.monotonic()*1000)
    if drag and not moved:
        reaction_start = animation_now()
        say(random.choice(phrases))
    elif drag:
        result = snap(root.winfo_x(),root.winfo_y(),W,H,(0,0,screenw,screenh)) if dock_enabled else None
        dock_edge = result[0] if result else None
        if result:
            dock_position = result[1:]
            smooth_to(*dock_position); schedule_hide()
    drag = None
    canvas.grab_release()

def cancel_drag(_=None):
    global drag
    interaction.end(time.monotonic()*1000)
    drag = None
    canvas.grab_release()
    schedule_hide()

def menu(e):
    global popup_open
    popup_open = True
    try: popup.tk_popup(e.x_root, e.y_root)
    finally: popup.grab_release()

popup = tk.Menu(root, tearoff=False)
def menu_closed(_):
    global popup_open
    popup_open = False
    schedule_hide()
popup.bind('<Unmap>',menu_closed)
popup.add_command(label='🐋 摸摸鲸鱼娘', command=lambda: say(random.choice(phrases)))
popup.add_command(label='边缘吸附与收起：开启 / 关闭', command=toggle_dock)
popup.add_command(label='退出桌宠（可在 Kiro 中重开）', command=close)
canvas.bind('<ButtonPress-1>', click)
canvas.bind('<B1-Motion>', move)
canvas.bind('<ButtonRelease-1>', release)
root.bind('<Escape>',cancel_drag)
canvas.bind('<Button-3>', menu)
canvas.bind('<Button-2>', menu)
canvas.bind('<Enter>',unfold)
canvas.bind('<Leave>',schedule_hide)

def parent_alive(pid):
    if not pid: return True
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True

def monitor():
    global state, last_state, clip_start, reaction_start, activity_detail
    if not parent_alive(a.parent): close(); return
    try:
        with open(a.state, encoding='utf-8') as f:
            payload = json.load(f)
        current = (payload.get('state', 'idle'), payload.get('at'), payload.get('detail'))
        if current != last_state:
            last_state = current
            next_state = current[0] if current[0] in manifest['clips'] else 'idle'
            restart = payload.get('phase')=='start'
            if next_state != state or next_state == 'done' or restart:
                work.set_state(state,next_state,animation_now()*1000,restart)
                state = next_state
                clip_start = animation_now()
                reaction_start = None
                idle.reset(animation_now()*1000)
            activity_detail = str(payload.get('detail') or '')[:160]
            msg = {'working':'Kiro 正在处理…', 'tool':'Kiro 正在调用工具…',
                   'editing':'Kiro 更新了文件～', 'done':'任务完成啦！', 'idle':'休息一会儿～', 'sleep':'呼噜呼噜～'}.get(state)
            if msg and not folded: say(activity_detail or msg, 2)
    except (OSError, ValueError, TypeError):
        pass
    root.after(700, monitor)

def animate():
    global reaction_start, last_frame
    wall = time.monotonic()
    now = animation_now()
    if folded:
        root.after(250, animate)
        return
    if reaction_start is not None and (now - reaction_start) * 1000 >= sum(manifest['clips']['hug']['durations']):
        reaction_start = None
    name = 'hug' if reaction_start is not None else state
    elapsed = (now - (reaction_start if reaction_start is not None else clip_start)) * 1000
    index = frame_at(manifest['clips'][name], elapsed)
    held = interaction.sample(wall*1000)
    if held is not None: name,index = held
    elif state == 'idle' and reaction_start is None: name, index = idle.sample(now*1000)
    elif state in ('working','tool','editing') and reaction_start is None: name,index = work.sample(state,now*1000)
    if root.winfo_viewable() and (name, index) != last_frame:
        canvas.itemconfigure(img, image=frames_for(name)[index])
        last_frame = (name, index)
    if wall >= bubble_end:
        canvas.itemconfigure(text_id, text=(activity_detail or {'working':'正在处理你的请求','tool':'正在调用工具','editing':'正在更新文件'}.get(state,'')) if state in ('working','tool','editing') and not mute else '')
    root.after(80, animate)

say('嗨～一起写代码吧！')
root.after(150, animate)
root.after(100, monitor)
root.mainloop()
