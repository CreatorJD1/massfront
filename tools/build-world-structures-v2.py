"""Pack the five live map structures into one battle-scale Material V2 atlas.

The source rebuilds already own unique 2048 PBR maps and authored UV0. Shipping
fifteen 2048 textures would cost more GPU memory than the rest of a busy map,
so this tool downsamples each asset into a padded 320px tile in three shared
1024 atlases. At the game's closest legal battle zoom a structure is about
20-100 pixels tall; 320px preserves useful facade/roof detail without spending
showcase memory on scenery repeated hundreds of times.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps, ImageStat
import json

ROOT=Path(__file__).resolve().parents[1]
WORLD=ROOT/'source-media'/'world-asset-rebuilds'
OUT=ROOT/'assets'/'textures'/'materials'
OUT.mkdir(parents=True,exist_ok=True)
ATLAS=1024
CELL=320
PAD=8
ORIGINS=[(16,16),(352,16),(688,16),(16,352),(352,352)]
ASSETS=[
  ('mdlCityTower','civilian','CityTower'),
  ('mdlCityDome','civilian','CityDome'),
  ('mdlCityHall','military','CityHall'),
  ('mdlCityTank','military','CityTank'),
  ('mdlCivicBlock','civilian','CivicBlock'),
]
MICRO=Image.open(OUT/'mf_mechanical_microdetail_v2.webp').convert('L')

def asset_dir(model):
  roots=[p for p in WORLD.iterdir() if p.is_dir() and p.name!='engine-json']
  for base in roots:
    for p in base.iterdir():
      if p.is_dir() and model.lower() in p.name.lower(): return p
  raise FileNotFoundError(model)

def tex(folder,model,suffix):
  hits=list(folder.rglob(f'T_MASSFRONT_{model}_{suffix}.png'))
  if len(hits)!=1: raise RuntimeError(f'{model} {suffix}: expected one map, got {len(hits)}')
  return Image.open(hits[0]).convert('RGBA')

def tile(im):
  inner=CELL-PAD*2
  # Pillow filters RGBA through premultiplied alpha. NRE stores emissive in A,
  # so an asset with no emissive has A=0; resizing the packed image therefore
  # erased its perfectly valid normal/roughness RGB to black. Resize data-map
  # channels independently because these channels are data, not layered colour.
  if im.mode=='RGBA':
    im=Image.merge('RGBA',tuple(ch.resize((inner,inner),Image.Resampling.LANCZOS) for ch in im.split()))
  else: im=im.resize((inner,inner),Image.Resampling.LANCZOS)
  out=Image.new('RGBA',(CELL,CELL))
  out.paste(im,(PAD,PAD))
  # Dilation prevents mip/bilinear taps at UV-island borders sampling empty atlas.
  out.paste(im.crop((0,0,inner,1)).resize((inner,PAD)),(PAD,0))
  out.paste(im.crop((0,inner-1,inner,inner)).resize((inner,PAD)),(PAD,PAD+inner))
  out.paste(im.crop((0,0,1,inner)).resize((PAD,inner)),(0,PAD))
  out.paste(im.crop((inner-1,0,inner,inner)).resize((PAD,inner)),(PAD+inner,PAD))
  for box,pos in [((0,0,1,1),(0,0)),((inner-1,0,inner,1),(PAD+inner,0)),
                  ((0,inner-1,1,inner),(0,PAD+inner)),
                  ((inner-1,inner-1,inner,inner),(PAD+inner,PAD+inner))]:
    out.paste(im.crop(box).resize((PAD,PAD)),pos)
  return out

def channel(im,n): return im.getchannel(n)
def max_emissive(im):
  r,g,b=im.split()[:3]
  # max(R,G,B), preserving coloured sources as a scalar intensity mask.
  return Image.merge('RGB',(r,g,b)).convert('L')

def repeat_detail(size,phase):
  """Repeat the approved low-contrast V2 micro tile without unique textures."""
  side=256
  src=MICRO.resize((side,side),Image.Resampling.LANCZOS)
  if phase&1: src=ImageOps.mirror(src)
  if phase&2: src=ImageOps.flip(src)
  out=Image.new('L',size,128)
  for y in range(-side,size[1]+side,side):
    for x in range(-side,size[0]+side,side): out.paste(src,(x+(phase*47)%side-side,y+(phase*83)%side-side))
  return out

def fallback_surface_maps(base,normal,orm,ao,family,phase):
  """Repair incomplete source bakes while preserving valid authored channels.

  Four legacy rebuild folders contain all-black Normal/ORM images. Packing
  those bytes verbatim made the new shader look flat and polished no matter
  how correct its lighting was. The fallback is baked here, not improvised per
  fragment: panel value changes supply broad relief and the established V2
  micro tile supplies restrained brushed/grunge response.
  """
  micro=repeat_detail(base.size,phase)
  height=Image.blend(ImageOps.grayscale(base).filter(ImageFilter.GaussianBlur(.52)),micro,.34)
  left=ImageChops.offset(height,-1,0);right=ImageChops.offset(height,1,0)
  up=ImageChops.offset(height,0,-1);down=ImageChops.offset(height,0,1)
  gx=ImageChops.subtract(left,right,2.18,128);gy=ImageChops.subtract(up,down,2.18,128)
  nm=ImageStat.Stat(normal)
  valid_normal=(nm.mean[0]+nm.mean[1])>48
  nr=channel(normal,'R') if valid_normal else gx
  ng=channel(normal,'G') if valid_normal else gy
  if valid_normal:
    nr=Image.blend(nr,gx,.34);ng=Image.blend(ng,gy,.34)
  detail=ImageEnhance.Contrast(micro).enhance(2.2)
  generated_rough=Image.blend(Image.new('L',base.size,184 if family=='civilian' else 162),detail,.27)
  generated_rough=Image.blend(generated_rough,ImageOps.invert(channel(ao,'R')),0.06)
  source_rough=channel(orm,'G');rough_mean=ImageStat.Stat(source_rough).mean[0]
  rough=Image.blend(source_rough,generated_rough,.34) if rough_mean>20 else generated_rough
  source_metal=channel(orm,'B');metal_mean=ImageStat.Stat(source_metal).mean[0]
  metal=source_metal if metal_mean>2 else Image.new('L',base.size,14 if family=='civilian' else 118)
  return nr,ng,rough,metal

baseao=Image.new('RGBA',(ATLAS,ATLAS),(36,38,40,255))
nre=Image.new('RGBA',(ATLAS,ATLAS),(128,128,225,0))
masks=Image.new('RGBA',(ATLAS,ATLAS),(0,0,0,0))
meta={}
for phase,((model,family,label),(ox,oy)) in enumerate(zip(ASSETS,ORIGINS)):
  folder=asset_dir(model)
  base=tex(folder,model,'BaseColor')
  normal=tex(folder,model,'Normal')
  orm=tex(folder,model,'ORM')
  ao=tex(folder,model,'AO')
  emis=tex(folder,model,'Emissive')
  # Concrete/civic surfaces remain lighter; military plant gets colder steel.
  base=ImageEnhance.Contrast(base).enhance(1.14 if family=='civilian' else 1.20)
  base=ImageEnhance.Color(base).enhance(.72 if family=='civilian' else .60)
  # Map structures sit inside darker terrain and receive less fill than a
  # showcase turntable. Grade their midtone down before packing, then recover
  # only authored panel edges. This removes the bright plastic cut-out while
  # preserving exactly the high-frequency structure the phone camera needs.
  base=ImageEnhance.Brightness(base).enhance(.86 if family=='civilian' else .80)
  rgb=base.convert('RGB');lum=ImageOps.grayscale(rgb)
  wear=lum.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(.30))
  wear=ImageEnhance.Contrast(wear).enhance(2.5).point(lambda v:max(0,min(255,int((v-16)*.82))))
  steel=Image.new('RGB',rgb.size,(126,137,143) if family=='civilian' else (119,129,137))
  rgb=Image.composite(Image.blend(rgb,steel,.56),rgb,wear)
  # Restore the broad low-amplitude brushed/aged response that is lost when a
  # 2048 bake becomes a 304px battle tile. This remains surface-scale noise;
  # panels, seams and signage still come only from authored maps.
  micro=repeat_detail(rgb.size,phase)
  micro_grade=ImageEnhance.Contrast(micro).enhance(1.65).point(lambda v:max(224,min(255,240+int((v-128)*.11))))
  rgb=ImageChops.multiply(rgb,Image.merge('RGB',(micro_grade,micro_grade,micro_grade)))
  # Several legacy rebuilds carry near-white AO. Derive only missing concave
  # information from local value valleys, then multiply it with authored AO.
  # It puts vents, panel gaps and window recesses back into the lighting while
  # never inventing a large shadow or changing the asset silhouette.
  local=lum.filter(ImageFilter.GaussianBlur(4.0))
  valley=ImageChops.subtract(local,lum,1.0,0)
  derived_ao=valley.point(lambda v:max(62,255-min(193,int(v*2.35))))
  packed_ao=ImageChops.multiply(channel(ao,'R'),derived_ao)
  cavity=ImageOps.invert(packed_ao).filter(ImageFilter.GaussianBlur(.48)).point(lambda v:int(v*.43))
  rgb=Image.composite(ImageEnhance.Brightness(rgb).enhance(.64),rgb,cavity)
  base=Image.merge('RGBA',(*rgb.split(),base.getchannel('A')))
  ba=Image.merge('RGBA',(*base.split()[:3],packed_ao))
  # Existing rebuild convention is glTF ORM: R AO, G roughness, B metallic.
  nx,ny,rough,metal=fallback_surface_maps(base,normal,orm,ao,family,phase)
  nr=Image.merge('RGBA',(nx,ny,rough,max_emissive(emis)))
  # B is family identity (civilian=.22, military=.78). A is restrained baked
  # grime/wear from inverse AO, used only to modulate edges/cavities in shader.
  inv=Image.eval(packed_ao,lambda v:255-v).filter(ImageFilter.GaussianBlur(1.2))
  fam=Image.new('L',base.size,56 if family=='civilian' else 200)
  empty=Image.new('L',base.size,0)
  mk=Image.merge('RGBA',(metal,empty,fam,inv))
  for atlas,im in ((baseao,ba),(nre,nr),(masks,mk)): atlas.paste(tile(im),(ox,oy))
  inner=CELL-PAD*2
  meta[model]={
    'label':label,'family':family,
    'rect':[(ox+PAD)/ATLAS,(oy+PAD)/ATLAS,inner/ATLAS,inner/ATLAS]
  }

baseao.save(OUT/'mf-world-structures-v2-baseao.png',optimize=True)
nre.save(OUT/'mf-world-structures-v2-nre.png',optimize=True)
masks.save(OUT/'mf-world-structures-v2-masks.png',optimize=True)
(OUT/'mf-world-structures-v2.json').write_text(json.dumps({
  'version':2,'atlas':ATLAS,'tile':CELL,'padding':PAD,'assets':meta
},indent=2),encoding='utf-8')
print('packed',len(ASSETS),'individual structures into',ATLAS,'atlas')
