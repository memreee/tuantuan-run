'use strict';
const $=id=>document.getElementById(id);
const stage=$('stage'),canvas=$('scene'),ctx=canvas.getContext('2d'),engine=new RunnerEngine();
const streetVideo=$('street-video');
streetVideo.muted=true;
streetVideo.defaultMuted=true;
streetVideo.playsInline=true;
let streetPending=false,streetLastTime=-1,streetProgressAt=0,streetRetryAt=0;
function streetWanted(){return !document.hidden&&screen==='playing'}
function playStreet(){
 if(!streetWanted()||streetPending)return;
 streetVideo.muted=true;
 streetPending=true;
 try{
  const attempt=streetVideo.play();
  Promise.resolve(attempt).catch(()=>{}).finally(()=>{
   streetPending=false;
   if(!streetWanted())streetVideo.pause();
  });
 }catch{streetPending=false;}
}
// Unlock video on the start/resume gesture, but hold its frame through countdown.
function primeStreet(){
 if(document.hidden||screen!=='countdown')return;
 try{Promise.resolve(streetVideo.play()).then(()=>{
  if(screen!=='playing')streetVideo.pause();
 }).catch(()=>{});}catch{}
}
function resetStreetWatch(){streetLastTime=-1;streetProgressAt=performance.now();streetRetryAt=0;}
function checkStreet(){
 if(!streetWanted())return;
 const now=performance.now(),time=streetVideo.currentTime;
 if(Math.abs(time-streetLastTime)>.01){streetLastTime=time;streetProgressAt=now;return;}
 if(now-streetProgressAt<4000||now-streetRetryAt<4000)return;
 streetRetryAt=now;
 if(streetVideo.ended){try{streetVideo.currentTime=0}catch{}}
 // Restart a suspended decoder without reloading the whole video on slow networks.
 if(!streetVideo.paused&&!streetVideo.seeking&&streetVideo.readyState>=2)streetVideo.pause();
 playStreet();
}
setInterval(checkStreet,1000);
for(const event of ['canplay','loadeddata','ended'])streetVideo.addEventListener(event,()=>{if(streetWanted())playStreet()});
// A fresh touch also retries playback under mobile browser gesture policies.
document.addEventListener('pointerdown',()=>{if(streetWanted()&&streetVideo.paused)playStreet()},{passive:true});
window.addEventListener('pageshow',()=>{if(streetWanted()){resetStreetWatch();playStreet()}});
const images={},names=['rider','city','packet'];
// Transparent, fixed-size animation cells keep lane position and collision geometry unchanged.
const riderSheets=[];let riderAnimationReady=false;
Promise.all(Array.from({length:8},(_,index)=>new Promise((resolve,reject)=>{
 const sheet=new Image();sheet.onload=()=>{riderSheets[index]=sheet;resolve()};sheet.onerror=reject;
 sheet.src='assets/rider-animation/rider-'+index+'.webp';
}))).then(()=>{riderAnimationReady=true}).catch(()=>{});

let W=480,H=982,screen='home',ready=false,last=0,count=0,particles=[],pickups=[],elapsed=0,toastTimer,finishTimer,modalKind='',previousFocus;
let sound=true,audio;
const backgroundMusic=$('background-music');backgroundMusic.volume=.18;
const storage={get(k,f){try{const v=JSON.parse(localStorage.getItem('tuantuan-'+k));return v??f}catch{return f}},set(k,v){try{localStorage.setItem('tuantuan-'+k,JSON.stringify(v))}catch{}}};
let records=storage.get('records',[]);if(!Array.isArray(records))records=[];records=records.filter(r=>Number.isFinite(r.distance)&&Number.isFinite(r.packets)).slice(0,10);
let energy=storage.get('energy',3);if(!Number.isInteger(energy)||energy<0||energy>3)energy=3;
let played=storage.get('played',0);if(!Number.isFinite(played))played=0;
function energyUI(){$('energy-count').textContent='剩余体力：'+energy;storage.set('energy',energy)}energyUI();
function toast(t){clearTimeout(toastTimer);$('toast').textContent=t;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function resize(){const b=stage.getBoundingClientRect();W=b.width;H=b.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0)}new ResizeObserver(resize).observe(stage);
Promise.all(names.map(name=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[name]=im;resolve()};im.onerror=()=>reject(name);im.src='assets/'+name+'.png'}))).then(()=>{ready=true;$('loading').hidden=true;resize()}).catch(()=>{$('loading').textContent='素材加载失败，请刷新页面重试'});
function tone(freq,duration=.12,type='sine',volume=.04,hold=0){if(!sound||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);if(hold>0)g.gain.setValueAtTime(volume,audio.currentTime+Math.min(hold,duration));g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}
// A soft pop, warm plucked chord, and a quiet sparkling tail for packet collection.
let packetNoiseBuffer;
function packetSound(){
 if(!sound||!audio||audio.state!=='running')return;
 const now=audio.currentTime,variation=1+(Math.random()-.5)*.035;
 const mix=audio.createGain();mix.gain.value=.8;mix.connect(audio.destination);
 let voices=0;
 function release(nodes){nodes.forEach(n=>n.disconnect());if(--voices===0)mix.disconnect();}
 function pluck(freq,delay,length,level,type='sine',endFreq=freq){
  voices++;
  const o=audio.createOscillator(),g=audio.createGain(),t=now+delay;
  o.type=type;o.frequency.setValueAtTime(freq*variation,t);
  o.frequency.exponentialRampToValueAtTime(endFreq*variation,t+Math.min(.085,length));
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+length);
  o.connect(g);g.connect(mix);o.onended=()=>release([o,g]);o.start(t);o.stop(t+length+.01);
 }
 // Low rounded impact, followed by overlapping consonant notes rather than beeps.
 pluck(330,0,.13,.20,'sine',145);
 pluck(523.25,.012,.28,.13,'triangle');
 pluck(659.25,.032,.30,.10,'sine');
 pluck(784,.055,.32,.09,'sine');
 pluck(1568,.085,.25,.028,'sine');
 pluck(2093,.12,.24,.012,'sine');
 if(!packetNoiseBuffer){
  packetNoiseBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.1),audio.sampleRate);
  const samples=packetNoiseBuffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
 }
 voices++;
 const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
 noise.buffer=packetNoiseBuffer;filter.type='lowpass';filter.frequency.value=1800;
 gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.09,now+.006);gain.gain.exponentialRampToValueAtTime(.0001,now+.085);
 noise.connect(filter);filter.connect(gain);gain.connect(mix);
 noise.onended=()=>release([noise,filter,gain]);noise.start(now);noise.stop(now+.1);
}

function musicUI(){ $('mute-mark').hidden=sound;document.querySelector('.home-music').setAttribute('aria-label',sound?'关闭音乐':'开启音乐'); }
function playMusic(){
 if(!sound||document.hidden||screen==='paused')return;
 backgroundMusic.play().catch(error=>{
  if(!sound||document.hidden||screen==='paused')return;
  // Autoplay restrictions defer audio until a gesture; keep the user's enabled setting.
  if(error.name==='NotAllowedError'||error.name==='AbortError')return;
  toast('音乐暂未播放，请点击音乐按钮重试');
 });
}
function unlockGameAudio(){
 if(!sound)return;
 try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}
 playMusic();
}
musicUI();playMusic();
document.addEventListener('click',event=>{
 if(!event.target.closest('.home-music'))unlockGameAudio();
},{capture:true});
document.addEventListener('keydown',unlockGameAudio,{capture:true});
function toggleMusic(){sound=!sound;musicUI();if(sound){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}playMusic()}else backgroundMusic.pause();toast(sound?'音乐已开启':'音乐已关闭')}

function openModal(title,content,kind='info'){$('modal').classList.remove('design-dialog');$('modal').removeAttribute('style');previousFocus=document.activeElement;modalKind=kind;$('modal-content').innerHTML='<h2>'+title+'</h2>'+content;if(!$('modal').open)$('modal').showModal()}
function closeModal(){if(modalKind==='pause'){resume();return}if(modalKind==='result'||((modalKind==='refilled'||modalKind==='energy')&&screen!=='home')){goHome();return}$('modal').close();previousFocus?.focus();modalKind=''}
$('close-modal').onclick=closeModal;$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal()});
function actionButton(text,action,secondary=false){return '<button class="'+(secondary?'secondary':'primary')+'" data-modal-action="'+action+'">'+text+'</button>'}
function rules(){openModal('挑战规则','<img class="modal-icon" src="assets/packet.png" alt="红包"><ol class="rules-list"><li>自动向前骑行，左右滑动切换车道。</li><li>电脑使用 ← → 或 A / D，也可点击两侧箭头。</li><li>躲避路障，沿途收集红包；撞到路障后结束。</li><li>每骑行 200 米进入下一关，速度逐渐提升。</li><li>暂停按钮或空格键可随时暂停。</li></ol>'+actionButton('知道了，开始挑战','start'))}
function openDesignPanel(title,content,kind){
 previousFocus=document.activeElement;modalKind=kind;
 const dialog=$('modal'),bounds=stage.getBoundingClientRect();
 dialog.classList.add('design-dialog');dialog.style.width=bounds.width+'px';dialog.style.maxHeight='none';dialog.style.bottom=Math.max(0,innerHeight-bounds.bottom)+'px';
 $('modal-content').innerHTML='<h2 class="sr-only">'+title+'</h2>'+content;
 if(!dialog.open)dialog.showModal();
}
function ranking(){
 const labels=['第1名，云***溪，最远980米，红包31个','第2名，林***夏，最远843米，红包25个','第3名，顾***辰，最远585米，红包17个','第4名，沈***舟，最远465米，红包13个','第5名，苏***橙，最远438米，红包16个'];
 openDesignPanel('最高里程排行榜','<div class="design-panel"><img src="assets/ui-v2/ranking-header.webp" alt="最高里程排行榜，统计截至于12月31日12:00。我的排名：未上榜，李***蕾，最远165米，红包5个。"><div class="rank-scroll" tabindex="0" role="region" aria-label="示例排行榜，上下滑动查看第1至第5名"><ol>'+labels.map((label,i)=>'<li><img src="assets/ui-v2/rank-'+(i+1)+'.webp" alt="'+label+'"></li>').join('')+'</ol></div></div>','ranking');
}
function energyTasks(){
 const labels=['邀请好友助力得体力','浏览商品得体力','分享活动页得体力'];
 openDesignPanel('做任务 赚体力','<div class="design-panel energy-panel"><img src="assets/ui-v2/energy.webp" alt="做任务赚体力，每天12:00刷新任务。邀请好友、浏览商品、分享活动，各得2个体力。">'+labels.map((label,i)=>'<button class="energy-task" aria-label="'+label+'，去完成" data-modal-action="task-feedback"><img src="assets/ui-v2/task-button-'+(i+1)+'.png" alt=""></button>').join('')+'</div>','energy-tasks');
}
$('modal').addEventListener('click',e=>{
 if(e.target===$('modal')&&$('modal').classList.contains('design-dialog')){closeModal();return}
 const button=e.target.closest('[data-modal-action="task-feedback"]');if(!button)return;
 button.getAnimations().forEach(a=>a.cancel());
 button.animate([{transform:'translateX(0)'},{transform:'translateX(-2px)'},{transform:'translateX(2px)'},{transform:'translateX(-1px)'},{transform:'translateX(0)'}],{duration:240,easing:'ease-in-out'});
});
function prizes(){openModal('我的奖品',played>0?'<div class="coupon"><strong>88元神券</strong><span>挑战参与奖励</span></div><p>累计参与 '+played+' 次挑战<br>最佳成绩 '+(records[0]?.distance||0)+' 米</p><p class="fine">作品集体验奖品，仅供展示，不实际发放。</p>'+actionButton('去使用','use-prize'):'<p>完成首次挑战，点亮你的奖品。</p><div class="coupon"><strong>88元神券</strong><span>开始挑战 · 必得好礼</span></div><p class="fine">作品集体验奖品，仅供展示，不实际发放。</p>'+actionButton('开始挑战','start'))}
function energyModal(){openModal('去赚体力','<p>团团休息一下，继续出发！</p><p>当前体力 <b>'+energy+' / 3</b></p>'+actionButton('补充体力','refill')+'<p class="fine">看视频赚体力</p>','energy')}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='start')start();else if(a==='rules')rules();else if(a==='music')toggleMusic();else if(a==='ranking')ranking();else if(a==='prizes')prizes();else if(a==='energy')energyTasks();else if(a==='levels')openModal('关卡挑战','<p>每前进 200 米，解锁下一关。</p><p>第一关 → 第二关 → 第三关<br>第四关 → 第五关 → 极限挑战</p><p>越往前越快，红包也在等你！</p>'+actionButton('开始挑战','start'));else if(a==='hello'){const rider=document.querySelector('.rabbit img');rider.getAnimations().forEach(a=>a.cancel());const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;rider.animate(reduced?[{opacity:.7},{opacity:1}]:[{transform:'translateX(0) rotate(0)'},{transform:'translateX(-5%) rotate(-5deg)'},{transform:'translateX(5%) rotate(5deg)'},{transform:'translateX(-3%) rotate(-3deg)'},{transform:'translateX(0) rotate(0)'}],{duration:reduced?180:620,easing:'ease-in-out'});toast('和团团一起出发，把红包带回家！');}else toast('已经在游戏首页啦')});
$('modal').addEventListener('click',e=>{const b=e.target.closest('[data-modal-action]');if(!b)return;const a=b.dataset.modalAction;if(a==='start')start();if(a==='resume')resume();if(a==='home')goHome();if(a==='refill'){energy=3;energyUI();openModal('体力已补满','<p>剩余体力 <b>3 / 3</b><br>团团准备好继续出发了！</p>'+actionButton('开始挑战','start')+actionButton('返回首页','home',true),'refilled')}if(a==='ranking')ranking();if(a==='use-prize')openModal('88元神券','<div class="coupon"><strong>88元神券</strong><span>挑战参与奖励</span></div><p>神券已收进你的奖品。</p><p class="fine">当前为展示体验，暂未接入实际核销。</p>'+actionButton('返回我的奖品','prizes'));if(a==='prizes')prizes()});
function start(){if(!ready){toast('街区还在准备中');return}if(energy<=0){energyModal();return}clearTimeout(finishTimer);$('modal').close();modalKind='';energy--;energyUI();engine.reset();streetVideo.pause();streetVideo.currentTime=0;particles=[];pickups=[];screen='countdown';playMusic();count=3.6;$('home').hidden=true;$('play').hidden=false;$('instruction').style.opacity='1';$('countdown').textContent='3';$('distance').textContent='0';$('packets').textContent='0';$('level-label').textContent='第一关';$('level-progress').style.width='0%';stage.classList.remove('hit');resize();resetStreetWatch();primeStreet();last=performance.now();if(audio)audio.resume()}
function pause(){if(screen!=='playing'&&screen!=='countdown')return;engine.running=false;streetVideo.pause();screen='paused';backgroundMusic.pause();openModal('稍作休息','<p>团团在这里等你。</p>'+actionButton('继续骑行','resume')+actionButton('返回首页','home',true),'pause')}
function resume(){$('modal').close();modalKind='';screen='countdown';playMusic();count=1.6;$('countdown').textContent='1';last=performance.now();resetStreetWatch();primeStreet()}
function goHome(){clearTimeout(finishTimer);engine.running=false;streetVideo.pause();screen='home';playMusic();$('modal').close();modalKind='';$('home').hidden=false;$('play').hidden=true;$('countdown').textContent='';document.querySelector('.start').focus()}
function finish(){screen='crashed';streetVideo.pause();stage.classList.add('hit');tone(110,.4,'sawtooth',.035);const record={distance:Math.floor(engine.distance),packets:engine.packets};const best=records.length?record.distance>records[0].distance:true;records.push(record);records.sort((a,b)=>b.distance-a.distance||b.packets-a.packets);records=records.slice(0,10);storage.set('records',records);played++;storage.set('played',played);finishTimer=setTimeout(()=>{openModal(best?'新纪录！':'挑战完成','<img class="modal-icon" src="assets/packet.png" alt="红包"><p>这一路，收获满满</p><div class="result-stats"><div><b>'+record.distance+'</b><span>骑行距离 / 米</span></div><div><b>'+record.packets+'</b><span>收集红包 / 个</span></div></div><span class="badge">最佳纪录 '+records[0].distance+' 米</span>'+actionButton('再挑战一次','start')+actionButton('返回首页','home',true),'result')},280)}
$('pause').onclick=pause;$('left').onclick=()=>move(-1);$('right').onclick=()=>move(1);
function move(d){if(screen==='playing'){engine.move(d);tone(300+d*70,.045,'sine',.016)}}
window.addEventListener('keydown',e=>{if($('modal').open)return;if(['ArrowLeft','ArrowRight',' ','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.repeat)return;if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')move(-1);if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')move(1);if(e.key===' '||e.key==='Escape')pause()});
let touchStart=null;
canvas.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)){move(Math.sign(dx));touchStart={x:e.clientX,y:e.clientY}}});
canvas.addEventListener('pointerup',()=>touchStart=null);canvas.addEventListener('pointercancel',()=>touchStart=null);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();backgroundMusic.pause();if(audio)audio.suspend()}else if(sound){if(audio)audio.resume();playMusic()}});window.addEventListener('blur',pause);
function project(t,lane=1){const z=Math.pow(Math.max(0,t),2.5);return{x:W*.5+(lane-1)*W*.37*z,y:H*.675+z*H*.385,s:z}}
function poly(points,fill){ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill()}
function quad(t1,t2,l1,l2,color){const a=project(t1,l1),b=project(t1,l2),c=project(t2,l2),d=project(t2,l1);poly([[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]],color)}
function startLinePosition(distance){return .79+distance*.045}
function drawWorld(){
 ctx.clearRect(0,0,W,H);
 // This start line belongs to the run, not to the repeating background video.
 const t=startLinePosition(engine.distance);
 if(t>1.15)return;
 for(let row=0;row<2;row++)for(let col=0;col<8;col++){
  const left=-.38+col*.345;
  quad(t+row*.027,t+(row+1)*.027,left,left+.345,(row+col)%2?'#f9d757':'#468dd0');
 }
}
function roundRect(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function drawBarrier(o){if(o===engine.hit||o.checked||o.t>=.9)return;const p=project(o.t,o.lane),w=W*.38*p.s,h=w*.68;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#27445b40';ctx.beginPath();ctx.ellipse(0,3,w*.64,w*.13,0,0,Math.PI*2);ctx.fill();roundRect(-w*.4,-h*.4,w*.12,h*.42,2,'#356695');roundRect(w*.28,-h*.4,w*.12,h*.42,2,'#356695');roundRect(-w*.46,-h,w*.92,h*.68,Math.max(2,w*.08),'#e89720');const g=ctx.createLinearGradient(0,-h,0,0);g.addColorStop(0,'#fff397');g.addColorStop(.25,'#ffd850');g.addColorStop(1,'#f1a91c');roundRect(-w*.46,-h,w*.92,h*.62,Math.max(2,w*.06),g);ctx.save();ctx.beginPath();ctx.roundRect(-w*.43,-h*.93,w*.86,h*.49,Math.max(1,w*.035));ctx.clip();for(let i=-3;i<5;i++)poly([[i*w*.29,-h],[i*w*.29+w*.16,-h],[i*w*.29-w*.13,0],[i*w*.29-w*.29,0]],'#f26b4e');ctx.restore();ctx.fillStyle='#fff1a0';ctx.beginPath();ctx.arc(-w*.36,-h*.72,Math.max(1,w*.026),0,7);ctx.arc(w*.36,-h*.72,Math.max(1,w*.026),0,7);ctx.fill();ctx.restore()}
function drawPacket(o){const p=project(o.t,o.lane),w=W*.15*p.s,h=w*images.packet.height/images.packet.width;ctx.save();ctx.translate(p.x,p.y-h*.48+Math.sin(elapsed*4+o.id)*3*p.s);ctx.rotate(Math.sin(elapsed*2+o.id)*.09);ctx.shadowColor='#ffd76c';ctx.shadowBlur=12*p.s;ctx.drawImage(images.packet,-w/2,-h/2,w,h);ctx.restore()}
function drawRider(){const p=project(.9,engine.x),h=H*.245,w=h*images.rider.width/images.rider.height,bob=screen==='playing'?Math.sin(engine.time*16)*1.6:0;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#203c6245';ctx.beginPath();ctx.ellipse(0,3,w*.55,w*.12,0,0,7);ctx.fill();ctx.rotate((engine.lane-engine.x)*.12);if(riderAnimationReady){
 const frame=Math.floor(engine.time*24)%96,sheet=riderSheets[Math.floor(frame/12)],cell=frame%12;
 ctx.drawImage(sheet,(cell%4)*210,Math.floor(cell/4)*550,210,550,-w/2,-h+bob,w,h);
 }else ctx.drawImage(images.rider,-w/2,-h+bob,w,h);
 ctx.restore()}
function collectEffect(lane){
 packetSound();
 const p=project(.9,lane),x=p.x,y=p.y-H*.1;
 pickups.push({x,y,age:0});
 const hud=document.querySelector('.packet-stat');
 hud.getAnimations?.().forEach(a=>a.cancel());
 hud.animate?.([{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.22)',filter:'brightness(1.5)',offset:.3},{transform:'scale(1)',filter:'brightness(1)'}],{duration:550,easing:'ease-out'});
 for(let i=0;i<32;i++){
  const angle=Math.PI*2*i/32,speed=W*(.22+Math.random()*.35);
  particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-H*.04,age:0,size:4+Math.random()*4,color:i%3?'#ffe570':'#ff5884'});
 }
}
function drawPickupEffects(dt){
 for(const f of pickups){
  f.age+=dt;const t=f.age/1.05;if(t>=1)continue;
  ctx.save();ctx.translate(f.x,f.y);
  const radius=W*(.07+.20*t),fade=Math.pow(1-t,.7);
  ctx.globalAlpha=fade;
  const glow=ctx.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#fff5b4bb');glow.addColorStop(.48,'#ffdc4c66');glow.addColorStop(1,'#ffe04b00');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffe77e';ctx.lineWidth=Math.max(1,5*(1-t));ctx.beginPath();ctx.arc(0,0,radius*.8,0,Math.PI*2);ctx.stroke();
  const pop=Math.sin(Math.min(1,t*2.5)*Math.PI),size=W*(.14+.10*pop),iy=-H*.09*t;
  ctx.shadowColor='#ffcd42';ctx.shadowBlur=18;
  ctx.drawImage(images.packet,-size/2,iy-size*.58,size,size*1.08);
  ctx.restore();
 }
 pickups=pickups.filter(f=>f.age<1.05);
 for(const p of particles){
  p.age+=dt;const life=1-p.age/.9;if(life<=0)continue;
  ctx.save();ctx.globalAlpha=life;ctx.translate(p.x+p.vx*p.age,p.y+p.vy*p.age+100*p.age*p.age);ctx.rotate(p.age*4);ctx.fillStyle=p.color;
  const r=p.size*life;poly([[0,-r*1.6],[r*.35,-r*.35],[r*1.6,0],[r*.35,r*.35],[0,r*1.6],[-r*.35,r*.35],[-r*1.6,0],[-r*.35,-r*.35]],p.color);ctx.restore();
 }
 particles=particles.filter(p=>p.age<.9);
}
function draw(dt){
 if(!ready||screen==='home')return;drawWorld();const objects=engine.objects.filter(o=>o.kind!=='barrier'||(o!==engine.hit&&!o.checked&&o.t<.9)).sort((a,b)=>a.t-b.t);
 for(const o of objects.filter(o=>o.t<=.9)){if(o.kind==='packet')drawPacket(o);else drawBarrier(o)}
 drawRider();for(const o of objects.filter(o=>o.t>.9)){if(o.kind==='packet')drawPacket(o);else drawBarrier(o)}
 drawPickupEffects(screen==='playing'?dt:0);
 if(screen==='crashed'){ctx.fillStyle='#ff59772b';ctx.fillRect(0,0,W,H)}
}
function countdownLabel(remaining){return remaining>.6?String(Math.ceil(remaining-.6)):remaining>0?'出发!':''}
function frame(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;elapsed+=dt;if(screen==='countdown'){count-=dt;$('countdown').textContent=countdownLabel(count);if(count<=0){screen='playing';engine.running=true;playStreet()}}if(screen==='playing'){engine.update(dt);$('distance').textContent=Math.floor(engine.distance);$('packets').textContent=engine.packets;const level=Math.min(5,Math.floor(engine.distance/200));$('level-label').textContent=['第一关','第二关','第三关','第四关','第五关','极限挑战'][level];$('level-progress').style.width=(engine.distance%200/2)+'%';$('instruction').style.opacity=engine.time<5?'1':'0';for(const e of engine.events){if(e.kind==='collect'){collectEffect(e.lane)}else if(e.kind==='crash')finish()}}
 draw(dt);requestAnimationFrame(frame)}requestAnimationFrame(frame);

// Welfare buttons share the lightweight feedback of energy tasks.
document.querySelectorAll('[data-feedback]').forEach(button=>button.addEventListener('click',()=>{
 button.getAnimations().forEach(a=>a.cancel());
 button.animate([{transform:'translateX(0)'},{transform:'translateX(-2px)'},{transform:'translateX(2px)'},{transform:'translateX(-1px)'},{transform:'translateX(0)'}],{duration:240,easing:'ease-in-out'});
}));
// Mouse dragging complements native touch/trackpad scrolling.
const couponRail=document.querySelector('.welfare-scroll');
let couponDrag=null,couponDidDrag=false;
couponRail.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='mouse'||e.button!==0)return;
 couponDidDrag=false;couponDrag={x:e.clientX,left:couponRail.scrollLeft,id:e.pointerId};
});
couponRail.addEventListener('pointermove',e=>{
 if(!couponDrag)return;
 const dx=e.clientX-couponDrag.x;
 if(Math.abs(dx)>4){couponDidDrag=true;couponRail.setPointerCapture(e.pointerId);couponRail.style.scrollSnapType='none';}
 if(couponDidDrag){e.preventDefault();couponRail.scrollLeft=couponDrag.left-dx;}
});
function endCouponDrag(){couponDrag=null;couponRail.style.scrollSnapType='';}
couponRail.addEventListener('pointerup',endCouponDrag);
couponRail.addEventListener('pointercancel',endCouponDrag);
couponRail.addEventListener('lostpointercapture',endCouponDrag);
couponRail.addEventListener('pointerleave',e=>{if(!couponRail.hasPointerCapture(e.pointerId))endCouponDrag()});
couponRail.addEventListener('click',e=>{if(couponDidDrag){e.preventDefault();e.stopPropagation();couponDidDrag=false;}},true);
