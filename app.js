(() => {
  const CFG = window.WORKSHOP_CONFIG || {};
  const API = (CFG.APPS_SCRIPT_URL || '').trim();
  const content = document.getElementById('content');
  const statusEl = document.getElementById('connectionStatus');
  const configWarning = document.getElementById('configWarning');
  document.getElementById('brandTitle').textContent = CFG.WORKSHOP_TITLE || 'Agente em produção?';
  document.getElementById('brandOrg').textContent = CFG.ORGANIZATION || 'Oficina — Guia de Agentes de IA';

  const participantId = getParticipantId();
  let state = { currentRound: 0, sessionId: 'demo', status: 'waiting' };
  let lastRenderedRound = null;

  const rounds = {
    1: {
      title: 'Faz sentido usar um agente aqui?',
      theme: 'Adequação e benefício',
      intro: 'Uma instituição recebe grande volume de solicitações de cidadãos. Servidores precisam ler cada solicitação, identificar o assunto, avaliar a urgência, localizar a unidade responsável e preparar o encaminhamento.',
      questions: [
        {id:'r1_problem', title:'Qual é o problema principal que esse projeto tenta resolver?', type:'single', options:['Tempo gasto em tarefas repetitivas','Dificuldade de encaminhar corretamente','Baixa consistência no atendimento','Outro problema']},
        {id:'r1_benefit', title:'Qual seria o principal benefício esperado?', type:'single', options:['Reduzir tempo de processamento','Aumentar consistência','Liberar servidores para tarefas mais complexas','Melhorar a experiência do cidadão','Outro']},
        {id:'r1_needed', title:'Um agente de IA é realmente necessário?', help:'Pense se uma automação tradicional ou outra solução mais simples poderia resolver o problema.', type:'single', options:['Sim','Talvez — preciso de mais informações','Não']},
        {id:'r1_initial', title:'Com o que você sabe agora, qual é sua recomendação?', type:'single', options:['Prosseguir','Prosseguir com cautela','Não prosseguir']}
      ]
    },
    2: {
      title: 'Quanto poder damos ao agente?',
      theme: 'Autonomia e dados',
      intro: 'A instituição quer que o agente consulte solicitações, normas e sistemas internos. Agora é preciso decidir o que ele poderá fazer e quais informações poderá acessar.',
      questions: [
        {id:'r2_actions', title:'Para cada ação, qual nível de autonomia você permitiria?', type:'matrix', rows:['Identificar o assunto','Sugerir a unidade responsável','Classificar a urgência','Encaminhar automaticamente','Preparar uma resposta','Enviar a resposta ao cidadão'], columns:['Não permitir','Permitir com revisão humana','Permitir automaticamente']},
        {id:'r2_data', title:'Quais fontes o agente poderia acessar?', help:'Selecione todas as que você considera necessárias e justificáveis.', type:'multi', options:['Solicitação atual','Normas e procedimentos institucionais','Cadastro do cidadão','Histórico completo de solicitações','Documentos anexados','Dados de saúde presentes no processo','Processos administrativos relacionados']},
        {id:'r2_review', title:'Em que momento a revisão humana deve ser obrigatória?', type:'multi', options:['Antes de definir prioridade','Antes de encaminhar','Antes de gerar documento oficial','Antes de qualquer resposta externa','Somente quando o agente indicar incerteza','Não considero revisão obrigatória necessária']}
      ]
    },
    3: {
      title: 'O piloto começou. O que pode dar errado?',
      theme: 'Riscos e impactos',
      intro: 'Após algumas semanas de piloto, três situações chamaram a atenção da equipe.',
      incidents: [
        ['Incidente 1 — informação incorreta','O agente informou a um cidadão que determinado documento não era obrigatório, embora a norma exigisse sua apresentação.'],
        ['Incidente 2 — possível tratamento desigual','Solicitações escritas em linguagem informal receberam, em média, prioridade inferior a solicitações equivalentes escritas em linguagem formal.'],
        ['Incidente 3 — dado desnecessário','Uma resposta mencionou uma condição de saúde encontrada em um documento anexado, embora essa informação não fosse necessária para atender à solicitação.']
      ],
      questions: [
        {id:'r3_grave', title:'Qual incidente você considera mais grave?', type:'single', options:['Informação incorreta','Possível tratamento desigual','Uso desnecessário de dado sensível','Os três têm gravidade semelhante']},
        {id:'r3_affected', title:'Quem pode ser prejudicado nesse cenário?', type:'multi', options:['O cidadão diretamente afetado','Grupos que se comunicam de forma diferente do padrão','Servidores responsáveis pelo processo','A instituição','A sociedade / confiança no serviço público']},
        {id:'r3_worst', title:'Qual seria o pior resultado plausível?', help:'Resposta curta — pense nas consequências, não apenas no erro técnico.', type:'text', max:300},
        {id:'r3_action', title:'Depois desses incidentes, o que você faria agora?', type:'single', options:['Manter o piloto como está','Manter o piloto e adicionar controles','Reduzir a autonomia do agente','Suspender o piloto até revisão completa','Encerrar o projeto']}
      ]
    },
    4: {
      title: 'Como tornar esse agente aceitável?',
      theme: 'Controles e governança',
      intro: 'O projeto não foi encerrado. A instituição pede que você proponha condições para que o uso continue de maneira responsável.',
      questions: [
        {id:'r4_controls', title:'Quais controles você considera indispensáveis?', type:'multi', options:['Revisão humana antes de respostas externas','Prioridade apenas como recomendação','Proibir envio automático','Restringir acesso aos dados estritamente necessários','Registrar ações e fontes utilizadas','Identificar conteúdo produzido com apoio de IA','Encaminhar ao humano em situações de incerteza','Avaliar periodicamente erros e impactos']},
        {id:'r4_forbidden', title:'Que ação o agente não deveria realizar de forma autônoma?', type:'single', options:['Definir prioridade','Encaminhar solicitações','Produzir rascunhos','Enviar respostas ao cidadão','Nenhuma — todas podem ser autônomas com controles adequados']},
        {id:'r4_responsible', title:'Quem deve responder pelo resultado final?', type:'single', options:['O fornecedor do modelo','O agente / sistema','O servidor ou gestor responsável','A equipe técnica','Responsabilidade compartilhada, sem responsável final único']},
        {id:'r4_document', title:'O que deve ser documentado?', type:'multi', options:['Quando o agente foi utilizado','Quais dados foram utilizados','Quais fontes sustentaram o resultado','Quais ações o agente executou','Quem revisou/aprovou o resultado','Erros, incidentes e intervenções humanas']},
        {id:'r4_transparency', title:'Como o uso da IA deve ser comunicado?', type:'single', options:['Sempre identificar conteúdos produzidos com apoio de IA quando aplicável','Identificar apenas quando houver interação direta com cidadão','Registrar apenas internamente','Não é necessário identificar se houve revisão humana']}
      ]
    },
    5: {
      title: 'Qual é sua decisão final?',
      theme: 'Piloto, monitoramento e recomendação',
      intro: 'Considere agora o agente com os controles discutidos. A instituição precisa decidir o próximo passo.',
      questions: [
        {id:'r5_test', title:'Como você testaria a próxima versão?', type:'single', options:['Implantação ampla imediatamente','Piloto pequeno com casos de baixo impacto','Piloto em uma unidade, com revisão de 100% dos resultados','Apenas testes internos, sem uso em processos reais','Não continuaria testando']},
        {id:'r5_monitor', title:'O que deve ser monitorado?', type:'multi', options:['Taxa de informações incorretas','Diferenças de resultado entre grupos/casos','Incidentes envolvendo dados','Quantidade de intervenções humanas','Tempo economizado','Qualidade percebida por servidores','Qualidade percebida pelos cidadãos']},
        {id:'r5_final', title:'Recomendação final', type:'single', options:['Prosseguir para implantação','Continuar apenas em piloto controlado','Não prosseguir']},
        {id:'r5_condition', title:'Em uma frase: qual condição você considera mais importante para esse agente?', type:'text', max:240}
      ]
    }
  };

  function getParticipantId(){
    let id = localStorage.getItem('workshop_participant_id');
    if(!id){ id = 'p_' + crypto.randomUUID(); localStorage.setItem('workshop_participant_id', id); }
    return id;
  }

  function setStatus(text, live=false){ statusEl.textContent = text; statusEl.classList.toggle('live', live); }

  function renderProgress(round){
    const el = document.getElementById('progressBar');
    el.innerHTML = '';
    for(let i=1;i<=5;i++){
      const step = document.createElement('div');
      step.className = 'progress-step' + (i < round ? ' done' : '') + (i === round ? ' active' : '');
      el.appendChild(step);
    }
  }

  function esc(v){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  function renderWaiting(message='Aguardando o facilitador'){
    renderProgress(state.currentRound || 0);
    content.className = 'card waiting';
    content.innerHTML = `<div class="wait-icon">◷</div><h2>${esc(message)}</h2><p class="lead" style="margin-inline:auto">A próxima rodada aparecerá aqui automaticamente quando for liberada.</p>`;
  }

  function renderFinished(){
    renderProgress(6);
    content.className = 'card waiting';
    content.innerHTML = `<div class="wait-icon">✓</div><h2>Atividade encerrada</h2><p class="lead" style="margin-inline:auto">Obrigado. Agora acompanhe a discussão e os resultados coletivos no telão.</p>`;
  }

  function questionHTML(q){
    const name = q.id;
    if(q.type === 'single'){
      return `<div class="question" data-qid="${name}"><div class="q-title">${esc(q.title)}</div>${q.help?`<div class="q-help">${esc(q.help)}</div>`:''}<div class="options ${q.options.length<=3?'cols-3':''}">${q.options.map(o=>`<label class="option"><input type="radio" name="${name}" value="${esc(o)}" required><span class="opt-title">${esc(o)}</span></label>`).join('')}</div></div>`;
    }
    if(q.type === 'multi'){
      return `<div class="question" data-qid="${name}"><div class="q-title">${esc(q.title)}</div>${q.help?`<div class="q-help">${esc(q.help)}</div>`:''}<div class="options cols-2">${q.options.map(o=>`<label class="option"><input type="checkbox" name="${name}" value="${esc(o)}"><span class="opt-title">${esc(o)}</span></label>`).join('')}</div></div>`;
    }
    if(q.type === 'text'){
      return `<div class="question" data-qid="${name}"><div class="q-title">${esc(q.title)}</div>${q.help?`<div class="q-help">${esc(q.help)}</div>`:''}<textarea name="${name}" maxlength="${q.max||400}" required placeholder="Escreva uma resposta curta..."></textarea></div>`;
    }
    if(q.type === 'matrix'){
      return `<div class="question" data-qid="${name}"><div class="q-title">${esc(q.title)}</div>${q.help?`<div class="q-help">${esc(q.help)}</div>`:''}${q.rows.map((row,ri)=>`<div style="padding:13px 0;border-top:1px solid var(--border)"><strong style="font-size:.9rem">${esc(row)}</strong><div class="options cols-3" style="margin-top:8px">${q.columns.map(col=>`<label class="option"><input type="radio" name="${name}__${ri}" value="${esc(col)}" required><span class="opt-title">${esc(col)}</span></label>`).join('')}</div></div>`).join('')}</div>`;
    }
    return '';
  }

  function renderRound(roundNum){
    const r = rounds[roundNum];
    if(!r) return renderWaiting();
    renderProgress(roundNum);
    content.className = 'card';
    const incidentHTML = r.incidents ? `<div class="incidents">${r.incidents.map(x=>`<div class="incident"><span class="tag">resultado do piloto</span><strong>${esc(x[0])}</strong><div>${esc(x[1])}</div></div>`).join('')}</div>` : '';
    content.innerHTML = `
      <div class="round-kicker"><div class="round-number">${roundNum}</div><div class="round-theme">${esc(r.theme)}</div></div>
      <h2>${esc(r.title)}</h2>
      <div class="scenario"><strong>Contexto desta rodada</strong>${esc(r.intro)}</div>
      ${incidentHTML}
      <form id="roundForm">${r.questions.map(questionHTML).join('')}<div class="actions"><button class="btn btn-primary" type="submit">Enviar minhas respostas</button></div></form>`;
    document.getElementById('roundForm').addEventListener('submit', e => submitRound(e, roundNum));
  }

  function collectAnswers(roundNum){
    const form = document.getElementById('roundForm');
    const r = rounds[roundNum];
    const answers = [];
    for(const q of r.questions){
      if(q.type === 'single'){
        const checked = form.querySelector(`input[name="${q.id}"]:checked`);
        if(!checked) throw new Error(`Responda: ${q.title}`);
        answers.push({questionId:q.id, questionLabel:q.title, answer:checked.value});
      } else if(q.type === 'multi'){
        const vals = [...form.querySelectorAll(`input[name="${q.id}"]:checked`)].map(i=>i.value);
        if(vals.length===0) throw new Error(`Selecione ao menos uma opção em: ${q.title}`);
        answers.push({questionId:q.id, questionLabel:q.title, answer:vals.join(' || ')});
      } else if(q.type === 'text'){
        const val = form.querySelector(`[name="${q.id}"]`).value.trim();
        if(!val) throw new Error(`Responda: ${q.title}`);
        answers.push({questionId:q.id, questionLabel:q.title, answer:val});
      } else if(q.type === 'matrix'){
        q.rows.forEach((row,ri)=>{
          const checked = form.querySelector(`input[name="${q.id}__${ri}"]:checked`);
          if(!checked) throw new Error(`Escolha o nível de autonomia para: ${row}`);
          answers.push({questionId:`${q.id}__${ri}`, questionLabel:`${q.title} — ${row}`, answer:checked.value, meta:{matrixParent:q.id,row}});
        });
      }
    }
    return answers;
  }

  async function submitRound(e, roundNum){
    e.preventDefault();
    let answers;
    try { answers = collectAnswers(roundNum); }
    catch(err){ alert(err.message); return; }
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Enviando...';
    const payload = {action:'submit', participantId, sessionId:state.sessionId, round:roundNum, answers};
    try {
      if(API) await postPayload(payload);
      else saveDemo(payload);
      localStorage.setItem(`submitted_${state.sessionId}_${roundNum}`, '1');
      content.innerHTML = `<div class="success"><strong>Resposta registrada.</strong><p>Agora acompanhe a discussão coletiva. Quando o facilitador liberar a próxima rodada, ela aparecerá automaticamente aqui.</p></div>`;
      content.className = 'card';
    } catch(err){
      btn.disabled = false; btn.textContent = 'Enviar minhas respostas';
      alert('Não foi possível registrar a resposta. Tente novamente.\n\n' + err.message);
    }
  }

  async function postPayload(payload){
    const body = new URLSearchParams({payload:JSON.stringify(payload)});
    const res = await fetch(API, {method:'POST', body});
    if(!res.ok) throw new Error('Falha HTTP ' + res.status);
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Erro no servidor');
    return data;
  }

  function saveDemo(payload){
    const key = 'workshop_demo_responses';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push({...payload, timestamp:new Date().toISOString()});
    localStorage.setItem(key, JSON.stringify(arr));
  }

  async function fetchState(){
    if(!API){
      configWarning.classList.remove('hidden');
      setStatus('modo demonstração');
      const demoRound = Number(localStorage.getItem('workshop_demo_round') || '1');
      return {ok:true, currentRound:demoRound, sessionId:'demo', status: demoRound===6?'finished':'live'};
    }
    const url = API + '?action=state&t=' + Date.now();
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('state HTTP ' + res.status);
    return await res.json();
  }

  async function tick(){
    try {
      const next = await fetchState();
      state = next;
      setStatus(next.status === 'live' ? `rodada ${next.currentRound} aberta` : (next.status==='finished'?'encerrado':'aguardando'), next.status==='live');
      const renderedKey = `${next.sessionId}:${next.currentRound}:${next.status}`;
      if(renderedKey !== lastRenderedRound){
        lastRenderedRound = renderedKey;
        if(next.status === 'finished' || Number(next.currentRound) === 6) renderFinished();
        else if(Number(next.currentRound) >= 1 && Number(next.currentRound) <= 5){
          const submitted = localStorage.getItem(`submitted_${next.sessionId}_${next.currentRound}`) === '1';
          if(submitted) {
            renderProgress(Number(next.currentRound));
            content.className='card';
            content.innerHTML = `<div class="success"><strong>Você já respondeu a esta rodada.</strong><p>Aguarde a discussão e a próxima etapa.</p></div>`;
          } else renderRound(Number(next.currentRound));
        } else renderWaiting();
      }
    } catch(err){
      setStatus('sem conexão');
      console.error(err);
    }
  }

  tick();
  setInterval(tick, 3500);
})();
