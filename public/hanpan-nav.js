/**
 * 게임 페이지에서 포털 홈으로 돌아가는 플로팅 버튼.
 * 게임 코드를 건드리지 않으려고 별도 스크립트로 주입한다 —
 * 외부에서 가져온 게임도 index.html에 script 한 줄이면 동일하게 붙는다.
 */
(function () {
  if (window.self !== window.top) return; // iframe 안에서는 표시하지 않는다
  if (document.getElementById('hanpan-nav')) return;

  var STYLE = [
    // 게임마다 상단 UI 위치가 달라 어디에 둬도 겹친다.
    // 평소에는 아이콘만 보여 면적을 최소화하고, 다가가면 이름을 펼친다.
    '#hanpan-nav{',
    'position:fixed;',
    'top:max(8px,env(safe-area-inset-top,0px));',
    'left:max(8px,env(safe-area-inset-left,0px));',
    'z-index:2147483000;',
    'display:inline-flex;align-items:center;gap:0;',
    'padding:4px;',
    'border-radius:999px;',
    'background:rgba(18,14,12,.72);',
    '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
    'border:1px solid rgba(255,175,90,.34);',
    'color:#f6e8d2;',
    'font:800 13px/1 "Noto Sans KR",system-ui,-apple-system,sans-serif;',
    'text-decoration:none;',
    'box-shadow:0 3px 14px rgba(0,0,0,.42);',
    'opacity:.72;',
    'transition:opacity .18s ease,gap .18s ease,padding .18s ease,background .18s ease;',
    '-webkit-tap-highlight-color:transparent;',
    '}',
    '#hanpan-nav img{width:26px;height:26px;border-radius:8px;display:block;flex:0 0 auto;}',
    '#hanpan-nav .hanpan-nav__label{',
    'display:inline-block;max-width:0;overflow:hidden;white-space:nowrap;',
    'opacity:0;transition:max-width .18s ease,opacity .18s ease;',
    '}',
    '#hanpan-nav:hover,#hanpan-nav:focus-visible{',
    'opacity:1;gap:7px;padding:4px 13px 4px 4px;background:rgba(18,14,12,.92);',
    '}',
    '#hanpan-nav:hover .hanpan-nav__label,#hanpan-nav:focus-visible .hanpan-nav__label{',
    'max-width:80px;opacity:1;',
    '}',
    '#hanpan-nav:focus-visible{outline:3px solid #f3c06f;outline-offset:3px;}',
    '@media (hover:none){', // 터치 기기는 hover가 없으니 항상 이름을 보여준다
    '#hanpan-nav{opacity:.82;gap:6px;padding:4px 12px 4px 4px;}',
    '#hanpan-nav .hanpan-nav__label{max-width:80px;opacity:1;}',
    '#hanpan-nav img{width:24px;height:24px;}',
    '}',
    '@media (prefers-reduced-motion:reduce){',
    '#hanpan-nav,#hanpan-nav .hanpan-nav__label{transition:none;}',
    '}'
  ].join('');

  function mount() {
    if (document.getElementById('hanpan-nav')) return;

    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    var link = document.createElement('a');
    link.id = 'hanpan-nav';
    link.href = '/';
    link.setAttribute('aria-label', '한판 홈으로 이동');

    var mark = document.createElement('img');
    mark.src = '/hanpan-mark.webp';
    mark.alt = '';
    mark.width = 26;
    mark.height = 26;

    var label = document.createElement('span');
    label.className = 'hanpan-nav__label';
    label.textContent = '한판 홈';

    link.appendChild(mark);
    link.appendChild(label);
    document.body.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
