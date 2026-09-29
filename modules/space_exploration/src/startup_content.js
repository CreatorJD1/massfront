// The exact canonical download engine shares verified chunks and a lifetime-
// bound writer lock with the base document. No game renderer/updater is loaded.
import '../assets/runtime/content/assetpack-runtime.js?v=20260906-release5';

const contentPacks=window.MASSFRONT_ASSET_PACKS;
if(contentPacks){
  const contentStatus=document.createElement('details');
  contentStatus.id='mfGalacticContentStatus';
  contentStatus.className='mf-normal-inline-status';
  contentStatus.dataset.loaderArchetype='normal';
  const summary=document.createElement('summary');
  summary.className='mf-normal-inline-summary';
  const description=document.createElement('p');
  const retry=document.createElement('button');
  retry.textContent='Retry content download';
  retry.className='mf-normal-inline-action';
  retry.addEventListener('click',()=>contentPacks.retryStartup());
  contentStatus.append(summary,description,retry);
  document.body.append(contentStatus);
  let observedControls=[],layoutQueued=false;
  const contentResize=typeof ResizeObserver==='function'?new ResizeObserver(positionContentStatus):null;
  function positionContentStatus(){
    if(contentStatus.hidden)return;
    const controls=[...document.querySelectorAll('.uga-command-nav,.uga-quick-actions,.uga-context-panel,.uga-command-header,.uga-deployment-context')]
      .map(node=>({node,rect:node.getBoundingClientRect()})).filter(row=>row.rect.width&&row.rect.height);
    const nodes=controls.map(row=>row.node);
    if(nodes.length!==observedControls.length||nodes.some((node,index)=>node!==observedControls[index])){
      contentResize?.disconnect();for(const node of nodes)contentResize?.observe(node);observedControls=nodes;
    }
    const width=window.innerWidth,height=window.innerHeight;
    let left=12,right=width-12,top=12,bottom=height-12;
    // Deployment hides the bottom nav, not the inspector. Reserve its actual
    // rectangle: above a portrait sheet, or beside a landscape side panel.
    // Otherwise a paused download's Retry card covers Confirm & Deploy.
    for(const {node,rect} of controls){
      if(node.matches('.uga-command-nav,.uga-quick-actions'))bottom=Math.min(bottom,rect.top-8);
      else if(node.matches('.uga-context-panel')){
        if(rect.width>=width*.6)bottom=Math.min(bottom,rect.top-8);
        else if(rect.left>=width*.33)right=Math.min(right,rect.left-8);
        else if(rect.right<=width*.67)left=Math.max(left,rect.right+8);
        else bottom=Math.min(bottom,rect.top-8);
      }
    }
    for(const {node,rect} of controls){
      if(node.matches('.uga-command-header,.uga-deployment-context')&&rect.left<right&&rect.right>left)top=Math.max(top,rect.bottom+8);
    }
    contentStatus.style.left=`max(${left}px, env(safe-area-inset-left))`;
    contentStatus.style.bottom=`max(${height-bottom}px, env(safe-area-inset-bottom))`;
    contentStatus.style.maxWidth=`${Math.max(1,Math.min(300,right-left))}px`;
    contentStatus.style.maxHeight=`${Math.max(1,bottom-top)}px`;
    contentStatus.style.overflow='auto';
  }
  function queueContentPosition(){
    if(contentStatus.hidden||layoutQueued)return;layoutQueued=true;
    requestAnimationFrame(()=>{layoutQueued=false;positionContentStatus();});
  }
  window.addEventListener('resize',queueContentPosition);
  contentStatus.addEventListener('toggle',queueContentPosition);
  window.visualViewport?.addEventListener('resize',queueContentPosition);
  new MutationObserver(queueContentPosition).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  function renderContentStatus(state){
    contentStatus.hidden=state.state==='idle'||state.state==='ready';
    const mb=n=>(Number(n||0)/1048576).toFixed(1);
    summary.textContent=state.busy?`CONTENT ${state.percent}% · ${mb(state.got)} / ${mb(state.total)} MB`:
      state.state==='waiting'?'CONTENT · continuing in another view':'CONTENT · download paused';
    description.textContent=state.busy?'Verified progress is saved. Your base game is ready to play.':
      (state.error||'Your base game remains playable.');
    retry.hidden=state.busy||state.state==='waiting';
    positionContentStatus();
  }
  window.addEventListener('massfront:assetpack-state',event=>renderContentStatus(event.detail));
  renderContentStatus(contentPacks.snapshot());
  contentPacks.initializeStartup({ui:false});
}
