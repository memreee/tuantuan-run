(function(root){
 'use strict';
 class RunnerEngine{
  constructor(random=Math.random){this.random=random;this.reset()}
  reset(){this.lane=1;this.x=1;this.time=0;this.distance=0;this.packets=0;this.objects=[];this.spawnIn=.9;this.lastSafe=1;this.running=false;this.ended=false;this.id=0;this.events=[];this.hit=null}
  move(dir){if(this.running)this.lane=Math.max(0,Math.min(2,this.lane+Math.sign(dir)))}
  spawn(){
   const options=[this.lastSafe-1,this.lastSafe,this.lastSafe+1].filter(x=>x>=0&&x<3);
   const safe=options[Math.floor(this.random()*options.length)];this.lastSafe=safe;
   const block=(safe+1+Math.floor(this.random()*2))%3;
   this.objects.push({id:++this.id,lane:block,t:0,kind:'barrier'});
   this.objects.push({id:++this.id,lane:safe,t:0,kind:'packet'});
   if(this.distance>350&&this.random()<.35)this.objects.push({id:++this.id,lane:3-safe-block,t:0,kind:'barrier'});
  }
  update(dt){
   this.events=[];if(!this.running)return;
   dt=Math.min(.05,Math.max(0,dt));this.time+=dt;
   const speed=.205+Math.min(.125,this.distance/12000);
   this.distance+=dt*(15+Math.min(13,this.distance/100));
   this.x+=(this.lane-this.x)*(1-Math.exp(-18*dt));
   this.spawnIn-=dt;if(this.spawnIn<=0){this.spawn();this.spawnIn=1.35-Math.min(.25,this.distance/4000)}
   for(const o of this.objects){
    const prev=o.t;o.t+=dt*speed;
    if(!o.checked&&prev<.9&&o.t>=.9){
     o.checked=true;
     if(Math.abs(o.lane-this.x)<(o.kind==='packet'?.45:.56)){
      if(o.kind==='packet'){o.collected=true;this.packets++;this.events.push({kind:'collect',lane:o.lane})}
      else{this.running=false;this.ended=true;this.hit=o;this.events.push({kind:'crash'});break}
     }
    }
   }
   this.objects=this.objects.filter(o=>o.t<1.2&&!o.collected&&!(o.kind==='barrier'&&o.checked));
  }
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=RunnerEngine;else root.RunnerEngine=RunnerEngine;
})(typeof globalThis!=='undefined'?globalThis:this);
