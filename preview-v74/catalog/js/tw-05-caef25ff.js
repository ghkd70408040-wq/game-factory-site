
(function(){var k=new URLSearchParams(location.search).get('bg');if(!k)return;
fetch('catalog/manifest.json').then(function(r){return r.json();}).then(function(m){
var f=m&&m[k]&&m[k].file;if(!f)return;var s=document.createElement('style');
s.textContent='#screen-menu::before,#screen-menu.is-night::before{background-image:url("catalog/'+f+'")!important;background-size:cover!important;background-position:center center!important;background-repeat:no-repeat!important;}';
document.head.appendChild(s);}).catch(function(){});})();
