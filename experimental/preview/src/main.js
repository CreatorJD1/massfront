import { createCamera, createPadWorld, bindRtsPointer, FACTION_POP_CAP, novaPop, nightAmt } from './mf-engine.js';
import { createBabylonBackend } from './babylon-backend.js';

const canvas=document.getElementById('view');
const chrome=document.getElementById('chrome');

const world=createPadWorld();
const cam=createCamera();
bindRtsPointer(canvas, cam, world);

const gfx=createBabylonBackend(canvas, world, cam);

function dayLabel(dayT){
  const n=nightAmt(dayT);
  if(n<0.12) return 'NOON';
  if(n<0.45) return 'DUSK';
  if(n<0.78) return 'NIGHT';
  return 'DAWN';
}

chrome.innerHTML=`
  <header>
    <div class="kicker">EXPERIMENTAL / PREVIEW · BABYLON.JS · NOT THE SHIP PATH</div>
    <h1>MASSFRONT COMMAND PAD</h1>
    <div class="sub">Ortho tilt cam · PBR sun · cascaded shadows · production remains WebGL2</div>
    <div class="res" id="resBar">
      <span>⛏ <b id="rMass">842</b></span>
      <span>⚡ <b id="rEn">3610</b></span>
      <span>◆ <b id="rPop">14</b> / ${FACTION_POP_CAP}</span>
    </div>
    <div class="sides">
      <span class="tag nova">NOVA · YOU</span>
      <span class="tag dom">LEGION · AI</span>
    </div>
  </header>
  <div class="dock panel">
    <label>DAY CYCLE <b id="dayName">NOON</b></label>
    <input id="day" type="range" min="0" max="1000" value="80">
    <div class="row">
      <button type="button" id="auto">AUTO CYCLE</button>
      <button type="button" id="noon">NOON</button>
      <button type="button" id="night">NIGHT</button>
    </div>
    <div class="hint">Drag pan · pinch/wheel zoom · shift-drag or two-finger twist to yaw. Rim is FAR-clamped. Tap a Nova unit to select.</div>
  </div>
`;

const dayEl=document.getElementById('day');
const autoEl=document.getElementById('auto');
const dayName=document.getElementById('dayName');

function setDay(v){
  gfx.setDayT(v);
  dayEl.value=String(Math.round(v*1000)%1000);
  dayName.textContent=dayLabel(v);
}

dayEl.addEventListener('input', ()=>{
  gfx.setAutoDay(false); autoEl.classList.remove('on');
  setDay((+dayEl.value)/1000);
});
autoEl.addEventListener('click', ()=>{
  const on=!gfx.getAutoDay();
  gfx.setAutoDay(on);
  autoEl.classList.toggle('on', on);
});
document.getElementById('noon').addEventListener('click', ()=>{
  gfx.setAutoDay(false); autoEl.classList.remove('on'); setDay(0.08);
});
document.getElementById('night').addEventListener('click', ()=>{
  gfx.setAutoDay(false); autoEl.classList.remove('on'); setDay(0.5);
});

const rMass=document.getElementById('rMass');
const rEn=document.getElementById('rEn');
const rPop=document.getElementById('rPop');
function hudTick(){
  rMass.textContent=String(world.hud.mass|0);
  rEn.textContent=String(world.hud.energy|0);
  rPop.textContent=String(novaPop(world));
  dayName.textContent=dayLabel(gfx.getDayT());
  if(gfx.getAutoDay()) dayEl.value=String(Math.round(gfx.getDayT()*1000)%1000);
  requestAnimationFrame(hudTick);
}
hudTick();
