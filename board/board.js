/* board.js v2.1 — 타일 이미지 = site/catalog 원본 webp 그대로(jpg 사본 폐기) · 창고 선반 = 계층 T1~T5 → 역할 순 · 칸마다 준수/위반/미사용 + 프레임 수 */
(function(){
  /* 정본 GAME-FACTORY-STANDARD.md §1 — 에셋 5계층 */
  var TIERS = [
    { id:"T1", name:"화면", desc:"레이아웃 격자 + 배경", roles:["배경"] },
    { id:"T2", name:"컨테이너", desc:"판 · 카드 · 바 · 캡슐 · 탭 판", roles:["판","캡슐","바·게이지"] },
    { id:"T3", name:"제어", desc:"버튼 · 탭 · 토글 · 슬롯 · 칩 · 게이지 틀 · X", roles:["버튼","그림버튼","탭","토글","슬롯","칩·방울","X"] },
    { id:"T4", name:"내용물", desc:"제목 그림 · 글자 · 숫자 · 아이콘 · 초상 · 배지", roles:["제목그림","아이콘","배지","전신·초상"] },
    { id:"T5", name:"효과", desc:"재질 광 · 림 · 접지 · 반짝이 · 파티클", roles:["효과"] },
    { id:"—",  name:"미분류", desc:"계층 미지정 — 분류 필요", roles:["기타"] }
  ];
  var ROLE_TIER = {};
  TIERS.forEach(function(t){ t.roles.forEach(function(r){ ROLE_TIER[r]=t; }); });

  var state = { role:"전체", tier:"전체", viol:false, unused:false };
  var KIT = document.body && document.body.classList.contains('kit-page');

  function tierBadge(t){ return '<span class="tier tier-'+(t.id==="—"?"none":t.id.toLowerCase())+'">'+t.id+'</span>'; }

  function tile(c){
    var t = ROLE_TIER[c.role] || TIERS[TIERS.length-1];
    return '<div class="part'+(KIT?(c.viol?' is-partial':' is-live'):'')+'" title="'+t.id+' · '+c.w+'×'+c.h+' · '+c.kb+'KB · '+(c.viol?'위반':'준수')+(c.used?'':' · 미사용')+' · '+c.verdict+'">'
      + '<div class="part-stage"><img class="frame-file" loading="lazy" src="../catalog/'+c.stem+'.webp" alt="'+c.stem+'"></div>'
      + (KIT
        ? '<div class="part-label"><div class="part-name">'+c.role+'</div></div></div>'
        : '<div class="part-label"><div class="part-name">'+c.stem+'</div>'
      + '<div class="part-file">'+t.id+' · '+c.w+'×'+c.h+' · '+c.kb+'KB</div>'
      + '<div class="part-tags">'
      + (c.viol ? '<span class="state state-none">위반</span>' : '<span class="state state-ok">준수</span>')
      + (c.used ? '' : '<span class="state state-partial">미사용</span>')
      + '<span class="tag">'+c.verdict+'</span></div></div></div>');
  }

  function counts(list){
    var v=0,u=0;
    list.forEach(function(c){ if(c.viol)v++; if(!c.used)u++; });
    return { n:list.length, viol:v, ok:list.length-v, unused:u };
  }
  function tallyHtml(k){
    return '<span class="state state-ok">준수 '+k.ok+'</span> <span class="state state-none">위반 '+k.viol+'</span> '
         + '<span class="state state-partial">미사용 '+k.unused+'</span>';
  }

  function render(data){
    var host = document.getElementById('grid');
    var items = data.catalog.filter(function(c){
      var t = ROLE_TIER[c.role] || TIERS[TIERS.length-1];
      if(state.tier!=="전체" && t.id!==state.tier) return false;
      if(state.role!=="전체" && c.role!==state.role) return false;
      if(state.viol && !c.viol) return false;
      if(state.unused && c.used) return false;
      return true;
    });
    var byRole = {};
    items.forEach(function(c){ (byRole[c.role]=byRole[c.role]||[]).push(c); });

    var html='';
    TIERS.forEach(function(t){
      var inTier = [];
      t.roles.forEach(function(r){ if(byRole[r]) inTier = inTier.concat(byRole[r]); });
      if(!inTier.length) return;
      var kt = counts(inTier);
      html += '<div class="shelf-tier">'+tierBadge(t)
            + '<span class="shelf-name">'+t.name+'</span>'
            + '<span class="shelf-desc">'+t.desc+'</span>'
            + (KIT ? '' : '<span class="shelf-tally">프레임 '+kt.n+' · 준수 '+kt.ok+' · 위반 '+kt.viol+' · 미사용 '+kt.unused+'</span>')+'</div>';
      t.roles.forEach(function(r){
        var g = byRole[r]; if(!g||!g.length) return;
        var k = counts(g);
        html += '<div class="shelf-role">'+r+(KIT ? '' : ' <span class="count">프레임 '+k.n+'</span> '+tallyHtml(k))+'</div>';
        g.forEach(function(c){ html += tile(c); });
      });
    });
    host.innerHTML = html || '<div class="value-missing">해당 없음</div>';
    /* 계층 토글 한 줄이 프레임 선반도 함께 거른다(창고 = 킷 격자 하나) */
    document.querySelectorAll('.shelf-group').forEach(function(g){
      g.hidden = (state.tier!=="전체" && g.getAttribute('data-tier')!==state.tier);
    });
    var cnt = document.getElementById('count'); if (cnt) cnt.textContent = items.length + ' / ' + data.catalog.length; /* 킷 판에는 숫자 줄이 없다(0908) */
  }

  function buildFilters(data){
    var f = document.getElementById('filters');
    var html='';
    html += '<button data-tier="전체" class="is-current">계층 전체</button>';
    TIERS.forEach(function(t){
      var n = data.catalog.filter(function(c){ return (ROLE_TIER[c.role]||TIERS[TIERS.length-1]).id===t.id; }).length;
      if(!n) return;
      html += '<button data-tier="'+t.id+'">'+t.id+' '+t.name+' <span class="count">'+n+'</span></button>';
    });
    if(!KIT){                       /* 킷 페이지 = 계층 토글 한 줄만 (역할·위반·미사용 줄은 공장/문서 쪽) */
      html += '<span class="filter-sep"></span>';
      html += '<button data-role="전체" class="is-current">역할 전체</button>';
      TIERS.forEach(function(t){
        t.roles.forEach(function(r){
          var n = data.catalog.filter(function(c){return c.role===r;}).length;
          if(!n) return;
          html += '<button data-role="'+r+'">'+r+' <span class="count">'+n+'</span></button>';
        });
      });
      html += '<span class="filter-sep"></span>';
      html += '<button id="f-viol">위반만</button><button id="f-unused">미사용만</button>';
    }
    f.innerHTML = html;

    function wire(attr, key){
      f.querySelectorAll('['+attr+']').forEach(function(b){
        b.onclick=function(){
          state[key]=b.getAttribute(attr);
          f.querySelectorAll('['+attr+']').forEach(function(x){x.classList.remove('is-current');});
          b.classList.add('is-current'); render(data);
        };
      });
    }
    wire('data-tier','tier');
    wire('data-role','role');
    var fv = document.getElementById('f-viol'), fu = document.getElementById('f-unused');
    if(fv) fv.onclick=function(){
      state.viol=!state.viol; this.classList.toggle('is-current',state.viol); render(data);
    };
    if(fu) fu.onclick=function(){
      state.unused=!state.unused; this.classList.toggle('is-current',state.unused); render(data);
    };
  }

  function tierSummary(data){
    var host = document.getElementById('tiersum'); if(!host) return;
    var rows='';
    TIERS.forEach(function(t){
      var g = data.catalog.filter(function(c){ return (ROLE_TIER[c.role]||TIERS[TIERS.length-1]).id===t.id; });
      var k = counts(g);
      rows += '<tr><td>'+tierBadge(t)+' '+t.name+'</td><td>'+t.desc+'</td>'
            + '<td class="num">'+k.n+'</td><td class="num">'+k.ok+'</td><td class="num">'+k.viol+'</td><td class="num">'+k.unused+'</td>'
            + '<td>'+(t.roles.join(' · '))+'</td></tr>';
    });
    var all = counts(data.catalog);
    rows += '<tr><td colspan="2"><b>합계</b></td><td class="num"><b>'+all.n+'</b></td><td class="num">'+all.ok
          + '</td><td class="num">'+all.viol+'</td><td class="num">'+all.unused+'</td><td>—</td></tr>';
    host.innerHTML = rows;
  }

  fetch('board-data.json').then(function(r){return r.json();}).then(function(data){
    var t=document.getElementById('tally');
    if(t){
      var k=counts(data.catalog);
      t.innerHTML='총 <b>'+k.n+'</b> · 준수 <b>'+k.ok+'</b> · 위반 <b>'+k.viol+'</b> · 미사용 <b>'+k.unused+'</b>';
    }
    tierSummary(data);
    buildFilters(data); render(data);
  }).catch(function(e){
    var g=document.getElementById('grid');
    if(g) g.innerHTML='<div class="value-missing">board-data.json 로드 실패: '+e+'</div>';
  });
})();
