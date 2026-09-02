(() => {
  const CFG = window.WORKSHOP_CONFIG || {};
  const API = (CFG.APPS_SCRIPT_URL || '').trim();
  const statusEl = document.getElementById('connectionStatus');
  const warning = document.getElementById('configWarning');
  const resultsEl = document.getElementById('results');
  const resultTitle = document.getElementById('resultTitle');
  const sessionCode = document.getElementById('sessionCode');
  const sessionInfo = document.getElementById('sessionInfo');
  const responsesBadge = document.getElementById('responsesBadge');
  const metrics = document.getElementById('metrics');
  let state = {currentRound:0,sessionId:'demo',status:'waiting'};

  const roundNames = ['Aguardando','1 · Adequação e benefício','2 · Autonomia e dados','3 · Riscos e impactos','4 · Controles e governança','5 · Decisão final','Encerrado'];

  const labels = {
    r1_problem:'Problema principal', r1_benefit:'Principal benefício esperado', r1_needed:'Um agente é realmente necessário?', r1_initial:'Recomendação inicial',
    r2_actions__0:'Autonomia — identificar o assunto', r2_actions__1:'Autonomia — sugerir a unidade', r2_actions__2:'Autonomia — classificar urgência', r2_actions__3:'Autonomia — encaminhar automaticamente', r2_actions__4:'Autonomia — preparar resposta', r2_actions__5:'Autonomia — enviar resposta ao cidadão', r2_data:'Fontes de dados permitidas', r2_review:'Revisão humana obrigatória',
    r3_grave:'Incidente considerado mais grave', r3_affected:'Quem pode ser prejudicado?', r3_worst:'Pior resultado plausível', r3_action:'O que fazer após os incidentes?',
    r4_controls:'Controles indispensáveis', r4_forbidden:'Ação que não deveria ser autônoma', r4_responsible:'Responsável pelo resultado final', r4_document:'O que deve ser documentado?', r4_transparency:'Como comunicar o uso de IA?',
    r5_test:'Como testar a próxima versão?', r5_monitor:'O que deve ser monitorado?', r5_final:'Recomendação final', r5_condition:'Condição mais importante'
  };

  function esc(v){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function setStatus(t,live=false){ statusEl.textContent=t; statusEl.classList.toggle('live',live); }
  function adminKey(){ return document.getElementById('adminKey').value.trim(); }

  function buildControls(){
    const c = document.getElementById('roundControls'); c.innerHTML='';
    for(let i=0;i<=6;i++){
      const b=document.createElement('button'); b.className='round-btn'+(state.currentRound===i?' active':''); b.textContent=roundNames[i];
      b.onclick=()=>setRound(i); c.appendChild(b);
    }
  }

  function jsonp(params){
    return new Promise((resolve,reject)=>{
      const cb='__fac_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const timer=setTimeout(()=>cleanup(new Error('Tempo esgotado ao consultar o servidor.')),10000);
      function cleanup(err,data){
        clearTimeout(timer); delete window[cb]; script.remove();
        if(err) reject(err); else resolve(data);
      }
      window[cb]=(data)=>{
        if(!data || data.ok===false) cleanup(new Error((data&&data.error)||'Erro no servidor'));
        else cleanup(null,data);
      };
      const q=new URLSearchParams({...params,callback:cb,t:String(Date.now())});
      script.src=API+'?'+q.toString();
      script.onerror=()=>cleanup(new Error('Não foi possível acessar o Apps Script.'));
      document.head.appendChild(script);
    });
  }

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // Envia POST cross-origin sem usar fetch/CORS. Apps Script pode redirecionar
  // respostas de Web Apps, e alguns navegadores (especialmente Firefox)
  // transformam isso em NetworkError mesmo com mode=no-cors. Um formulário
  // HTML normal pode fazer POST cross-origin sem depender de CORS.
  function postOneWay(payload){
    return new Promise((resolve,reject)=>{
      const frameName='__fac_post_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const iframe=document.createElement('iframe');
      iframe.name=frameName;
      iframe.style.display='none';
      iframe.setAttribute('aria-hidden','true');

      const form=document.createElement('form');
      form.method='POST';
      form.action=API;
      form.target=frameName;
      form.style.display='none';

      const input=document.createElement('input');
      input.type='hidden';
      input.name='payload';
      input.value=JSON.stringify(payload);
      form.appendChild(input);

      document.body.appendChild(iframe);
      document.body.appendChild(form);

      try {
        form.submit();
        form.remove();
        // Mantemos o iframe por alguns segundos para não abortar o POST
        // enquanto o Apps Script segue seus redirecionamentos internos.
        setTimeout(()=>iframe.remove(),15000);
        setTimeout(resolve,80);
      } catch(err){
        form.remove();
        iframe.remove();
        reject(err);
      }
    });
  }

  async function call(payload){
    if(!API){ return demoCall(payload); }
    const before=await jsonp({action:'state'});
    await postOneWay(payload);
    for(let i=0;i<6;i++){
      await sleep(400+i*250);
      const after=await jsonp({action:'state'});
      if(payload.action==='setRound' && Number(after.currentRound)===Number(payload.round)) return after;
      if(payload.action==='resetSession' && after.sessionId && after.sessionId!==before.sessionId) return after;
    }
    throw new Error('A alteração não foi confirmada. Confira a chave do facilitador e a implantação do Apps Script.');
  }

  function demoCall(payload){
    if(payload.action==='setRound'){ localStorage.setItem('workshop_demo_round',String(payload.round)); return Promise.resolve({ok:true}); }
    if(payload.action==='resetSession'){ localStorage.removeItem('workshop_demo_responses'); localStorage.setItem('workshop_demo_round','0'); return Promise.resolve({ok:true,sessionId:'demo'}); }
    return Promise.resolve({ok:true});
  }

  let mutationInFlight=false;

  function setMutationBusy(busy,label='processando...'){
    mutationInFlight=busy;
    document.querySelectorAll('#roundControls button, #resetBtn').forEach(b=>b.disabled=busy);
    const resetBtn=document.getElementById('resetBtn');
    if(resetBtn){
      if(!resetBtn.dataset.originalText) resetBtn.dataset.originalText=resetBtn.textContent;
      resetBtn.textContent=busy?label:resetBtn.dataset.originalText;
    }
  }

  async function setRound(round){
    if(mutationInFlight) return;
    if(API && !adminKey()){ alert('Digite a chave do facilitador.'); return; }
    setMutationBusy(true,'Atualizando...');
    try {
      setStatus('atualizando...');
      await call({action:'setRound',round,adminKey:adminKey()});
      await refresh();
    } catch(e){
      setStatus('erro ao atualizar');
      alert(e.message);
      // Tenta recuperar o painel mesmo após uma falha de rede.
      try { await refresh(); } catch(_err){}
    } finally {
      setMutationBusy(false);
    }
  }

  async function reset(){
    if(mutationInFlight) return;
    if(!confirm('Iniciar uma nova sessão? Os dados anteriores permanecerão na planilha, mas deixarão de aparecer neste painel.')) return;
    if(API && !adminKey()){ alert('Digite a chave do facilitador.'); return; }
    setMutationBusy(true,'Criando sessão...');
    try {
      setStatus('criando sessão...');
      await call({action:'resetSession',adminKey:adminKey()});
      await refresh();
    } catch(e){
      setStatus('erro ao criar sessão');
      alert(e.message);
      try { await refresh(); } catch(_err){}
    } finally {
      setMutationBusy(false);
    }
  }

  async function fetchState(){
    if(!API){ warning.classList.remove('hidden'); return {ok:true,currentRound:Number(localStorage.getItem('workshop_demo_round')||'0'),sessionId:'demo',status:'live'}; }
    return await jsonp({action:'state'});
  }
  async function fetchResults(){
    if(!API){
      const arr=JSON.parse(localStorage.getItem('workshop_demo_responses')||'[]');
      return aggregateDemo(arr,state.currentRound);
    }
    return await jsonp({action:'results',sessionId:state.sessionId,round:String(state.currentRound)});
  }

  function aggregateDemo(arr,round){
    const latest={};
    arr.filter(x=>Number(x.round)===Number(round)).forEach(sub=>sub.answers.forEach(a=>{ latest[`${sub.participantId}|${a.questionId}`]={...a,participantId:sub.participantId}; }));
    const q={}; Object.values(latest).forEach(x=>{ if(!q[x.questionId])q[x.questionId]={questionId:x.questionId,questionLabel:x.questionLabel,answers:[]}; q[x.questionId].answers.push({participantId:x.participantId,answer:x.answer}); });
    const participants=new Set(Object.values(latest).map(x=>x.participantId));
    return {ok:true,participantCount:participants.size,questions:Object.values(q)};
  }

  function splitAnswer(answer){ return String(answer).split(' || ').map(x=>x.trim()).filter(Boolean); }
  function isOpenQuestion(qid){ return qid==='r3_worst'||qid==='r5_condition'; }

  function renderResults(data){
    const count=data.participantCount||0; responsesBadge.textContent=`${count} participante${count===1?'':'s'}`;
    resultTitle.textContent = state.currentRound>=1&&state.currentRound<=5 ? roundNames[state.currentRound] : roundNames[state.currentRound] || 'Aguardando';
    metrics.innerHTML=`<div class="metric"><div class="value">${count}</div><div class="label">participantes nesta rodada</div></div><div class="metric"><div class="value">${(data.questions||[]).length}</div><div class="label">itens com respostas</div></div><div class="metric"><div class="value">${state.currentRound>=1&&state.currentRound<=5?state.currentRound+'/5':'—'}</div><div class="label">progresso da atividade</div></div>`;
    if(!data.questions||data.questions.length===0){ resultsEl.innerHTML='<p class="lead">Ainda não há respostas para esta rodada.</p>'; return; }
    resultsEl.innerHTML=data.questions.map(renderQuestionResult).join('');
  }

  function renderQuestionResult(q){
    const qid=q.questionId; const title=labels[qid]||q.questionLabel||qid; const answers=q.answers||[];
    if(isOpenQuestion(qid)){
      const snippets=answers.map(x=>x.answer).filter(Boolean).slice(-12).reverse();
      return `<div class="result-block"><h3>${esc(title)}</h3><div class="open-responses">${snippets.map(s=>`<div class="open-response">${esc(s)}</div>`).join('')||'<span class="small">Sem respostas abertas ainda.</span>'}</div></div>`;
    }
    const counts={}; answers.forEach(x=>splitAnswer(x.answer).forEach(v=>counts[v]=(counts[v]||0)+1));
    const denominator=answers.length||1; const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    return `<div class="result-block"><h3>${esc(title)}</h3>${entries.map(([name,n])=>{ const pct=Math.round(n/denominator*100); return `<div class="bar-row"><div class="bar-label">${esc(name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,pct)}%"></div></div><div class="bar-val">${n} · ${pct}%</div></div>`; }).join('')}</div>`;
  }

  async function refresh(){
    try{
      state=await fetchState();
      sessionCode.textContent=state.sessionId||'—'; sessionInfo.textContent=state.currentRound>=1&&state.currentRound<=5?`Rodada ${state.currentRound} aberta`:roundNames[state.currentRound]||'Aguardando';
      setStatus(API?'conectado':'modo demonstração',!!API); buildControls();
      const data=await fetchResults(); renderResults(data);
    }catch(e){ setStatus('sem conexão'); console.error(e); }
  }

  document.getElementById('refreshBtn').onclick=refresh; document.getElementById('resetBtn').onclick=reset;
  refresh(); setInterval(refresh,4000);
})();
