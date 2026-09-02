(() => {
  const CFG = window.WORKSHOP_CONFIG || {};
  const API = (CFG.APPS_SCRIPT_URL || '').trim();

  const roundInfo = {
    1:{theme:'Adequação e benefício', title:'Faz sentido usar um agente aqui?'},
    2:{theme:'Autonomia e dados', title:'Quanto poder damos ao agente?'},
    3:{theme:'Riscos e impactos', title:'O piloto começou. O que pode dar errado?'},
    4:{theme:'Controles e governança', title:'Como tornar esse agente aceitável?'},
    5:{theme:'Piloto, monitoramento e recomendação', title:'Qual é sua decisão final?'}
  };

  const canonicalOrder = [
    'r1_problem','r1_benefit','r1_needed','r1_initial',
    'r2_actions__0','r2_actions__1','r2_actions__2','r2_actions__3','r2_actions__4','r2_actions__5','r2_data','r2_review',
    'r3_grave','r3_affected','r3_worst','r3_action',
    'r4_controls','r4_forbidden','r4_responsible','r4_document','r4_transparency',
    'r5_test','r5_monitor','r5_final','r5_condition'
  ];

  const labels = {
    r1_problem:'Qual é o problema principal que esse projeto tenta resolver?',
    r1_benefit:'Qual seria o principal benefício esperado?',
    r1_needed:'Um agente de IA é realmente necessário?',
    r1_initial:'Com o que você sabe agora, qual é sua recomendação?',
    r2_actions__0:'Autonomia — Identificar o assunto',
    r2_actions__1:'Autonomia — Sugerir a unidade responsável',
    r2_actions__2:'Autonomia — Classificar a urgência',
    r2_actions__3:'Autonomia — Encaminhar automaticamente',
    r2_actions__4:'Autonomia — Preparar uma resposta',
    r2_actions__5:'Autonomia — Enviar a resposta ao cidadão',
    r2_data:'Quais fontes o agente poderia acessar?',
    r2_review:'Em que momento a revisão humana deve ser obrigatória?',
    r3_grave:'Qual incidente você considera mais grave?',
    r3_affected:'Quem pode ser prejudicado nesse cenário?',
    r3_worst:'Qual seria o pior resultado plausível?',
    r3_action:'Depois desses incidentes, o que você faria agora?',
    r4_controls:'Quais controles você considera indispensáveis?',
    r4_forbidden:'Que ação o agente não deveria realizar de forma autônoma?',
    r4_responsible:'Quem deve responder pelo resultado final?',
    r4_document:'O que deve ser documentado?',
    r4_transparency:'Como o uso da IA deve ser comunicado?',
    r5_test:'Como você testaria a próxima versão?',
    r5_monitor:'O que deve ser monitorado?',
    r5_final:'Recomendação final',
    r5_condition:'Qual condição você considera mais importante para esse agente?'
  };

  const openQuestions = new Set(['r3_worst','r5_condition']);
  const questionRound = qid => Number((/^r(\d)_/.exec(qid)||[])[1] || 0);

  let state = null;
  let slides = [];
  let current = 0;

  const $ = id => document.getElementById(id);
  $('workshopTitle').textContent = CFG.WORKSHOP_TITLE || 'Agente em produção?';

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function setStatus(text, live=false){ $('connectionStatus').textContent=text; $('connectionStatus').classList.toggle('live',live); }
  function splitAnswer(answer){ return String(answer).split(' || ').map(x=>x.trim()).filter(Boolean); }

  // Comunicação direta com o Apps Script.
  // Usa POST com text/plain para manter a requisição simples e evitar preflight CORS.
  async function call(payload){
    if(!API){ return demoCall(payload); }
    const res = await fetch(API, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('Erro de rede: HTTP ' + res.status);
    let data;
    try{
      data = await res.json();
    }catch(_){
      throw new Error('O Apps Script retornou uma resposta inválida.');
    }
    if(!data || data.ok === false) throw new Error((data && data.error) || 'Erro no servidor');
    return data;
  }

  function demoCall(payload){
    if(payload.action === 'state'){
      return Promise.resolve({
        ok:true,
        currentRound:Number(localStorage.getItem('workshop_demo_round') || '0'),
        sessionId:'demo',
        status:'live'
      });
    }
    if(payload.action === 'results'){
      const arr = JSON.parse(localStorage.getItem('workshop_demo_responses') || '[]');
      const round = Number(payload.round || 0);
      const rows = arr.filter(x => Number(x.round) === round);
      const grouped = {};
      const participants = new Set();
      rows.forEach(x => {
        participants.add(x.participantId || x.participant || 'demo');
        const qid = x.questionId || x.question || '';
        if(!qid) return;
        if(!grouped[qid]) grouped[qid] = [];
        grouped[qid].push({answer:x.answer ?? x.value ?? ''});
      });
      return Promise.resolve({
        ok:true,
        participantCount:participants.size,
        questions:Object.entries(grouped).map(([questionId,answers]) => ({questionId,answers}))
      });
    }
    return Promise.resolve({ok:true});
  }

  async function loadAll(){
    $('loadingState').classList.remove('hidden'); $('emptyState').classList.add('hidden'); $('slide').classList.add('hidden');
    setStatus('consultando...');
    try{
      state = await call({action:'state'});
      const results = await Promise.all([1,2,3,4,5].map(round => call({action:'results',sessionId:state.sessionId,round:String(round)})));
      slides = [];
      results.forEach((data,idx)=>{
        const round = idx+1;
        (data.questions||[]).forEach(q => slides.push({...q,round,participantCount:data.participantCount||0}));
      });
      slides.sort((a,b)=>canonicalOrder.indexOf(a.questionId)-canonicalOrder.indexOf(b.questionId));
      $('loadingState').classList.add('hidden');
      if(!slides.length){ $('emptyState').classList.remove('hidden'); setStatus('sem respostas'); return; }
      current = Math.min(current,slides.length-1);
      buildSelect(); buildOverview(); render();
      $('slide').classList.remove('hidden');
      setStatus('dados atualizados',true);
    }catch(err){
      $('loadingState').classList.add('hidden'); $('emptyState').classList.remove('hidden');
      $('emptyState').innerHTML=`<div class="presentation-empty-icon">!</div><h1>Não foi possível carregar os resultados</h1><p>${esc(err.message)}</p>`;
      setStatus('erro'); console.error(err);
    }
  }

  function buildSelect(){
    $('slideSelect').innerHTML = slides.map((s,i)=>`<option value="${i}">${i+1}. R${s.round} — ${esc(labels[s.questionId]||s.questionLabel||s.questionId)}</option>`).join('');
  }

  function buildOverview(){
    $('overviewGrid').innerHTML=slides.map((s,i)=>`<button class="overview-item" data-index="${i}" type="button"><div class="ov-round">Rodada ${s.round} · ${esc(roundInfo[s.round]?.theme||'')}</div><div class="ov-title">${esc(labels[s.questionId]||s.questionLabel||s.questionId)}</div></button>`).join('');
    $('overviewGrid').querySelectorAll('.overview-item').forEach(b=>b.onclick=()=>{ current=Number(b.dataset.index); closeOverview(); render(); });
  }

  function render(){
    if(!slides.length) return;
    const s=slides[current]; const round=s.round || questionRound(s.questionId);
    $('roundBadge').textContent=`Rodada ${round}`;
    $('roundTheme').textContent=roundInfo[round]?.theme||'';
    $('questionTitle').textContent=labels[s.questionId]||s.questionLabel||s.questionId;
    $('participantCount').textContent=`${s.participantCount||0} participante${Number(s.participantCount)===1?'':'s'} responderam nesta rodada`;
    $('slideIndex').textContent=current+1; $('slideTotal').textContent=slides.length;
    $('sessionCode').textContent=state?.sessionId ? `Sessão ${state.sessionId}` : '';
    $('slideSelect').value=String(current);
    $('prevBtn').disabled=current===0; $('nextBtn').disabled=current===slides.length-1;
    $('visualization').innerHTML = openQuestions.has(s.questionId) ? renderOpen(s) : renderChart(s);
    history.replaceState(null,'',`#${current+1}`);
  }

  function renderChart(s){
    const counts={};
    (s.answers||[]).forEach(x=>splitAnswer(x.answer).forEach(v=>counts[v]=(counts[v]||0)+1));
    const denominator=(s.answers||[]).length||1;
    const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) return '<div class="no-data">Sem respostas para esta pergunta.</div>';
    return `<div class="chart-list">${entries.map(([name,n])=>{
      const pct=Math.round(n/denominator*100);
      return `<div class="result-row"><div class="result-label">${esc(name)}</div><div class="result-track"><div class="result-fill" style="width:${Math.min(100,pct)}%"></div></div><div class="result-value">${pct}% <span style="font-weight:650;color:#8391a1;font-size:.82rem">(${n})</span></div></div>`;
    }).join('')}</div>`;
  }

  function renderOpen(s){
    const answers=(s.answers||[]).map(x=>x.answer).filter(Boolean);
    if(!answers.length) return '<div class="no-data">Sem respostas abertas para esta pergunta.</div>';
    const max=9, shown=answers.slice(-max).reverse(), remaining=Math.max(0,answers.length-shown.length);
    return `<div class="open-wall">${shown.map(a=>`<div class="open-card">${esc(a)}</div>`).join('')}${remaining?`<div class="open-more">+ ${remaining} outra${remaining===1?' resposta':'s respostas'} registrada${remaining===1?'':'s'}</div>`:''}</div>`;
  }

  function prev(){ if(current>0){current--;render();} }
  function next(){ if(current<slides.length-1){current++;render();} }
  function openOverview(){ $('overview').classList.remove('hidden'); }
  function closeOverview(){ $('overview').classList.add('hidden'); }

  $('prevBtn').onclick=prev; $('nextBtn').onclick=next;
  $('refreshBtn').onclick=loadAll;
  $('overviewBtn').onclick=openOverview; $('closeOverviewBtn').onclick=closeOverview;
  $('overview').onclick=e=>{if(e.target===$('overview'))closeOverview();};
  $('slideSelect').onchange=e=>{current=Number(e.target.value);render();};
  $('fullscreenBtn').onclick=async()=>{ try{ if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }catch(_e){} };
  document.addEventListener('keydown',e=>{
    if(!$('overview').classList.contains('hidden')){ if(e.key==='Escape')closeOverview(); return; }
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ') { e.preventDefault(); next(); }
    if(e.key==='ArrowLeft'||e.key==='PageUp') { e.preventDefault(); prev(); }
    if(e.key.toLowerCase()==='r') loadAll();
    if(e.key.toLowerCase()==='f') $('fullscreenBtn').click();
  });

  const hashIndex=Number(location.hash.replace('#',''))-1;
  if(Number.isFinite(hashIndex)&&hashIndex>=0) current=hashIndex;
  loadAll();
})();
