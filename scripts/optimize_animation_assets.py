"""Compile authored transition sheets and playback sequences, repeatably.

Only slices/scales existing ImageGen drawings; never synthesizes in-between art.
Original eight-frame clips remain intact. The manifest references shared frames.
"""
import copy
import json
from pathlib import Path
from PIL import Image
from stabilize_work_frames import desk_anchor, safe_shift
from lock_work_desk import table_mask
from prepare_animation_assets import cells_for, isolate_sprite

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/animations'


def prepare_transitions():
    canonical = Image.open(ASSETS/'working/00.png').convert('RGBA')
    anchor = desk_anchor(canonical)
    for name in ('sit_down', 'lie_down', 'work_bridge'):
        sheet = Image.open(ASSETS/'source'/f'{name}.png').convert('RGBA')
        if sheet.getchannel('A').getextrema()[0] != 0:
            raise ValueError(f'{name}: expected transparent source')
        cells=[isolate_sprite(cell) for cell in cells_for(sheet, True)]
        scale = min(240/max(cell.width for cell in cells),320/max(cell.height for cell in cells))
        for index in range(8):
            cell = cells[index]
            cell = cell.resize((round(cell.width*scale),round(cell.height*scale)), Image.Resampling.LANCZOS)
            frame = Image.new('RGBA',(256,342))
            frame.alpha_composite(cell,((256-cell.width)//2,331-cell.height))
            if name == 'work_bridge':
                point = desk_anchor(frame)
                if point is None: raise ValueError('Missing desk in generated transition')
                dx,dy = safe_shift(frame,anchor[0]-point[0],anchor[1]-point[1])
                aligned=Image.new('RGBA',frame.size)
                aligned.paste(frame,(dx,dy))
                frame=Image.composite(canonical,aligned,table_mask(*anchor))
            for folder, size in ((ASSETS/name,(256,342)),(ASSETS/'tk/190'/name,(142,190))):
                folder.mkdir(parents=True,exist_ok=True)
                frame.resize(size,Image.Resampling.LANCZOS).save(folder/f'{index:02}.png',optimize=True)


def optimize():
    prepare_transitions()
    manifest=json.loads((ROOT/'scripts/animation-base.json').read_text(encoding='utf-8'))
    original=copy.deepcopy(manifest['clips'])
    clips=manifest['clips']
    def sequence(name, pieces, loop=False):
        frames=[]; durations=[]
        for paths,times in pieces:
            frames.extend(paths); durations.extend(times)
        clips[name]={'frames':frames,'durations':durations,'loop':loop}
    def source(name, times=None):
        clip=original[name]
        return clip['frames'], times or clip['durations']
    def transition(name, reverse=False):
        paths=[f'{name}/{i:02}.png' for i in range(8)]
        return (paths[::-1] if reverse else paths), [100,100,120,140,140,120,100,100]
    rest=([original['idle']['frames'][0]],[320])
    down=transition('sit_down'); up=transition('sit_down',True)
    lie=transition('lie_down'); rise=transition('lie_down',True)
    # Smaller hand-drawn steps, while keeping a brief natural blink.
    for name, duration in (('working',140),('editing',110)):
        paths=[]
        for i in range(8): paths += [original[name]['frames'][i],f'work_bridge/{i:02}.png']
        sequence(name,[(paths,[duration]*16)],True)
    clips['work_start']['durations']=[180,240,300,260,300,240,260,300]
    clips['done']['durations']=[180,240,260,280,280,320,380,700]
    clips['work_pause']['durations']=[240,240,320,650,320,650,260,320]
    sequence('tool',[([original['work_pause']['frames'][i] for i in (0,1,2,3,2,1)],[500,400,450,650,450,400])],True)
    # Each autonomous scene starts and ends standing; hold the rest pose inside it.
    sequence('sit',[down,source('sit',[400,180,120,240,180,180,240,4500]),up,rest])
    sequence('nap',[down,lie,source('nap',[300,300,2400,300,300,2400,300,600]),rise,up,rest])
    sequence('stretch',[down,source('stretch',[240,180,240,400,320,240,180,400]),up,rest])
    for name in ('rice_scoop','rice_hug'):
        sequence(name,[source(name,[360,280,240,300,360,360,400,1400]),rest])
    sequence('rice_full',[down,source('rice_full',[360,280,240,300,400,800,400,1800]),up,rest])
    sequence('walk',[source('walk',[260,200,200,200,200,200,200,320]),rest])
    sequence('hug',[source('hug',[120,140,160,240,280,220,160,180])])
    sequence('work_pet',[(original['work_pause']['frames'][:3]+original['work_pause']['frames'][1::-1],[180,220,300,220,180])])
    sequence('sit_pet',[(original['sit']['frames'][1:7],[160,180,200,220,200,160])])
    sequence('nap_pet',[(original['nap']['frames'][:3]+original['nap']['frames'][1::-1],[200,220,300,220,200])])
    sequence('land',[([f'sit_down/{i:02}.png' for i in (3,2,1,0)]+[original['idle']['frames'][0]],[80,100,100,120,180])])
    manifest['version']=3
    manifest['reactions']={'working':'work_pet','editing':'work_pet','tool':'work_pet','sit':'sit_pet','sit_down':'sit_pet','nap':'nap_pet','lie_down':'nap_pet','sleep':'nap_pet'}
    # Long floor scenes and food scenes are less common than small standing actions.
    manifest['idleBehavior'].update(weights={'idle':5,'walk':3,'sit':3,'nap':1,'stretch':2,'rice_scoop':1,'rice_hug':1,'rice_full':1},restMinMs=22000,restMaxMs=45000)
    # Native Tk cannot resize to arbitrary dimensions without an image library.
    # Ship exact-size frames for the small default, keeping runtime dependency-free.
    for relative in sorted({frame for clip in clips.values() for frame in clip['frames']}):
        destination = ASSETS/'tk/140'/relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(ASSETS/relative) as image:
            image.resize((105, 140), Image.Resampling.LANCZOS).save(destination, optimize=True)
    (ASSETS/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Compiled animation sequences and exact 140px Tk frames.')


if __name__ == '__main__':
    optimize()
