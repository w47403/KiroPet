#!/usr/bin/env python3
"""Optional macOS / Linux desktop window. Uses Python 3 + Tk (no pip dependencies)."""
import argparse
import json
import math
import os
import random
import sys
import time
import tkinter as tk
from animation_runtime import frame_at, frame_delay, peek_delay, IdleDirector, WorkDirector, DragDirector
from dock_runtime import TAB_EXPOSURE, snap, hidden_position, ease_out
from preferences import read_preferences, save_preferences, restore_position

p = argparse.ArgumentParser()
p.add_argument('--image', required=True)
p.add_argument('--state', required=True)
p.add_argument('--size', type=int, default=140)
p.add_argument('--parent', type=int, default=0)
p.add_argument('--preferences', default='')
a = p.parse_args()

phrases = ['在呢～', '摸摸头，继续加油！', '今天也要写出漂亮的代码～', '呼噜呼噜～', '你写代码，我负责卖萌！']
size = max(100, min(320, a.size))
configured_size = size
preferences = read_preferences(a.preferences, configured_size)
size = preferences['size']
root = tk.Tk()
root.withdraw()
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
image_cache = {}

def frame_for(name, index):
    relative = manifest['clips'][name]['frames'][index]
    if relative in image_cache:
        return image_cache[relative]
    # Pre-sized PNGs keep native Tk dependency-free and avoid integer zoom artifacts.
    filename = os.path.join(animation_dir, 'tk', str(size), relative)
    if not os.path.isfile(filename):
        filename = os.path.join(animation_dir, relative)
    raw = tk.PhotoImage(file=filename)
    factor = max(1, round(max(raw.width(), raw.height()) / size))
    image_cache[relative] = raw.subsample(factor, factor)
    while len(image_cache) > 240:
        del image_cache[next(iter(image_cache))]
    return image_cache[relative]

photo = frame_for('idle', 0)
W, H = max(size, photo.width() + 18), photo.height() + 76
screenw, screenh = root.winfo_screenwidth(), root.winfo_screenheight()
x, y = screenw-W-32, screenh-H-95
if 'left' in preferences and 'top' in preferences:
    x, y = restore_position(preferences['left'], preferences['top'], W, H, [(0, 0, screenw, screenh)])
root.geometry(f'{W}x{H}+{round(x)}+{round(y)}')
canvas = tk.Canvas(root, width=W, height=H, bg='#e4f3fa', bd=0, highlightthickness=0)
canvas.pack()
img = canvas.create_image(W // 2, H-photo.height()//2, image=photo)
text_id = canvas.create_text(W // 2, 34, text='', fill='#225a81', font=('Arial', 10, 'bold'), width=W-12)

state = 'idle'
last_state = None
last_transition = None
bubble_end = 0.0
start_time = time.monotonic()
clip_start = start_time
reaction_start = None
reaction_name = 'hug'
idle = IdleDirector(manifest, start_time*1000)
work = WorkDirector(manifest)
interaction = DragDirector(manifest)
def animation_now(): return interaction.timeline(time.monotonic()*1000)/1000
activity_detail = ''
last_frame = None
drag = None
mute = preferences['mute']
notify_on_done = preferences['notifyOnDone']
popup_open = False
dock_enabled = preferences['dockEnabled']
dock_edge = None
folded = False
dock_position = None
motion_job = None
hide_job = None
# Show the original whale girl's peeking face, not a generic emoji.
# Tk can crop/subsample existing PNGs without any installed image library.
def peek_face(index):
    clip=manifest['clips']['idle']
    sources=clip.get('sources')
    if sources:
        original=f'idle/{index:02}.png'
        index=sources.index(original) if original in sources else 0
    raw = tk.PhotoImage(file=os.path.join(animation_dir,clip['frames'][index]))
    crop = tk.PhotoImage(width=216, height=216)
    crop.tk.call(str(crop), 'copy', str(raw), '-from', 20, 12, 236, 228, '-to', 0, 0)
    return crop.subsample(4, 4)  # 54x54px

peek_faces = {'smile': peek_face(4), 'open': peek_face(0), 'blink': peek_face(3)}
tab_id = canvas.create_rectangle(0, 0, 0, 0, fill='#dbeffe', outline='#428abb', width=2, state='hidden')
tab_avatar = canvas.create_image(0, 0, image=peek_faces['smile'], state='hidden')
tab_badge = canvas.create_text(0, 0, text='♡', fill='#1f5b91', font=('Arial', 12, 'bold'), state='hidden')
folded_at = time.monotonic()

def update_peek(now):
    if not folded: return
    elapsed = max(0, (now-folded_at) * 1000)
    blink = elapsed > 1000 and 5000 <= elapsed % 7200 < 5230
    pose = 'open' if state in ('working', 'tool', 'editing') else 'smile'
    if state == 'sleep': pose = 'blink'
    badge = '••' if state in ('working','tool','editing') else '✦' if state == 'done' else 'zZ' if state == 'sleep' else '♡'
    canvas.itemconfigure(tab_avatar, image=peek_faces['blink' if blink else pose])
    canvas.itemconfigure(tab_badge, text=badge)

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
    for item in (tab_id, tab_avatar, tab_badge): canvas.itemconfigure(item, state='hidden')
    canvas.itemconfigure(img, state='normal')
    smooth_to(*dock_position)
    animate()

def fold():
    global folded, hide_job, folded_at
    hide_job = None
    if dock_edge not in ('left', 'right') or not dock_enabled or drag is not None or popup_open: return
    px, py = root.winfo_pointerxy()
    if root.winfo_x() <= px < root.winfo_x()+W and root.winfo_y() <= py < root.winfo_y()+H: return
    folded = True
    folded_at = time.monotonic()
    canvas.itemconfigure(text_id, text='')
    tab = TAB_EXPOSURE
    bounds = {'left':(W-tab,(H-74)//2,W,(H+74)//2),
              'right':(0,(H-74)//2,tab,(H+74)//2)}[dock_edge]
    left, top, right, bottom = bounds
    canvas.coords(tab_id, *bounds)
    canvas.coords(tab_avatar, (left+right)/2, (top+bottom)/2)
    canvas.coords(tab_badge, right-9, bottom-11)
    for item in (tab_id, tab_avatar, tab_badge): canvas.itemconfigure(item, state='normal')
    update_peek(folded_at)
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
    say('左右吸附已开启' if dock_enabled else '左右吸附已关闭')
    save_window()


def save_window():
    x, y = dock_position if dock_edge and dock_position else (root.winfo_x(), root.winfo_y())
    save_preferences(a.preferences, dict(size=size, configuredSize=configured_size, left=x, top=y,
                                       mute=mute, dockEnabled=dock_enabled, notifyOnDone=notify_on_done))


def toggle_mute():
    global mute
    mute = not mute
    canvas.itemconfigure(text_id, text='')
    if not mute: say('我回来啦～')
    save_window()


def toggle_notify():
    global notify_on_done
    notify_on_done = not notify_on_done
    say('完成时会展开提醒～' if notify_on_done else '完成时保持探头待机～')
    save_window()

def say(msg, sec=3):
    global bubble_end
    if mute or folded: return
    canvas.itemconfigure(text_id, text=msg)
    bubble_end = time.monotonic() + sec

def react():
    global reaction_start, reaction_name
    if reaction_start is not None: return
    intro=manifest['clips'].get('work_start',{})
    if state=='done' or (state in ('working','tool','editing') and work.started is not None and
            animation_now()*1000-work.started < sum(intro.get('durations',[]))):
        say(random.choice(phrases))
        return
    clip=manifest['clips'][last_frame[0]] if last_frame else None
    pose=(clip.get('sources',clip['frames'])[last_frame[1]].split('/')[-2]) if clip else 'idle'
    if (last_frame and last_frame[0] in ('work_start','done')) or pose in ('work_start','done','sit_down','lie_down','rice_scoop','rice_hug','rice_full'):
        say(random.choice(phrases))
        return
    reactions = manifest.get('reactions',{})
    reaction_name = reactions.get(state,reactions.get(pose,'hug'))
    reaction_start = animation_now()
    say(random.choice(phrases))
    animate()

def shift_background(shift):
    global clip_start
    clip_start += shift/1000
    idle.next_at += shift
    if idle.started is not None: idle.started += shift
    if work.started is not None: work.started += shift
    work.loop_started += shift
    work.next_at += shift
    if work.accent is not None: work.accent += shift

def cancel_reaction():
    global reaction_start
    if reaction_start is not None:
        elapsed = (animation_now()-reaction_start)*1000
        shift_background(max(0,min(sum(manifest['clips'][reaction_name]['durations']),elapsed)))
        reaction_start = None

def close(_=None):
    save_window()
    root.destroy()
def click(e):
    global drag, motion_job
    unfold()
    if motion_job is not None: root.after_cancel(motion_job); motion_job=None
    drag = (e.x_root, e.y_root, root.winfo_x(), root.winfo_y())
    canvas.grab_set()
def move(e):
    global reaction_start
    if drag:
        dx, dy = e.x_root-drag[0], e.y_root-drag[1]
        if interaction.started is None and abs(dx)+abs(dy)<8: return
        if interaction.started is None and reaction_start is not None:
            shift_background(min(sum(manifest['clips'][reaction_name]['durations']),(animation_now()-reaction_start)*1000))
            reaction_start=None
        interaction.begin(time.monotonic()*1000)
        position(drag[2]+dx,drag[3]+dy)
        animate()
def release(e):
    global drag, reaction_start, reaction_name, dock_edge, dock_position
    moved = interaction.started is not None
    interaction.end(time.monotonic()*1000)
    if drag and not moved:
        react()
    elif drag:
        if state == 'idle':
            idle.reset(animation_now()*1000)
            reaction_name='land'; reaction_start=animation_now()
        result = snap(root.winfo_x(),root.winfo_y(),W,H,(0,0,screenw,screenh)) if dock_enabled else None
        dock_edge = result[0] if result else None
        if result:
            dock_position = result[1:]
            smooth_to(*dock_position); schedule_hide()
    drag = None
    canvas.grab_release()
    if moved: save_window()
    animate()

def cancel_drag(_=None):
    global drag
    interaction.end(time.monotonic()*1000)
    drag = None
    canvas.grab_release()
    schedule_hide()
    animate()

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
popup.add_command(label='🐋 摸摸鲸鱼娘', command=react)
def preview_action(name):
    global reaction_name, reaction_start
    cancel_reaction()
    reaction_name = name
    reaction_start = animation_now()
    say(manifest['clips'][name].get('nameZh', name))

if manifest.get('catalog'):
    actions_menu = tk.Menu(popup, tearoff=False)
    groups = {}
    for action in manifest['catalog']:
        category = action['category']
        if category not in groups:
            groups[category] = tk.Menu(actions_menu, tearoff=False)
            actions_menu.add_cascade(label=category, menu=groups[category])
        groups[category].add_command(label=action['nameZh'], command=lambda name=action['id']: preview_action(name))
    popup.add_cascade(label='全部动作（95）', menu=actions_menu)
popup.add_command(label='左右吸附与收起：开启 / 关闭', command=toggle_dock)
popup.add_command(label='静音 / 恢复气泡', command=toggle_mute)
popup.add_command(label='完成时自动展开：开启 / 关闭', command=toggle_notify)
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
    global state, last_state, last_transition, clip_start, reaction_start, activity_detail
    if not parent_alive(a.parent): close(); return
    try:
        with open(a.state, encoding='utf-8') as f:
            payload = json.load(f)
        current = (payload.get('state', 'idle'), payload.get('at'), payload.get('detail'), payload.get('reply'), payload.get('replyUntil'))
        if current != last_state:
            last_state = current
            next_state = current[0] if current[0] in manifest['clips'] else 'idle'
            transition = (next_state, payload.get('at'), payload.get('session'))
            changed = transition != last_transition
            if changed:
                last_transition = transition
                cancel_reaction()
                restart = payload.get('phase')=='start'
                if next_state != state or next_state == 'done' or restart:
                    work.set_state(state,next_state,animation_now()*1000,restart)
                    state = next_state
                    clip_start = animation_now()
                    idle.reset(animation_now()*1000)
            activity_detail = str(payload.get('detail') or '')[:160]
            msg = {'working':'Kiro 正在处理…', 'tool':'Kiro 正在调用工具…',
                   'editing':'Kiro 更新了文件～', 'done':'任务完成啦！', 'idle':'休息一会儿～', 'sleep':'呼噜呼噜～'}.get(state)
            if changed and state == 'done' and folded and notify_on_done:
                unfold()
                if dock_edge: root.after(9000, schedule_hide)
            if msg and not folded: say(activity_detail or msg, 5 if state == 'done' else 2)
            remaining = (float(payload.get('replyUntil') or 0) - time.time()*1000) / 1000
            if payload.get('reply') and remaining > 0 and not folded:
                say('回答 · ' + str(payload['reply'])[:90], min(8, remaining))
            animate()
    except (OSError, ValueError, TypeError):
        pass
    root.after(700, monitor)

animation_job = None

def animate():
    global reaction_start, last_frame, animation_job, clip_start
    if animation_job is not None:
        root.after_cancel(animation_job)
        animation_job = None
    wall = time.monotonic()
    now = animation_now()
    if folded:
        update_peek(wall)
        animation_job = root.after(math.ceil(peek_delay((wall-folded_at)*1000, state)), animate)
        return
    if reaction_start is not None and (now - reaction_start) * 1000 >= sum(manifest['clips'][reaction_name]['durations']):
        shift = sum(manifest['clips'][reaction_name]['durations'])
        shift_background(shift)
        reaction_start = None
    name = reaction_name if reaction_start is not None else state
    elapsed = (now - (reaction_start if reaction_start is not None else clip_start)) * 1000
    index = frame_at(manifest['clips'][name], elapsed)
    delay = frame_delay(manifest['clips'][name], elapsed)
    held = interaction.sample(wall*1000)
    if held is not None:
        name,index = held
        delay = interaction.next_delay
    elif state == 'idle' and reaction_start is None:
        name, index = idle.sample(now*1000)
        delay = idle.next_delay
    elif state in ('working','tool','editing') and reaction_start is None:
        name,index = work.sample(state,now*1000)
        delay = work.next_delay
    if root.winfo_viewable() and (name, index) != last_frame:
        canvas.itemconfigure(img, image=frame_for(name, index))
        last_frame = (name, index)
    if wall >= bubble_end:
        canvas.itemconfigure(text_id, text=(activity_detail or {'working':'正在处理你的请求','tool':'正在调用工具','editing':'正在更新文件'}.get(state,'')) if state in ('working','tool','editing') and not mute else '')
    animation_job = root.after(math.ceil(delay), animate)

say('嗨～一起写代码吧！')
root.deiconify()
animation_job = root.after(16, animate)
root.after(100, monitor)
root.mainloop()
