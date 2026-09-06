/* board.js — 창고 격자 렌더 + 필터 (board-data.json 읽기) */
(function(){
  var ROLE_ORDER = ["판","캡슐","버튼","그림버튼","칩·방울","슬롯","탭","바·게이지",
                    "X","배지","아이콘","제목그림","전신·초상","배경","기타"];
  var state = { role:"전체", viol:false, unused:false };

  function frameTag(c){
    if(c.viol) return '<span class="st r">위반</span>';
    return '<span class="st g">준수</span>';
  }
  function usedTag(c){
    return c.used ? '' : '<span class="st y">미사용</span>';
  }
  function tile(c){
    return '<div class="tile">'
      + '<div class="stage"><img loading="lazy" src="'+c.img+'" alt="'+c.stem+'"></div>'
      + '<div class="lab"><div class="pn">'+c.stem+'</div>'
      + '<div class="fn">'+c.w+'×'+c.h+' · '+c.kb+'KB</div>'
      + '<div class="row2">'+frameTag(c)+usedTag(c)
      + '<span class="vd">'+c.verdict+'</span></div></div></div>';
  }

  function render(data){
    var host = document.getElementById('grid');
    var items = data.catalog.filter(function(c){
      if(state.role!=="전체" && c.role!==state.role) return false;
      if(state.viol && !c.viol) return false;
      if(state.unused && c.used) return false;
      return true;
    });
    // group by role
    var byRole = {};
    items.forEach(function(c){ (byRole[c.role]=byRole[c.role]||[]).push(c); });
    var html='';
    ROLE_ORDER.forEach(function(r){
      var g = byRole[r]; if(!g||!g.length) return;
      html += '<div class="rolehead">'+r+' <span class="n">'+g.length+'</span></div>';
      g.forEach(function(c){ html += tile(c); });
    });
    host.innerHTML = html || '<div style="color:var(--dim);padding:30px">해당 없음</div>';
    document.getElementById('count').textContent = items.length + ' / ' + data.catalog.length;
  }

  function buildFilters(data){
    var f = document.getElementById('filters');
    var roles = ["전체"].concat(ROLE_ORDER.filter(function(r){
      return data.catalog.some(function(c){return c.role===r;});
    }));
    var html='';
    roles.forEach(function(r){
      html += '<button data-role="'+r+'" class="'+(r==="전체"?"on":"")+'">'+r+'</button>';
    });
    html += '<span class="sep"></span>';
    html += '<button id="f-viol">위반만</button><button id="f-unused">미사용만</button>';
    f.innerHTML = html;
    f.querySelectorAll('[data-role]').forEach(function(b){
      b.onclick=function(){
        state.role=b.getAttribute('data-role');
        f.querySelectorAll('[data-role]').forEach(function(x){x.classList.remove('on');});
        b.classList.add('on'); render(data);
      };
    });
    document.getElementById('f-viol').onclick=function(){
      state.viol=!state.viol; this.classList.toggle('on',state.viol); render(data);
    };
    document.getElementById('f-unused').onclick=function(){
      state.unused=!state.unused; this.classList.toggle('on',state.unused); render(data);
    };
  }

  fetch('board-data.json').then(function(r){return r.json();}).then(function(data){
    // tallies
    var t=document.getElementById('tally');
    if(t){
      var v=data.catalog.filter(function(c){return c.viol;}).length;
      var u=data.catalog.filter(function(c){return !c.used;}).length;
      t.innerHTML='총 <b>'+data.catalog.length+'</b> · 위반 <b>'+v+'</b> · 미사용 <b>'+u+'</b>';
    }
    buildFilters(data); render(data);
  }).catch(function(e){
    document.getElementById('grid').innerHTML='<div style="color:var(--r);padding:30px">board-data.json 로드 실패: '+e+'</div>';
  });
})();
