(function(){
'use strict';
var status=document.getElementById('status');
var parts=['app.00.txt','app.01.txt','app.02.txt','app.03.txt','app.04.txt'];
Promise.all(parts.map(function(path){
  return fetch(path+'?v=7.3',{cache:'no-store'}).then(function(response){
    if(!response.ok)throw new Error(path+' '+response.status);
    return response.text();
  });
})).then(function(chunks){
  var blob=new Blob(chunks,{type:'text/javascript'});
  var url=URL.createObjectURL(blob);
  var script=document.createElement('script');
  script.src=url;
  script.onload=function(){URL.revokeObjectURL(url)};
  script.onerror=function(){URL.revokeObjectURL(url);if(status)status.textContent='彩色解析プログラムを起動できませんでした。ページを再読み込みしてください。'};
  document.head.appendChild(script);
}).catch(function(error){
  if(status)status.textContent='彩色解析プログラムの読み込みに失敗しました：'+String(error.message||error).slice(0,160);
});
})();
