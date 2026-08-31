const MF_UI_DESTRUCTIVE_IDS=new Set(['quitBtn']);
const MF_UI_DISRUPTIVE_IDS=new Set(['setupStart']);
const MF_UI_EXISTING_CONFIRM=new Set(['quitBtn']);
const MF_UI_CONFIRM_COPY={};
if(el!==mfUiLastTarget&&now-mfUiLastAt<180){ev.stopImmediatePropagation();}
if(Math.hypot(ev.clientX-g.x,ev.clientY-g.y)>10)g.moved=true;
if(now-mfUiPanelDismissedAt<220)ev.stopImmediatePropagation();
if(up!==down)ev.stopImmediatePropagation();
