#!/usr/bin/env python3
"""
Item art generator.

Every craftable, researchable and purchasable thing in the game gets a real
painted icon rather than an emoji. Emoji are a different typeface on every
platform, they carry someone else's design language, and they cannot be made to
share a palette with the game — three good reasons not to ship a shop full of
them.

These are drawn procedurally, in the same way the in-game materials are: a dark
machined panel, a rim light, a category-tinted glyph built from primitives, and
a bevel. Same source, same palette, same treatment, so the whole set reads as
one family. Re-run this to regenerate the lot.

    python3 tools/make-icons.py
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

S = 256                      # authored large, downsampled to 128 on save
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons', 'items')

# Category palettes: (glyph bright, glyph mid, panel tint)
PAL = {
    'mat':    ((150, 214, 255), (46, 120, 172), (14, 26, 40)),
    'fab':    ((190, 226, 255), (58, 132, 186), (14, 26, 40)),
    'doc':    ((255, 226, 160), (168, 126, 44), (32, 26, 14)),
    'xeno':   ((196, 150, 255), (110, 62, 178), (26, 16, 40)),
    'mod':    ((160, 240, 210), (36, 140, 110), (12, 30, 26)),
    'store':  ((255, 190, 130), (168, 96, 40), (32, 20, 12)),
    'boost':  ((255, 214, 120), (176, 118, 30), (34, 26, 10)),
    'danger': ((255, 150, 130), (160, 48, 34), (36, 14, 12)),
    'unit':   ((150, 232, 255), (42, 130, 178), (10, 25, 38)),
    'alien':  ((224, 160, 255), (124, 56, 174), (29, 13, 40)),
    'struct': ((172, 224, 255), (56, 126, 164), (16, 27, 36)),
}


def panel(tint):
    """The plate every glyph sits on: machined, lit from above, chamfered."""
    img = Image.new('RGB', (S, S), (6, 10, 16))
    d = ImageDraw.Draw(img, 'RGBA')
    r, g, b = tint
    for y in range(S):                       # vertical falloff
        k = y / S
        d.line([(0, y), (S, y)], fill=(int(r * (1.5 - k * .8)), int(g * (1.5 - k * .8)),
                                       int(b * (1.5 - k * .8))))
    d.rounded_rectangle([10, 10, S - 10, S - 10], radius=26,
                        outline=(120, 170, 205, 90), width=3)
    d.rounded_rectangle([13, 13, S - 13, S - 13], radius=23,
                        outline=(255, 255, 255, 26), width=2)
    for i in range(3):                       # corner rivets
        for (cx, cy) in [(30, 30), (S - 30, 30), (30, S - 30), (S - 30, S - 30)]:
            d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(200, 225, 245, 60))
    return img


def glow(img, mask, col, amt=1.0, rad=14):
    g = Image.new('RGB', (S, S), (0, 0, 0))
    ImageDraw.Draw(g).bitmap((0, 0), mask, fill=col)
    g = g.filter(ImageFilter.GaussianBlur(rad))
    from PIL import ImageChops
    return ImageChops.add(img, g.point(lambda v: int(v * amt)))


# ---------------------------------------------------------------- glyph motifs
def g_shield(d, c1, c2):
    d.polygon([(128, 42), (206, 76), (206, 140), (128, 214), (50, 140), (50, 76)], fill=c2)
    d.polygon([(128, 62), (188, 88), (188, 138), (128, 194), (68, 138), (68, 88)], fill=(0, 0, 0, 190))
    d.polygon([(128, 78), (172, 96), (172, 134), (128, 176), (84, 134), (84, 96)], fill=c1)
    d.polygon([(128, 96), (156, 108), (156, 132), (128, 158), (100, 132), (100, 108)], fill=(0, 0, 0, 150))


def g_crosshair(d, c1, c2):
    d.ellipse([58, 58, 198, 198], outline=c2, width=12)
    d.ellipse([84, 84, 172, 172], outline=c1, width=6)
    for a in range(4):
        t = a * math.pi / 2
        d.line([(128 + math.cos(t) * 34, 128 + math.sin(t) * 34),
                (128 + math.cos(t) * 96, 128 + math.sin(t) * 96)], fill=c1, width=10)
    d.ellipse([118, 118, 138, 138], fill=c1)


def g_dish(d, c1, c2):
    d.ellipse([46, 66, 210, 170], fill=c2)
    d.ellipse([64, 78, 192, 158], fill=(0, 0, 0, 170))
    d.ellipse([84, 90, 172, 146], fill=c1)
    d.polygon([(120, 118), (136, 118), (140, 210), (116, 210)], fill=c2)
    d.rectangle([96, 204, 160, 218], fill=c1)


def g_gear(d, c1, c2):
    for i in range(10):
        a = i * math.pi / 5
        x, y = 128 + math.cos(a) * 82, 128 + math.sin(a) * 82
        d.regular_polygon((x, y, 22), 4, rotation=math.degrees(a), fill=c2)
    d.ellipse([56, 56, 200, 200], fill=c2)
    d.ellipse([74, 74, 182, 182], fill=c1)
    d.ellipse([104, 104, 152, 152], fill=(0, 0, 0, 210))


def g_recycle(d, c1, c2):
    """Three chasing arrows. Drawn as a thick arc plus a head so it reads as
    motion rather than as three loose triangles."""
    for i in range(3):
        a0 = i * 120 - 84
        d.arc([56, 56, 200, 200], a0, a0 + 78, fill=c2 if i else c1, width=26)
        t = math.radians(a0 + 86)
        cx, cy = 128 + math.cos(t) * 100, 128 + math.sin(t) * 100
        n = t + math.pi / 2
        d.polygon([(cx + math.cos(t) * 26, cy + math.sin(t) * 26),
                   (cx + math.cos(n) * 24, cy + math.sin(n) * 24),
                   (cx - math.cos(n) * 24, cy - math.sin(n) * 24)], fill=c2 if i else c1)


def g_atom(d, c1, c2):
    for i in range(3):
        e = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ed = ImageDraw.Draw(e)
        ed.ellipse([38, 100, 218, 156], outline=c2, width=11)
        e = e.rotate(i * 60, resample=Image.BICUBIC, center=(128, 128))
        d.bitmap((0, 0), e.split()[3], fill=c2)
    d.ellipse([108, 108, 148, 148], fill=c1)


def g_lattice(d, c1, c2):
    pts = [(128, 40), (206, 84), (206, 172), (128, 216), (50, 172), (50, 84)]
    for i in range(6):
        for j in range(i + 1, 6):
            d.line([pts[i], pts[j]], fill=c2, width=5)
    for p in pts:
        d.ellipse([p[0] - 13, p[1] - 13, p[0] + 13, p[1] + 13], fill=c1)
    d.ellipse([112, 112, 144, 144], fill=c1)


def g_bolt(d, c1, c2):
    d.polygon([(150, 34), (86, 138), (124, 138), (100, 222), (176, 112), (134, 112)], fill=c2)
    d.polygon([(146, 52), (100, 128), (130, 128), (112, 198), (162, 122), (128, 122)], fill=c1)


def g_plate(d, c1, c2):
    d.rounded_rectangle([48, 62, 208, 194], radius=16, fill=c2)
    d.rounded_rectangle([62, 76, 194, 180], radius=10, fill=(0, 0, 0, 170))
    for i in range(3):
        d.rounded_rectangle([74, 88 + i * 32, 182, 108 + i * 32], radius=5, fill=c1)


def g_chip(d, c1, c2):
    d.rounded_rectangle([64, 64, 192, 192], radius=10, fill=c2)
    d.rounded_rectangle([84, 84, 172, 172], radius=6, fill=(0, 0, 0, 200))
    d.rounded_rectangle([100, 100, 156, 156], radius=4, fill=c1)
    for i in range(4):
        o = 78 + i * 28
        for (x0, y0, x1, y1) in [(38, o, 64, o + 12), (192, o, 218, o + 12),
                                 (o, 38, o + 12, 64), (o, 192, o + 12, 218)]:
            d.rounded_rectangle([x0, y0, x1, y1], radius=3, fill=c1)


def g_canister(d, c1, c2):
    d.rounded_rectangle([84, 52, 172, 210], radius=26, fill=c2)
    d.rounded_rectangle([98, 70, 158, 194], radius=18, fill=(0, 0, 0, 190))
    d.rounded_rectangle([102, 120, 154, 190], radius=14, fill=c1)
    d.rectangle([104, 40, 152, 60], fill=c1)
    d.ellipse([112, 92, 144, 118], fill=c1)


def g_crystal(d, c1, c2):
    d.polygon([(128, 28), (194, 108), (158, 224), (98, 224), (62, 108)], fill=c2)
    d.polygon([(128, 52), (172, 112), (146, 204), (128, 204)], fill=c1)
    d.polygon([(128, 52), (84, 112), (110, 204), (128, 204)], fill=(0, 0, 0, 130))


def g_tower(d, c1, c2):
    d.polygon([(96, 214), (160, 214), (146, 74), (110, 74)], fill=c2)
    d.rectangle([84, 208, 172, 226], fill=c1)
    d.polygon([(110, 74), (146, 74), (128, 34)], fill=c1)
    for i in range(3):
        d.rectangle([98 + i * 2, 110 + i * 34, 158 - i * 2, 122 + i * 34], fill=(0, 0, 0, 170))


def g_flask(d, c1, c2):
    d.polygon([(106, 40), (150, 40), (150, 104), (194, 206), (62, 206), (106, 104)], fill=c2)
    d.polygon([(112, 118), (144, 118), (176, 192), (80, 192)], fill=c1)
    d.rectangle([100, 30, 156, 48], fill=c1)
    d.ellipse([104, 150, 128, 174], fill=(0, 0, 0, 120))


def g_star(d, c1, c2):
    p = []
    for i in range(10):
        r = 96 if i % 2 == 0 else 42
        a = -math.pi / 2 + i * math.pi / 5
        p.append((128 + math.cos(a) * r, 128 + math.sin(a) * r))
    d.polygon(p, fill=c2)
    p2 = [(128 + (x - 128) * .62, 128 + (y - 128) * .62) for x, y in p]
    d.polygon(p2, fill=c1)


def g_clock(d, c1, c2):
    d.ellipse([46, 46, 210, 210], fill=c2)
    d.ellipse([64, 64, 192, 192], fill=(0, 0, 0, 200))
    d.line([(128, 128), (128, 78)], fill=c1, width=12)
    d.line([(128, 128), (172, 148)], fill=c1, width=10)
    d.ellipse([118, 118, 138, 138], fill=c1)


def g_beam(d, c1, c2):
    d.polygon([(108, 26), (148, 26), (196, 224), (60, 224)], fill=c2)
    d.polygon([(118, 44), (138, 44), (168, 210), (88, 210)], fill=c1)
    d.ellipse([96, 12, 160, 52], fill=c1)


def g_wrench(d, c1, c2):
    """A spanner on the diagonal: open jaw at the top, knurled shaft, ring at
    the foot. The jaw notch is what makes it read as a tool at 32 pixels."""
    d.line([(72, 196), (176, 74)], fill=c2, width=36)
    d.line([(76, 192), (172, 78)], fill=c1, width=16)
    d.ellipse([144, 30, 224, 110], fill=c2)                 # head
    d.ellipse([160, 46, 208, 94], fill=(0, 0, 0, 225))      # bore
    d.polygon([(150, 28), (206, 22), (196, 62), (156, 66)], fill=(0, 0, 0, 235))  # open jaw
    d.ellipse([36, 168, 108, 240], fill=c2)                 # ring end
    d.ellipse([54, 186, 90, 222], fill=(0, 0, 0, 225))
    for i in range(4):                                       # knurling
        t = 0.20 + i * 0.16
        x0, y0 = 72 + (176 - 72) * t, 196 + (74 - 196) * t
        d.line([(x0 - 12, y0 - 10), (x0 + 12, y0 + 10)], fill=(0, 0, 0, 120), width=5)


def g_builder(d, c1, c2):
    d.rounded_rectangle([42, 126, 176, 194], radius=18, fill=c2)
    for x in (72, 148):
        d.ellipse([x-27, 168, x+27, 222], fill=(10, 14, 20, 255), outline=c1, width=8)
    d.line([(116, 138), (146, 76), (194, 48)], fill=c2, width=22)
    d.line([(194, 48), (218, 66)], fill=c1, width=13)
    d.ellipse([101, 123, 137, 159], fill=c1)
    d.ellipse([202, 57, 226, 81], fill=c1)


def g_flamer(d, c1, c2):
    d.rounded_rectangle([38, 132, 178, 196], radius=18, fill=c2)
    for x in (70, 146):
        d.ellipse([x-28, 168, x+28, 224], fill=(8, 12, 18, 255), outline=c1, width=7)
    d.rectangle([108, 98, 196, 142], fill=c2)
    d.polygon([(196, 106), (226, 120), (196, 136)], fill=c1)
    d.polygon([(52, 124), (72, 52), (96, 112), (128, 34), (142, 126)], fill=c1)
    d.polygon([(70, 126), (82, 86), (100, 124), (122, 72), (130, 128)], fill=(255, 236, 178, 255))


def g_beast(d, c1, c2):
    d.ellipse([54, 86, 190, 194], fill=c2)
    d.ellipse([138, 102, 220, 176], fill=c1)
    for x, h in ((82, 52), (112, 32), (142, 48), (170, 70)):
        d.polygon([(x-12, 104), (x, h), (x+12, 104)], fill=c1)
    for y in (126, 158):
        d.line([(66, y), (34, y+42)], fill=c2, width=12)
        d.line([(180, y), (218, y+42)], fill=c2, width=12)
    d.polygon([(204, 126), (238, 106), (216, 142)], fill=c1)
    d.polygon([(204, 156), (238, 176), (216, 140)], fill=c1)


def g_geothermal(d, c1, c2):
    d.rectangle([44, 190, 212, 218], fill=c2)
    d.ellipse([82, 112, 174, 204], fill=c2)
    d.rectangle([104, 62, 152, 160], fill=c1)
    for x in (64, 192):
        d.rectangle([x-14, 122, x+14, 200], fill=c2)
        d.ellipse([x-18, 106, x+18, 140], fill=c1)
    for x, y, r in ((120, 44, 22), (148, 28, 27), (176, 52, 20)):
        d.ellipse([x-r, y-r, x+r, y+r], fill=(210, 244, 255, 150))


def g_gate(d, c1, c2):
    d.rectangle([40, 70, 86, 218], fill=c2)
    d.rectangle([170, 70, 216, 218], fill=c2)
    d.rectangle([40, 54, 216, 92], fill=c1)
    d.rectangle([88, 94, 168, 218], fill=(14, 34, 48, 255), outline=c1, width=7)
    for x in range(98, 168, 16):
        d.line([(x, 102), (x, 210)], fill=c1, width=4)


def g_launcher(d, c1, c2):
    """Tracked artillery silhouette with a raised missile rack."""
    d.rounded_rectangle([38, 154, 196, 204], radius=18, fill=c2)
    for x in (70, 164):
        d.ellipse([x-30, 172, x+30, 232], fill=(8, 12, 18, 255), outline=c1, width=7)
    d.polygon([(78, 154), (112, 98), (190, 98), (210, 138), (182, 154)], fill=c2)
    for y in (62, 92, 122):
        d.rounded_rectangle([96, y-11, 208, y+11], radius=9, fill=c1)
        d.polygon([(208, y-11), (234, y), (208, y+11)], fill=c1)


def g_aircraft(d, c1, c2):
    """Broad-wing strike craft readable at small mobile card sizes."""
    d.polygon([(128, 26), (154, 92), (224, 138), (218, 166),
               (150, 146), (150, 204), (184, 224), (174, 238),
               (128, 218), (82, 238), (72, 224), (106, 204),
               (106, 146), (38, 166), (32, 138), (102, 92)], fill=c2)
    d.polygon([(128, 42), (142, 106), (128, 192), (114, 106)], fill=c1)
    d.ellipse([113, 78, 143, 120], fill=c1)


def g_tank(d, c1, c2):
    """Heavy tracked armor with an oversized forward cannon."""
    d.rounded_rectangle([30, 138, 210, 214], radius=26, fill=c2)
    for x in (62, 102, 142, 182):
        d.ellipse([x-22, 170, x+22, 214], fill=(8, 12, 18, 255), outline=c1, width=6)
    d.rounded_rectangle([70, 92, 178, 164], radius=24, fill=c2)
    d.ellipse([94, 102, 154, 160], fill=c1)
    d.line([(142, 118), (226, 70)], fill=c1, width=18)
    d.ellipse([216, 59, 240, 83], fill=c1)


GLYPH = {
    'shield': g_shield, 'crosshair': g_crosshair, 'dish': g_dish, 'gear': g_gear,
    'recycle': g_recycle, 'atom': g_atom, 'lattice': g_lattice, 'bolt': g_bolt,
    'plate': g_plate, 'chip': g_chip, 'canister': g_canister, 'crystal': g_crystal,
    'tower': g_tower, 'flask': g_flask, 'star': g_star, 'clock': g_clock,
    'beam': g_beam, 'wrench': g_wrench,
    'builder': g_builder, 'flamer': g_flamer, 'beast': g_beast,
    'geothermal': g_geothermal, 'gate': g_gate,
    'launcher': g_launcher, 'aircraft': g_aircraft, 'tank': g_tank,
}

# id -> (glyph, palette)
ITEMS = {
    # materials
    'mat_alloy': ('plate', 'mat'), 'mat_circuit': ('chip', 'mat'),
    'mat_isotope': ('canister', 'xeno'), 'mat_relic': ('crystal', 'xeno'),
    # research
    'res_metallurgy': ('plate', 'fab'), 'res_optics': ('crosshair', 'fab'),
    'res_servos': ('gear', 'fab'), 'res_slot2': ('lattice', 'fab'),
    'res_salvage': ('recycle', 'doc'), 'res_logistics': ('clock', 'doc'),
    'res_refit': ('wrench', 'doc'), 'res_slot3': ('star', 'doc'),
    'res_xeno': ('flask', 'xeno'), 'res_reactor': ('atom', 'xeno'),
    'res_relictech': ('crystal', 'xeno'), 'res_ability': ('bolt', 'xeno'),
    'res_asc_siege_foundry': ('tower', 'danger'),
    'res_syn_quantum_grid': ('lattice', 'xeno'),
    'res_hor_gene_splice': ('beast', 'alien'),
    # modules
    'mod_plate': ('shield', 'mod'), 'mod_optic': ('crosshair', 'mod'),
    'mod_range': ('dish', 'mod'), 'mod_tempo': ('gear', 'mod'),
    'mod_recl': ('recycle', 'mod'), 'mod_core': ('atom', 'mod'),
    'mod_relic': ('lattice', 'xeno'), 'mod_emp': ('bolt', 'xeno'),
    # boosters
    'bst_xp': ('star', 'boost'), 'bst_cores': ('crystal', 'boost'),
    'bst_res': ('canister', 'boost'), 'bst_build': ('gear', 'boost'),
    # store
    'st_cache': ('canister', 'store'), 'st_armor': ('shield', 'store'),
    'st_targeting': ('crosshair', 'store'), 'st_trade': ('recycle', 'store'),
    'st_capacitor': ('bolt', 'store'), 'st_salvage': ('recycle', 'store'),
    'st_droppod': ('canister', 'store'), 'st_reactor': ('atom', 'store'),
    'st_bastion': ('tower', 'store'), 'st_orbital': ('beam', 'store'),
    'st_uplink': ('dish', 'store'), 'st_neural': ('lattice', 'store'),
    # distinct mobile roster/catalog art for models whose legacy atlas keys are shared
    'unit_constructor': ('builder', 'unit'), 'unit_scorcher': ('flamer', 'danger'),
    'unit_alpha': ('beast', 'alien'), 'bld_geo': ('geothermal', 'struct'),
    'bld_gate': ('gate', 'struct'),
    'unit_reaper': ('launcher', 'danger'), 'unit_cinder': ('flamer', 'danger'),
    'unit_lancer': ('beam', 'unit'), 'unit_resonator': ('dish', 'xeno'),
    'unit_warden': ('wrench', 'mod'), 'unit_kestrel': ('aircraft', 'unit'),
    'unit_basilisk': ('tank', 'danger'), 'unit_harbinger': ('launcher', 'xeno'),
    'unit_praetor': ('star', 'danger'), 'unit_archon': ('star', 'mod'),
    'unit_brood': ('beast', 'alien'),
}


def make(gid, pal):
    c1, c2, tint = PAL[pal]
    img = panel(tint)
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay, 'RGBA')
    GLYPH[gid](d, c1 + (255,), c2 + (255,))
    # drop shadow under the glyph so it sits ON the plate
    sh = lay.split()[3].filter(ImageFilter.GaussianBlur(7))
    from PIL import ImageChops
    img = ImageChops.subtract(img, Image.merge('RGB', (sh, sh, sh)).point(lambda v: int(v * .55)))
    img.paste(lay, (0, 0), lay)
    img = glow(img, lay.split()[3], c1, .30, 18)
    # top-edge sheen
    sheen = Image.new('RGB', (S, S), (0, 0, 0))
    ImageDraw.Draw(sheen).ellipse([-40, -150, S + 40, 80], fill=(255, 255, 255))
    sheen = sheen.filter(ImageFilter.GaussianBlur(40))
    img = ImageChops.add(img, sheen.point(lambda v: int(v * .07)))
    return img.resize((128, 128), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for k, (g, p) in ITEMS.items():
        make(g, p).save(os.path.join(OUT, k + '.png'))
    print('wrote %d item icons to %s' % (len(ITEMS), OUT))


if __name__ == '__main__':
    main()
