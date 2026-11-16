(() => {
  'use strict';
  const canvas = document.getElementById('battlefield'), ctx = canvas.getContext('2d');
  const mini = document.getElementById('miniCanvas'), mctx = mini.getContext('2d');
  const W = 1600, H = 1000, $ = id => document.getElementById(id);
  let seed = 9147; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const camera = { x: W / 2, y: H / 2, zoom: 1 }, selected = new Set();
  const ZOOM_MIN = .72, ZOOM_MAX = 2.6, ZOOM_STEP = 1.35;
  let zoomTarget = 1, zoomAnchor = null;
  let scale = 1, cw = 0, ch = 0, last = performance.now(), elapsed = 0, running = true, speed = 1, playerScore = 0, enemyScore = 0, ended = false, honor = 240, drag = null, toastTimer = 0, soundOn = false;
  const names = ['1st Legion · Hastati', '2nd Cohort · Archers', 'Ala · Equites', 'Praetorian Guard'];
  const types = ['infantry','archers','cavalry','infantry'];
  const specs = [24,18,12,18];
  const makeUnit = (team, idx, x, y, count, label, type) => {
    const soldiers = [];
    const cols = type === 'cavalry' ? 4 : 6;
    for (let i=0;i<count;i++) { const row=Math.floor(i/cols), col=i%cols; soldiers.push({x:x+(col-(cols-1)/2)*13+(rand()-.5)*3,y:y+(row-Math.floor(count/cols)/2)*13+(rand()-.5)*3,alive:true,spear:type==='infantry'&&rand()<.21}); }
    return {team,idx,x,y,count,label,type,soldiers,target:{x,y},attackTarget:null,mode:'advance',morale:100,cooldown:rand()*1.4,charge:0};
  };
  let units = [];
  const objectives = [
    {name:'WESTERN RIDGE', short:'WEST RIDGE', x:800,y:265,owner:'neutral',progress:0,icon:'⚑'},
    {name:'GREYFORD BRIDGE',short:'THE BRIDGE',x:800,y:500,owner:'neutral',progress:0,icon:'⌑'},
    {name:'EASTERN FARM',short:'EAST FARM',x:800,y:735,owner:'neutral',progress:0,icon:'⌂'}
  ];
  function finish(win,copy){if(ended)return;ended=true;running=false;$('endTitle').textContent=win?'VICTORY':'DEFEAT';$('endTitle').style.color=win?'#e3c36d':'#d18b73';$('endCopy').textContent=copy;$('battleEnd').classList.remove('hidden');$('battleStatus').textContent=win?'FIELD WON':'FIELD LOST';log(`<b>${win?'Victory':'Defeat'}:</b> The battle is decided.`)}
  function sound(kind){if(!soundOn)return;try{const ac=new(window.AudioContext||window.webkitAudioContext)(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.type='triangle';o.frequency.setValueAtTime(kind==='capture'?520:180,ac.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='capture'?760:110,ac.currentTime+.18);g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.2);o.start();o.stop(ac.currentTime+.21);o.onended=()=>ac.close()}catch(e){}}
  function reset(){
    units=[]; selected.clear(); objectives.forEach(o=>{o.owner='neutral';o.progress=0});
    units.push(makeUnit('blue',0,235,345,24,names[0],'infantry'),makeUnit('blue',1,235,485,18,names[1],'archers'),makeUnit('blue',2,235,650,12,names[2],'cavalry'),makeUnit('blue',3,370,505,18,names[3],'infantry'));
    units.push(makeUnit('red',0,1365,335,23,'Black Banner · Raiders','infantry'),makeUnit('red',1,1365,490,18,'Longbow · Yeomen','archers'),makeUnit('red',2,1365,655,13,'Ashen Riders · Horse','cavalry'),makeUnit('red',3,1230,510,18,'Iron Guard · Men-at-arms','infantry'));
    units.filter(u=>u.team==='red').forEach((u,i)=>{u.target={x:850+rand()*120,y:[260,500,740,500][i]};u.mode='advance'});
    camera.x=W/2;camera.y=H/2;camera.zoom=1;zoomTarget=1;zoomAnchor=null;playerScore=enemyScore=0;elapsed=0;running=true;ended=false;speed=1;last=performance.now();updateZoomUI();
    $('battleEnd').classList.add('hidden');$('battleStatus').textContent='ENGAGEMENT IN PROGRESS';$('pauseBtn').textContent='Ⅱ';$('honor').textContent='240';
    document.querySelectorAll('.speed').forEach(b=>b.classList.toggle('active',b.dataset.speed==='1'));
    $('battleLog').innerHTML=''; log('Scouts report enemy formations advancing from the east.');log('Secure the <b>bridge</b> and high ground to turn the battle.'); toast('FIELD ORDERS RECEIVED'); renderUI();
  }
  function log(text){const row=document.createElement('div');row.className='log-entry';row.innerHTML=`<time>${clockText()}</time>${text}`;$('battleLog').prepend(row);while($('battleLog').children.length>7)$('battleLog').lastChild.remove()}
  function clockText(){const s=Math.max(0,Math.floor(elapsed));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
  function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1650)}
  function resize(){const r=canvas.getBoundingClientRect();const d=Math.min(devicePixelRatio||1,2);cw=r.width;ch=r.height;canvas.width=Math.max(1,Math.floor(cw*d));canvas.height=Math.max(1,Math.floor(ch*d));ctx.setTransform(d,0,0,d,0,0);const mr=mini.getBoundingClientRect();mini.width=Math.max(1,Math.floor(mr.width*d));mini.height=Math.max(1,Math.floor(mr.height*d));mctx.setTransform(d,0,0,d,0,0);scale=Math.min(cw/W,ch/H)*camera.zoom;}
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const hash=(i,k=0)=>{const v=Math.sin(i*127.1+k*311.7)*43758.5453;return v-Math.floor(v)};
  function toScreen(x,y){return {x:(x-camera.x)*scale+cw/2,y:(y-camera.y)*scale+ch/2}}
  function toWorld(x,y){return {x:(x-cw/2)/scale+camera.x,y:(y-ch/2)/scale+camera.y}}
  function drawTerrain(){
    ctx.save();ctx.translate(cw/2-camera.x*scale,ch/2-camera.y*scale);ctx.scale(scale,scale);
    ctx.fillStyle='#74865d';ctx.fillRect(0,0,W,H);
    // broad terrain patches (stable between frames)
    let terrainSeed=3167;const terrainRand=()=>{terrainSeed=(terrainSeed*1664525+1013904223)>>>0;return terrainSeed/4294967296};
    for(let i=0;i<115;i++){const x=terrainRand()*W,y=terrainRand()*H,r=30+terrainRand()*125;ctx.fillStyle=i%3===0?'#697c55':i%3===1?'#7d8b63':'#71845b';ctx.globalAlpha=.12+terrainRand()*.1;ctx.beginPath();ctx.ellipse(x,y,r,r*(.3+terrainRand()*.5),terrainRand()*3,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
    // gentle contour lines
    ctx.strokeStyle='#c0b994';ctx.globalAlpha=.14;ctx.lineWidth=1.5;
    for(let j=0;j<13;j++){const y=55+j*76;ctx.beginPath();ctx.moveTo(-20,y);ctx.bezierCurveTo(250,y-85+terrainRand()*20,390,y+60,620,y-5);ctx.bezierCurveTo(900,y-80,1130,y+65,1620,y-18);ctx.stroke()}ctx.globalAlpha=1;
    // shallow stream meanders through the bridge
    ctx.beginPath();ctx.moveTo(720,-30);ctx.bezierCurveTo(760,130,870,145,820,300);ctx.bezierCurveTo(760,425,710,440,790,555);ctx.bezierCurveTo(850,665,860,700,795,825);ctx.bezierCurveTo(750,900,830,950,790,1030);ctx.lineWidth=40;ctx.strokeStyle='#667b76';ctx.stroke();ctx.lineWidth=31;ctx.strokeStyle='#85958a';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#acb4a1';ctx.globalAlpha=.32;ctx.stroke();ctx.globalAlpha=1;
    // road to the ford
    ctx.beginPath();ctx.moveTo(-20,510);ctx.bezierCurveTo(250,475,440,530,680,510);ctx.bezierCurveTo(850,500,920,480,1080,505);ctx.bezierCurveTo(1260,535,1400,495,1620,510);ctx.lineWidth=56;ctx.strokeStyle='#7d795e';ctx.stroke();ctx.lineWidth=44;ctx.strokeStyle='#a39670';ctx.stroke();ctx.lineWidth=1;ctx.setLineDash([6,9]);ctx.strokeStyle='#d3c497';ctx.globalAlpha=.42;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    // bridge
    ctx.fillStyle='#4d5044';ctx.fillRect(704,461,190,80);ctx.fillStyle='#a4956f';ctx.fillRect(709,468,181,64);ctx.strokeStyle='#594f3b';ctx.lineWidth=5;for(let x=720;x<890;x+=22){ctx.beginPath();ctx.moveTo(x,470);ctx.lineTo(x,530);ctx.stroke()}ctx.strokeStyle='#c0ad7b';ctx.lineWidth=3;ctx.strokeRect(708,467,182,66);
    // fields and stone walls
    ctx.globalAlpha=.45;ctx.fillStyle='#b0a16b';ctx.fillRect(1040,165,280,112);ctx.fillRect(1120,790,300,120);ctx.globalAlpha=1;
    ctx.strokeStyle='#b7ad88';ctx.lineWidth=5;ctx.setLineDash([7,5]);ctx.strokeRect(1040,165,280,112);ctx.strokeRect(1120,790,300,120);ctx.setLineDash([]);
    // farmhouse
    drawBuilding(1212,220,42,29);drawBuilding(1290,835,48,33);drawBuilding(1165,870,32,24);
    // stone ruins / small settlements
    drawBuilding(390,190,37,28);drawBuilding(295,790,40,31);drawBuilding(1010,410,31,23);
    // clusters of trees as static objects
    for(let i=0;i<152;i++){let x=terrainRand()*W,y=terrainRand()*H;if(Math.abs(x-800)<115&&Math.abs(y-500)<240)continue;if(x>1030&&x<1335&&y>155&&y<285)continue;if(x>1100&&x<1440&&y>780&&y<930)continue;drawTree(x,y,6+terrainRand()*9)}
    // rocks, scrub, field strokes
    for(let i=0;i<85;i++){let x=terrainRand()*W,y=terrainRand()*H;ctx.fillStyle=i%2?'#9b986f':'#a8a17a';ctx.globalAlpha=.45;ctx.beginPath();ctx.ellipse(x,y,3+terrainRand()*7,2+terrainRand()*4,terrainRand(),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
    // small warm map border vignette
    const grd=ctx.createRadialGradient(W/2,H/2,360,W/2,H/2,980);grd.addColorStop(0,'#0000');grd.addColorStop(1,'#25301c55');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
  function drawTree(x,y,r){ctx.fillStyle='#344333';ctx.globalAlpha=.38;ctx.beginPath();ctx.ellipse(x+3,y+5,r*1.25,r*.78,0,0,7);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#526c45';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.fillStyle='#718553';ctx.beginPath();ctx.arc(x-r*.2,y-r*.25,r*.62,0,7);ctx.fill();ctx.fillStyle='#899467';ctx.globalAlpha=.4;ctx.beginPath();ctx.arc(x-r*.34,y-r*.4,r*.25,0,7);ctx.fill();ctx.globalAlpha=1}
  function drawBuilding(x,y,w,h){ctx.fillStyle='#4f4c3b';ctx.fillRect(x-w/2-3,y-h/2+5,w+6,h);ctx.fillStyle='#c2b58c';ctx.fillRect(x-w/2,y-h/2,w,h);ctx.fillStyle='#75684d';ctx.beginPath();ctx.moveTo(x-w/2-5,y-h/2);ctx.lineTo(x,y-h/2-13);ctx.lineTo(x+w/2+5,y-h/2);ctx.closePath();ctx.fill();ctx.fillStyle='#574f3b';ctx.fillRect(x-4,y+2,8,h/2-2)}
  function drawObjective(o){
    const col=o.owner==='blue'?'#9ac7d3':o.owner==='red'?'#d18b73':'#e0c775';
    ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle='#20281c66';ctx.beginPath();ctx.ellipse(0,0,45,24,0,0,7);ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,35+Math.sin(elapsed*2)*2,0,7);ctx.stroke();ctx.globalAlpha=1;
    ctx.strokeStyle='#4c4733';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,-42);ctx.stroke();ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(1,-41);ctx.lineTo(23,-34);ctx.lineTo(1,-26);ctx.closePath();ctx.fill();ctx.fillStyle='#f0ead4';ctx.font='bold 11px DM Mono';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(objectives.indexOf(o)+1),0,1);
    if(Math.abs(o.progress)>0&&Math.abs(o.progress)<100){ctx.strokeStyle=o.progress<0?'#d18b73':col;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,41,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.abs(o.progress)/100);ctx.stroke()}ctx.restore();
  }
  function drawUnit(u){
    const living=u.soldiers.filter(s=>s.alive);if(!living.length)return;
    const color=u.team==='blue'?'#82b6c8':'#c97967', dark=u.team==='blue'?'#335262':'#683d36';
    const cx=living.reduce((a,s)=>a+s.x,0)/living.length,cy=living.reduce((a,s)=>a+s.y,0)/living.length;
    if(selected.has(u)){ctx.strokeStyle='#f2d47c';ctx.lineWidth=2.2;ctx.beginPath();ctx.ellipse(cx,cy,30+(u.type==='cavalry'?6:0),24+(u.type==='cavalry'?6:0),0,0,7);ctx.stroke();ctx.fillStyle='#e7d488';ctx.beginPath();ctx.arc(cx,cy-31,3,0,7);ctx.fill()}
    for(const s of living){ctx.fillStyle='#263026';ctx.beginPath();ctx.arc(s.x+1.5,s.y+2,5.1,0,7);ctx.fill();ctx.fillStyle=dark;ctx.beginPath();ctx.arc(s.x,s.y,4.6,0,7);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(s.x-1,s.y-1,3.1,0,7);ctx.fill();ctx.fillStyle='#e5d7b6';ctx.beginPath();ctx.arc(s.x-.3,s.y-2.2,1.05,0,7);ctx.fill();if(u.type==='archers'){ctx.strokeStyle='#d5bc83';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.x+2,s.y-2);ctx.lineTo(s.x+6,s.y-6);ctx.stroke()}else if(u.type==='infantry'&&s.spear){ctx.strokeStyle='#e1ddc2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.x+1,s.y-2);ctx.lineTo(s.x+4,s.y-8);ctx.stroke()}}
    ctx.fillStyle=dark;ctx.fillRect(cx-18,cy-37,36,5);ctx.fillStyle=color;ctx.fillRect(cx-17,cy-36,34*(alive(u)/u.soldiers.length),3);ctx.fillStyle='#eee6d0';ctx.font='9px DM Mono';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(u.label.split('·')[0].trim(),cx,cy-40);
    if(u.mode==='charge'){ctx.fillStyle='#f3db8e';ctx.font='bold 12px sans-serif';ctx.fillText('⚔',cx,cy+35)}
  }
  function drawMap(){
    ctx.clearRect(0,0,cw,ch);drawTerrain();ctx.save();ctx.translate(cw/2-camera.x*scale,ch/2-camera.y*scale);ctx.scale(scale,scale);
    objectives.forEach(drawObjective);units.forEach(drawUnit);
    if(drag){ctx.strokeStyle='#e3cd84';ctx.fillStyle='#ead79518';ctx.lineWidth=1;ctx.fillRect(drag.x,drag.y,drag.w,drag.h);ctx.strokeRect(drag.x,drag.y,drag.w,drag.h)}ctx.restore();drawMini();
  }
  function drawMini(){const r=mini.getBoundingClientRect(),w=r.width,h=r.height;mctx.clearRect(0,0,w,h);mctx.fillStyle='#72835a';mctx.fillRect(0,0,w,h);mctx.strokeStyle='#82968a';mctx.lineWidth=3;mctx.beginPath();mctx.moveTo(w*.48,0);mctx.lineTo(w*.52,h*.3);mctx.lineTo(w*.49,h*.58);mctx.lineTo(w*.51,h);mctx.stroke();mctx.fillStyle='#ac9b70';mctx.fillRect(0,h*.49,w,h*.035);objectives.forEach(o=>{mctx.fillStyle=o.owner==='blue'?'#9ec9d5':o.owner==='red'?'#d28570':'#e2cb78';mctx.beginPath();mctx.arc(o.x/W*w,o.y/H*h,2.5,0,7);mctx.fill()});units.forEach(u=>{const a=u.soldiers.filter(s=>s.alive);if(!a.length)return;const x=a.reduce((n,s)=>n+s.x,0)/a.length/W*w,y=a.reduce((n,s)=>n+s.y,0)/a.length/H*h;mctx.fillStyle=u.team==='blue'?'#9ed0e0':'#dc8b78';mctx.beginPath();mctx.arc(x,y,u.type==='cavalry'?2.8:2,0,7);mctx.fill()});mctx.strokeStyle='#fff9';mctx.lineWidth=1;mctx.strokeRect((camera.x-cw/(2*scale))/W*w,(camera.y-ch/(2*scale))/H*h,cw/scale/W*w,ch/scale/H*h)}
  function alive(u){return u.soldiers.filter(s=>s.alive).length}
  function center(u){const a=u.soldiers.filter(s=>s.alive);if(!a.length)return{x:u.x,y:u.y};return{x:a.reduce((n,s)=>n+s.x,0)/a.length,y:a.reduce((n,s)=>n+s.y,0)/a.length}}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function nearestEnemy(u){const c=center(u);let best=null,bd=Infinity;for(const e of units){if(e.team===u.team||!alive(e))continue;const d=distance(c,center(e));if(d<bd){best=e;bd=d}}return{unit:best,d:bd}}
  function simulate(dt){
    const step=dt*speed;elapsed+=step;
    for(const u of units){if(!alive(u))continue;u.cooldown-=step;u.charge=Math.max(0,u.charge-step);
      if(u.team==='red'&&u.mode!=='hold'&&u.mode!=='retreat'){const near=nearestEnemy(u);if(near.d<200){u.attackTarget=near.unit;u.mode='engage'}else if(!u.attackTarget||!alive(u.attackTarget)){u.attackTarget=null;const o=objectives.slice().sort((a,b)=>distance(center(u),a)-distance(center(u),b))[0];u.target={x:o.x+(u.idx%2?70:-70),y:o.y+(u.idx===0?-65:u.idx===2?65:0)}}}
      if(u.attackTarget&&!alive(u.attackTarget))u.attackTarget=null;
      if(!u.attackTarget&&u.mode!=='hold'&&u.mode!=='retreat'){const near=nearestEnemy(u),range=u.type==='archers'?255:u.type==='cavalry'?125:105;if(near.unit&&near.d<range){u.attackTarget=near.unit;u.mode='engage'}}
      const c=center(u),target=u.attackTarget&&alive(u.attackTarget)?center(u.attackTarget):u.target;const to=distance(c,target);const attackRange=u.type==='archers'?215:u.type==='cavalry'?43:36;
      let moving=to>attackRange+3&&(u.mode!=='hold');
      if(u.mode==='hold'&&u.attackTarget&&to>attackRange)moving=false;
      if(moving){const angle=Math.atan2(target.y-c.y,target.x-c.x),fx=Math.cos(angle),fy=Math.sin(angle),sx=-fy,sy=fx,speedPx=(u.type==='cavalry'?74:48)*(u.charge>0?1.7:1)*step;const cols=u.type==='cavalry'?4:6;
        u.soldiers.forEach((s,i)=>{if(!s.alive)return;const row=Math.floor(i/cols),col=i%cols-(cols-1)/2;const rowCount=Math.ceil(alive(u)/cols),rank=row-(rowCount-1)/2;const px=(u.attackTarget?target.x-fx*34:target.x)+sx*col*12-fx*rank*12;const py=(u.attackTarget?target.y-fy*34:target.y)+sy*col*12-fy*rank*12;const dx=px-s.x,dy=py-s.y,len=Math.hypot(dx,dy);if(len>1){s.x+=dx/len*Math.min(speedPx,len);s.y+=dy/len*Math.min(speedPx,len)}});
      }
      if(u.attackTarget&&alive(u.attackTarget)&&u.cooldown<=0){const d=distance(center(u),center(u.attackTarget));if(d<=attackRange+22){const targetUnit=u.attackTarget;const damage=u.type==='archers'?(u.team==='blue'?1.5:1.35):u.type==='cavalry'?(u.charge>0?2.5:1.6):1.2;let hits=Math.max(1,Math.floor(damage+(rand()<damage%1?1:0)));while(hits-->0&&alive(targetUnit)){const aliveList=targetUnit.soldiers.filter(s=>s.alive);aliveList[Math.floor(rand()*aliveList.length)].alive=false}targetUnit.morale=Math.max(0,targetUnit.morale-2.6);if(!alive(targetUnit)){log(`<b>${u.team==='blue'?'Legion':'Enemy'}:</b> ${targetUnit.label} routed from the field.`);if(targetUnit.team==='red'){honor+=25;$('honor').textContent=honor}}u.cooldown=(u.type==='archers'?1.15:1.05)+rand()*.45;if(u.mode==='charge')u.charge=0}}
    }
    objectives.forEach(o=>{const b=units.filter(u=>u.team==='blue'&&alive(u)&&distance(center(u),o)<83).length;const r=units.filter(u=>u.team==='red'&&alive(u)&&distance(center(u),o)<83).length;if(b&&r)return;const previous=o.owner;if(b)o.progress=Math.min(100,o.progress+step*17);else if(r)o.progress=Math.max(-100,o.progress-step*17);o.owner=o.progress>=100?'blue':o.progress<=-100?'red':'neutral';if(o.owner!==previous&&o.owner==='blue'){log(`<b>Secured:</b> ${o.name} is under legion control.`);toast(`${o.name} SECURED`);sound('capture')}else if(o.owner!==previous&&o.owner==='red'){log(`<b>Lost:</b> ${o.name} has fallen to the enemy.`);toast(`${o.name} LOST`)}});
    const blue=objectives.filter(o=>o.owner==='blue').length,red=objectives.filter(o=>o.owner==='red').length;if(blue>=2)playerScore+=step*2.7;else if(blue===1)playerScore+=step*.5;if(red>=2)enemyScore+=step*2.7;else if(red===1)enemyScore+=step*.5;
    if(units.filter(u=>u.team==='red').every(u=>alive(u)===0))finish(true,'The enemy banners have fallen. Greyford is yours.');else if(units.filter(u=>u.team==='blue').every(u=>alive(u)===0))finish(false,'The Iron Legion has been driven from the field.');else if(playerScore>=100)finish(true,'Your control of the field broke the enemy line.');else if(enemyScore>=100)finish(false,'The enemy seized the field and forced a retreat.');
  }
  function renderUI(){
    const list=$('unitList');list.innerHTML='';const friendly=units.filter(u=>u.team==='blue');friendly.forEach((u,i)=>{const count=alive(u),card=document.createElement('div');card.className=`unit-card ${u.type}${selected.has(u)?' selected':''}${count===0?' routed':''}${count<u.soldiers.length*.35?' enemy-low':''}`;card.innerHTML=`<div class="unit-icon">${u.type==='cavalry'?'♞':u.type==='archers'?'➶':'⚔'}</div><div class="unit-details"><strong>${u.label}</strong><small>${u.type==='cavalry'?'CAVALRY':u.type==='archers'?'MISSILE INFANTRY':'HEAVY INFANTRY'} · ${count?'READY':'ROUTED'}</small><div class="unit-health"><i style="width:${100*count/u.soldiers.length}%"></i></div></div><div class="unit-size">${count}<small style="display:block;color:#808a7b;font-size:8px">/ ${u.soldiers.length}</small></div>`;card.onclick=()=>selectOnly(u);list.appendChild(card)});
    const total=friendly.reduce((n,u)=>n+alive(u),0),max=friendly.reduce((n,u)=>n+u.soldiers.length,0);$('armyCount').textContent=`${total} / ${max}`;$('armyMeter').style.width=`${100*total/max}%`;
    $('objectiveList').innerHTML=objectives.map(o=>`<div class="objective ${o.owner==='blue'?'owned':o.owner==='red'?'enemy':''}"><span class="objective-icon">${o.icon}</span><div><strong>${o.short}</strong><small>${o.owner==='blue'?'LEGION CONTROL':o.owner==='red'?'ENEMY CONTROL':'CONTESTED GROUND'}</small></div><span class="objective-state">${o.owner==='blue'?'HELD':o.owner==='red'?'LOST':`${Math.round(Math.abs(o.progress))}%`}</span></div>`).join('');
    $('selectedCount').textContent=selected.size?`${selected.size} ${selected.size===1?'FORMATION':'FORMATIONS'}`:'NONE';const info=$('selectedInfo'),active=[...selected].filter(u=>u.team==='blue');if(!active.length)info.innerHTML='<div class="empty-insignia">⌖</div><div><strong>No unit selected</strong><small>Choose a formation to issue orders</small></div>';else{const u=active[0],n=active.reduce((a,x)=>a+alive(x),0);info.innerHTML=`<div class="empty-insignia" style="color:${u.type==='cavalry'?'#c3a361':'#87b6c7'}">${u.type==='cavalry'?'♞':u.type==='archers'?'➶':'⚔'}</div><div><strong>${active.length>1?`${active.length} formations selected`:u.label}</strong><small>${n} soldiers · ${u.mode.toUpperCase()}</small></div>`}
    document.querySelectorAll('.unit-card').forEach((el,i)=>el.classList.toggle('selected',selected.has(friendly[i])));
  }
  function selectOnly(u){selected.clear();if(u&&u.team==='blue'&&alive(u))selected.add(u);renderUI()}
  function order(mode,point){const group=[...selected].filter(u=>u.team==='blue'&&alive(u));if(!group.length){toast('SELECT A FORMATION FIRST');return}group.forEach((u,i)=>{u.mode=mode;u.attackTarget=null;if(mode==='retreat'){u.target={x:75,y:clamp(u.y+(i-(group.length-1)/2)*70,100,900)}}else if(mode==='charge'){const near=nearestEnemy(u);if(near.unit){u.attackTarget=near.unit;u.target=center(near.unit);u.charge=7}else if(point)u.target=point}else if(mode==='hold'){u.target=center(u)}else if(point){u.target={x:point.x,y:point.y+(i-(group.length-1)/2)*34}}});$('orderStatus').textContent=mode.toUpperCase();$('commanderQuote').textContent=mode==='charge'?'“Now! Break their line!”':mode==='hold'?'“Shields up. Hold this ground.”':mode==='retreat'?'“Fall back in good order!”':'“Move as one. Keep your formation.”';toast(mode==='charge'?'CHARGE!':mode==='hold'?'HOLD POSITION':mode==='retreat'?'FALL BACK':'ORDERS RECEIVED');renderUI()}
  function pointer(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);const p=pointer(e),w=toWorld(p.x,p.y);drag={startX:w.x,startY:w.y,x:w.x,y:w.y,w:0,h:0,screenX:p.x,screenY:p.y};});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=toWorld(...Object.values(pointer(e)));drag.x=Math.min(drag.startX,p.x);drag.y=Math.min(drag.startY,p.y);drag.w=Math.abs(drag.startX-p.x);drag.h=Math.abs(drag.startY-p.y)});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;const p=pointer(e),w=toWorld(p.x,p.y);if(Math.hypot(p.x-d.screenX,p.y-d.screenY)>8){selected.clear();units.filter(u=>u.team==='blue'&&alive(u)).forEach(u=>{const c=center(u);if(c.x>=d.x&&c.x<=d.x+d.w&&c.y>=d.y&&c.y<=d.y+d.h)selected.add(u)});renderUI();return}let nearest=null,dist=Infinity;for(const u of units){if(u.team!=='blue'||!alive(u))continue;const c=center(u),dd=distance(w,c);if(dd<dist){dist=dd;nearest=u}}if(nearest&&dist<55)selectOnly(nearest);else if(nearest&&dist<95){selected.add(nearest);renderUI()}else selectOnly(null)});
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();const p=pointer(e),w=toWorld(p.x,p.y);let target=null,dist=Infinity;for(const u of units){if(u.team==='blue'||!alive(u))continue;const d=distance(w,center(u));if(d<dist){target=u;dist=d}}const group=[...selected];if(!group.length){toast('SELECT A FORMATION FIRST');return}if(target&&dist<55){group.forEach(u=>{u.mode='engage';u.attackTarget=target;u.target=center(target)});$('orderStatus').textContent='ATTACK';$('commanderQuote').textContent='“Put them to the sword!”';toast('ATTACKING ENEMY FORMATION');renderUI()}else order('move',w)});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=pointer(e);zoomAt(camera.zoom*(e.deltaY<0?ZOOM_STEP:1/ZOOM_STEP),p.x,p.y)},{passive:false});
  canvas.addEventListener('dblclick',e=>{e.preventDefault();const p=pointer(e);zoomAt(camera.zoom<1.55?1.9:1,p.x,p.y)});
  function zoomAt(z,ax,ay){zoomTarget=clamp(z,ZOOM_MIN,ZOOM_MAX);zoomAnchor={x:ax??cw/2,y:ay??ch/2};updateZoomUI()}
  function stepZoom(){
    if(zoomAnchor==null)return;
    if(Math.abs(zoomTarget-camera.zoom)<.002){camera.zoom=zoomTarget;scale=Math.min(cw/W,ch/H)*camera.zoom;zoomAnchor=null;updateZoomUI();return}
    const before=toWorld(zoomAnchor.x,zoomAnchor.y);
    camera.zoom+=(zoomTarget-camera.zoom)*.24;
    scale=Math.min(cw/W,ch/H)*camera.zoom;
    const after=toWorld(zoomAnchor.x,zoomAnchor.y);
    camera.x+=before.x-after.x;camera.y+=before.y-after.y;
    updateZoomUI();
  }
  function updateZoomUI(){const el=$('zoomLevel');if(!el)return;el.textContent=`${Math.round(camera.zoom*100)}%`;el.classList.toggle('limit',Math.abs(zoomTarget-ZOOM_MIN)<.001||Math.abs(zoomTarget-ZOOM_MAX)<.001)}
  $('minimap').addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect();camera.x=(e.clientX-r.left)/r.width*W;camera.y=(e.clientY-r.top)/r.height*H});
  document.querySelectorAll('.unit-actions button').forEach(b=>b.onclick=()=>order(b.dataset.action==='charge'?'charge':b.dataset.action==='hold'?'hold':'retreat'));
  document.querySelectorAll('.speed').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('.speed').forEach(x=>x.classList.toggle('active',x===b));toast(`${speed}× SPEED`)});
  function togglePause(){running=!running;$('pauseBtn').textContent=running?'Ⅱ':'▶';$('battleStatus').textContent=running?'ENGAGEMENT IN PROGRESS':'BATTLE PAUSED';if(running)last=performance.now()}
  $('pauseBtn').onclick=togglePause;$('retreatAll').onclick=()=>{selected.clear();units.filter(u=>u.team==='blue'&&alive(u)).forEach(u=>selected.add(u));order('retreat');selected.clear();renderUI()};$('restartBtn').onclick=reset;
  $('helpBtn').onclick=()=>$('helpModal').classList.remove('hidden');$('closeHelp').onclick=$('understood').onclick=()=>$('helpModal').classList.add('hidden');$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.add('hidden')});
  $('soundBtn').onclick=()=>{soundOn=!soundOn;$('soundBtn').classList.toggle('active',soundOn);toast(soundOn?'FIELD AUDIO ON':'FIELD AUDIO OFF')};
  $('mapExpand').onclick=()=>{$('field-wrap').classList.toggle('fullscreen')};
  $('zoomIn').onclick=()=>zoomAt(zoomTarget*ZOOM_STEP);
  $('zoomOut').onclick=()=>zoomAt(zoomTarget/ZOOM_STEP);
  $('zoomLevel').onclick=()=>{zoomAt(1);toast('ZOOM RESET')};
  document.querySelector('.field-wrap').id='field-wrap';
  window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();togglePause();return}
    if(e.key==='+'||e.key==='='){zoomAt(zoomTarget*ZOOM_STEP);return}
    if(e.key==='-'||e.key==='_'){zoomAt(zoomTarget/ZOOM_STEP);return}
    if(e.key==='0'){zoomAt(1);toast('ZOOM RESET');return}
    if(e.repeat)return;if(e.key>='1'&&e.key<='4'){selectOnly(units.filter(u=>u.team==='blue')[Number(e.key)-1]);return}if(e.key.toLowerCase()==='c')order('charge');if(e.key.toLowerCase()==='h')order('hold');if(e.key.toLowerCase()==='r')order('retreat');if(e.key==='Escape'){$('helpModal').classList.add('hidden');$('field-wrap').classList.remove('fullscreen')}});
  window.addEventListener('resize',resize);
  function frame(now){const dt=clamp((now-last)/1000,0,.05);last=now;if(running&&!ended)simulate(dt);stepZoom();$('clock').textContent=clockText();drawMap();if(Math.floor(now/280)!==Math.floor((now-dt*1000)/280))renderUI();requestAnimationFrame(frame)}
  resize();reset();$('helpModal').classList.add('hidden');requestAnimationFrame(frame);
})();
