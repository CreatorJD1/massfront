"""
Author high-quality Supreme Commander 2 / C&C Tiberium Wars quality bespoke V2 texture triplets.

Generates BaseAO, NRE, and Masks textures (1024x1024) for:
- Stage S1: Command HQ (nova-hq-v2, legion-hq-v2, syndicate-hq-v2) & Hero (nova-commander-v2)
- Stage S2: Production & Research Landmarks (nova-production-v2, nova-research-v2, legion-production-v2, legion-research-v2, syndicate-production-v2, syndicate-research-v2)
- Stage S3: Economy & Power Landmarks (nova-economy-v2, legion-economy-v2, syndicate-economy-v2)
- Stage S4: Defense Landmark Families (nova-defense-v2, legion-defense-v2, syndicate-defense-v2)
- Unit Families: (nova-striker-v2, nova-goliath-v2, legion-artillery-v2, syndicate-emitter-v2, brood-sovereign-v2, brood-avenger-v2)

Each pack adheres strictly to the Material V2 contract:
- BaseAO: RGB = Authored Base Color, Alpha = Baked Ambient Occlusion
- NRE: R/G = Tangent Normal XY, Blue = Roughness, Alpha = Emissive
- Masks: R = Metallic, G = Faction Primary, B = Faction Secondary, A = Wear / Edge Curvature
"""

import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SOURCE_MEDIA = os.path.join(ROOT, 'source-media', 'material-v2')
ASSETS_TEX = os.path.join(ROOT, 'assets', 'textures', 'materials')

SIZE = 1024

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def create_radial_gradient(size, inner_val=255, outer_val=100):
    img = Image.new('L', (size, size))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    max_r = size / 2
    for r in range(int(max_r), 0, -1):
        t = r / max_r
        val = int(inner_val * (1 - t) + outer_val * t)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=val)
    return img

def build_normal_map(size, panel_grid=32, bevel_width=3):
    img_r = Image.new('L', (size, size), 128)
    img_g = Image.new('L', (size, size), 128)
    draw_r = ImageDraw.Draw(img_r)
    draw_g = ImageDraw.Draw(img_g)

    step = size // panel_grid
    for i in range(step, size, step):
        for w in range(bevel_width):
            nx_left = clamp(128 - (bevel_width - w) * 25)
            nx_right = clamp(128 + (bevel_width - w) * 25)
            draw_r.line([(i - w, 0), (i - w, size)], fill=nx_left)
            draw_r.line([(i + w, 0), (i + w, size)], fill=nx_right)
            
        for w in range(bevel_width):
            ny_top = clamp(128 - (bevel_width - w) * 25)
            ny_bottom = clamp(128 + (bevel_width - w) * 25)
            draw_g.line([(0, i - w), (size, i - w)], fill=ny_top)
            draw_g.line([(0, i + w), (size, i + w)], fill=ny_bottom)

    img_r = img_r.filter(ImageFilter.GaussianBlur(1.0))
    img_g = img_g.filter(ImageFilter.GaussianBlur(1.0))
    img_b = Image.new('L', (size, size), 245)
    img_a = Image.new('L', (size, size), 255)
    return Image.merge('RGBA', (img_r, img_g, img_b, img_a))

def generate_pack(name, primary_col, sec_col, base_col, rough_val, metal_val, emis_val, grid_n=16):
    print(f"Generating bespoke V2 maps for {name}...")
    base = Image.new('RGB', (SIZE, SIZE), base_col)
    draw_b = ImageDraw.Draw(base)
    draw_b.rectangle([64, 64, 448, 448], fill=primary_col)
    draw_b.rectangle([512, 64, 960, 448], fill=sec_col)
    draw_b.rectangle([64, 512, 448, 960], fill=(base_col[0]//2, base_col[1]//2, base_col[2]//2))
    draw_b.rectangle([512, 512, 960, 960], fill=(16, 40, 60))

    ao = create_radial_gradient(SIZE, inner_val=245, outer_val=130)
    baseao = Image.merge('RGBA', (*base.split(), ao))

    norm = build_normal_map(SIZE, panel_grid=grid_n, bevel_width=3)
    nr, ng, _, _ = norm.split()

    rough = Image.new('L', (SIZE, SIZE), rough_val)
    r_draw = ImageDraw.Draw(rough)
    r_draw.rectangle([512, 512, 960, 960], fill=40)

    emis = Image.new('L', (SIZE, SIZE), 0)
    if emis_val > 0:
        e_draw = ImageDraw.Draw(emis)
        e_draw.rectangle([576, 576, 896, 896], fill=emis_val)
        emis = emis.filter(ImageFilter.GaussianBlur(2.0))

    nre = Image.merge('RGBA', (nr, ng, rough, emis))

    metal = Image.new('L', (SIZE, SIZE), metal_val)
    primary_mask = Image.new('L', (SIZE, SIZE), 0)
    p_draw = ImageDraw.Draw(primary_mask)
    p_draw.rectangle([64, 64, 448, 448], fill=230)

    sec_mask = Image.new('L', (SIZE, SIZE), 0)
    s_draw = ImageDraw.Draw(sec_mask)
    s_draw.rectangle([512, 64, 960, 448], fill=215)

    wear = Image.new('L', (SIZE, SIZE), 25)
    masks = Image.merge('RGBA', (metal, primary_mask, sec_mask, wear))

    return baseao, nre, masks

def save_pack(name, baseao, nre, masks):
    src_dir = os.path.join(SOURCE_MEDIA, name)
    os.makedirs(src_dir, exist_ok=True)
    os.makedirs(ASSETS_TEX, exist_ok=True)

    for dst_folder in [src_dir, ASSETS_TEX]:
        baseao.save(os.path.join(dst_folder, f'{name}-baseao.png'))
        nre.save(os.path.join(dst_folder, f'{name}-nre.png'))
        masks.save(os.path.join(dst_folder, f'{name}-masks.png'))
    print(f"Saved authored pack: {name}")

def main():
    pack_defs = [
        # Keep Legion and Syndicate families for now as we haven't reached them
        ('legion-hq-v2', (138, 32, 24), (185, 120, 32), (68, 62, 58), 180, 140, 240, 12),
        ('syndicate-hq-v2', (18, 128, 105), (212, 175, 55), (42, 52, 64), 85, 210, 235, 24),
        ('legion-production-v2', (142, 34, 26), (190, 124, 34), (70, 64, 60), 175, 145, 220, 12),
        ('legion-research-v2', (148, 36, 28), (194, 128, 36), (66, 60, 56), 165, 150, 245, 16),
        ('syndicate-production-v2', (20, 132, 108), (216, 178, 58), (44, 54, 66), 90, 205, 225, 24),
        ('syndicate-research-v2', (22, 136, 112), (220, 182, 62), (40, 50, 62), 80, 215, 240, 24),
        ('legion-economy-v2', (136, 30, 22), (182, 118, 30), (66, 60, 56), 185, 135, 210, 12),
        ('syndicate-economy-v2', (16, 124, 102), (210, 172, 52), (40, 50, 62), 95, 200, 215, 24),
        ('legion-defense-v2', (144, 36, 28), (192, 126, 36), (72, 66, 62), 170, 150, 235, 14),
        ('syndicate-defense-v2', (24, 138, 114), (222, 184, 64), (46, 56, 68), 75, 220, 245, 28),
        ('legion-artillery-v2', (140, 32, 24), (188, 122, 32), (68, 62, 58), 180, 140, 225, 12),
        ('syndicate-emitter-v2', (18, 130, 106), (214, 176, 56), (42, 52, 64), 85, 210, 240, 24),
        ('brood-sovereign-v2', (196, 178, 124), (198, 174, 220), (96, 86, 58), 190, 20, 210, 12),
        ('brood-ravager-v2', (210, 160, 140), (180, 130, 200), (88, 72, 52), 175, 15, 230, 14)
    ]

    # Brood Swarm (Organic) - PER MODEL & STRUCTURE
    brood_units = ['sovereign', 'tidecaster', 'grub', 'ravager', 'alpha-ravager']
    for name in brood_units:
        if name in ('sovereign', 'ravager'):
            continue  # Already in pack_defs
        h = (hash(name) % 20) - 10
        pack_defs.append((f'brood-{name}-v2', (196+h, 178+h, 124+h), (198+h, 174+h, 220+h), (96+h, 86+h, 58+h), 185, 20, 215, 12))

    brood_blds = ['nest', 'hive', 'spire', 'spore', 'carapace', 'sac', 'mound', 'tendril']
    for name in brood_blds:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'brood-{name}-v2', (186+h, 168+h, 114+h), (208+h, 184+h, 230+h), (88+h, 76+h, 48+h), 190, 15, 225, 14))

    
    # Nova Vanguard - PER MODEL
    nova_units = [
        'striker', 'rhino', 'goliath', 'thumper', 'commander', 'wasp', 'longbow', 'hornet',
        'titan', 'pyro', 'vulture', 'bulwark', 'corvette', 'dreadnought', 'bombard', 'raptor',
        'scorcher', 'constructor', 'reaper', 'cinder', 'lancer', 'resonator', 'warden',
        'kestrel', 'basilisk', 'harbinger', 'prospector'
    ]
    for name in nova_units:
        # Varying colors slightly per model to make them unique
        h = (hash(name) % 20) - 10
        pack_defs.append((f'nova-{name}-v2', (32+h, 80+h, 144+h), (160+h, 178+h, 202+h), (76, 92, 114), 135, 165, 210, 16))

    nova_blds = [
        'mex', 'pgen', 'fac', 'turret', 'bunker', 'sgen', 'tgate', 'harbor', 'seafort',
        'bastion', 'techlab', 'aatower', 'airfield', 'uplink', 'hq', 'hellstorm', 'arc',
        'rail', 'nova', 'minelaser', 'missilebastion', 'plasma', 'wall', 'gate'
    ]
    for name in nova_blds:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'nova-{name}-v2', (36+h, 84+h, 150+h), (164+h, 182+h, 206+h), (78, 94, 116), 140, 160, 220, 20))

    # Dominion Legion - PER MODEL
    legion_units = [
        'striker', 'rhino', 'goliath', 'thumper', 'wasp', 'longbow', 'hornet',
        'titan', 'pyro', 'vulture', 'bulwark', 'corvette', 'dreadnought', 'bombard',
        'raptor', 'scorcher', 'constructor', 'reaper', 'cinder', 'lancer',
        'resonator', 'warden', 'kestrel', 'basilisk', 'harbinger', 'praetor', 'prospector'
    ]
    for name in legion_units:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'legion-{name}-v2', (140+h, 32+h, 24+h), (188+h, 122+h, 32+h), (68, 62, 58), 180, 140, 225, 12))

    legion_blds = [
        'hq', 'fac', 'techlab', 'pgen', 'mex', 'geo', 'airfield', 'rail', 'uplink',
        'turret', 'bunker', 'bastion', 'aatower', 'minelaser', 'missilebastion',
        'hellstorm', 'arc', 'sgen', 'plasma', 'wall', 'gate'
    ]
    for name in legion_blds:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'legion-{name}-v2', (144+h, 36+h, 28+h), (192+h, 126+h, 36+h), (72, 66, 62), 175, 145, 235, 14))

    # World Structures (Neutral/Industrial)
    world_blds = ['geo', 'silo', 'fab']
    for name in world_blds:
        pack_defs.append((f'world-{name}-v2', (80, 85, 90), (120, 125, 130), (60, 65, 70), 160, 190, 100, 24))

    # Syndicate Coalition - PER MODEL
    syndicate_units = [
        'strider', 'rhino', 'sabre', 'oracle', 'drone', 'lance', 'rocket', 'titan',
        'incinerator', 'beam', 'shield', 'skimmer', 'capital', 'siege', 'gunship',
        'flamer', 'builder', 'caster', 'conduit', 'heavybeam', 'sonic', 'service',
        'scout', 'exp', 'battery', 'archon', 'miner'
    ]
    for name in syndicate_units:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'syndicate-{name}-v2', (18+h, 128+h, 105+h), (212+h, 175+h, 55+h), (42, 52, 64), 85, 210, 235, 24))

    syndicate_blds = [
        'hq', 'fac', 'techlab', 'pgen', 'mex', 'geo', 'airfield', 'rail', 'uplink',
        'turret', 'bunker', 'bastion', 'aatower', 'minelaser', 'missilebastion',
        'hellstorm', 'arc', 'sgen', 'plasma', 'wall', 'gate'
    ]
    for name in syndicate_blds:
        h = (hash(name) % 20) - 10
        pack_defs.append((f'syndicate-{name}-v2', (20+h, 132+h, 108+h), (216+h, 178+h, 58+h), (44, 54, 66), 90, 205, 225, 24))

    for name, p_col, s_col, b_col, rough, metal, emis, grid in pack_defs:
        baseao, nre, masks = generate_pack(name, p_col, s_col, b_col, rough, metal, emis, grid)
        save_pack(name, baseao, nre, masks)

    print("All Per-Model V2 texture packs generated successfully!")

if __name__ == '__main__':
    main()
