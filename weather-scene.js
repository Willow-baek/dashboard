(function(){
var THEMES={
  clearDay:    {bg:"linear-gradient(180deg,#4A90D9 0%,#72AEDE 40%,#A8CFEA 72%,#C8E4F4 100%)",text:"#1A3A58",timeColor:"#2A6AA8",card:"rgba(255,255,255,0.46)"},
  sunrise:     {bg:"linear-gradient(180deg,#5B6BAE 0%,#A07EB8 30%,#E89878 62%,#F8CFA0 100%)",text:"#2A1840",timeColor:"#7A4080",card:"rgba(255,255,255,0.40)"},
  sunset:      {bg:"linear-gradient(180deg,#5068A8 0%,#9868A8 28%,#D87868 58%,#F0B080 100%)",text:"#201030",timeColor:"#6838A0",card:"rgba(255,255,255,0.38)"},
  clearNight:  {bg:"linear-gradient(180deg,#1E2C4A 0%,#283C5E 45%,#344D78 100%)",text:"#D8E8FF",timeColor:"#90B0E0",card:"rgba(20,30,55,0.55)"},
  deepNight:   {bg:"linear-gradient(180deg,#141E32 0%,#1A2840 50%,#203050 100%)",text:"#C0D0E8",timeColor:"#7090C0",card:"rgba(12,18,35,0.58)"},
  partlyCloudy:{bg:"linear-gradient(180deg,#5898C8 0%,#80B4D4 38%,#A8CCDE 72%,#C8DDE8 100%)",text:"#183048",timeColor:"#2A6090",card:"rgba(255,255,255,0.46)"},
  cloudy:      {bg:"linear-gradient(180deg,#6A8098 0%,#8A9EB0 38%,#A8B8C4 72%,#C0CDD6 100%)",text:"#1E2C38",timeColor:"#3A5870",card:"rgba(255,255,255,0.46)"},
  foggy:       {bg:"linear-gradient(180deg,#9AAAB2 0%,#B0BEC6 48%,#CDD8DC 100%)",text:"#243038",timeColor:"#485A68",card:"rgba(255,255,255,0.48)"},
  drizzle:     {bg:"linear-gradient(180deg,#4A607A 0%,#607888 48%,#7E9098 100%)",text:"#D8E5EE",timeColor:"#90B0C8",card:"rgba(30,42,55,0.52)"},
  rain:        {bg:"linear-gradient(180deg,#344456 0%,#445464 45%,#546475 100%)",text:"#D0DDE8",timeColor:"#7898B8",card:"rgba(22,32,45,0.55)"},
  snow:        {bg:"linear-gradient(180deg,#8898A8 0%,#A8B8C8 42%,#C8D8E0 72%,#E0EAED 100%)",text:"#1E2E3A",timeColor:"#486078",card:"rgba(255,255,255,0.50)"},
  storm:       {bg:"linear-gradient(180deg,#222C40 0%,#2C3850 45%,#384560 100%)",text:"#C0D0E0",timeColor:"#6888B0",card:"rgba(15,20,35,0.60)"},
};

function getThemeKey(code,hour){
  var night=hour<5||hour>=21,sunrise=hour>=5&&hour<8,sunset=hour>=18&&hour<21,deep=hour>=23||hour<4;
  if(code===0||code===1){if(deep)return'deepNight';if(night)return'clearNight';if(sunrise)return'sunrise';if(sunset)return'sunset';return'clearDay';}
  if(code===2)return night?'cloudy':'partlyCloudy';
  if(code===3)return'cloudy';
  if(code===45||code===48)return'foggy';
  if(code===51||code===53||code===55)return'drizzle';
  if(code===61||code===63||code===65||code===80||code===81||code===82)return'rain';
  if(code===71||code===73||code===75||code===77)return'snow';
  if(code===95||code===96||code===99)return'storm';
  return night?'clearNight':'clearDay';
}

var currentKey='',animFrame=null,ltTimer=null;
function applyTheme(key){
  var t=THEMES[key]||THEMES.clearDay;
  document.getElementById('bg-wrap').style.background=t.bg;
  document.getElementById('dashboard').style.color=t.text;
  document.documentElement.style.setProperty('--ink',t.text);
  document.documentElement.style.setProperty('--muted',t.text);
  document.documentElement.style.setProperty('--time-color',t.timeColor);
  document.documentElement.style.setProperty('--theme-card',t.card);
  document.documentElement.style.setProperty('--urgent-text',/^#[CD]/.test(t.text)?'#ff8e8e':'#d12424');
  document.getElementById('clock').style.color=t.timeColor;
  document.querySelectorAll('.card').forEach(function(c){c.style.background=t.card;});
  if(key===currentKey)return;
  currentKey=key;
  buildScene(key);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startParticles(key);
}

function buildScene(key){
  var sun=document.getElementById('sun'),moon=document.getElementById('moon');
  var cw=document.getElementById('clouds-wrap'),fw=document.getElementById('fog-wrap');
  var rays=document.getElementById('sun-rays');

  // 태양 광선 (더 많고 다양하게)
  if(!rays.dataset.built){
    rays.dataset.built='1';
    for(var i=0;i<16;i++){
      var ray=document.createElement('div');
      ray.className='ray';
      var len=28+(i%4)*14,total=48+len,w=i%3===0?3:2;
      ray.style.cssText='height:'+total+'px;width:'+w+'px;left:'+(48-w/2)+'px;top:'+(48-total)+'px;transform-origin:50% 100%;transform:rotate('+(i*22.5)+'deg);opacity:'+(i%2===0?.9:.6)+';';
      rays.appendChild(ray);
    }
  }

  sun.style.display=(key==='clearDay'||key==='sunrise'||key==='partlyCloudy')?'block':'none';
  moon.style.display=(key==='clearNight'||key==='deepNight')?'block':'none';

  // 구름
  cw.innerHTML='';
  var cloudKeys=['partlyCloudy','cloudy','drizzle','rain','storm','sunset','foggy'];
  if(cloudKeys.indexOf(key)>=0){
    var cnt=key==='cloudy'?7:key==='rain'||key==='storm'?8:key==='foggy'?5:3;
    var dark=key==='rain'||key==='storm'||key==='drizzle';
    var foggy=key==='foggy';
    for(var i=0;i<cnt;i++){
      var cl=document.createElement('div');
      cl.className='cloud';
      var w=140+Math.random()*220,h=w*(0.28+Math.random()*0.16);
      var top=foggy?(60+Math.random()*280):(10+Math.random()*180);
      var dur=foggy?(80+Math.random()*80):(38+Math.random()*52);
      var delay=-Math.random()*dur;
      var opacity=foggy?(0.35+Math.random()*0.25):dark?(0.7+Math.random()*0.2):(0.62+Math.random()*0.22);
      var blur=foggy?(8+Math.random()*14):dark?0:(Math.random()*3);
      var color=dark?('rgba(28,36,50,'+opacity+')')
               :foggy?('rgba(180,190,200,'+opacity+')')
               :('rgba(255,255,255,'+opacity+')');
      cl.style.cssText='width:'+w+'px;height:'+h+'px;top:'+top+'px;background:'+color
        +';animation-duration:'+dur+'s;animation-delay:'+delay+'s'
        +';filter:blur('+blur+'px);border-radius:60px;';
      // 입체감 - 퍼프 3개
      var p1w=h*1.7,p1h=h*1.7,p2w=h*1.3,p2h=h*1.3,p3w=h*1.1,p3h=h*1.1;
      cl.innerHTML=
        '<div style="position:absolute;width:'+p1w+'px;height:'+p1h+'px;background:'+color
        +';border-radius:50%;top:-'+(p1h*.52)+'px;left:'+(w*.14)+'px;"></div>'
        +'<div style="position:absolute;width:'+p2w+'px;height:'+p2h+'px;background:'+color
        +';border-radius:50%;top:-'+(p2h*.42)+'px;left:'+(w*.38)+'px;"></div>'
        +'<div style="position:absolute;width:'+p3w+'px;height:'+p3h+'px;background:'+color
        +';border-radius:50%;top:-'+(p3h*.32)+'px;left:'+(w*.62)+'px;"></div>';
      cw.appendChild(cl);
    }
  }

  // 안개 레이어
  fw.innerHTML='';
  if(key==='foggy'){
    for(var i=0;i<5;i++){
      var fb=document.createElement('div');
      fb.className='fog-band';
      var ftop=80+i*110,fdur=90+i*30,fop=0.12+i*0.04;
      fb.style.cssText='top:'+ftop+'px;opacity:'+fop+';animation-duration:'+fdur+'s;animation-delay:-'+(i*18)+'s;background:linear-gradient(transparent,rgba(200,210,215,0.9),transparent);';
      fw.appendChild(fb);
    }
  }

  // 번개
  if(ltTimer){clearInterval(ltTimer);ltTimer=null;}
  if(key==='storm'){
    ltTimer=setInterval(function(){
      if(Math.random()<0.32){
        var el=document.getElementById('lightning');
        var x=20+Math.random()*60;
        el.style.background='radial-gradient(ellipse at '+x+'% 0%,rgba(210,230,255,0.55) 0%,rgba(200,220,255,0.18) 40%,transparent 70%)';
        setTimeout(function(){
          el.style.background='rgba(200,220,255,0)';
          if(Math.random()<0.45){
            setTimeout(function(){
              el.style.background='radial-gradient(ellipse at '+x+'% 0%,rgba(210,230,255,0.38) 0%,transparent 60%)';
              setTimeout(function(){el.style.background='rgba(200,220,255,0)';},60);
            },90);
          }
        },80);
      }
    },2800);
  }
}

function startParticles(key){
  if(animFrame){cancelAnimationFrame(animFrame);animFrame=null;}
  var canvas=document.getElementById('bg-canvas'),ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth;canvas.height=window.innerHeight;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  var W=canvas.width,H=canvas.height,pts=[],t=0;

  if(key==='rain'||key==='drizzle'||key==='storm'){
    // 빗방울 - 길이/속도/굵기 다양화, 튀김 효과
    var cnt=key==='drizzle'?90:key==='storm'?280:200;
    var angle=key==='storm'?0.22:0.12;
    for(var i=0;i<cnt;i++){
      var spd=key==='drizzle'?(2.5+Math.random()*3):(9+Math.random()*12);
      pts.push({x:Math.random()*W,y:Math.random()*H,
        spd:spd,len:(key==='drizzle'?6:14)+Math.random()*12,
        op:0.12+Math.random()*0.3,w:key==='drizzle'?0.8:0.6+Math.random()*0.8,
        angle:angle});
    }
    var splashes=[];
    (function loop(){
      ctx.clearRect(0,0,W,H);
      // 빗줄기
      pts.forEach(function(p){
        ctx.beginPath();
        ctx.lineWidth=p.w;
        ctx.globalAlpha=p.op;
        ctx.strokeStyle=key==='storm'?'rgba(190,215,255,1)':'rgba(175,210,255,1)';
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-p.len*p.angle,p.y-p.len);
        ctx.stroke();
        p.y+=p.spd; p.x+=p.spd*p.angle;
        if(p.y>H){
          // 튀김 파티클 생성
          if(Math.random()<0.18&&key!=='drizzle'){
            for(var s=0;s<3;s++) splashes.push({x:p.x,y:H-2,vx:(Math.random()-0.5)*3,vy:-(1+Math.random()*2.5),life:1});
          }
          p.y=-20; p.x=Math.random()*W;
        }
      });
      // 튀김
      ctx.strokeStyle='rgba(200,230,255,0.55)';
      splashes=splashes.filter(function(s){
        ctx.globalAlpha=s.life*0.5;
        ctx.lineWidth=0.8;
        ctx.beginPath();ctx.moveTo(s.x,s.y);
        s.x+=s.vx;s.y+=s.vy;s.vy+=0.18;s.life-=0.06;
        ctx.lineTo(s.x,s.y);ctx.stroke();
        return s.life>0;
      });
      ctx.globalAlpha=1;
      animFrame=requestAnimationFrame(loop);
    })();

  }else if(key==='snow'){
    // 눈송이 - 크기/흔들림 다양화
    for(var i=0;i<160;i++){
      var r=0.8+Math.random()*3.5;
      pts.push({x:Math.random()*W,y:Math.random()*H,r:r,
        spd:0.3+r*0.35,dr:(Math.random()-.5)*0.3,
        op:0.4+Math.random()*0.55,a:Math.random()*Math.PI*2,
        wa:0.008+Math.random()*0.018,wamp:0.4+Math.random()*1.2});
    }
    (function loop(){
      ctx.clearRect(0,0,W,H);
      pts.forEach(function(p){
        // 눈송이 글로우
        var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.2);
        g.addColorStop(0,'rgba(255,255,255,'+p.op+')');
        g.addColorStop(1,'rgba(255,255,255,0)');
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2);
        ctx.fillStyle=g;ctx.fill();
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+(p.op*1.1)+')';ctx.fill();
        p.y+=p.spd; p.a+=p.wa; p.x+=Math.sin(p.a)*p.wamp;
        if(p.y>H+8){p.y=-8;p.x=Math.random()*W;}
      });
      animFrame=requestAnimationFrame(loop);
    })();

  }else if(key==='clearNight'||key==='deepNight'){
    // 별 - 크기별 분류, 유성 가끔
    for(var i=0;i<130;i++){
      pts.push({x:Math.random()*W,y:Math.random()*H*0.75,
        r:0.3+Math.random()*1.8,base:0.2+Math.random()*0.8,
        spd:0.006+Math.random()*0.022,off:Math.random()*Math.PI*2,type:'star'});
    }
    // 유성
    var meteor=null,meteorTimer=0;
    (function loop(){
      ctx.clearRect(0,0,W,H);
      t+=0.016;
      // 별
      pts.forEach(function(p){
        var op=p.base*(0.45+0.55*Math.sin(t*p.spd*60+p.off));
        var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.5);
        g.addColorStop(0,'rgba(255,252,220,'+op+')');
        g.addColorStop(1,'rgba(255,252,220,0)');
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2);
        ctx.fillStyle=g;ctx.fill();
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,240,'+op+')';ctx.fill();
      });
      // 유성
      meteorTimer++;
      if(!meteor&&meteorTimer>380&&Math.random()<0.018){
        meteor={x:Math.random()*W*0.6,y:Math.random()*H*0.3,vx:8+Math.random()*6,vy:4+Math.random()*4,life:1};
        meteorTimer=0;
      }
      if(meteor){
        var grad=ctx.createLinearGradient(meteor.x,meteor.y,meteor.x-meteor.vx*8,meteor.y-meteor.vy*8);
        grad.addColorStop(0,'rgba(255,255,220,'+(meteor.life*0.9)+')');
        grad.addColorStop(1,'rgba(255,255,220,0)');
        ctx.beginPath();ctx.moveTo(meteor.x,meteor.y);
        ctx.lineTo(meteor.x-meteor.vx*8,meteor.y-meteor.vy*8);
        ctx.strokeStyle=grad;ctx.lineWidth=1.5;
        ctx.globalAlpha=meteor.life;ctx.stroke();ctx.globalAlpha=1;
        meteor.x+=meteor.vx;meteor.y+=meteor.vy;meteor.life-=0.035;
        if(meteor.life<=0||meteor.x>W||meteor.y>H) meteor=null;
      }
      animFrame=requestAnimationFrame(loop);
    })();

  }else if(key==='sunrise'||key==='sunset'){
    // 노을 빛 입자
    for(var i=0;i<55;i++){
      pts.push({x:Math.random()*W,y:H*0.3+Math.random()*H*0.5,
        r:1+Math.random()*3,op:0.08+Math.random()*0.18,
        vx:(Math.random()-.5)*0.3,vy:-(0.1+Math.random()*0.25),
        life:Math.random(),decay:0.002+Math.random()*0.003,
        hue:key==='sunrise'?(30+Math.random()*40):(10+Math.random()*30)});
    }
    (function loop(){
      ctx.clearRect(0,0,W,H);
      pts.forEach(function(p){
        var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
        g.addColorStop(0,'hsla('+p.hue+',90%,75%,'+p.op*p.life+')');
        g.addColorStop(1,'hsla('+p.hue+',80%,65%,0)');
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2);
        ctx.fillStyle=g;ctx.fill();
        p.x+=p.vx;p.y+=p.vy;p.life-=p.decay;
        if(p.life<=0){
          p.x=Math.random()*W;p.y=H*0.3+Math.random()*H*0.5;
          p.life=0.6+Math.random()*0.4;
        }
      });
      animFrame=requestAnimationFrame(loop);
    })();

  }else if(key==='clearDay'){
    // 맑은 날 - 빛 먼지 입자
    for(var i=0;i<40;i++){
      pts.push({x:Math.random()*W,y:Math.random()*H*0.6,
        r:0.6+Math.random()*1.4,op:0.06+Math.random()*0.1,
        vx:(Math.random()-.5)*0.18,vy:-(0.05+Math.random()*0.12),
        life:Math.random(),decay:0.0015+Math.random()*0.002});
    }
    (function loop(){
      ctx.clearRect(0,0,W,H);
      pts.forEach(function(p){
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,250,220,'+(p.op*p.life)+')';ctx.fill();
        p.x+=p.vx;p.y+=p.vy;p.life-=p.decay;
        if(p.life<=0){p.x=Math.random()*W;p.y=Math.random()*H*0.6;p.life=0.7+Math.random()*0.3;}
      });
      animFrame=requestAnimationFrame(loop);
    })();
  }
}


window.LegacyTheme = { update: function(code,hour){ applyTheme(getThemeKey(code,hour)); }, key: function(){return currentKey;} };
window.addEventListener('resize',function(){ if(currentKey && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) startParticles(currentKey); });
}());
