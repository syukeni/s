(function(){
'use strict';
function $(id){return document.getElementById(id)}
var file=$('file'),fileName=$('fileName'),steps=$('steps'),bpm=$('bpm'),mechanism=$('mechanism');
var generate=$('generate'),test=$('test'),listen=$('listen'),audio=$('audio'),download=$('download');
var status=$('status'),canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
var empty=$('empty'),scan=$('scan'),previewCard=$('previewCard'),analysisLabel=$('analysisLabel'),palette=$('palette'),dropZone=$('dropZone');
var source=null,events=[],audioUrl='',songMeta=null,lastKey=-1,scanFrame=0,paletteHues=[];
var ROOT_NAMES=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
var MAJOR=[0,2,4,5,7,9,11],MINOR=[0,2,3,5,7,8,10];

function setStatus(text){status.textContent=text}
function clamp(x,a,b){return Math.min(b,Math.max(a,x))}
function hz(midi){return 440*Math.pow(2,(midi-69)/12)}
function rgbToHsv(r,g,b){
  r/=255;g/=255;b/=255;var max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0;
  if(d!==0){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
  if(h<0)h+=360;return{h:h,s:max===0?0:d/max,v:max};
}
function hueDistance(a,b){var d=Math.abs(a-b)%360;return Math.min(d,360-d)}
function updatePalette(hues){
  palette.innerHTML='';paletteHues=hues.slice(0,6);
  for(var i=0;i<paletteHues.length;i++){var sw=document.createElement('span');sw.style.background='hsl('+Math.round(paletteHues[i])+' 72% 54%)';sw.title=Math.round(paletteHues[i])+'°';palette.appendChild(sw)}
  palette.classList.toggle('visible',paletteHues.length>0);
}
function random01(){
  if(window.crypto&&window.crypto.getRandomValues){var a=new Uint32Array(1);window.crypto.getRandomValues(a);return a[0]/4294967296}
  return Math.random()
}
function seeded(seed){var x=seed|0;return function(){x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)/4294967296)}}
function ascii(view,offset,text){for(var i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))}
function wavStereo(left,right,sr){
  var length=Math.min(left.length,right.length),buffer=new ArrayBuffer(44+length*4),view=new DataView(buffer);
  ascii(view,0,'RIFF');view.setUint32(4,36+length*4,true);ascii(view,8,'WAVE');ascii(view,12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sr,true);
  view.setUint32(28,sr*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);ascii(view,36,'data');view.setUint32(40,length*4,true);
  for(var i=0;i<length;i++){
    var l=clamp(left[i],-1,1),r=clamp(right[i],-1,1),o=44+i*4;
    view.setInt16(o,l<0?l*32768:l*32767,true);view.setInt16(o+2,r<0?r*32768:r*32767,true);
  }
  return new Blob([buffer],{type:'audio/wav'});
}
function mixSample(left,right,index,value,pan){
  if(index<0||index>=left.length)return;
  var angle=(clamp(pan,-1,1)+1)*Math.PI/4;
  left[index]+=value*Math.cos(angle);right[index]+=value*Math.sin(angle);
}
function addMusicBox(left,right,sr,start,midi,volume,pan,seed,duration){
  var begin=Math.floor(start*sr),end=Math.min(left.length,begin+Math.floor(duration*sr)),f=hz(midi),rnd=seeded(seed);
  var partials=[1,2.008,2.97,4.075,5.42,6.76],amps=[1,.48,.24,.12,.068,.036],decays=[1.12,.72,.48,.34,.25,.2];
  var phases=[];for(var p=0;p<partials.length;p++)phases.push(rnd()*Math.PI*2);
  for(var i=begin;i<end;i++){
    var t=(i-begin)/sr,attack=Math.min(1,t/.0018),body=Math.exp(-t/1.05)+.18*Math.exp(-t/2.6),s=0;
    var flutter=.012*Math.sin(2*Math.PI*5.1*t+phases[0])+.005*Math.sin(2*Math.PI*8.7*t+phases[1]);
    for(var j=0;j<partials.length;j++){
      s+=Math.sin(2*Math.PI*f*partials[j]*t+phases[j]+flutter*partials[j])*amps[j]*Math.exp(-t/decays[j]);
    }
    s+=.11*Math.sin(2*Math.PI*(f*.503)*t+phases[2])*Math.exp(-t/.42);
    if(t<.016)s+=(rnd()*2-1)*(.12*(1-t/.016));
    mixSample(left,right,i,s*attack*body*volume*.19,pan);
  }
}
function addClick(left,right,sr,start,volume,pan,seed){
  var begin=Math.floor(start*sr),end=Math.min(left.length,begin+Math.floor(.04*sr)),rnd=seeded(seed);
  for(var i=begin;i<end;i++){
    var t=(i-begin)/sr,e=Math.exp(-t/0.006),noise=(rnd()*2-1)*.55,tone=Math.sin(2*Math.PI*1850*t)*.45;
    mixSample(left,right,i,(noise+tone)*e*volume,pan);
  }
}
function addWindUp(left,right,sr,amount,seed){
  if(amount<=0)return;
  var rnd=seeded(seed),t=.08;
  while(t<1.34){addClick(left,right,sr,t,.045+amount*.11,-.28+rnd()*.55,seed+Math.floor(t*10000));t+=.105-rnd()*.035}
  var end=Math.min(left.length,Math.floor(1.5*sr));
  for(var i=0;i<end;i++){
    var x=i/sr,e=Math.sin(Math.PI*clamp(x/1.48,0,1)),whirr=Math.sin(2*Math.PI*(74+38*x)*x)*.018+(rnd()*2-1)*.008;
    mixSample(left,right,i,whirr*e*amount,0);
  }
}
function addMechanismBed(left,right,sr,start,end,stepSec,amount,seed){
  if(amount<=0)return;
  var rnd=seeded(seed),t=start;
  while(t<end){
    addClick(left,right,sr,t,.012+amount*.035,-.35+rnd()*.7,seed+Math.floor(t*1000));
    t+=stepSec*(.98+(rnd()-.5)*.035);
  }
  var a=Math.floor(start*sr),z=Math.min(left.length,Math.floor(end*sr));
  for(var i=a;i<z;i++){
    var x=(i-a)/sr,slow=.0045*Math.sin(2*Math.PI*2.15*x)+(rnd()*2-1)*.0017;
    mixSample(left,right,i,slow*amount,0);
  }
}
function normalize(left,right){
  var peak=.0001,i;for(i=0;i<left.length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  var gain=Math.min(1.8,.91/peak);for(i=0;i<left.length;i++){left[i]=Math.tanh(left[i]*gain);right[i]=Math.tanh(right[i]*gain)}
}
function chooseKey(){
  var pc=Math.floor(random01()*12);if(pc===lastKey)pc=(pc+1+Math.floor(random01()*11))%12;lastKey=pc;
  var minor=random01()<.4,intervals=minor?MINOR:MAJOR;
  var base=60+pc;while(base<64)base+=12;while(base>71)base-=12;
  var notes=[];for(var oct=0;oct<3;oct++){for(var i=0;i<intervals.length;i++)notes.push(base+intervals[i]+oct*12)}
  return{pc:pc,minor:minor,intervals:intervals,base:base,notes:notes,name:ROOT_NAMES[pc]+(minor?' minor':' major'),jp:ROOT_NAMES[pc]+(minor?'短調':'長調')};
}
function useBlob(blob,name,meta){
  if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);songMeta=meta||null;
  audio.pause();audio.src=audioUrl;audio.load();download.href=audioUrl;download.download=name;download.hidden=false;listen.disabled=false;
  setStatus('音声ができました。黒い「できた曲を再生」を押してください。');
}
function makeTest(){
  setStatus('オルゴールの音色を作っています…');
  var sr=32000,duration=7,left=new Float32Array(sr*duration),right=new Float32Array(sr*duration),amount=Number(mechanism.value)/100;
  addWindUp(left,right,sr,amount,1097);var notes=[72,76,79,84,79,76,72];
  for(var i=0;i<notes.length;i++)addMusicBox(left,right,sr,1.45+i*.58,notes[i],.88,(i/(notes.length-1)-.5)*.45,400+i,3.1);
  addMechanismBed(left,right,sr,1.43,6.1,.58,amount,714);normalize(left,right);
  $('keyName').textContent='C長調・音色サンプル';useBlob(wavStereo(left,right,sr),'musicbox-sound-test.wav',{intro:1.45,length:4.2});
}
function analyze(){
  if(!source)return;
  var w=source.width,h=source.height,data=source.data,count=Number(steps.value),slice=w/count;
  var stride=Math.max(1,Math.floor(Math.min(w,h)/360)),out=[],notes=0,repeats=0,seals=0;
  var hueBins=new Float64Array(12),colorSlices=0;
  for(var s=0;s<count;s++){
    var x0=Math.floor(s*slice),x1=Math.min(w,Math.ceil((s+1)*slice));
    var all=0,ink=0,red=0,color=0,weightedY=0,weight=0,hx=0,hy=0,colorWeight=0,satSum=0;
    for(var y=0;y<h;y+=stride){
      for(var x=x0;x<x1;x+=stride){
        var k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2],brightness=(.299*r+.587*g+.114*b)/255,hsv=rgbToHsv(r,g,b);
        var chromatic=hsv.s>.24&&hsv.v>.16&&hsv.v<.985;
        var isRed=chromatic&&(hueDistance(hsv.h,0)<27||hueDistance(hsv.h,355)<22)&&r>65;
        var isColor=chromatic&&!isRed&&brightness>.18;
        var isInk=!isRed&&!isColor&&(brightness<.69||(brightness<.34&&hsv.s<.5));
        all++;
        if(isRed)red++;
        if(isColor){
          var cw=Math.max(.05,hsv.s)*Math.max(.15,1-Math.abs(hsv.v-.62));
          color++;colorWeight+=cw;satSum+=hsv.s;hx+=Math.cos(hsv.h*Math.PI/180)*cw;hy+=Math.sin(hsv.h*Math.PI/180)*cw;
          hueBins[Math.floor(((hsv.h+15)%360)/30)]+=cw;
        }
        if(isInk){var deep=clamp((.84-brightness)/.74,.06,1);ink++;weight+=deep;weightedY+=y*deep}
      }
    }
    var inkRatio=ink/Math.max(1,all),redRatio=red/Math.max(1,all),colorRatio=color/Math.max(1,all),has=inkRatio>.003&&weight>0;
    var yPos=has?weightedY/weight:h/2,degree=clamp(Math.round((1-yPos/h)*18),0,18);
    var hue=colorWeight>0?(Math.atan2(hy,hx)*180/Math.PI+360)%360:0;
    var colorDegree=clamp(Math.floor(((hue+12)%360)/360*7),0,6),colorAccent=colorRatio>.0018&&colorWeight>.18;
    var repeat=has&&inkRatio>.043,seal=redRatio>.0024;
    out.push({degree:degree,has:has,volume:clamp(.38+inkRatio*4.8,.38,.95),repeat:repeat,seal:seal,density:inkRatio,x:s/(count-1||1),color:colorAccent,hue:hue,colorDegree:colorDegree,colorRatio:colorRatio,colorStrength:clamp(colorRatio*8+(satSum/Math.max(1,color))*.32,.18,.95)});
    if(has)notes++;if(repeat)repeats++;if(seal)seals++;if(colorAccent)colorSlices++;
  }
  var ranked=[];for(var bi=0;bi<hueBins.length;bi++)if(hueBins[bi]>.12)ranked.push({h:bi*30,w:hueBins[bi]});
  ranked.sort(function(a,b){return b.w-a.w});
  var selected=[];for(var ri=0;ri<ranked.length&&selected.length<6;ri++){var ok=true;for(var rj=0;rj<selected.length;rj++)if(hueDistance(selected[rj],ranked[ri].h)<28)ok=false;if(ok)selected.push(ranked[ri].h)}
  updatePalette(selected);
  events=out;$('nNotes').textContent=notes+'音';$('nRepeat').textContent=repeats+'か所';$('nSeal').textContent=seals+'か所';$('nColor').textContent=(selected.length||colorSlices?Math.max(selected.length,1):0)+'色';
  analysisLabel.textContent=count+' SLICES / '+selected.length+' COLORS';generate.disabled=false;setStatus('色彩を含めて読み取り完了。赤いボタンで曲を作れます。');
}
function makeSong(){
  if(!events.length){setStatus('先に御朱印の写真を選んでください。');return}
  generate.disabled=true;listen.disabled=true;setStatus('金属の櫛歯とゼンマイ音を合成しています…');previewCard.classList.add('playing');
  setTimeout(function(){
    try{
      var key=chooseKey(),sr=32000,stepSec=60/Number(bpm.value)/2,intro=1.48,tail=3.4;
      var duration=intro+events.length*stepSec+tail,left=new Float32Array(Math.ceil(duration*sr)),right=new Float32Array(Math.ceil(duration*sr));
      var mech=Number(mechanism.value)/100,seed=Math.floor(random01()*2147483000),previous=null,sealIndex=0;
      addWindUp(left,right,sr,mech,seed+7);
      for(var i=0;i<events.length;i++){
        var e=events[i],t=intro+i*stepSec+(random01()-.5)*stepSec*.035;
        if(e.has){
          var idx=clamp(e.degree,0,key.notes.length-1),midi=key.notes[idx];
          if(previous!==null&&Math.abs(midi-previous)>10){while(midi-previous>9)midi-=12;while(previous-midi>9)midi+=12}
          previous=midi;
          addMusicBox(left,right,sr,t,midi,e.volume,(e.x-.5)*.55,seed+i*31,3.4);
          if(e.repeat)addMusicBox(left,right,sr,t+stepSec*.42,midi+((i%3===0)?2:0),e.volume*.48,(e.x-.5)*.48,seed+i*31+3,2.4);
        }
        if(e.color){
          var colorMidi=key.base+key.intervals[e.colorDegree%7]+12;while(colorMidi>91)colorMidi-=12;
          var colorPan=clamp((e.hue/360-.5)*1.3,-.72,.72),colorVol=.16+e.colorStrength*.26;
          addMusicBox(left,right,sr,t+stepSec*.18,colorMidi,colorVol,colorPan,seed+2200+i*17,2.5);
          if(e.colorRatio>.024)addMusicBox(left,right,sr,t+stepSec*.55,colorMidi+((e.colorDegree%2)?3:4),colorVol*.52,-colorPan*.55,seed+2300+i*19,1.9);
        }
        if(e.seal){
          var degreeRoot=(sealIndex%2===0)?0:4,root=48+key.pc+key.intervals[degreeRoot%7];while(root>58)root-=12;
          var triad=key.minor?[0,3,7]:[0,4,7];
          for(var c=0;c<triad.length;c++)addMusicBox(left,right,sr,t,root+triad[c],.35,-.12+c*.12,seed+900+i*11+c,3.8);
          sealIndex++;
        }
      }
      var cadence=intro+events.length*stepSec+.15,finalRoot=60+key.pc;while(finalRoot<64)finalRoot+=12;while(finalRoot>72)finalRoot-=12;
      addMusicBox(left,right,sr,cadence,finalRoot,.88,0,seed+4000,3.8);
      addMusicBox(left,right,sr,cadence,finalRoot+7,.48,.13,seed+4001,3.3);
      addMechanismBed(left,right,sr,intro,cadence+1.2,stepSec,mech,seed+88);
      normalize(left,right);
      $('keyName').textContent=key.jp+' / '+key.name;analysisLabel.textContent=key.name.toUpperCase()+' / '+events.length+' STEPS';
      useBlob(wavStereo(left,right,sr),'goshuin-musicbox-'+key.name.replace(' ','-')+'.wav',{intro:intro,length:events.length*stepSec+1.3});
    }catch(err){setStatus('生成エラー：'+err.message)}
    generate.disabled=false;previewCard.classList.remove('playing');
  },35);
}
function loadImage(selected){
  if(!selected)return;
  var lower=(selected.name||'').toLowerCase(),looksImage=!selected.type||selected.type.indexOf('image/')===0||/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(lower);
  if(!looksImage){setStatus('画像ファイルを選んでください。');return}
  fileName.textContent=selected.name;setStatus('写真を読み込んでいます…');
  var url=URL.createObjectURL(selected),img=new Image();
  img.onload=function(){
    var ratio=Math.min(1200/img.naturalWidth,1600/img.naturalHeight,1);
    canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    source=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.hidden=false;empty.hidden=true;URL.revokeObjectURL(url);analyze();
  };
  img.onerror=function(){URL.revokeObjectURL(url);setStatus('画像を開けませんでした。端末でJPEG・PNG・WebPに変換して試してください。')};img.decoding='async';img.src=url;
}
function startScan(){
  cancelAnimationFrame(scanFrame);scan.classList.add('active');previewCard.classList.add('playing');
  function frame(){
    if(audio.paused||audio.ended){scan.classList.remove('active');previewCard.classList.remove('playing');return}
    var intro=songMeta?songMeta.intro:0,length=songMeta?songMeta.length:Math.max(1,audio.duration);
    var p=clamp((audio.currentTime-intro)/Math.max(.1,length),0,1);scan.style.left=(p*100)+'%';scanFrame=requestAnimationFrame(frame);
  }frame();
}
['dragenter','dragover'].forEach(function(type){dropZone.addEventListener(type,function(e){e.preventDefault();e.stopPropagation();dropZone.classList.add('dragover')})});
['dragleave','drop'].forEach(function(type){dropZone.addEventListener(type,function(e){e.preventDefault();e.stopPropagation();dropZone.classList.remove('dragover')})});
dropZone.addEventListener('drop',function(e){var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadImage(f)});
dropZone.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click()}});
file.addEventListener('change',function(){loadImage(file.files&&file.files[0])});
steps.addEventListener('input',function(){$('stepsOut').textContent=steps.value;if(source)analyze()});
bpm.addEventListener('input',function(){$('bpmOut').textContent=bpm.value});
mechanism.addEventListener('input',function(){$('mechanismOut').textContent=mechanism.value});
test.addEventListener('click',makeTest);generate.addEventListener('click',makeSong);
listen.addEventListener('click',function(){
  if(!audio.src){setStatus('先に音声を作ってください。');return}
  audio.play().then(function(){setStatus('再生中です。');startScan()}).catch(function(){setStatus('下の標準プレーヤーの「▶︎」を押してください。')});
});
audio.addEventListener('play',startScan);audio.addEventListener('pause',function(){scan.classList.remove('active');previewCard.classList.remove('playing')});
audio.addEventListener('ended',function(){scan.classList.remove('active');previewCard.classList.remove('playing');scan.style.left='0%'});
window.addEventListener('error',function(e){setStatus('エラー：'+e.message)});
})();
