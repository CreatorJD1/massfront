;
;
/* ============================================================================
   RESEARCH NETWORK — touch-first prerequisite graph
   ----------------------------------------------------------------------------
   develop.js remains the authority for research data, costs, availability and
   effects. This module only takes over the RESEARCH presentation after the
   normal Development renderer has populated materials and tabs. Keeping the
   purchase call routed through devBuy() prevents the visual tree from becoming
   a second, subtly different progression system.

   The old spatial view only ran above 700 px in landscape, which meant the
   game's actual phone orientation silently fell back to the original list.
   This graph is deliberately 2D and scrollable: prerequisite direction stays
   readable under a thumb, cross-branch links are real SVG paths, and every
   node remains at least 52 px tall on a 320 px-wide device.
   ============================================================================ */
(function(){
  if(!document.querySelector('link[href*="restree.css"]')){
    var lk=document.createElement('link');
    lk.rel='stylesheet'; lk.href='./src/styles/restree.css';
    document.head.appendChild(lk);
  }

  var RT_BRANCHES=['FABRICATION','DOCTRINE','XENOLOGY'];
  /* Navigation uses stable public IDs. Node data retains shipped fac keys so
     existing research ownership and prerequisites remain compatible. */
  var RT_FACTIONS=['nova','dominion','syndicate','brood'];
  var RT_QUEUE_SLOTS=5;
  var RT_NODE_W=126,RT_NODE_H=76,RT_COL=154,RT_GAP_Y=94;
  var RT={sel:null,scrollX:0,scrollY:0,branch:'FABRICATION',faction:'nova',inspect:false,focus:null,renderCount:0};

  function rtEsc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function rtNode(id){ return DEVTREE.find(function(n){ return n.id===id; }); }
  function rtFactionNodes(){
    /* Existing account research is Nova's expedition doctrine. New faction
       nodes opt in with `fac`, which keeps old careers intact while making a
       faction tab a real tree rather than a cosmetic recolour. */
    return DEVTREE.filter(function(n){
      var f=(typeof facCanonicalId==='function'&&facCanonicalId(n.fac||'nova'))||(n.fac||'nova');
      return f===RT.faction;
    });
  }
  function rtState(n){
    if(typeof mfFactionTechPurchasable==='function'&&!mfFactionTechPurchasable(n.id)) return 'dossier';
    if(devHas(n.id)) return 'owned';
    if(!devAvail(n)) return 'locked';
    return ((META.researchData||0)>=n.data&&matHas(n.cost))?'ready':'funding';
  }
  function rtDepth(n,memo,stack){
    if(memo[n.id]!=null) return memo[n.id];
    if(stack[n.id]) return 0;
    stack[n.id]=1;
    var d=0;
    n.req.forEach(function(id){ var p=rtNode(id); if(p) d=Math.max(d,rtDepth(p,memo,stack)+1); });
    delete stack[n.id]; memo[n.id]=d; return d;
  }
  function rtLayout(){
    var memo={},rows=[],bands=[],top=18,maxDepth=0;
    RT_BRANCHES.forEach(function(br){
      var nodes=rtFactionNodes().filter(function(n){ return n.br===br; });
      var layers={};
      nodes.forEach(function(n){
        var d=rtDepth(n,memo,{}); maxDepth=Math.max(maxDepth,d);
        (layers[d]||(layers[d]=[])).push(n);
      });
      var stackMax=1;
      Object.keys(layers).forEach(function(d){ stackMax=Math.max(stackMax,layers[d].length); });
      var bandH=Math.max(144,58+stackMax*RT_GAP_Y);
      var center=top+50+(bandH-62)*.5;
      Object.keys(layers).forEach(function(k){
        var d=+k,list=layers[k];
        list.forEach(function(n,i){
          rows.push({n:n,state:rtState(n),depth:d,
            x:84+d*RT_COL,y:center+(i-(list.length-1)*.5)*RT_GAP_Y});
        });
      });
      bands.push({br:br,top:top,height:bandH});
      top+=bandH+14;
    });
    return {nodes:rows,bands:bands,width:188+maxDepth*RT_COL,height:top+8};
  }

  function rtQueue(save){
    var before=Array.isArray(META.resQueue)?META.resQueue.slice():[];
    var seen={};
    var clean=before.filter(function(id){
      if(seen[id]||!rtNode(id)||devHas(id)||
         (typeof mfFactionTechPurchasable==='function'&&!mfFactionTechPurchasable(id))) return false;
      seen[id]=1; return true;
    }).slice(0,RT_QUEUE_SLOTS);
    META.resQueue=clean;
    if(save&&before.join('|')!==clean.join('|')&&typeof metaSave==='function') metaSave();
    return clean;
  }
  function rtQueuePath(id){
    var out=[],seen={};
    function walk(n){
      if(!n||seen[n.id]||devHas(n.id)) return;
      seen[n.id]=1;
      n.req.forEach(function(r){ walk(rtNode(r)); });
      out.push(n.id);
    }
    walk(rtNode(id)); return out;
  }
  function rtQueueAdd(id,path){
    var n=rtNode(id); if(!n||devHas(id)) return;
    if(typeof mfFactionTechPurchasable==='function'&&!mfFactionTechPurchasable(id)){
      if(typeof toast==='function') toast('AI DOSSIER — reserved until Brood becomes playable');
      return;
    }
    var q=rtQueue(false).slice();
    var add=path?rtQueuePath(id):[id];
    add.forEach(function(x){ if(q.indexOf(x)<0&&q.length<RT_QUEUE_SLOTS) q.push(x); });
    META.resQueue=q;
    if(typeof metaSave==='function') metaSave();
    if(add.some(function(x){ return q.indexOf(x)<0; })&&typeof toast==='function')
      toast('Research queue is full — '+RT_QUEUE_SLOTS+' priorities maximum');
    if(typeof sfx==='function') sfx('ui');
    buildTree();
  }
  function rtQueueRemove(at){
    var q=rtQueue(false); if(at<0||at>=q.length) return;
    q.splice(at,1); META.resQueue=q;
    if(typeof metaSave==='function') metaSave();
    if(typeof sfx==='function') sfx('ui');
    buildTree();
  }
  function rtBuy(n){
    if(!n) return;
    var had=devHas(n.id);
    devBuy(n);
    if(!had&&devHas(n.id)){
      META.resQueue=rtQueue(false).filter(function(id){ return id!==n.id; });
      if(typeof metaSave==='function') metaSave();
      /* devBuy redraws before control returns to us. Redraw once more after
         queue cleanup so the first slot cannot keep showing a purchased node. */
      buildTree();
    }
  }

  function rtCostHtml(n){
    var b=matBag();
    var h='<div class="rt3d-costGrid">';
    Object.keys(n.cost).forEach(function(k){
      var have=Math.floor(b[k]||0),need=n.cost[k],ok=have>=need;
      h+='<div class="rt3d-cost '+(ok?'ok':'need')+'">'
        +itemArt('mat_'+k,MATS[k].em,18)+'<span>'+rtEsc(MATS[k].nm)+'</span>'
        +'<b>'+have+' / '+need+'</b></div>';
    });
    var dh=Math.floor(META.researchData||0),dok=dh>=n.data;
    h+='<div class="rt3d-cost data '+(dok?'ok':'need')+'"><i>◆</i><span>Research Data</span>'
      +'<b>'+dh+' / '+n.data+'</b></div></div>';
    return h;
  }
  function rtDetailHtml(){
    var n=RT.sel&&rtNode(RT.sel);
    if(!n){
      return '<section class="rt3d-detail empty" id="rtDetail" data-test="research-detail">'
        +'<div class="rt3d-emptyIcon">⌬</div><div><b>SELECT A RESEARCH NODE</b>'
        +'<span>Inspect its unlock, resource cost, and prerequisite path.</span></div></section>';
    }
    var st=rtState(n),q=rtQueue(false),queued=q.indexOf(n.id)>=0;
    var missing=n.req.filter(function(id){ return !devHas(id); });
    var stateText={owned:'RESEARCHED',ready:'READY TO RESEARCH',funding:'RESOURCES REQUIRED',locked:'PREREQUISITES LOCKED',dossier:'AI DOSSIER · FUTURE PLAYER TECH'}[st];
    var h='<section class="rt3d-detail '+st+(RT.inspect?' rt3d-inspector':'')+'" id="rtDetail" data-test="research-detail" data-node="'+rtEsc(n.id)+'">'
      +'<button class="rt3d-detailClose" id="rtDetailClose" type="button" aria-label="Close research details">×</button>'
      +'<header><div class="rt3d-detailArt">'+itemArt(n.art||'res_'+n.id,'⌬',46)+'</div>'
      +'<div><small>'+rtEsc(n.br)+' · TIER '+(rtDepth(n,{},{} )+1)+'</small><b>'+rtEsc(n.nm)+'</b>'
      +'<span>'+rtEsc(n.ds)+'</span></div><em>'+stateText+'</em></header>';
    if(n.req.length){
      h+='<div class="rt3d-detailLabel">PREREQUISITES</div><div class="rt3d-prereqs">'
        +n.req.map(function(id){
          var p=rtNode(id),ok=devHas(id);
          return '<button type="button" data-prereq="'+rtEsc(id)+'" class="'+(ok?'ok':'locked')+'">'
            +(ok?'✓ ':'🔒 ')+rtEsc(p?p.nm:id)+'</button>';
        }).join('')+'</div>';
    }
    if(st!=='dossier') h+='<div class="rt3d-detailLabel">RESEARCH COST</div>'+rtCostHtml(n);
    h+='<div class="rt3d-detailActions">';
    if(st==='owned'){
      h+='<button class="rt3d-primary done" type="button" disabled>✓ RESEARCH COMPLETE</button>';
    }else if(st==='dossier'){
      h+='<button class="rt3d-primary locked" type="button" disabled>AI DOSSIER · PLAYER TECH RESERVED</button>';
    }else if(st==='ready'){
      h+='<button class="rt3d-primary" id="rtResearchNow" type="button">RESEARCH NOW</button>';
    }else{
      h+='<button class="rt3d-primary locked" type="button" disabled>'
        +(st==='locked'?'COMPLETE '+missing.length+' PREREQUISITE'+(missing.length===1?'':'S'):'GATHER REQUIRED RESOURCES')+'</button>';
    }
    if(st!=='owned'&&st!=='dossier'){
      h+='<button class="rt3d-secondary" id="rtQueueToggle" type="button">'
        +(queued?'REMOVE FROM QUEUE':'ADD TO QUEUE')+'</button>';
      if(st==='locked') h+='<button class="rt3d-secondary path" id="rtQueuePath" type="button">QUEUE PREREQUISITE PATH</button>';
    }
    return h+'</div></section>';
  }

  function rtQueueHtml(){
    var q=rtQueue(true),next=q.length?rtNode(q[0]):null;
    var h='<section class="rt3d-queue" data-test="research-queue"><header><div><b>RESEARCH QUEUE</b>'
      +'<span>Plan the next unlocks without spending resources</span></div><strong>'+q.length+'/'+RT_QUEUE_SLOTS+'</strong></header>'
      +'<div class="rt3d-qslots">';
    for(var i=0;i<RT_QUEUE_SLOTS;i++){
      var n=i<q.length?rtNode(q[i]):null;
      if(n){
        h+='<div class="rt3d-qslot filled '+rtState(n)+'" data-queue-slot="'+i+'">'
          +'<button class="rt3d-qinspect" type="button" data-qid="'+rtEsc(n.id)+'" aria-label="Inspect '+rtEsc(n.nm)+'">'
          +'<small>'+(i+1)+'</small>'+itemArt(n.art||'res_'+n.id,'⌬',24)+'<span>'+rtEsc(n.nm)+'</span></button>'
          +'<button class="rt3d-qremove" type="button" data-qremove="'+i+'" aria-label="Remove '+rtEsc(n.nm)+' from queue">×</button></div>';
      }else{
        h+='<div class="rt3d-qslot empty" data-queue-slot="'+i+'"><small>'+(i+1)+'</small><span>EMPTY</span></div>';
      }
    }
    h+='</div>';
    if(next){
      var st=rtState(next);
      h+='<button class="rt3d-next '+(st==='ready'?'ready':'')+'" id="rtResearchNext" type="button" '
        +(st==='ready'?'':'disabled')+'>'+(st==='ready'?'RESEARCH NEXT · '+rtEsc(next.nm):'NEXT · '+rtEsc(next.nm)+' · '+(st==='locked'?'LOCKED':'NEEDS RESOURCES'))+'</button>';
    }
    return h+'</section>';
  }

  function rtGraphHtml(layout){
    var tree=rtFactionNodes();
    var done=tree.filter(function(n){ return devHas(n.id); }).length;
    var ready=tree.filter(function(n){ return rtState(n)==='ready'; }).length;
    var faction=typeof facArt==='function'?facArt(RT.faction):null;
    var h='<div class="rt3d-summary"><div><small>RESEARCH NETWORK</small><b>'+done+' / '+tree.length+' NODES</b></div>'
      +'<div class="rt3d-summaryStats"><span><i class="ready"></i>'+ready+' READY</span><span>◆ '+Math.floor(META.researchData||0)+' DATA</span>'
      +'<button type="button" class="rt3d-focusReady" id="rtFocusReady" aria-label="Focus the next ready research node">FOCUS READY</button></div></div>'
      +rtQueueHtml()
      +'<nav class="rt3d-factionNav" aria-label="Faction research trees">'
      +RT_FACTIONS.map(function(f){
        var a=typeof facArt==='function'?facArt(f):null;
        return '<button type="button" data-rtfaction="'+f+'" class="'+(RT.faction===f?'on':'')+'" aria-label="'+rtEsc(a?a.nm:f)+' research tree">'
          +(a&&typeof facIcon==='function'?facIcon(f,24,'rt3d-facIcon'):'<span>FACTION</span>')+'<b>'+rtEsc(a?a.nm:f)+'</b></button>';
      }).join('')+'</nav>'
      +'<div class="rt3d-factionCaption">'+rtEsc(RT.faction==='brood'?'AI OPPONENT DOSSIER — evolution research is reserved until the Brood becomes playable':
        (faction?faction.motto:'FACTION DOCTRINE')+' — '+(faction?faction.bonus:'Dedicated faction research'))+'</div>'
      /* No branch sub-tabs. Every branch of this faction is laid out together in
         one canvas below, and the player drags around it freely. */
       +'<div class="rt3d-navHint"><span>✥</span> Drag to explore the whole tree · tap a node to inspect</div>';
    if(RT.inspect&&RT.sel) return h+rtDetailHtml();
    h+='<div class="rt3d-stage" id="rtStage" data-test="research-graph" tabindex="0" aria-label="Scrollable research prerequisite graph">'
      +'<div class="rt3d-world" id="rtWorld" style="width:'+layout.width+'px;height:'+layout.height+'px">';
    layout.bands.forEach(function(b){
      h+='<div class="rt3d-band '+b.br.toLowerCase()+'" data-band="'+b.br+'" style="top:'+b.top+'px;height:'+b.height+'px">'
        +'<span>'+({FABRICATION:'⚙ FABRICATION',DOCTRINE:'⌖ DOCTRINE',XENOLOGY:'◈ XENOLOGY'}[b.br])+'</span></div>';
    });
    h+='<svg class="rt3d-links" width="'+layout.width+'" height="'+layout.height+'" viewBox="0 0 '+layout.width+' '+layout.height+'" aria-hidden="true">';
    layout.nodes.forEach(function(row){
      row.n.req.forEach(function(rid){
        var pr=layout.nodes.find(function(x){ return x.n.id===rid; }); if(!pr) return;
        var x1=pr.x+RT_NODE_W*.5,y1=pr.y,x2=row.x-RT_NODE_W*.5,y2=row.y;
        var bend=Math.max(28,(x2-x1)*.48);
        var cls=(devHas(row.n.id)?'owned':devHas(rid)?'open':'locked')
          +(RT.sel===rid||RT.sel===row.n.id?' focus':'');
        h+='<path data-from="'+rtEsc(rid)+'" data-to="'+rtEsc(row.n.id)+'" class="'+cls+'" d="M '+x1+' '+y1+' C '+(x1+bend)+' '+y1+', '+(x2-bend)+' '+y2+', '+x2+' '+y2+'"></path>';
      });
    });
    h+='</svg>';
    layout.nodes.forEach(function(row){
      var n=row.n,st=row.state,missing=n.req.filter(function(id){ return !devHas(id); });
      var sub=st==='owned'?'RESEARCHED':st==='ready'?'READY':st==='funding'?'NEEDS RESOURCES':st==='dossier'?'AI DOSSIER':'NEEDS '+missing.length;
      h+='<button type="button" class="rt3d-node '+st+(RT.sel===n.id?' selected':'')+'" data-research-id="'+rtEsc(n.id)+'" '
        +'data-state="'+st+'" data-prerequisites="'+rtEsc(n.req.join(','))+'" '
        +'style="left:'+(row.x-RT_NODE_W*.5)+'px;top:'+(row.y-RT_NODE_H*.5)+'px" aria-label="'+rtEsc(n.nm)+', '+sub+'">'
        +'<span class="rt3d-tier">T'+(row.depth+1)+'</span><span class="rt3d-nodeArt">'+itemArt(n.art||'res_'+n.id,'⌬',30)+'</span>'
        +'<b>'+rtEsc(n.nm)+'</b><small>'+sub+'</small></button>';
    });
    return h+'</div></div>'+rtDetailHtml();
  }

  function rtWire(){
    var stage=document.getElementById('rtStage');
    if(stage){
      requestAnimationFrame(function(){
        if(RT.focus){
          var target=stage.querySelector('[data-research-id="'+RT.focus+'"]');
          if(target){
            stage.scrollLeft=Math.max(0,target.offsetLeft+target.offsetWidth*.5-stage.clientWidth*.5);
            stage.scrollTop=Math.max(0,target.offsetTop+target.offsetHeight*.5-stage.clientHeight*.5);
            RT.scrollX=stage.scrollLeft; RT.scrollY=stage.scrollTop;
          }
          RT.focus=null;
        }else{ stage.scrollLeft=RT.scrollX; stage.scrollTop=RT.scrollY; }
      });
      stage.addEventListener('scroll',function(){ RT.scrollX=stage.scrollLeft; RT.scrollY=stage.scrollTop; },{passive:true});
    }
    document.querySelectorAll('[data-research-id]').forEach(function(el){
      if(typeof mfBindTap==='function') mfBindTap(el,function(ev){ ev.stopPropagation(); rtSelect(el.dataset.researchId,true); });
      else el.addEventListener('click',function(){ rtSelect(el.dataset.researchId,true); });
    });
    var focusReady=document.getElementById('rtFocusReady');
    if(focusReady) focusReady.addEventListener('click',function(){
      var ready=rtFactionNodes().find(function(n){ return rtState(n)==='ready'; });
      if(!ready){ if(typeof toast==='function') toast('No research node is ready yet'); return; }
      RT.sel=ready.id; RT.inspect=false; RT.focus=ready.id; buildTree();
    });
    /* The branch sub-tabs are gone: the whole faction tree is one canvas you
       drag around. Touch already pans natively (overflow:auto + touch-action),
       so only add grab-drag for mouse/stylus — guarded so it never fights native
       touch scroll or swallows a node/queue tap. */
    if(stage){
      var pan={on:false,px:0,py:0,sx:0,sy:0};
      stage.addEventListener('pointerdown',function(e){
        if(e.pointerType==='touch') return;
        if(e.target.closest('button')) return;
        pan.on=true; pan.px=e.clientX; pan.py=e.clientY; pan.sx=stage.scrollLeft; pan.sy=stage.scrollTop;
        stage.classList.add('grabbing');
      });
      stage.addEventListener('pointermove',function(e){
        if(!pan.on) return;
        stage.scrollLeft=pan.sx-(e.clientX-pan.px);
        stage.scrollTop =pan.sy-(e.clientY-pan.py);
        RT.scrollX=stage.scrollLeft; RT.scrollY=stage.scrollTop;
      });
      var endPan=function(){ if(pan.on){ pan.on=false; stage.classList.remove('grabbing'); } };
      stage.addEventListener('pointerup',endPan);
      stage.addEventListener('pointerleave',endPan);
      stage.addEventListener('pointercancel',endPan);
    }
    document.querySelectorAll('[data-rtfaction]').forEach(function(el){
      var choose=function(){
        RT.faction=el.dataset.rtfaction; RT.branch='FABRICATION';
        RT.sel=null; RT.inspect=false; RT.focus=null; RT.scrollX=0; RT.scrollY=0;
        buildTree(); if(typeof sfx==='function') sfx('ui');
      };
      if(typeof mfBindTap==='function') mfBindTap(el,choose); else el.addEventListener('click',choose);
    });
    rtWireDetail();
    document.querySelectorAll('[data-qid]').forEach(function(el){ el.addEventListener('click',function(){ rtSelect(el.dataset.qid,true); }); });
    document.querySelectorAll('[data-qremove]').forEach(function(el){ el.addEventListener('click',function(ev){ ev.stopPropagation(); rtQueueRemove(+el.dataset.qremove); }); });
    var next=document.getElementById('rtResearchNext');
    if(next) next.addEventListener('click',function(){ var q=rtQueue(false),n=q.length&&rtNode(q[0]); if(n) rtBuy(n); });
  }
  function rtWireDetail(){
    var close=document.getElementById('rtDetailClose');
    if(close){
      if(RT.inspect) close.setAttribute('aria-label','Back to research network');
      close.addEventListener('click',function(){
        if(RT.inspect){ RT.inspect=false; RT.focus=RT.sel; }
        else RT.sel=null;
        buildTree();
      });
    }
    document.querySelectorAll('[data-prereq]').forEach(function(el){ el.addEventListener('click',function(){ rtSelect(el.dataset.prereq,true); }); });
    var buy=document.getElementById('rtResearchNow');
    if(buy) buy.addEventListener('click',function(){ rtBuy(rtNode(RT.sel)); });
    var toggle=document.getElementById('rtQueueToggle');
    if(toggle) toggle.addEventListener('click',function(){
      var q=rtQueue(false),at=q.indexOf(RT.sel);
      if(at>=0) rtQueueRemove(at); else rtQueueAdd(RT.sel,false);
    });
    var path=document.getElementById('rtQueuePath');
    if(path) path.addEventListener('click',function(){ rtQueueAdd(RT.sel,true); });
  }
  function rtSelect(id,inspect){
    if(!rtNode(id)) return;
    RT.sel=id; RT.inspect=inspect!==false;
    if(RT.inspect){ buildTree(); if(typeof sfx==='function') sfx('ui'); return; }
    document.querySelectorAll('[data-research-id]').forEach(function(el){ el.classList.toggle('selected',el.dataset.researchId===id); });
    document.querySelectorAll('.rt3d-links path').forEach(function(p){ p.classList.toggle('focus',p.dataset.from===id||p.dataset.to===id); });
    var detail=document.getElementById('rtDetail');
    if(detail){ detail.outerHTML=rtDetailHtml(); rtWireDetail(); }
    if(typeof sfx==='function') sfx('ui');
  }

  function buildTree(){
    var body=document.getElementById('devBody'); if(!body) return;
    var layout=rtLayout();
    if(RT.sel&&!rtNode(RT.sel)) RT.sel=null;
    body.innerHTML='<div class="rt3d-wrap" data-test="research-tree">'+rtGraphHtml(layout)+'</div>';
    RT.renderCount++;
    rtWire();
  }

  function rtSnapshot(){
    var layout=rtLayout(),edges=0;
    DEVTREE.forEach(function(n){ edges+=n.req.length; });
    return {
      version:'2.0',nodeCount:DEVTREE.length,edgeCount:edges,
      renderedNodes:document.querySelectorAll('[data-research-id]').length,
      renderedEdges:document.querySelectorAll('.rt3d-links path').length,
      branches:RT_BRANCHES.slice(),queueSlots:RT_QUEUE_SLOTS,queue:rtQueue(false).slice(),
      selected:RT.sel,faction:RT.faction,inspecting:RT.inspect,renderCount:RT.renderCount,width:layout.width,height:layout.height,
      states:DEVTREE.reduce(function(o,n){ o[n.id]=rtState(n); return o; },{})
    };
  }

  function initResTree3D(){
    if(typeof renderDevelop!=='function'||typeof DEVTREE==='undefined') return;
    var flatRender=renderDevelop;
    renderDevelop=function(){
      flatRender();
      if(typeof devTab!=='undefined'&&devTab==='research') buildTree();
    };
    window.__MF_RESEARCH_TREE__={
      version:'2.0',build:buildTree,snapshot:rtSnapshot,select:rtSelect,
      queueAdd:function(id){ rtQueueAdd(id,false); },queuePath:function(id){ rtQueueAdd(id,true); },
      queueRemove:rtQueueRemove,clearQueue:function(){ META.resQueue=[]; if(typeof metaSave==='function') metaSave(); buildTree(); },
      layout:function(){ return rtLayout(); }
    };
  }

  window.initResTree3D=initResTree3D;
})();

