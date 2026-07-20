(function(){
'use strict';
var status=document.getElementById('status');
fetch('app.js?v=7.1',{cache:'no-store'})
.then(function(response){if(!response.ok)throw new Error('app.js '+response.status);return response.text()})
.then(function(code){
var oldDistance="function labDistance(a,b){var dl=(a.l-b.l)*.45,da=a.a-b.a,db=a.b-b.b;return Math.sqrt(dl*dl+da*da+db*db)}";
var newDistance="function labDistance(a,b){var ab=a.labB===undefined?a.b:a.labB,bb=b.labB===undefined?b.b:b.labB,dl=(a.l-b.l)*.45,da=a.a-b.a,db=ab-bb;return Math.sqrt(dl*dl+da*da+db*db)}";
var oldMap="return merged.slice(0,6).map(function(c){return{l:c.l,a:c.a,b:c.b,r:c.r,g:c.g,b:c.bb,w:c.w}})";
var newMap="return merged.slice(0,6).map(function(c){return{l:c.l,a:c.a,labB:c.b,r:c.r,g:c.g,b:c.bb,w:c.w}})";
code=code.replace(oldDistance,newDistance).replace(oldMap,newMap);
var script=document.createElement('script');script.text=code;document.head.appendChild(script);
})
.catch(function(error){if(status)status.textContent='アプリの読み込みに失敗しました：'+error.message});
})();
