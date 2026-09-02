/**
 * Backend da oficina — Google Apps Script + Google Sheets.
 * 1) Crie uma planilha vazia.
 * 2) Extensões > Apps Script.
 * 3) Cole este arquivo.
 * 4) Troque ADMIN_KEY abaixo.
 * 5) Implantar > Nova implantação > Aplicativo da Web.
 *    Executar como: você | Quem tem acesso: qualquer pessoa.
 * 6) Copie a URL terminada em /exec para config.js.
 */

const ADMIN_KEY = 'TROQUE-ESTA-CHAVE';
const RESPONSES_SHEET = 'Responses';
const CONFIG_SHEET = 'Config';

function setup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rs = ss.getSheetByName(RESPONSES_SHEET);
  if (!rs) rs = ss.insertSheet(RESPONSES_SHEET);
  if (rs.getLastRow() === 0) {
    rs.appendRow(['timestamp','session_id','participant_id','round','question_id','question_label','answer','metadata_json']);
    rs.setFrozenRows(1);
  }

  let cs = ss.getSheetByName(CONFIG_SHEET);
  if (!cs) cs = ss.insertSheet(CONFIG_SHEET);
  if (cs.getLastRow() === 0) {
    cs.getRange(1,1,4,2).setValues([
      ['key','value'],
      ['current_round','0'],
      ['session_id',newSessionId_()],
      ['status','waiting']
    ]);
    cs.setFrozenRows(1);
  }
  return {rs, cs};
}

function doGet(e) {
  try {
    setup_();
    const action = (e.parameter.action || 'state').trim();
    let result;
    if (action === 'state') {
      result = getState_();
    } else if (action === 'results') {
      result = getResults_(e.parameter.sessionId, Number(e.parameter.round || 0));
    } else if (action === 'submissionStatus') {
      result = getSubmissionStatus_(e.parameter.sessionId, Number(e.parameter.round || 0), e.parameter.participantId || '');
    } else {
      result = {ok:false,error:'Ação GET desconhecida.'};
    }
    return response_(result, e.parameter.callback || '');
  } catch (err) {
    return response_({ok:false,error:String(err && err.message || err)}, (e && e.parameter && e.parameter.callback) || '');
  }
}

function doPost(e) {
  try {
    setup_();
    const payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
    if (payload.action === 'submit') return json_(submit_(payload));
    if (payload.action === 'setRound') return json_(setRound_(payload));
    if (payload.action === 'resetSession') return json_(resetSession_(payload));
    return json_({ok:false,error:'Ação POST desconhecida.'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Para leituras feitas a partir do GitHub Pages, aceita JSONP via ?callback=...
// Isso evita depender de CORS do Apps Script em navegadores móveis.
function response_(obj, callback) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const cb = String(callback || '');
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}

function getConfigMap_() {
  const cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  const values = cs.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) map[String(values[i][0])] = String(values[i][1]);
  return map;
}

function setConfig_(key, value) {
  const cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  const values = cs.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === key) { cs.getRange(i+1,2).setValue(String(value)); return; }
  }
  cs.appendRow([key,String(value)]);
}

function getState_() {
  const c = getConfigMap_();
  return {ok:true,currentRound:Number(c.current_round || 0),sessionId:c.session_id,status:c.status || 'waiting'};
}

function submit_(p) {
  const c = getConfigMap_();
  if (!p.sessionId || p.sessionId !== c.session_id) throw new Error('Sessão inválida ou encerrada. Atualize a página.');
  const round = Number(p.round || 0);
  if (round !== Number(c.current_round || 0)) throw new Error('Esta rodada não está mais aberta.');
  if (!p.participantId || !Array.isArray(p.answers)) throw new Error('Resposta inválida.');

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const rs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET);
    const now = new Date();
    const rows = p.answers.map(a => [now,p.sessionId,p.participantId,round,a.questionId,a.questionLabel || '',String(a.answer || ''),JSON.stringify(a.meta || {})]);
    if (rows.length) rs.getRange(rs.getLastRow()+1,1,rows.length,8).setValues(rows);
  } finally { lock.releaseLock(); }
  return {ok:true};
}

function getSubmissionStatus_(sessionId, round, participantId) {
  const c = getConfigMap_();
  if (!sessionId || sessionId !== c.session_id) return {ok:true,submitted:false,reason:'session'};
  if (!participantId || !round) return {ok:true,submitted:false};
  const rs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET);
  const values = rs.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === String(sessionId) &&
        String(values[i][2]) === String(participantId) &&
        Number(values[i][3]) === Number(round)) {
      return {ok:true,submitted:true};
    }
  }
  return {ok:true,submitted:false};
}

function assertAdmin_(p) {
  if (!p.adminKey || p.adminKey !== ADMIN_KEY) throw new Error('Chave do facilitador incorreta.');
}

function setRound_(p) {
  assertAdmin_(p);
  const round = Number(p.round);
  if (round < 0 || round > 6) throw new Error('Rodada inválida.');
  setConfig_('current_round', round);
  setConfig_('status', round === 0 ? 'waiting' : (round === 6 ? 'finished' : 'live'));
  return {ok:true,...getState_()};
}

function resetSession_(p) {
  assertAdmin_(p);
  const id = newSessionId_();
  setConfig_('session_id', id);
  setConfig_('current_round', 0);
  setConfig_('status', 'waiting');
  return {ok:true,sessionId:id};
}

function newSessionId_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyyMMdd-HHmm') + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

function getResults_(sessionId, round) {
  const c = getConfigMap_();
  const sid = sessionId || c.session_id;
  const rs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET);
  const values = rs.getDataRange().getValues();

  // Mantém somente a resposta mais recente por participante + pergunta.
  const latest = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[1]) !== String(sid)) continue;
    if (round && Number(row[3]) !== Number(round)) continue;
    const key = String(row[2]) + '|' + String(row[4]);
    latest[key] = {timestamp:row[0],participantId:String(row[2]),round:Number(row[3]),questionId:String(row[4]),questionLabel:String(row[5]),answer:String(row[6])};
  }

  const participants = {};
  const questions = {};
  Object.keys(latest).forEach(k => {
    const x = latest[k]; participants[x.participantId] = true;
    if (!questions[x.questionId]) questions[x.questionId] = {questionId:x.questionId,questionLabel:x.questionLabel,answers:[]};
    questions[x.questionId].answers.push({participantId:x.participantId,answer:x.answer});
  });

  return {ok:true,sessionId:sid,round:round,participantCount:Object.keys(participants).length,questions:Object.keys(questions).map(k=>questions[k])};
}
