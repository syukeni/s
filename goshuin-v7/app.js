(function(){
'use strict';
var status=document.getElementById('status');
var parts=['app.00.txt','app.01.txt','app.02.txt','app.03.txt','app.04.txt'];

function setBootError(message){
  if(status)status.textContent=message;
}

Promise.all(parts.map(function(path){
  return fetch(path+'?v=7.4',{cache:'no-store'}).then(function(response){
    if(!response.ok)throw new Error(path+' '+response.status);
    return response.text();
  });
})).then(function(chunks){
  var code=chunks.join('');

  code=code.replace(
    "var source=null,events=[],clusters=[],paper={r:238,g:234,b:222},audioUrl='',songMeta=null,lastKey=-1,scanFrame=0,analyzeTimer=0,busy=false;",
    "var source=null,events=[],clusters=[],paper={r:238,g:234,b:222},sealModel=null,audioUrl='',songMeta=null,lastKey=-1,scanFrame=0,analyzeTimer=0,busy=false;"
  );

  var classifierPatch = String.raw`function distanceToSealLine(lab,paperLab,sealLab){
  var vl=sealLab.l-paperLab.l,va=sealLab.a-paperLab.a,vb=sealLab.b-paperLab.b;
  var wl=lab.l-paperLab.l,wa=lab.a-paperLab.a,wb=lab.b-paperLab.b;
  var len=vl*vl+va*va+vb*vb||1;
  var u=(wl*vl+wa*va+wb*vb)/len;
  var cu=clamp(u,0,1.35),dl=lab.l-(paperLab.l+vl*cu),da=lab.a-(paperLab.a+va*cu),db=lab.b-(paperLab.b+vb*cu);
  return{u:u,d:Math.sqrt(dl*dl+da*da+db*db)};
}
function estimateSealModel(image,paperLab){
  var w=image.width,h=image.height,data=image.data,step=Math.max(2,Math.floor(Math.sqrt(w*h/70000))),samples=[];
  for(var y=0;y<h;y+=step){
    for(var x=0;x<w;x+=step){
      var k=(y*w+x)*4,c=correctedRGB(data[k],data[k+1],data[k+2]),hsv=rgbToHsv(c.r,c.g,c.b),lab=rgbToLab(c.r,c.g,c.b),de=deltaE(lab,paperLab);
      var warm=hsv.h<48||hsv.h>330;
      if(warm&&hsv.s>.38&&de>17&&c.r>c.g*1.08&&c.r>c.b*1.05&&lab.l>18&&lab.l<88){
        samples.push({r:c.r,g:c.g,b:c.b,s:hsv.s,de:de});
      }
    }
  }
  if(samples.length<12)return null;
  samples.sort(function(a,b){return (b.s*b.de)-(a.s*a.de)});
  samples=samples.slice(0,Math.max(12,Math.floor(samples.length*.72)));
  var rs=[],gs=[],bs=[];for(var i=0;i<samples.length;i++){rs.push(samples[i].r);gs.push(samples[i].g);bs.push(samples[i].b)}
  var rgb={r:Math.round(median(rs)),g:Math.round(median(gs)),b:Math.round(median(bs))};
  return{rgb:rgb,lab:rgbToLab(rgb.r,rgb.g,rgb.b)};
}
function classifyPixel(r,g,b,paperLab,t){
  var c=correctedRGB(r,g,b),lab=rgbToLab(c.r,c.g,c.b),hsv=rgbToHsv(c.r,c.g,c.b);
  var de=deltaE(lab,paperLab),chroma=Math.sqrt(lab.a*lab.a+lab.b*lab.b),dark=paperLab.l-lab.l;
  var paperLike=(de<t.paper&&lab.l>paperLab.l-22)||(lab.l>94&&chroma<8);
  var ink=!paperLike&&(lab.l<32||(dark>26&&chroma<16)||(dark>36&&chroma<25&&hsv.s<.43));
  var canonicalRed=(hsv.h<29||hsv.h>337)&&hsv.s>Math.max(.13,t.sat*.72)&&c.r>c.g*1.035&&c.r>c.b*1.025;
  var sealBlend=false;
  if(sealModel&&!paperLike&&!ink){
    var line=distanceToSealLine(lab,paperLab,sealModel.lab);
    sealBlend=line.u>.075&&line.u<1.34&&line.d<(10.8+Math.max(0,.32-line.u)*5.5)&&hsv.s>.055&&c.r>=c.g*1.008&&c.r>=c.b*1.005;
  }
  var red=!paperLike&&!ink&&de>Math.max(7,t.de*.48)&&(canonicalRed||sealBlend);
  var warmPaperNoise=!red&&hsv.h>18&&hsv.h<78&&hsv.s<.34&&de<t.de+9;
  var color=!paperLike&&!ink&&!red&&!warmPaperNoise&&de>t.de+1.5&&chroma>t.chroma&&hsv.s>t.sat&&lab.l>14&&lab.l<95;
  return{paper:paperLike,ink:ink,red:red,color:color,lab:lab,hsv:hsv,r:c.r,g:c.g,b:c.b,de:de,chroma:chroma};
}
function sensitivityLabel`;

  code=code.replace(/function classifyPixel[\s\S]*?function sensitivityLabel/,classifierPatch);

  var paletteAndAnalyzePatch = String.raw`function updatePalette(items,hasInk,hasSeal){
  palette.replaceChildren();
  function addSwatch(rgb,name){
    var sw=document.createElement('button');sw.type='button';sw.tabIndex=-1;
    sw.style.background='rgb('+rgb.r+' '+rgb.g+' '+rgb.b+')';sw.setAttribute('aria-label',name);sw.title=name;palette.appendChild(sw);
  }
  if(hasInk)addSwatch({r:28,g:28,b:27},'墨');
  if(hasSeal)addSwatch(sealModel?sealModel.rgb:{r:218,g:63,b:42},'朱');
  for(var i=0;i<items.length;i++)addSwatch(items[i].rgb,items[i].name);
  paletteWrap.hidden=palette.children.length===0;
}

function analyze(){
  if(!source||busy)return;
  busy=true;generate.disabled=true;setStatus('用紙色・朱色・追加彩色を再解析しています…');
  setTimeout(function(){
    try{
      paper=estimatePaper(source);
      paperSwatch.style.background='rgb('+paper.r+' '+paper.g+' '+paper.b+')';paperLabel.textContent=paperDescription(paper)+' / RGB '+paper.r+', '+paper.g+', '+paper.b;
      var pc=correctedRGB(paper.r,paper.g,paper.b),paperLab=rgbToLab(pc.r,pc.g,pc.b),t=thresholds();
      sealModel=estimateSealModel(source,paperLab);
      var w=source.width,h=source.height,data=source.data,sampleStride=Math.max(2,Math.floor(Math.sqrt(w*h/120000))),colorPoints=[],sampled=0;
      for(var sy=0;sy<h;sy+=sampleStride){
        for(var sx=0;sx<w;sx+=sampleStride){
          sampled++;
          var sk=(sy*w+sx)*4,cl=classifyPixel(data[sk],data[sk+1],data[sk+2],paperLab,t);
          if(cl.color){
            var weight=clamp((cl.de-t.de)/20+.3,.18,2.2)*clamp(cl.chroma/35,.45,2);
            colorPoints.push({l:cl.lab.l,a:cl.lab.a,b:cl.lab.b,r:cl.r,g:cl.g,bb:cl.b,w:weight,x:sx/w,y:sy/h});
          }
        }
      }

      var rawClusters=colorPoints.length>=Math.max(20,Math.floor(sampled*.0008))?clusterColors(colorPoints):[];
      if(rawClusters.length){
        var support=new Uint32Array(rawClusters.length),cells=[];for(var ci0=0;ci0<rawClusters.length;ci0++)cells.push(Object.create(null));
        for(var cp=0;cp<colorPoints.length;cp++){
          var ni=nearestCenter(colorPoints[cp],rawClusters);support[ni]++;
          cells[ni][Math.floor(colorPoints[cp].x*10)+'-'+Math.floor(colorPoints[cp].y*10)]=1;
        }
        var minCoverage=.00065+(1-Number(colorSensitivity.value)/100)*.00115;
        clusters=rawClusters.filter(function(c,idx){
          var hsv=rgbToHsv(c.rgb.r,c.rgb.g,c.rgb.b),lab={l:c.l,a:c.a,b:c.b},nearPaper=deltaE(lab,paperLab)<t.de+5;
          var canonicalSeal=(hsv.h<36||hsv.h>333)&&hsv.s>.14&&c.rgb.r>c.rgb.g*1.025;
          var sealFamily=false;
          if(sealModel){var line=distanceToSealLine(lab,paperLab,sealModel.lab);sealFamily=line.u>.06&&line.u<1.38&&line.d<13.2&&hsv.s>.045;}
          var cellCount=Object.keys(cells[idx]).length;
          return support[idx]>=Math.max(14,Math.floor(sampled*minCoverage))&&cellCount>=2&&!nearPaper&&!canonicalSeal&&!sealFamily&&hsv.s>.16;
        });
      }else clusters=[];

      var count=Number(steps.value),slice=w/count,stride=Math.max(1,Math.floor(Math.min(w,h)/420)),out=[],notes=0,repeats=0,seals=0,colorSlices=0;
      for(var s=0;s<count;s++){
        var x0=Math.floor(s*slice),x1=Math.min(w,Math.ceil((s+1)*slice));
        var all=0,ink=0,red=0,color=0,weightedY=0,inkWeight=0,clusterWeights=new Float64Array(Math.max(1,clusters.length)),satSum=0;
        for(var y=0;y<h;y+=stride){
          for(var x=x0;x<x1;x+=stride){
            var k=(y*w+x)*4,c=classifyPixel(data[k],data[k+1],data[k+2],paperLab,t);all++;
            if(c.red)red++;
            if(c.color&&clusters.length){
              var ci=nearestCenter({l:c.lab.l,a:c.lab.a,b:c.lab.b},clusters),distance=colorDistance({l:c.lab.l,a:c.lab.a,b:c.lab.b},clusters[ci]);
              if(distance<520){color++;satSum+=c.hsv.s;clusterWeights[ci]+=clamp(c.chroma/30,.3,2)}
            }
            if(c.ink){var deep=clamp((paperLab.l-c.lab.l)/65,.06,1);ink++;inkWeight+=deep;weightedY+=y*deep}
          }
        }
        var inkRatio=ink/Math.max(1,all),redRatio=red/Math.max(1,all),colorRatio=color/Math.max(1,all),has=inkRatio>.003&&inkWeight>0;
        var yPos=has?weightedY/inkWeight:h/2,degree=clamp(Math.round((1-yPos/h)*18),0,18);
        var dominant=0,domWeight=0;for(var cw=0;cw<clusterWeights.length;cw++)if(clusterWeights[cw]>domWeight){domWeight=clusterWeights[cw];dominant=cw}
        var colorAccent=colorRatio>.0015&&domWeight>.1&&clusters.length>0,repeat=has&&inkRatio>.043,seal=redRatio>.0024;
        var hue=colorAccent?clusters[dominant].h:0,colorDegree=colorAccent?clamp(Math.floor(((hue+12)%360)/360*7),0,6):0;
        out.push({degree:degree,has:has,volume:clamp(.38+inkRatio*4.8,.38,.95),repeat:repeat,seal:seal,density:inkRatio,x:s/(count-1||1),color:colorAccent,hue:hue,colorDegree:colorDegree,colorRatio:colorRatio,colorStrength:clamp(colorRatio*9+(satSum/Math.max(1,color))*.28,.18,.95),cluster:dominant});
        if(has)notes++;if(repeat)repeats++;if(seal)seals++;if(colorAccent)colorSlices++;
      }
      events=out;
      var baseColors=(notes>0?1:0)+(seals>0?1:0),totalColors=baseColors+clusters.length;
      updatePalette(clusters,notes>0,seals>0);
      $('nNotes').textContent=notes+'音';$('nRepeat').textContent=repeats+'か所';$('nSeal').textContent=seals+'か所';$('nColor').textContent=totalColors+'色';
      analysisLabel.textContent=count+' SLICES / '+totalColors+' COLORS';generate.disabled=false;
      if(showMask.checked)renderMask();else{maskCanvas.hidden=true;maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height)}
      var baseNames=[];if(notes>0)baseNames.push('墨');if(seals>0)baseNames.push('朱');
      setStatus('使用色は'+totalColors+'色'+(baseNames.length?'（'+baseNames.join('・')+(clusters.length?'＋追加彩色'+clusters.length+'色':'')+'）':'')+'として読み取りました。');
    }catch(err){setStatus('解析エラー：'+safeError(err));events=[]}
    busy=false;generate.disabled=!events.length;
  },24);
}
function renderMask`;

  code=code.replace(/function updatePalette[\s\S]*?function renderMask/,paletteAndAnalyzePatch);

  if(code.indexOf('estimateSealModel')<0||code.indexOf('使用色は')<0){
    throw new Error('彩色判定パッチを適用できませんでした');
  }

  var label=document.querySelector('.palette-label');if(label)label.textContent='使用色';
  var colorStat=document.getElementById('nColor');if(colorStat&&colorStat.parentElement)colorStat.parentElement.firstChild.nodeValue='使用色';
  var note=document.querySelector('.note');if(note)note.textContent='朱色の濃淡、紙との境界の桃色・橙色、JPEGのにじみは同じ「朱」としてまとめます。追加の青・緑・紫・金などだけを装飾音にします。';
  var footer=document.querySelector('.footer');if(footer)footer.textContent='御朱印オルゴール v7.4 — seal-aware color detection / local-only processing';

  var blob=new Blob([code],{type:'text/javascript'});
  var url=URL.createObjectURL(blob);
  var script=document.createElement('script');
  script.src=url;
  script.onload=function(){URL.revokeObjectURL(url)};
  script.onerror=function(){URL.revokeObjectURL(url);setBootError('彩色解析プログラムを起動できませんでした。ページを再読み込みしてください。')};
  document.head.appendChild(script);
}).catch(function(error){
  setBootError('彩色解析プログラムの読み込みに失敗しました：'+String(error.message||error).slice(0,160));
});
})();
