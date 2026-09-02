(() => {
  const CFG = window.WORKSHOP_CONFIG || {};
  const API = (CFG.APPS_SCRIPT_URL || '').trim();

  // ---------------------------------------------------------------------------
  // Metadados ESPELHADOS do app.js real.
  // IMPORTANTE: quando uma pergunta mudar no app.js, altere aqui também.
  // ---------------------------------------------------------------------------
  const rounds = {
    1: {
      title: 'Faz sentido usar um agente aqui?',
      theme: 'Adequação e benefício',
      questions: [
        {id:'r1_problem', title:'Qual é o problema principal que esse projeto tenta resolver?', type:'single'},
        {id:'r1_benefit', title:'Qual seria o principal benefício esperado?', type:'single'},
        {id:'r1_needed', title:'Um agente de IA é realmente necessário?', type:'single'},
        {id:'r1_initial', title:'Com o que você sabe agora, qual é sua recomendação?', type:'single'}
      ]
    },
    2: {
      title: 'Quanto poder damos ao agente?',
      theme: 'Autonomia e dados',
      questions: [
        {
          id:'r2_actions',
          title:'Para cada ação, qual nível de autonomia você permitiria?',
          type:'matrix',
          rows:[
            'Identificar o assunto',
            'Sugerir a unidade responsável',
            'Classificar a urgência',
            'Encaminhar automaticamente',
            'Preparar uma resposta',
            'Enviar a resposta ao cidadão'
          ]
        },
        {id:'r2_data', title:'Quais fontes o agente poderia acessar?', type:'multi'},
        {id:'r2_review', title:'Em que momento a revisão humana deve ser obrigatória?', type:'multi'}
      ]
    },
    3: {
      title: 'O piloto começou. O que pode dar errado?',
      theme: 'Riscos e impactos',
      questions: [
        {id:'r3_grave', title:'Qual incidente você considera mais grave?', type:'single'},
        {id:'r3_affected', title:'Quem pode ser prejudicado nesse cenário?', type:'multi'},
        {id:'r3_worst', title:'Qual seria o pior resultado plausível?', type:'text'},
        {id:'r3_action', title:'Depois desses incidentes, o que você faria agora?', type:'single'}
      ]
    },
    4: {
      title: 'Como tornar esse agente aceitável?',
      theme: 'Controles e governança',
      questions: [
        {id:'r4_controls', title:'Quais controles você considera indispensáveis?', type:'multi'},
        {id:'r4_forbidden', title:'Que ação o agente não deveria realizar de forma autônoma?', type:'single'},
        {id:'r4_responsible', title:'Quem deve responder pelo resultado final?', type:'single'},
        {id:'r4_document', title:'O que deve ser documentado?', type:'multi'},
        {id:'r4_transparency', title:'Como o uso da IA deve ser comunicado?', type:'single'}
      ]
    },
    5: {
      title: 'Qual é sua decisão final?',
      theme: 'Piloto, monitoramento e recomendação',
      questions: [
        {id:'r5_test', title:'Como você testaria a próxima versão?', type:'single'},
        {id:'r5_monitor', title:'O que deve ser monitorado?', type:'multi'},
        {id:'r5_final', title:'Recomendação final', type:'single'},
        {id:'r5_condition', title:'Em uma frase: qual condição você considera mais importante para esse agente?', type:'text'}
      ]
    }
  };

  // Converte a estrutura do app.js na sequência exata de slides.
  // A matriz da Rodada 2 é salva pelo app.js como r2_actions__0 ... __5,
  // portanto cada linha vira um gráfico separado para facilitar a discussão.
  const slideDefinitions = [];
  Object.entries(rounds).forEach(([roundNumber, round]) => {
    round.questions.forEach(q => {
      if (q.type === 'matrix') {
        q.rows.forEach((row, index) => {
          slideDefinitions.push({
            round: Number(roundNumber),
            questionId: `${q.id}__${index}`,
            title: `${q.title} — ${row}`,
            shortTitle: `Autonomia — ${row}`,
            type: 'single'
          });
        });
      } else {
        slideDefinitions.push({
          round: Number(roundNumber),
          questionId: q.id,
          title: q.title,
          shortTitle: q.title,
          type: q.type
        });
      }
    });
  });

  const definitionById = Object.fromEntries(slideDefinitions.map(x => [x.questionId, x]));

  let state = null;
  let slides = [];
  let current = 0;

  const $ = id => document.getElementById(id);
  $('workshopTitle').textContent = CFG.WORKSHOP_TITLE || 'Agente em produção?';

  function esc(v){
    return String(v ?? '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'
    }[c]));
  }

  function setStatus(text, live=false){
    $('connectionStatus').textContent = text;
    $('connectionStatus').classList.toggle('live', live);
  }

  function splitAnswer(answer){
    return String(answer ?? '')
      .split(' || ')
      .map(x => x.trim())
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // MESMA comunicação usada pelo app.js que já está funcionando.
  // ---------------------------------------------------------------------------
  async function call(payload){
    if(!API) return demoCall(payload);

    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      });
    } catch (err) {
      throw new Error('Falha de rede ao contatar o Apps Script: ' + err.message);
    }

    if(!res.ok) throw new Error('Erro de rede: HTTP ' + res.status);

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new Error('O Apps Script retornou uma resposta inválida.');
    }

    if(!data || data.ok === false){
      throw new Error((data && data.error) || 'Erro no servidor');
    }
    return data;
  }

  function demoCall(payload){
    if(payload.action === 'state'){
      const demoRound = Number(localStorage.getItem('workshop_demo_round') || '1');
      return Promise.resolve({
        ok:true,
        currentRound:demoRound,
        sessionId:'demo',
        status:demoRound === 6 ? 'finished' : 'live'
      });
    }

    if(payload.action === 'results'){
      const arr = JSON.parse(localStorage.getItem('workshop_demo_responses') || '[]');
      const round = Number(payload.round || 0);
      const rows = arr.filter(x => Number(x.round) === round);
      const participantIds = new Set();
      const questions = {};

      rows.forEach(submission => {
        participantIds.add(submission.participantId || 'demo');
        (submission.answers || []).forEach(answer => {
          const qid = String(answer.questionId || '');
          if(!qid) return;
          if(!questions[qid]){
            questions[qid] = {
              questionId: qid,
              questionLabel: answer.questionLabel || '',
              answers: []
            };
          }
          questions[qid].answers.push({
            participantId: submission.participantId || 'demo',
            answer: String(answer.answer ?? '')
          });
        });
      });

      return Promise.resolve({
        ok:true,
        sessionId:'demo',
        round,
        participantCount:participantIds.size,
        questions:Object.values(questions)
      });
    }

    return Promise.resolve({ok:true});
  }

  async function loadAll(){
    $('loadingState').classList.remove('hidden');
    $('emptyState').classList.add('hidden');
    $('slide').classList.add('hidden');
    setStatus('consultando...');

    try {
      state = await call({action:'state'});

      // Busca todas as rodadas, não somente a atual, pois a página serve para
      // discutir a oficina completa depois de cada conjunto de respostas.
      const roundResults = await Promise.all(
        [1,2,3,4,5].map(round =>
          call({action:'results', sessionId:state.sessionId, round:String(round)})
        )
      );

      const resultByQuestion = {};
      const participantCountByRound = {};

      roundResults.forEach((data, idx) => {
        const round = idx + 1;
        participantCountByRound[round] = Number(data.participantCount || 0);
        (data.questions || []).forEach(q => {
          resultByQuestion[q.questionId] = q;
        });
      });

      // Usa as definições do app.js como fonte da ordem. Perguntas ainda sem
      // respostas também aparecem, mas mostram "Sem respostas" — assim a ordem
      // do slideshow nunca muda durante a oficina.
      slides = slideDefinitions.map(def => {
        const received = resultByQuestion[def.questionId] || {};
        return {
          ...def,
          questionLabel: received.questionLabel || def.title,
          answers: Array.isArray(received.answers) ? received.answers : [],
          participantCount: participantCountByRound[def.round] || 0
        };
      });

      $('loadingState').classList.add('hidden');

      // Se absolutamente nenhuma resposta foi registrada ainda.
      const totalAnswers = slides.reduce((sum,s) => sum + s.answers.length, 0);
      if(totalAnswers === 0){
        $('emptyState').classList.remove('hidden');
        setStatus('sem respostas');
        return;
      }

      // Se veio um #N na URL, mantém o slide ao atualizar dados.
      const hashIndex = Number(location.hash.replace('#','')) - 1;
      if(Number.isInteger(hashIndex) && hashIndex >= 0 && hashIndex < slides.length){
        current = hashIndex;
      } else {
        current = Math.min(current, slides.length - 1);
      }

      buildSelect();
      buildOverview();
      render();
      $('slide').classList.remove('hidden');
      setStatus('dados atualizados', true);

    } catch (err) {
      $('loadingState').classList.add('hidden');
      $('emptyState').classList.remove('hidden');
      $('emptyState').innerHTML = `
        <div class="presentation-empty-icon">!</div>
        <h1>Não foi possível carregar os resultados</h1>
        <p>${esc(err.message)}</p>`;
      setStatus('erro');
      console.error(err);
    }
  }

  function buildSelect(){
    $('slideSelect').innerHTML = slides.map((s,i) =>
      `<option value="${i}">${i+1}. R${s.round} — ${esc(s.shortTitle)}</option>`
    ).join('');
  }

  function buildOverview(){
    $('overviewGrid').innerHTML = slides.map((s,i) => `
      <button class="overview-item" data-index="${i}" type="button">
        <div class="ov-round">Rodada ${s.round} · ${esc(rounds[s.round]?.theme || '')}</div>
        <div class="ov-title">${esc(s.shortTitle)}</div>
      </button>`).join('');

    $('overviewGrid').querySelectorAll('.overview-item').forEach(button => {
      button.onclick = () => {
        current = Number(button.dataset.index);
        closeOverview();
        render();
      };
    });
  }

  function render(){
    if(!slides.length) return;

    const s = slides[current];
    $('roundBadge').textContent = `Rodada ${s.round}`;
    $('roundTheme').textContent = rounds[s.round]?.theme || '';
    $('questionTitle').textContent = s.shortTitle;

    // participantCount é o total que respondeu à rodada. answers.length é o
    // total efetivo desta pergunta. Como as perguntas são obrigatórias, devem
    // coincidir; exibimos o efetivo para evitar números enganosos se houver
    // dados antigos/incompletos na planilha.
    const answered = s.answers.length;
    const roundTotal = Number(s.participantCount || 0);
    $('participantCount').textContent = answered
      ? `${answered} participante${answered === 1 ? '' : 's'} responderam esta pergunta${roundTotal && roundTotal !== answered ? ` · ${roundTotal} na rodada` : ''}`
      : `Nenhuma resposta registrada para esta pergunta${roundTotal ? ` · ${roundTotal} participante${roundTotal === 1 ? '' : 's'} na rodada` : ''}`;

    $('slideIndex').textContent = current + 1;
    $('slideTotal').textContent = slides.length;
    $('sessionCode').textContent = state?.sessionId ? `Sessão ${state.sessionId}` : '';
    $('slideSelect').value = String(current);
    $('prevBtn').disabled = current === 0;
    $('nextBtn').disabled = current === slides.length - 1;

    $('visualization').innerHTML = s.type === 'text'
      ? renderOpen(s)
      : renderChart(s);

    history.replaceState(null, '', `#${current + 1}`);
  }

  function renderChart(s){
    if(!s.answers.length){
      return '<div class="no-data">Sem respostas para esta pergunta.</div>';
    }

    const counts = {};
    s.answers.forEach(item => {
      splitAnswer(item.answer).forEach(value => {
        counts[value] = (counts[value] || 0) + 1;
      });
    });

    const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    if(!entries.length){
      return '<div class="no-data">Sem respostas para esta pergunta.</div>';
    }

    // Para múltipla seleção, o percentual é "percentual de participantes que
    // selecionaram esta opção", portanto o denominador continua sendo o número
    // de participantes que responderam a pergunta — e não a soma das escolhas.
    const denominator = s.answers.length;

    return `<div class="chart-list">${entries.map(([name,count]) => {
      const pct = Math.round((count / denominator) * 100);
      return `
        <div class="result-row">
          <div class="result-label">${esc(name)}</div>
          <div class="result-track"><div class="result-fill" style="width:${Math.min(100,pct)}%"></div></div>
          <div class="result-value">${pct}% <span style="font-weight:650;color:#8391a1;font-size:.82rem">(${count})</span></div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderOpen(s){
    const answers = s.answers
      .map(x => String(x.answer || '').trim())
      .filter(Boolean);

    if(!answers.length){
      return '<div class="no-data">Sem respostas abertas para esta pergunta.</div>';
    }

    // Em apresentação, muitas respostas simultâneas ficam ilegíveis.
    // Mostra até 9 por slide, preservando a ordem recebida do backend.
    const maxShown = 9;
    const shown = answers.slice(0, maxShown);
    const remaining = Math.max(0, answers.length - shown.length);

    return `
      <div class="open-wall">
        ${shown.map(answer => `<div class="open-card">${esc(answer)}</div>`).join('')}
        ${remaining ? `<div class="open-more">+ ${remaining} outra${remaining === 1 ? ' resposta' : 's respostas'} registrada${remaining === 1 ? '' : 's'}</div>` : ''}
      </div>`;
  }

  function prev(){
    if(current > 0){ current--; render(); }
  }

  function next(){
    if(current < slides.length - 1){ current++; render(); }
  }

  function openOverview(){ $('overview').classList.remove('hidden'); }
  function closeOverview(){ $('overview').classList.add('hidden'); }

  $('prevBtn').onclick = prev;
  $('nextBtn').onclick = next;
  $('refreshBtn').onclick = loadAll;
  $('overviewBtn').onclick = openOverview;
  $('closeOverviewBtn').onclick = closeOverview;
  $('overview').onclick = e => { if(e.target === $('overview')) closeOverview(); };
  $('slideSelect').onchange = e => { current = Number(e.target.value); render(); };

  $('fullscreenBtn').onclick = async () => {
    try {
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch(err){ console.error(err); }
  };

  document.addEventListener('keydown', e => {
    // Não interfere com select/inputs caso o navegador esteja focado neles.
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;

    if(e.key === 'ArrowLeft' || e.key === 'PageUp'){
      e.preventDefault(); prev();
    } else if(e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' '){
      e.preventDefault(); next();
    } else if(e.key.toLowerCase() === 'r'){
      e.preventDefault(); loadAll();
    } else if(e.key.toLowerCase() === 'f'){
      e.preventDefault(); $('fullscreenBtn').click();
    } else if(e.key === 'Escape'){
      closeOverview();
    }
  });

  loadAll();
})();
