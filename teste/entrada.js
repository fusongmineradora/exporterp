/* ═══════════════════════════════════════════════════════════
 * Fu Song ERP — AMBIENTE DE TESTES (fusongmineradora.com/teste)
 * ───────────────────────────────────────────────────────────
 * 1. Isolamento: planilha de testes (cópia da produção) e pasta
 *    "Fu Song ERP — TESTE" no Drive. Nada aqui grava na produção.
 * 2. Caixa de Entrada: lê os arquivos da pasta "📥 Entrada",
 *    reconhece o tipo de documento e o processo, e anexa ao botão
 *    certo do processo depois da sua confirmação.
 * ═══════════════════════════════════════════════════════════ */

// ── 1. ISOLAMENTO ───────────────────────────────────────────
// Sem dados de exemplo no ambiente de testes: tudo vem da planilha de teste
S.processos = []; S.clientes = []; S.fornecedores = []; S.lancamentos = []; S.custosMensais = [];
// Geração 3 (11/10/2026): recomeço do zero para importar a organização nova (Processos Unificados + Despesas Gerais + OFX);
// planilha e pasta novas — as das gerações 1 e 2 ficam no Drive sem uso
// Ambiente (definido no index.html): oficial = planilha e pasta fixas; teste = cópia própria (TESTE 4)
const ERP_ENV = window.ERP_ENV || {};
const TESTE_SHEET_NAME = ERP_ENV.sheetName || 'Fu Song ERP Database — TESTE 3';
const GERACAO = ERP_ENV.geracao || '3';
const FLAG_PASTA = ERP_ENV.flagPasta || '_testeOk';
if (ERP_ENV.rootFolderId) window._rootFolderId = ERP_ENV.rootFolderId;
let _ensureTestSheetPromise = null;

function ensureTestSheet() {
  if (SHEET_ID !== TESTE_SENTINEL) return Promise.resolve(SHEET_ID);
  if (ERP_ENV.sheetId) { SHEET_ID = ERP_ENV.sheetId; return Promise.resolve(SHEET_ID); }
  if (!_ensureTestSheetPromise) {
    _ensureTestSheetPromise = _ensureTestSheet().catch(e => { _ensureTestSheetPromise = null; throw e; });
  }
  return _ensureTestSheetPromise;
}

async function _ensureTestSheet() {
  // recomeço (geração 3): o backup local da planilha antiga não pode voltar
  try { if (localStorage.getItem('teste:geracao') !== GERACAO) { localStorage.removeItem('teste:erp-local-backup'); localStorage.setItem('teste:geracao', GERACAO); } } catch (e) {}
  // a) já usada neste aparelho
  let saved = null;
  try { saved = localStorage.getItem('teste:sheet-id-' + GERACAO); } catch (e) {}
  if (saved && saved !== PROD_SHEET_ID) {
    try {
      const f = await driveAPI('GET', '/files/' + saved, null, 'fields=id,trashed');
      if (f && !f.trashed) { SHEET_ID = saved; return SHEET_ID; }
    } catch (e) {}
  }
  // b) já existe no Drive (criada em outro aparelho)
  const q = `name='${TESTE_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const found = await driveAPI('GET', '/files', null, 'q=' + encodeURIComponent(q) + '&fields=files(id,name)&spaces=drive');
  if (found.files && found.files.length) {
    SHEET_ID = found.files[0].id;
  } else {
    // c) criar planilha de testes VAZIA (as abas e cabeçalhos são criados pelo setupSheets)
    showSyncIndicator('Criando planilha de testes vazia...');
    const nova = await driveAPI('POST', '/files', { name: TESTE_SHEET_NAME, mimeType: 'application/vnd.google-apps.spreadsheet' }, 'fields=id');
    hideSyncIndicator();
    SHEET_ID = nova.id;
    try { localStorage.removeItem('teste:erp-local-backup'); } catch (e) {}   // planilha nova: backup antigo não volta
    showToast('✅ Planilha de testes criada');
  }
  if (SHEET_ID === PROD_SHEET_ID) throw new Error('Bloqueado: planilha de testes igual à de produção.');
  try { localStorage.setItem('teste:sheet-id-' + GERACAO, SHEET_ID); } catch (e) {}
  return SHEET_ID;
}

// Carrega e garante que nenhum processo aponte para pastas da produção
async function loadFromSheets() {
  await ensureTestSheet();
  const marcaAntes = await _lerMarca();   // v86: qual foi a última gravação que estes dados já incluem
  await _loadFromSheetsBase();
  _fotoBase86(); _marcaVista = marcaAntes;   // v86: como a planilha estava ao abrir (para juntar com o que outro aparelho gravar)
  let changed = 0;
  (S.processos || []).forEach(p => {
    if (p.docs && p.docs._folderId && !p.docs[FLAG_PASTA]) {
      p.docs._prodFolderId = p.docs._folderId;
      p.docs._prodFolderUrl = p.docs._folderUrl || '';
      delete p.docs._folderId;
      delete p.docs._folderUrl;
      changed++;
    }
  });
  if (changed) {
    try { await saveToSheets(); } catch (e) {}
  }
  _carregadoEm = new Date().toISOString();
  if (S.page === 'entrada' || S.page === 'dashboard') render();
  if (typeof migrarDocsV2 === 'function') setTimeout(migrarDocsV2, 800);
}

// ── Duas abas / dois aparelhos: avisa antes de sobrescrever alterações feitas em outro lugar ──
const _SESSAO = Math.random().toString(36).slice(2, 10);
let _carregadoEm = '';
async function _lerMarca() {
  try { const r = await sheetsAPI('GET', `/${SHEET_ID}/values/CONFIG!E1`); return String(((r.values || [])[0] || [])[0] || ''); } catch (e) { return ''; }
}
let _marcaVista = '';   // v86: marca da última gravação que este aparelho já tem (dele ou de outro lugar)
async function _gravarMarca() {
  const v = _SESSAO + '|' + new Date().toISOString();
  try { await sheetsAPI('PUT', `/${SHEET_ID}/values/CONFIG!D1:E1?valueInputOption=RAW`, { values: [['ultima_gravacao', v]] }); return v; } catch (e) { return ''; }
}
// ── v86: gravação segura com dois aparelhos ou abas abertos ──
// A gravação reescreve a planilha inteira. Se outro lugar gravou depois que este abriu, antes de gravar
// o sistema lê a planilha e junta: o que só o outro lugar mudou entra aqui; o que os dois mudaram fica
// como está aqui; arquivo anexado lá nunca é apagado; registro criado lá (processo, lançamento...) é mantido.
const _ABAS86 = [['PROCESSOS', 'processos'], ['CLIENTES', 'clientes'], ['FORNECEDORES', 'fornecedores'], ['EXTRATO_CAIXA', 'lancamentos'], ['CUSTOS_FIXOS', 'custosMensais']];
let _base86 = null;
const _copia86 = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const _ehObj86 = v => !!v && typeof v === 'object' && !Array.isArray(v);
const _ehListaArq86 = v => Array.isArray(v) && v.length > 0 && v.every(x => _ehObj86(x) && (x.id || x.url));
function _estavel86(v) {
  if (v === undefined || v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(_estavel86).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + _estavel86(v[k])).join(',') + '}';
}
function _fotoBase86() {
  try { const b = {}; _ABAS86.forEach(([aba, k]) => { const m = {}; (S[k] || []).forEach(o => { if (o && o.id) m[o.id] = _copia86(o); }); b[aba] = m; }); _base86 = b; }
  catch (e) { console.warn('foto da planilha', e); _base86 = null; }
}
// junta "r" (o que está na planilha) em "l" (este aparelho), sabendo como era ao abrir ("b"); muda "l" no lugar
function _juntaEm86(b, l, r) {
  const bb = _ehObj86(b) ? b : {}; let n = 0;
  new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(bb)]).forEach(k => {
    const bk = bb[k], lk = l[k], rk = r[k];
    const sb = _estavel86(bk), sr = _estavel86(rk); if (sr === sb) return;     // o outro lugar não mexeu
    const sl = _estavel86(lk); if (sl === sr) return;
    if (_ehObj86(lk) && _ehObj86(rk)) { n += _juntaEm86(bk, lk, rk); return; }
    if (sl === sb) {                                                           // só o outro lugar mexeu
      if (rk === undefined) delete l[k];
      else if (Array.isArray(lk) && Array.isArray(rk)) lk.splice(0, lk.length, ..._copia86(rk));
      else l[k] = _copia86(rk);
      n++; return;
    }
    if ((Array.isArray(lk) || lk === undefined) && _ehListaArq86(rk)) {        // os dois mexeram numa lista de arquivos: soma o que foi anexado lá
      const ch = x => x.id || x.url, temL = new Set((lk || []).map(ch)), temB = new Set((Array.isArray(bk) ? bk : []).map(ch));
      const novos = rk.filter(x => !temL.has(ch(x)) && !temB.has(ch(x)));
      if (novos.length) { if (!Array.isArray(l[k])) l[k] = []; l[k].push(..._copia86(novos)); n += novos.length; }
    }
    // os dois mexeram no mesmo campo: fica o deste aparelho
  });
  return n;
}
function _normaliza86(aba, o) {   // igual à leitura da planilha ao abrir
  const num = ks => ks.forEach(k => { o[k] = parseFloat(o[k]) || 0; });
  const docs = () => { if (o.docs && typeof o.docs === 'string') { try { o.docs = JSON.parse(o.docs); } catch (e) { o.docs = {}; } } else if (!o.docs) o.docs = {}; };
  if (aba === 'PROCESSOS') {
    num(['custoMaritimo', 'custoFrete', 'custoCertificado', 'custoArmazem', 'custoPorto', 'custoDespachante', 'custoServTerceiros', 'custoImpostos', 'custoProduto', 'cambioInvoice', 'cambioTaxa', 'cambioReais', 'cambioIOF', 'cambioSpread', 'cambioRecebido']);
    if (typeof calcTaxa === 'function') o.cambioTaxa = calcTaxa(o.cambioReais, o.cambioRecebido);
    if (o.containers && typeof o.containers === 'string') { try { const x = JSON.parse(o.containers); o.containers = Array.isArray(x) && x.length > 0 ? x : [o.container || '']; } catch (e) { o.containers = [o.container || '']; } }
    else if (!Array.isArray(o.containers) || !o.containers.length) o.containers = [o.container || ''];
    docs();
  } else if (aba === 'EXTRATO_CAIXA') { o.valor = parseFloat(o.valor) || 0; docs(); }
  else if (aba === 'CUSTOS_FIXOS') { num(['contador', 'aluguel', 'software', 'internet', 'telefone', 'impostos', 'outros']); docs(); }
  return o;
}
async function _juntarComPlanilha86() {
  if (!_base86) return null;
  const abas = _ABAS86.map(a => a[0]);
  const res = await sheetsAPI('GET', `/${SHEET_ID}/values:batchGet?ranges=${abas.join('&ranges=')}&majorDimension=ROWS`);
  let n = 0;
  (res.valueRanges || []).forEach((vr, i) => {
    const [aba, chave] = _ABAS86[i], vals = (vr && vr.values) || [];
    if (vals.length < 2 || !Array.isArray(S[chave])) return;   // aba vazia (ou no meio de outra gravação): não usa
    const hs = vals[0], base = _base86[aba] || {}, meus = {}, deLa = new Set();
    S[chave].forEach(o => { if (o && o.id) meus[o.id] = o; });
    vals.slice(1).forEach(row => {
      const o = {}; hs.forEach((h, j) => { o[h] = row[j] || ''; }); if (!o.id) return;
      const r = _normaliza86(aba, o), l = meus[r.id], b = base[r.id]; deLa.add(r.id);
      if (!l) { if (!b) { S[chave].push(r); n++; } return; }                 // criado no outro lugar (apagado aqui: não volta)
      n += _juntaEm86(b || {}, l, r);
    });
    // apagado no outro lugar (ex.: lançamento repetido): sai daqui também, se aqui não mudou
    if (deLa.size >= Object.keys(base).length / 2) {
      for (let i = S[chave].length - 1; i >= 0; i--) { const o = S[chave][i], b = o && o.id && base[o.id];
        if (b && !deLa.has(o.id) && _estavel86(o) === _estavel86(b)) { S[chave].splice(i, 1); n++; } }
    }
  });
  return { n };
}
const _saveToSheetsBase = saveToSheets;
let _conflitoAberto = false;
saveToSheets = async function () {
  await ensureTestSheet();
  if (_carregadoEm && !_conflitoAberto) {
    const marca = await _lerMarca(), [sid, quando] = marca.split('|');
    // outro lugar gravou depois da última gravação que este aparelho tem (pela marca, não pelo relógio dos aparelhos)
    const outro = !!(sid && sid !== _SESSAO && marca !== _marcaVista);
    let jr = null;
    if (outro) {
      try { jr = await _juntarComPlanilha86(); } catch (e) { console.warn('juntar com a planilha', e); }
      if (jr) { _marcaVista = marca; if (jr.n) showToast(`🔄 Juntei com o que foi feito em outro aparelho ou aba às ${new Date(quando).toLocaleTimeString('pt-BR')}`); }
    }
    if (outro && !jr) {
      _conflitoAberto = true;
      const recarregar = await uiConfirm(`Os dados foram alterados em outro aparelho ou aba às ${new Date(quando).toLocaleTimeString('pt-BR')}, depois que você abriu esta tela.\n\nSe salvar agora, o que foi feito lá pode ser perdido. Recarregar os dados antes? (a sua última alteração precisará ser refeita)`, 'Alterações em outro lugar', 'Recarregar', 'Salvar mesmo assim');
      _conflitoAberto = false;
      if (recarregar) { await loadFromSheets(); showToast('Dados recarregados'); render(); return; }
    }
  }
  // célula do Google Sheets aceita até 50.000 caracteres: os dados de arquivos de cada processo são enxugados antes de passar disso
  try { (S.processos || []).forEach(p => enxugarDocs(p)); } catch (e) { console.warn('enxugar', e); }
  // antes de gravar: junta processo renumerado e atualiza os custos previstos (containers, certificado, armazém, valor real)
  try { if (typeof lancamentosDeCustoViramBaixa === 'function' && lancamentosDeCustoViramBaixa() && typeof salvarBanco === 'function') salvarBanco().catch(() => {}); if (typeof ajustarInvoiceTransferida === 'function') ajustarInvoiceTransferida(); } catch (e) { console.warn('baixas', e); }
  try { if (typeof juntarProcessosRenumerados === 'function') juntarProcessosRenumerados(); if (typeof aplicarPrevistos === 'function') (S.processos || []).forEach(p => aplicarPrevistos(p)); } catch (e) { console.warn('previstos', e); }
  const r = await _saveToSheetsBase.apply(this, arguments);
  if (r === true) {   // v86: só conta como gravado se gravou (antes marcava mesmo com erro de rede)
    const v = await _gravarMarca(); if (v) _marcaVista = v;
    _carregadoEm = new Date().toISOString();
    _fotoBase86();    // a planilha agora é o que este aparelho gravou
  }
  // gravou: o backup do navegador passa a ser a cópia do que está na planilha (não é mais oferecido para restaurar)
  if (r === true) { try { localStorage.setItem('teste:erp-local-backup', JSON.stringify({ processos: S.processos, clientes: S.clientes, fornecedores: S.fornecedores, lancamentos: S.lancamentos, custosMensais: S.custosMensais, savedAt: Date.now(), sincronizado: true })); } catch (e) { try { localStorage.removeItem('teste:erp-local-backup'); } catch (_) {} } }
  return r;
};

// Backup do navegador: só oferece restaurar se ele for MAIS NOVO que a última gravação da planilha
// (antes comparava só a quantidade de linhas: depois de apagar repetidos, o backup velho parecia "ter mais dados")
if (typeof checkLocalBackup === 'function') {
  const _checkBase = checkLocalBackup;
  checkLocalBackup = async function () {
    try {
      const raw = localStorage.getItem('teste:erp-local-backup'); if (!raw) return;
      const b = JSON.parse(raw);
      if (!b || b.sincronizado) return;
      const [, quando] = String(await _lerMarca() || '').split('|');
      if (quando && new Date(quando).getTime() > (Number(b.savedAt) || 0)) { localStorage.removeItem('teste:erp-local-backup'); return; }
    } catch (e) { return; }
    return _checkBase.apply(this, arguments);
  };
}

// ── 2. DOCUMENTOS COM VÁRIOS ARQUIVOS ───────────────────────
function docCount(p, k) {
  const files = p && p.docs && p.docs._files && p.docs._files[k];
  if (files && files.length) return files.length;
  return p && p.docs && p.docs[k] ? 1 : 0;
}

function docFilesHtml(p, k) {
  const files = (p && p.docs && p.docs._files && p.docs._files[k]) || [];
  if (!files.length) return '';
  return `<div style="margin:4px 0 14px">
    <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Arquivos anexados (${files.length})</div>
    ${files.map(f => `<a href="${sanitizeUrl(f.url)}" target="_blank" rel="noopener noreferrer"
        style="display:flex;justify-content:space-between;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:5px;font-size:12px;color:var(--text);text-decoration:none">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(f.name)}</span>
        <span style="color:var(--muted);white-space:nowrap">${f.numero ? 'nº ' + escHtml(f.numero) : ''} ↗</span></a>`).join('')}
  </div>`;
}

// ── 3. CAIXA DE ENTRADA ─────────────────────────────────────
const ENTRADA_FOLDER = (window.ERP_ENV && ERP_ENV.entradaNome) || '📥 Entrada';
const DUPLICADOS_FOLDER = '🔁 Duplicados';
const ENTRADA_TIPOS = [
  ['invoice', 'Invoice'], ['contrato', 'Contrato'], ['packingList', 'Packing List'], ['bl', 'BL'],
  ['due', 'DU-E'], ['nfe', 'NF-E Entrada'], ['nfeSaida', 'NF-E Saída'], ['cte', 'CT-e (frete)'],
  ['mdfe', 'MDF-e'], ['booking', 'Booking (reserva)'], ['nfse', 'NFS-e (serviço)'], ['recibo', 'Recibo / RPA'], ['comprovantes', 'Comprovantes Câmbio'], ['certOrigem', 'Cert. Origem'],
  ['seguro', 'Seguro de Carga'], ['pesagem', 'Pesagem'], ['pagamento', 'Comprovante de Pagamento'],
  ['faturaFrete', 'Fatura de frete (agente)'], ['planilhaCambio', 'Planilha de câmbio (banco)'], ['boleto', 'Boleto (cobrança)'], ['guia', 'Guia de imposto (DARF)'], ['outros', 'Outros Documentos'],
];
const tipoLabel = k => (ENTRADA_TIPOS.find(t => t[0] === k) || [k, k])[1];

S.entrada = S.entrada || { itens: [], carregando: false, lido: false, erro: '', progresso: '' };

async function getTesteFolder(name) {
  window._testeFolders = window._testeFolders || {};
  if (window._testeFolders[name]) return window._testeFolders[name];
  // duas chamadas ao mesmo tempo criavam DUAS pastas "📥 Entrada" (uma recebia os arquivos e a outra era lida): guarda a promessa
  window._testeFoldersP = window._testeFoldersP || {};
  if (!window._testeFoldersP[name]) window._testeFoldersP[name] = (async () => {
    // oficial: a Caixa de Entrada é a sua pasta "00 Entrada"; as pastas de trabalho do sistema ficam juntas numa subpasta
    if (name === ENTRADA_FOLDER && ERP_ENV.entradaId) { window._testeFolders[name] = ERP_ENV.entradaId; return ERP_ENV.entradaId; }
    let root = await getRootFolderId();
    if (name !== ENTRADA_FOLDER && ERP_ENV.sistemaNome) root = await getOrCreateFolder(ERP_ENV.sistemaNome, root);
    const id = await getOrCreateFolder(name, root);
    window._testeFolders[name] = id;
    return id;
  })().catch(e => { delete window._testeFoldersP[name]; throw e; });
  return window._testeFoldersP[name];
}

// mesma proteção para a pasta raiz do teste (duas chamadas juntas não criam duas raízes)
if (typeof getRootFolderId === 'function' && !getRootFolderId._uma) {
  const baseRoot = getRootFolderId; let pRoot = null;
  getRootFolderId = function () { if (window._rootFolderId) return Promise.resolve(window._rootFolderId); if (!pRoot) pRoot = baseRoot().catch(e => { pRoot = null; throw e; }); return pRoot; };
  getRootFolderId._uma = true;
}

async function driveDownload(fileId) {
  const token = await getAccessToken();
  const res = await fetch(DRIVE_API + '/files/' + fileId + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Não foi possível baixar o arquivo (' + res.status + ')');
  return res.arrayBuffer();
}

// Leitor de PDF (pdf.js) carregado só quando necessário
const PDFJS_VER = '3.11.174';
async function loadPdfJs() {
  if (window.pdfjsLib && window.pdfjsLib.__pronto) return window.pdfjsLib;
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF.'));
      document.head.appendChild(s);
    });
  }
  // Worker como blob (navegadores não aceitam worker de outro domínio)
  try {
    const w = await fetch(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`).then(r => r.text());
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([w], { type: 'text/javascript' }));
  } catch (e) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
  }
  window.pdfjsLib.__pronto = true;
  return window.pdfjsLib;
}

async function pdfTexto(buf) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const n = Math.min(doc.numPages, 6);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // v85: o pdf.js do navegador quebra o texto depois de "-" e "/" ("DU-" + "E", "NF-" + "e 001/...", "S/" + "A");
    // nesses pontos junta sem espaço, senão "DU- E" e "NF- e" não eram reconhecidos (DU-E sem nota de saída e sem situação)
    const its = tc.items;
    out += its.map((it, i) => {
      if (it.hasEOL) return it.str + '\n';
      const prox = its[i + 1];
      return it.str + ((/\S[-\/]$/.test(it.str || '') && prox && /^\S/.test(prox.str || '')) ? '' : ' ');
    }).join('') + '\n';
  }
  return out;
}

// ── Reconhecimento ──────────────────────────────────────────
// Chave de acesso: 44 dígitos; dígito verificador módulo 11
function dvChaveOk(ch) {
  if (!/^\d{44}$/.test(ch)) return false;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(ch[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  const dv = (r === 0 || r === 1) ? 0 : 11 - r;
  return dv === Number(ch[43]);
}

function chavesDoTexto(txt) {
  // Formatos aceitos: 44 dígitos seguidos, ou 11 grupos de 4 separados por espaço/ponto
  // (como sai no DANFE/DACTE). Exige fronteira antes e depois, e dígito verificador válido.
  const out = [];
  const t = String(txt || '');
  const re = /(?<![\d])(?:\d{44}|\d{4}(?:[\s.]{1,3}\d{4}){10})(?![\d])/g;
  let m;
  while ((m = re.exec(t))) {
    const ch = m[0].replace(/\D/g, '');
    if (dvChaveOk(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

function infoChave(ch) {
  return {
    chave: ch, uf: ch.slice(0, 2), aamm: ch.slice(2, 6), emitCnpj: ch.slice(6, 20),
    modelo: ch.slice(20, 22), serie: String(Number(ch.slice(22, 25))), numero: String(Number(ch.slice(25, 34))),
  };
}

const FU_SONG_CNPJ = '44962707000154';
const tipoPorModelo = m => m === '57' ? 'cte' : m === '58' ? 'mdfe' : (m === '55' || m === '65') ? 'nfe' : '';

// XML fiscal (NF-e, CT-e, MDF-e)
function lerXmlFiscal(txt) {
  let doc;
  try { doc = new DOMParser().parseFromString(txt, 'application/xml'); } catch (e) { return null; }
  if (!doc || doc.getElementsByTagName('parsererror').length) return null;
  const first = (name, root) => { const el = (root || doc).getElementsByTagNameNS('*', name)[0]; return el ? el.textContent.trim() : ''; };
  const all = name => Array.from(doc.getElementsByTagNameNS('*', name)).map(e => e.textContent.trim());
  const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0] || doc.getElementsByTagNameNS('*', 'infCte')[0] || doc.getElementsByTagNameNS('*', 'infMDFe')[0];
  if (!inf) return null;
  const chave = (inf.getAttribute('Id') || '').replace(/\D/g, '');
  const emit = doc.getElementsByTagNameNS('*', 'emit')[0];
  const dest = doc.getElementsByTagNameNS('*', 'dest')[0];
  const info = {
    origem: 'xml', chave, modelo: first('mod'),
    numero: first('nNF') || first('nCT') || first('nMDF'),
    serie: first('serie'),
    emitCnpj: emit ? first('CNPJ', emit) || first('CPF', emit) : '',
    emitNome: emit ? first('xNome', emit) : '',
    emitIE: emit ? first('IE', emit) : '',
    emitCep: emit ? first('CEP', emit) : '',
    emitEnd: emit ? [[first('xLgr', emit), first('nro', emit)].filter(Boolean).join(', '), [first('xMun', emit), first('UF', emit)].filter(Boolean).join('/')].filter(Boolean).join(' - ') : '',
    destNome: dest ? first('xNome', dest) : '',
    valor: Number(first('vNF') || first('vTPrest') || 0) || 0,
    cfop: first('CFOP'),
    data: (first('dhEmi') || first('dEmi')).slice(0, 10),
    refs: [...new Set([...all('chave'), ...all('chNFe'), ...all('chCTe'), ...all('refNFe'), ...chavesDoTexto(first('infCpl'))].map(c => c.replace(/\D/g, '')).filter(c => c.length === 44 && c !== chave))],
    protocolo: first('nProt'),
    emitMun: emit ? [first('xMun', emit), first('UF', emit)].filter(Boolean).join(' / ') : '',
    munIni: [first('xMunIni'), first('UFIni')].filter(Boolean).join(' / '),
    munFim: [first('xMunFim'), first('UFFim')].filter(Boolean).join(' / '),
    transpNome: (() => { const t = doc.getElementsByTagNameNS('*', 'transporta')[0]; return t ? first('xNome', t) : ''; })(),
    infCpl: first('infCpl').slice(0, 500),
    ncm: first('NCM'),   // NCM do primeiro produto (usado na invoice / contrato)
  };
  info.tipo = tipoPorModelo(info.modelo);
  if (info.tipo === 'nfe' && (info.emitCnpj === FU_SONG_CNPJ || /^7/.test(info.cfop))) info.tipo = 'nfeSaida';
  return info;
}

// NFS-e (nota de serviço) em XML: ABRASF (CompNfse/InfNfse) ou padrão nacional (infNFSe)
function lerXmlNfse(txt) {
  if (!/<(\w+:)?(CompNfse|InfNfse|Nfse|infNFSe|NFSe)\b/i.test(txt)) return null;
  let doc; try { doc = new DOMParser().parseFromString(txt, 'application/xml'); } catch (e) { return null; }
  const first = (...names) => { for (const n of names) { const el = doc.getElementsByTagNameNS('*', n)[0]; if (el && el.textContent.trim()) return el.textContent.trim(); } return ''; };
  const prest = doc.getElementsByTagNameNS('*', 'PrestadorServico')[0] || doc.getElementsByTagNameNS('*', 'Prestador')[0] || doc.getElementsByTagNameNS('*', 'emit')[0];
  const sub = (root, ...names) => { if (!root) return ''; for (const n of names) { const el = root.getElementsByTagNameNS('*', n)[0]; if (el) return el.textContent.trim(); } return ''; };
  // v92: NFS-e nacional — chave de acesso de 50 dígitos no Id do infNFSe (a mesma impressa no PDF / DANFSe)
  const infN = doc.getElementsByTagNameNS('*', 'infNFSe')[0];
  const ch50 = ((infN && infN.getAttribute('Id')) || '').match(/\d{50}/);
  return {
    chaveNfse: ch50 ? ch50[0] : '', emitEmail: sub(prest, 'email', 'Email'),
    origem: 'xml', tipo: 'nfse', modelo: 'NFS-e',
    numero: first('Numero', 'nNFSe', 'nDFSe'),
    emitCnpj: sub(prest, 'Cnpj', 'CNPJ'), emitNome: sub(prest, 'RazaoSocial', 'xNome', 'NomeFantasia'),
    valor: Number(String(first('ValorLiquidoNfse', 'ValorServicos', 'vLiq', 'vServ')).replace(',', '.')) || 0,
    data: first('DataEmissao', 'dhEmi', 'dhProc').slice(0, 10),
    descricao: first('Discriminacao', 'xDescServ').slice(0, 200),
    chave: (first('CodigoVerificacao') ? 'NFSE-' + sub(prest, 'Cnpj', 'CNPJ') + '-' + first('Numero', 'nNFSe') : (ch50 ? ch50[0] : '')),
    refs: [],
  };
}

// Valor total da nota no texto do DANFE (quando não há XML)
function valorDanfe(texto) {
  const T = String(texto || '').replace(/\s+/g, ' ');
  const m = T.match(/V(?:ALOR|\.)\s*TOTAL\s*DA\s*NOTA\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
  const v = m ? numBR(m[1]) : 0;
  if (v > 0) return v;
  const todos = [...T.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(x => numBR(x[1]));
  return todos.length ? Math.max(...todos) : 0;
}

// Documento comum (PDF ou nome do arquivo): ordem importa
const REGRAS_TIPO = [
  ['nfe', /DANFE[\s\S]{0,300}NOTA\s+FISCAL\s+ELETR[OÔ]NICA|DOCUMENTO\s+AUXILIAR\s+DA\s+NOTA\s+FISCAL\s+ELETR[OÔ]NICA/],
  // CT-e / MDF-e pelo texto (quando a chave de acesso vem ilegível): antes caíam em "seguro" pela apólice impressa no DACTE
  ['cte', /\bDACTE\b|DOCUMENTO\s+AUXILIAR\s+DO\s+CONHECIMENTO\s+DE\s+TRANSPORTE/],
  ['mdfe', /\bDAMDFE\b|MANIFESTO\s+ELETR[OÔ]NICO\s+DE\s+DOCUMENTOS/],
  ['faturaFrete', /FATURA\s+(?:DE\s+)?EXPORTA[CÇ][AÃ]O\s+MAR[IÍ]TIMA|FATURA\s+DE\s+FRETE|FREIGHT\s+INVOICE|DEBIT\s+NOTE|NUMER[AÁ]RIO/],
  ['nfse', /NOTA\s+FISCAL\s+(ELETR[OÔ]NICA\s+)?DE\s+SERVI[CÇ]OS?|\bNFS-?E\b|DANFSE/],
  ['recibo', /^\s*RECIBO\b|RECIBO\s+DE\s+PAGAMENTO|\bRPA\b|RECIBO\s+DE\s+PAGAMENTO\s+A\s+AUT[OÔ]NOMO/],
  ['bl', /BILL\s+OF\s+LADING|\bB\/L\s*(NO|N[º°])/],
  ['packingList', /PACKING\s+LIST|ROMANEIO/],
  ['certOrigem', /CERTIFICATE\s+OF\s+ORIGIN|CERTIFICADO\s+DE\s+ORIGEM/],
  ['due', /DECLARA[CÇ][AÃ]O\s+[UÚ]NICA\s+DE\s+EXPORTA|\bDU-?E\b/],
  ['comprovantes', /CONTRATO\s+DE\s+C[AÂ]MBIO|LIQUIDA[CÇ][AÃ]O\s+DE\s+C[AÂ]MBIO|BOLETO\s+DE\s+C[AÂ]MBIO/],
  ['pagamento', /COMPROVANTE\s+DE\s+(PAGAMENTO|TRANSFER|PIX)|COMPROVANTE\s+PIX|PIX\s+ENVIADO|PAGAMENTO\s+EFETUADO|AUTENTICA[CÇ][AÃ]O\s+MEC/],
  ['contrato', /SALES\s+CONTRACT|PURCHASE\s+CONTRACT|CONTRATO\s+DE\s+COMPRA\s+E\s+VENDA/],
  ['invoice', /COMMERCIAL\s+INVOICE|PROFORMA\s+INVOICE|\bINVOICE\b/],
  ['seguro', /AP[OÓ]LICE|AVERBA[CÇ][AÃ]O|SEGURO\s+DE\s+CARGA/],
  ['pesagem', /PESAGEM|TICKET\s+DE\s+BALAN|BALAN[CÇ]A\s+RODOVI/],
];

// Pelo nome do arquivo (ex.: "Comprovante AZ - FS260109.png", "Dacte 1024 NF 51 ...pdf")
const REGRAS_NOME = [
  ['nfse', /\bNFS-?E\b|\bNFES\b|NFSE_/],
  ['recibo', /\bRECIBO\b|\bRPA\b/],
  ['pagamento', /^(?:(?:ADM|FS\d{6}S?)[\s\-+_]*)*(COMPROVANTE|PAGAMENTO|PIX|ADIANTAMENTO|TRANSFER)/],
  ['comprovantes', /C[AÂ]MBIO/],
  ['guia', /DCTFWEB|\bDARF\b|GUIA\s*(?:DE\s*)?(?:PAGAMENTO|IMPOSTO|INSS|DAS)\b/],
  ['cte', /\bDACTE\b|\bCT-?E\b/],
  ['mdfe', /\bMDF-?E?\b|DAMDFE/],
  ['packingList', /PACKING/],
  ['bl', /\bB\/?L\b|BILL OF LADING/],
  ['due', /\bDU-?E\b/],
  ['invoice', /INVOICE/],
  ['contrato', /SALES CONTRACT|CONTRATO/],
  ['certOrigem', /ORIGEM|ORIGIN/],
  ['pesagem', /PESAGEM|TICKET/],
  ['nfe', /\bNF-?E?\b|NOTA FISCAL|DANFE/],
];
// Categoria de custo sugerida pelo nome do comprovante
function categoriaPeloNome(N) {
  const m = [
    [/MAR[IÍ]TIMO|FRETE INTERNACIONAL|ACC?ESS|AGENTE DE CARGA|MAERSK|COSCO|\bMSC\b|HAPAG/, 'Frete Marítimo'], [/TRANSPORTADORA|TRANSPORTES|ITALIANA|RODOVI|\bCT-?E\b|DACTE/, 'Frete Rodoviário'],
    [/\bAZ\b|ARMAZ|T5S|OZIRIS/, 'Armazém'], [/DESPACHANTE|DESPACHOS|ADUANEIR|\bCGA\b/, 'Despachante'], [/ASSESSORIA|\bADEMIR\b|\bFFA\b/, 'Serviços de Terceiros'], [/CERTIFICADO/, 'Certificado de Origem'], [/PORTO|TERMINAL/, 'Porto / Taxas'],
    [/NOTA DE ENTRADA|\bNFE\b|\bNF-E\b|MINERADORA|MINERA[CÇ][AÃ]O|PEDRA|PRODUTO|\bNOTA\b|CASCALHO/, 'Produto'], [/DARF|RECEITA FEDERAL|IMPOSTO/, 'Impostos'],
  ].find(([re]) => re.test(N));
  return m ? m[1] : '';
}

// Contrato de câmbio do Itaú: referência, valores e as faturas (processos) que ele paga
// número digitado nas telas: aceita "0,53", "0.53", "6500.50", "6.500,50", "13.500" (ponto com 3 casas = milhar) — 13/10/2026
function numEntrada(s) {
  s = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) return numBR(s);
  const ps = s.split('.');
  if (ps.length === 2 && ps[1].length !== 3) return Number(s) || 0;   // um ponto sem 3 casas depois = decimal
  return Number(s.replace(/\./g, '')) || 0;
}
function numBR(s) { // "53.238,18" | "10,740.00" | "4,957000000"
  s = String(s || '').trim();
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(/\./g, '').replace(',', '.'));
}
function lerCambio(texto) {
  const T = String(texto || '');
  if (!/OPERA[CÇ][AÃ]O\s+DE\s+C[AÂ]MBIO/i.test(T)) return null;
  const g = re => { const m = T.match(re); return m ? m[1] : ''; };
  const refInterna = g(/Ref(?:er[eê]ncia)?\s+Interna(?:\s+BANCO)?\W*:?\W*([\d\/]+)/i);
  const faturas = [];
  const re = /FATURA\W*?:?\W*(FS\s?\d{6}S?)\W+VALOR\W*?:?\W*([\d.,]+)/gi;
  let m;
  while ((m = re.exec(T))) faturas.push({ processo: m[1].replace(/\s/g, '').toUpperCase(), usd: numBR(m[2]) });
  const digits = refInterna.replace(/\D/g, '');
  return {
    referencia: g(/Refer[eê]ncia\s+(\d{6,})/i),
    data: g(/Data da opera[cç][aã]o\s+(\d{2}\/\d{2}\/\d{4})/i),
    moeda: g(/moeda estrangeira\s+([A-Z]{3})\b/i) || 'USD',
    valorMoeda: numBR(g(/Valor em moeda estrangeira\s+([\d.,]+)/i)),
    taxa: numBR(g(/Taxa cambial \(R\$\)\s+([\d.,]+)/i)),
    valorReais: numBR(g(/Valor em moeda nacional \(R\$\)\s+([\d.,]+)/i)),
    tarifa: numBR(g(/Tarifa \(R\$\)\s+([\d.,]+)/i)),
    refInterna,
    contratoExtrato: digits.length > 4 && digits.startsWith('0101') ? digits.slice(4) : digits, // = "LIQ EXPORT 3026633302" no extrato
    pagador: g(/NOME PAG\.?\W*:?\W*([A-Z0-9 ,.&]+?)\s+(?:PAIS|DATA|OPR)/i),
    liquidacao: g(/Liquida[cç][aã]o at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i) || g(/Data da entrega dos Reais\s+(\d{2}\/\d{2}\/\d{4})/i),
    embarque: g(/\bEMB\W*:?\W*(\d{2}\/\d{2}\/\d{4})/i) || g(/PREVIS[AÃ]O\s+(?:DE\s+)?EMBARQUE\W*:?\W*(\d{2}\/\d{2}\/\d{4})/i),
    modalidade: /PAGAMENTO\s+ANTECIPADO|RECEBIMENTO\s+ANTECIPADO/i.test(T) ? 'PAEX' : '',
    faturas,
  };
}

// Comprovante de PIX/transferência/boleto do Itaú
function lerPagamento(texto) {
  const T = String(texto || '');
  if (!/comprovante\s+de\s+(transfer[eê]ncia|pagamento|pix)|comprovante\s+pix|pix\s+(enviado|realizado)|transfer[eê]ncia\s+(realizada|efetuada)|pagamento\s+(realizado|efetuado)|via\s+SISPAG|valor\s+da\s+transfer[eê]ncia|tipo\s+de\s+transfer[eê]ncia|autentica[cç][aã]o\s+do\s+comprovante|ID\s+da\s+transa[cç][aã]o\s*:?\s*E\d{8}|autentica[cç][aã]o\s+no\s+comprovante|dados\s+do\s+benefici[aá]rio[\s\S]{0,400}valor\s+do\s+pagamento/i.test(T)) return null;
  const g = re => { const m = T.match(re); return m ? m[1].trim() : ''; };
  return {
    valor: numBR(g(/\bvalor(?:\s+do\s+pagamento|\s+da\s+transfer[eê]ncia)?\s*:?\s*R\$\s*([\d.,]+)/i)),
    data: g(/data\s+d[ao]\s+(?:transfer[eê]ncia|pagamento)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i),
    recebedor: g(/nome\s+do\s+recebedor\s*:?\s*([^\n]+)/i),
    documento: g(/CPF\/CNPJ\s+do\s+recebedor\s*:?\s*([\d.\/\-*]+)/i),
    identificacao: g(/identifica[cç][aã]o\s+no\s+(?:seu\s+)?comprovante\s*:?\s*\n?\s*([^\n]+)/i),
    idTransacao: g(/ID\s+da\s+transa[cç][aã]o\s*:?\s*(E[0-9A-Z]{20,})/i),
    tipoPagamento: g(/tipo\s+de\s+pagamento\s*:?\s*([^\n]+)/i),
  };
}
// Comprovante lido por OCR (print/foto): rótulos podem vir separados do valor
function completarPagamento(pag, texto) {
  const T = String(texto || '');
  // comprovante de boleto do Itaú (PDF): "dados do beneficiário / nome / ...", "data do pagamento", "valor do pagamento (=) R$"
  if (/dados\s+do\s+benefici[aá]rio/i.test(T)) {
    if (!pag.valor) { const m = T.match(/valor\s+do\s+pagamento\s*\n?\s*(?:\(=\)\s*)?R\$\s*([\d.]+,\d{2})/i); if (m) pag.valor = numBR(m[1]); }
    if (!pag.recebedor) { const m = T.match(/dados\s+do\s+benefici[aá]rio\s*\n?\s*(?:nome|raz[aã]o social)\s*\n?\s*([^\n]{3,80})/i); if (m) pag.recebedor = m[1].trim(); }
    if (!pag.documento) { const m = T.match(/benefici[aá]rio[\s\S]{0,120}?cpf\s*\/\s*cnpj\s*:?\s*([\d.\/-]{11,18})/i); if (m) pag.documento = m[1]; }
    if (!pag.data) {
      const M = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
      const m = T.match(/data\s+do\s+pagamento\s*\n?\s*(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s+(?:de\s+)?(\d{4})/i) ;
      const d = T.match(/data\s+do\s+pagamento\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (d) pag.data = d[1]; else if (m) pag.data = m[1].padStart(2, '0') + '/' + M[m[2].toLowerCase()] + '/' + m[3];
    }
    pag.tipoPagamento = pag.tipoPagamento || 'boleto';
  }
  if (!pag.valor) { const m = T.match(/R\$\s*([\d.]+,\d{2})/); if (m) { pag.valor = numBR(m[1]); pag.valorIncerto = true; } }
  if (!pag.data) { const m = T.match(/\b(\d{2}\/\d{2}\/\d{4})\b/); if (m) pag.data = m[1]; }
  if (!pag.data) {   // "10 jun. 2026, 16:26:10, via SISPAG"
    const M = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
    const m = T.match(/\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s+(?:de\s+)?(\d{4})/i);
    if (m) pag.data = m[1].padStart(2, '0') + '/' + M[m[2].toLowerCase()] + '/' + m[3];
  }
  if (!pag.recebedor) { const m = T.match(/(?:^|\n)\s*para\s*\n\s*([A-ZÀ-Ú0-9][^\n]{2,70})/i); if (m) pag.recebedor = m[1].trim(); }
  if (pag.identificacao) {
    pag.processos = processosAbreviados(pag.identificacao);
    pag.identificacao = pag.identificacao.replace(/\s+/g, '').toUpperCase();
  }
  if (!pag.recebedor) { const m = T.match(/(?:recebedor|favorecido|para|destinat[aá]rio)\s*:?\s*\n?\s*([A-ZÀ-Ú][^\n]{2,60})/i); if (m) pag.recebedor = m[1].trim(); }
  return pag;
}

// ── v91: guia de imposto / boleto (a conta) + comprovante do banco (o pagamento) = uma linha só no extrato de caixa ──
const MESES91 = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAc91 = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Guia da Receita (DARF / DCTFWeb / DAS): valor, período, vencimento, número, código de barras, principal + multa + juros
function lerGuia91(texto, nome) {
  const U = String(texto || '').replace(/\s+/g, ' ');
  const g = re => { const m = U.match(re); return m ? m[1] : ''; };
  const out = { orgao: /SIMPLES NACIONAL/i.test(U) ? 'Simples Nacional' : 'Receita Federal' };
  out.numero = g(/\b(\d{2}\.\d{2}\.\d{5}\.\d{7}-\d)\b/);
  const mp = U.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})\b/i);
  if (mp) { const i = MESES91.findIndex(x => semAc91(x) === semAc91(mp[1])); out.periodo = MESES91[i] + '/' + mp[2]; out.pa = mp[2] + '-' + String(i + 1).padStart(2, '0'); }
  else { const m = U.match(/\bPA\s*:?\s*(\d{2})\/(\d{4})\b/i) || U.match(/Per[ií]odo de Apura[cç][aã]o\s*:?\s*(\d{2})\/(\d{4})/i); if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { out.pa = m[2] + '-' + m[1]; out.periodo = MESES91[Number(m[1]) - 1] + '/' + m[2]; } }
  out.pagarAte = g(/Pagar (?:este documento )?at[eé]\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  // vencimento original (o da composição "Vencimento:dd/mm/aaaa"; senão a data logo depois do período) — no pdf.js a
  // "Data de Vencimento" fica longe da data dela
  out.vencimento = g(/\bVencimento\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || g(/\b(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*\d{4}\s+(\d{2}\/\d{2}\/\d{4})/i)
    || g(/Data de Vencimento[\s\S]{0,90}?(\d{2}\/\d{2}\/\d{4})/i) || out.pagarAte;
  out.emissao = brToIso(g(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}(?::\d{2})?\b/));
  out.total = numBR(g(/Valor Total do Documento\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i) || g(/\bValor\s*:\s*(?:R\$\s*)?([\d.]+,\d{2})/i) || g(/Valor (?:a pagar|do documento)\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i)) || 0;
  // principal + multa + juros: pela soma das linhas da composição ("código denominação principal multa juros total";
  // sem atraso vem só "principal total"). A linha "Totais" não serve para separar multa e juros: no PDF real o pdf.js
  // do navegador lê os juros antes da multa ("Totais principal juros multa total") — visto nas guias de 15/10/2026
  const ini = U.search(/Composi[cç][aã]o do Documento/i), fim = U.search(/\bTotais\b/i);
  if (ini >= 0 && fim > ini) {
    let p = 0, m = 0, j = 0, n = 0;
    for (const x of U.slice(ini, fim).matchAll(/\b\d{4}\s+(?:[^\s\d]\S*\s+)+?((?:\d{1,3}(?:\.\d{3})*,\d{2}\s*){2,4})/g)) {
      const vs = x[1].trim().split(/\s+/).map(numBR);
      p += vs[0]; n++;
      if (vs.length === 4) { m += vs[1]; j += vs[2]; }
      else if (vs.length === 3) { if (Math.abs(vs[0] + vs[1] - vs[2]) < 0.01) m += vs[1]; else j += vs[1]; }
    }
    const r = v => Math.round(v * 100) / 100;
    if (n && (!out.total || Math.abs(p + m + j - out.total) < 0.05)) { out.principal = r(p); out.multa = r(m); out.juros = r(j); if (!out.total) out.total = r(p + m + j); }
  }
  if (out.principal == null) {   // sem as linhas: pela linha "Totais" (multa = a que não passa de 20% do principal, o teto da multa de mora)
    const tot = U.match(/\bTotais\s+([\d.]+,\d{2})((?:\s+[\d.]+,\d{2}){1,3})/i);
    if (tot) {
      const vs = [tot[1], ...tot[2].trim().split(/\s+/)].map(numBR), ult = vs[vs.length - 1];
      out.principal = vs[0];
      if (vs.length === 4) { const [a, b] = [vs[1], vs[2]], teto = vs[0] * 0.2 + 0.01; if (b > teto && a <= teto) { out.multa = a; out.juros = b; } else { out.multa = b; out.juros = a; } }   // no pdf.js os juros vêm antes
      else if (vs.length === 3) out.juros = vs[1];
      if (!out.total) out.total = ult;
    }
  }
  // conferência: a multa de mora é 0,33% ao dia (até 20% do principal), do vencimento até o "pagar até";
  // se o valor dos juros é o que bate com essa conta, os dois vieram trocados
  if (out.multa > 0 && out.juros > 0 && out.vencimento && out.pagarAte && out.vencimento !== out.pagarAte) {
    const dias = Math.round((new Date(brToIso(out.pagarAte)) - new Date(brToIso(out.vencimento))) / 864e5);
    const esp = dias > 0 ? out.principal * Math.min(0.2, 0.0033 * dias) : 0;
    if (esp > 0 && Math.abs(out.juros - esp) < Math.abs(out.multa - esp)) { const t = out.multa; out.multa = out.juros; out.juros = t; }
  }
  // código de barras da arrecadação: 4 blocos de 11 dígitos (+ 1 dígito de conferência cada)
  const cb = U.match(/\b(8\d{10})\s?-?\s?(\d)\s+(\d{11})\s?-?\s?(\d)\s+(\d{11})\s?-?\s?(\d)\s+(\d{11})\s?-?\s?(\d)\b/);
  if (cb) { out.blocos = [cb[1], cb[3], cb[5], cb[7]]; out.barras = cb.slice(1, 9).join(''); }
  // o que a guia paga (pelos códigos da composição)
  const N = semAc91(U + ' ' + (nome || ''));
  const partes = [];
  if (/SIMPLES NACIONAL|\bDAS\b/.test(N)) partes.push('Simples Nacional (DAS)');
  else {
    if (/PREVIDENCI|\bCP\s+(?:DESCONTADA|PATRONAL|SEGURADO)|CONTRIBUINTES?\s+INDIVIDUA|\bINSS\b/.test(N)) partes.push('INSS');
    if (/\bIRRF\b/.test(N)) partes.push('IRRF');
    if (/\bPIS\b/.test(N)) partes.push('PIS');
    if (/\bCOFINS\b/.test(N)) partes.push('COFINS');
    if (/\bCSLL\b/.test(N)) partes.push('CSLL');
    if (/\bIRPJ\b/.test(N)) partes.push('IRPJ');
  }
  out.descricao = (partes.join(' + ') || 'DARF') + (/DCTF/.test(N) && !/DAS/.test(partes[0] || '') ? ' (DCTFWeb)' : '') + (out.periodo ? ' ' + out.periodo : '');
  out.categoria = 'Impostos federais';
  return out;
}
// linha digitável do boleto bancário: os pedaços que aparecem iguais no comprovante (linha digitável ou código de barras)
function blocosConta91(it) {
  const gu = it && it.info && it.info.guia;
  if (gu && gu.blocos && gu.blocos.length) return gu.blocos;
  const U = String((it && it.texto) || '').replace(/\s+/g, ' ');
  const b = U.match(/\b(\d{5})\.?(\d{5})\s+(\d{5})\.?(\d{6})\s+(\d{5})\.?(\d{6})\s+(\d)\s+(\d{14})\b/);
  if (b) return [b[3] + b[4].slice(0, 5), b[5] + b[6].slice(0, 5), b[8]];
  const a = U.match(/\b(8\d{10})\s?-?\s?\d\s+(\d{11})\s?-?\s?\d\s+(\d{11})\s?-?\s?\d\s+(\d{11})\s?-?\s?\d\b/);
  return a ? [a[1], a[2], a[3], a[4]] : [];
}
const digitos91 = t => String(t || '').replace(/(\d)[\s.\-]+(?=\d)/g, '$1');
// o comprovante tem o código de barras desta conta? Precisa de TODOS os pedaços: as guias da mesma empresa repetem alguns
// (o 1º e o 3º bloco da DCTFWeb são iguais em guias de valores parecidos)
function bateBarras91(bl, texto) { if (!bl || bl.length < 3) return false; const dig = digitos91(texto); return bl.every(b => dig.includes(b)); }
function vencConta91(it) { const gu = (it.info && it.info.guia) || {}; return gu.pagarAte || gu.vencimento || (it.info && it.info.vencimento) || ''; }
function somaDias91(iso, n) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
// valores que aparecem no comprovante (o lido + todos os "0,00" do texto)
function valoresComp91(c) {
  const vs = (String(c.texto || '').match(/(?<![\d,.])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d])/g) || []).map(numBR);
  if (Number(c.info && c.info.valor) > 0) vs.push(Number(c.info.valor));
  return vs;
}
// data do pagamento no comprovante: a do rótulo; senão a data do texto que cabe (depois da emissão da guia, até hoje)
function dataPagamento91(c, minIso) {
  const T = String(c.texto || '');
  const m = T.match(/(?:data\s+d[oe]\s+pagamento|pago\s+em|pagamento\s+(?:realizado|efetuado)\s+em|data\s+da\s+(?:opera[cç][aã]o|transa[cç][aã]o)|efetuad[oa]\s+em|realizad[oa]\s+em|data\s+de\s+d[eé]bito)\s*:?\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (m) return brToIso(m[1]);
  const hoje = new Date().toISOString().slice(0, 10);
  const MM = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
  const ds = [...T.matchAll(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/g)].map(x => `${x[3]}-${x[2]}-${x[1]}`)
    .concat([...T.matchAll(/\b(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s+(?:de\s+)?(20\d{2})\b/gi)].map(x => `${x[3]}-${MM[x[2].toLowerCase()]}-${x[1].padStart(2, '0')}`))
    .filter(d => d <= hoje && (!minIso || d >= minIso));
  if (ds.length) { const cont = {}; ds.forEach(d => { cont[d] = (cont[d] || 0) + 1; }); return Object.keys(cont).sort((a, b) => cont[b] - cont[a] || b.localeCompare(a))[0]; }
  return (c.info && c.info.data) || '';
}
// nota do quanto é principal, multa e juros
function composicao91(gu) {
  if (!gu || !(gu.multa > 0 || gu.juros > 0)) return '';
  const f = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return 'principal ' + f(gu.principal) + (gu.multa > 0 ? ' + multa ' + f(gu.multa) : '') + (gu.juros > 0 ? ' + juros ' + f(gu.juros) : '');
}
// Na Caixa de Entrada: junta cada guia / boleto (despesa do mês) com o comprovante dele
function juntarGuias91(lista) {
  lista = lista || (S.entrada && S.entrada.itens) || [];
  lista.forEach(it => { delete it._par91; if (it._avisoPar91) { it.aviso = String(it.aviso || '').replace(it._avisoPar91, '').trim(); delete it._avisoPar91; } });
  const contas = lista.filter(it => (it.tipo === 'guia' || it.tipo === 'boleto') && (!it.processo || it.processo === '__ADM'));
  const comps = lista.filter(it => it.tipo === 'pagamento' && !(it.info && it.info.cambio) && (!it.processo || it.processo === '__ADM'));
  if (!contas.length || !comps.length) return lista;
  const pares = [];
  contas.forEach(g => comps.forEach(c => {
    const vg = Number(g.info.valor) || 0, vc = Number(c.info.valor) || 0;
    const vcConfiavel = vc > 0 && (c.valorManual || !(c.info.pagamento && c.info.pagamento.valorIncerto));
    if (bateBarras91(blocosConta91(g), c.texto) && !(vg && vcConfiavel && Math.abs(vc - vg) >= 0.01)) { pares.push({ g, c, s: 100, por: 'código de barras' }); return; }
    if (!vg || !valoresComp91(c).some(x => Math.abs(x - vg) < 0.01)) return;
    const emis = (g.info.guia && g.info.guia.emissao) || g.info.data || '', ate = brToIso(vencConta91(g));
    const dp = dataPagamento91(c, emis ? somaDias91(emis, -3) : '');
    if (dp && emis && dp < somaDias91(emis, -3)) return;
    if (dp && ate && dp > somaDias91(ate, 10)) return;
    const txt = semAc91(c.texto + ' ' + c.nome + ' ' + ((c.info && c.info.emitNome) || ''));
    const quem = g.tipo === 'guia' ? /RECEITA|DARF|TRIBUT|ARRECADA|FEDERA|INSS|DCTF|PREVIDEN|SIMPLES/.test(txt)
      : !!(g.info.emitNome && semAc91(g.info.emitNome).replace(/[^A-Z ]/g, '').split(/\s+/).filter(w => w.length >= 4).slice(0, 2).some(w => txt.includes(w)));
    pares.push({ g, c, s: quem ? 80 : 60, por: 'valor' + (quem ? (g.tipo === 'guia' ? ' e Receita Federal' : ' e beneficiário') : '') });
  }));
  pares.sort((a, b) => b.s - a.s);
  const usada = new Set();
  pares.forEach(x => {
    if (usada.has(x.g) || usada.has(x.c)) return;
    usada.add(x.g); usada.add(x.c);
    x.g._par91 = { fileId: x.c.fileId, nome: x.c.nome, por: x.por };
    x.c._par91 = { fileId: x.g.fileId, nome: (x.g.info.guia && x.g.info.guia.descricao) || x.g.nome, por: x.por, daConta: true, tipoConta: x.g.tipo };
    const c = x.c, g = x.g;
    if (c.processo !== '__ADM' || c.admAuto) { c.processo = '__ADM'; c.admAuto = false; c.aviso = String(c.aviso || '').replace(/Não cita nenhum processo:[^.]*\.[^.]*\./, '').trim(); }
    if (!c.categoriaManual) c.categoria = g.categoria || c.categoria;
    const emis = (g.info.guia && g.info.guia.emissao) || g.info.data || '';
    if (!c._dataManual91) { const dp = dataPagamento91(c, emis ? somaDias91(emis, -3) : ''); if (dp) c.info.data = dp; }
    const vg = Number(g.info.valor) || 0;
    if (vg && (!(Number(c.info.valor) > 0) || (c.info.pagamento && c.info.pagamento.valorIncerto)) && !c.valorManual && (x.s === 100 || valoresComp91(c).some(v => Math.abs(v - vg) < 0.01))) { c.info.valor = vg; if (c.info.pagamento) { c.info.pagamento.valor = vg; c.info.pagamento.valorIncerto = false; } }
    if (x.s >= 80) { if (c.confianca !== 'manual') c.confianca = 'alta'; if (g.confianca !== 'manual' && Number(g.info.valor) > 0) g.confianca = 'alta'; }
    else if (c.confianca === 'alta') c.confianca = 'media';
    if (!c.info.data) {   // sem a data do pagamento a linha ficaria "sem data": pede para preencher antes de anexar
      const a = 'Não achei a data do pagamento no comprovante: preencha a data antes de anexar.';
      c._avisoPar91 = a; c.aviso = (c.aviso ? c.aviso + ' ' : '') + a; if (c.confianca === 'alta') c.confianca = 'media';
      if (g.confianca === 'alta') g.confianca = 'media';
    }
  });
  // segundo comprovante com o mesmo valor de uma guia que já tem o dela: pode ser o mesmo pagamento repetido
  pares.filter(x => !usada.has(x.c) && x.g._par91).forEach(x => {
    if (x.c._avisoPar91) return;
    const a = `Mesmo pagamento da ${x.g.tipo === 'boleto' ? 'conta' : 'guia'} ${(x.g.info.guia && x.g.info.guia.descricao) || x.g.nome}, que já tem o comprovante ${x.g._par91.nome}: confira se não é o mesmo comprovante repetido.`;
    x.c._avisoPar91 = a; x.c.aviso = (x.c.aviso ? x.c.aviso + ' ' : '') + a; if (x.c.confianca === 'alta') x.c.confianca = 'media';
  });
  return lista;
}
function preencherGuia91(item) {
  const gu = lerGuia91(item.texto, item.nome);
  item.info = item.info || {};
  item.info.guia = gu;
  if (!(Number(item.info.valor) > 0) && gu.total) item.info.valor = gu.total;
  if (!item.info.data && gu.emissao) item.info.data = gu.emissao;
  item.info.vencimento = gu.pagarAte || gu.vencimento || item.info.vencimento || '';
  item.info.emitNome = gu.orgao === 'Simples Nacional' ? 'RECEITA FEDERAL (SIMPLES NACIONAL)' : 'RECEITA FEDERAL';
  if (!item.categoriaManual) item.categoria = gu.categoria;
  return item;
}
// dados da guia / boleto que ficam no lançamento (para ligar o comprovante e o banco depois)
function metaConta91(g) {
  const gu = (g.info && g.info.guia) || {};
  const m = { tipo: g.tipo === 'boleto' ? 'boleto' : 'guia', numero: gu.numero || '', blocos: blocosConta91(g), periodo: gu.periodo || '', vencimento: vencConta91(g), emissao: gu.emissao || (g.info && g.info.data) || '' };
  if (gu.principal != null) { m.principal = gu.principal; m.multa = gu.multa || 0; m.juros = gu.juros || 0; }
  return m;
}
function descConta91(g) {
  const cat = g.categoria || (g.tipo === 'guia' ? 'Impostos federais' : 'Despesas administrativas');
  const gu = (g.info && g.info.guia) || {};
  return { categoria: cat, empresa: g.tipo === 'guia' ? 'RECEITA FEDERAL' : ((g.info && g.info.emitNome) || ''),
    descricao: cat + ' — ' + (g.tipo === 'guia' ? (gu.descricao || 'DARF') : ((g.info && g.info.emitNome) || String(g.nome || '').replace(/\.[a-z0-9]+$/i, ''))) };
}
const rotuloConta91 = g => (g.tipo === 'boleto' ? 'Boleto' : 'Guia');
// a data da linha cabe nesta guia? (com comprovante: até 7 dias da data do pagamento; sem: entre a emissão e o vencimento)
function dataCabe91(dLinha, dPg, emis, vencBr) {
  if (!dLinha) return false;
  const dif = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  if (dPg) return dif(dLinha, dPg) <= 7;
  const ate = brToIso(vencBr);
  if (!emis && !ate) return false;
  return (!emis || dLinha >= somaDias91(emis, -3)) && (!ate || dLinha <= somaDias91(ate, 10));
}
// despesa já lançada (pelo comprovante ou pela linha do banco) que é o pagamento desta guia
function linhaDaConta91(g, c, compUrl) {
  const L = S.lancamentos || [];
  const valorG = Number(g.info.valor) || 0, valorC = c ? Number(c.info.valor) || 0 : 0;
  const valor = valorC && !(c.info.pagamento && c.info.pagamento.valorIncerto) ? valorC : (valorG || valorC);
  const meta = metaConta91(g);
  const mesma = L.find(l => l.docs && l.docs._guia && meta.blocos.length && (l.docs._guia.blocos || []).join() === meta.blocos.join());
  if (mesma) return { linha: mesma, valor };
  const cands = L.filter(l => l.tipo === 'Despesa' && l.vinculo !== 'processo' && l.status === 'Pago' && !(l.docs && l.docs.fatura)
    && Math.abs((Number(l.valor) || 0) - valor) < 0.01 && !(compUrl && l.docs && l.docs.comprovante && l.docs.comprovante !== compUrl)
    && dataCabe91(brToIso(l.data), c ? (c.info.data || '') : '', meta.emissao, meta.vencimento));
  return { linha: cands.length === 1 ? cands[0] : null, valor, varias: cands.length > 1 };
}
// na observação: a guia pelo que ela é ("DCTFWeb setembro/2026"), o boleto pelo nome do arquivo (o link abre o arquivo)
const nomeCurto91 = (g, upd) => (g.info && g.info.guia && g.info.guia.descricao) || (upd && upd.name) || g.nome;
const juntaObs91 = (a, b) => [String(a || '').trim(), b].filter(Boolean).join(' · ');
// A guia / boleto entra no extrato: com o comprovante → uma linha paga (na data do pagamento) com os dois anexos;
// sem comprovante → conta a pagar (Em Aberto, no vencimento). Se o pagamento já está lançado, a guia vai para essa linha.
function lancarConta91(g, updG, c, updC) {
  S.lancamentos = S.lancamentos || [];
  const meta = metaConta91(g), d = descConta91(g), comp = composicao91(g.info.guia), rot = rotuloConta91(g);
  const { linha, valor } = linhaDaConta91(g, c, updC && updC.webViewLink);
  if (!valor) return null;
  const dataPg = c ? (c.info.data || '') : '';
  const idTx = (c && c.info.pagamento && c.info.pagamento.idTransacao) || '';
  if (linha) {
    linha.docs = linha.docs || {};
    linha.docs.fatura = updG.webViewLink; linha.docs._guia = meta;
    if (c && updC && !linha.docs.comprovante) { linha.docs.comprovante = updC.webViewLink; if (idTx) linha.docs.idTransacao = idTx; }
    if (c && linha.status !== 'Pago') { linha.status = 'Pago'; if (dataPg) linha.data = isoToBr(dataPg); }
    if (/^(Despesas administrativas|Outras despesas|Impostos federais|Impostos)?$/.test(linha.categoria || '') || g.tipo === 'guia') { linha.categoria = d.categoria; linha.descricao = d.descricao; }
    linha.observacao = juntaObs91(linha.observacao, rot + ': ' + nomeCurto91(g, updG) + (c && updC ? ' · Comprovante: ' + updC.name : '') + (comp ? ' · ' + comp : ''));
    logAction('editar', 'EXTRATO_CAIXA', linha.id, `${rot} anexada ao lançamento ${linha.descricao} R$ ${Number(linha.valor).toFixed(2)}`);
    return linha;
  }
  const obj = {
    id: genId(), tipo: 'Despesa', status: c ? 'Pago' : 'Em Aberto', descricao: d.descricao, valor,
    data: c ? (dataPg ? isoToBr(dataPg) : '') : meta.vencimento, empresa: d.empresa, categoria: d.categoria, vinculo: 'avulso', vinculoId: 'ADM',
    observacao: rot + ': ' + nomeCurto91(g, updG) + (c && updC ? ' · Comprovante: ' + updC.name : ' · vence ' + meta.vencimento) + (comp ? ' · ' + comp : '') + (c && !dataPg ? ' · data do pagamento não lida (confira)' : ''),
    docs: { fatura: updG.webViewLink, comprovante: c && updC ? updC.webViewLink : '', idTransacao: idTx, _guia: meta, _origem: 'entrada' },
  };
  S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, `Despesa ${obj.descricao} R$ ${valor.toFixed(2)} (${c ? rot.toLowerCase() + ' + comprovante' : rot.toLowerCase() + ' a pagar'})`);
  return obj;
}
// o que vai acontecer com a guia / boleto / comprovante (aparece no cartão da Caixa de Entrada)
function linhaPar91(it) {
  const box = (cor, html) => `<div style="margin-top:10px;font-size:12px;color:${cor}">${html}</div>`;
  const ehConta = it.tipo === 'guia' || it.tipo === 'boleto';
  if (it._par91) {
    const nomeConta = (it._par91.daConta ? it._par91.tipoConta : it.tipo) === 'boleto' ? 'do boleto' : 'da guia';
    return box('var(--green)', (it._par91.daConta ? `🔗 Comprovante do pagamento ${nomeConta} <b>${escHtml(it._par91.nome)}</b>` : `🔗 Junto com o comprovante <b>${escHtml(it._par91.nome)}</b>`)
      + ` (pelo ${escHtml(it._par91.por)}). Os dois vão anexados na mesma linha do extrato de caixa.`);
  }
  if (it.processo !== '__ADM') return '';
  try {
    if (ehConta) {
      const r = linhaDaConta91(it, null, '');
      if (r.linha) return box('var(--green)', `🔗 O pagamento já está no extrato de caixa: ${escHtml(r.linha.descricao)} (${escHtml(r.linha.data || '—')}). A ${it.tipo === 'boleto' ? 'conta' : 'guia'} vai anexada nessa linha.`);
      const v = vencConta91(it);
      return box('var(--yellow)', `🟡 Sem comprovante na Entrada: vira conta a pagar${v ? ' (vence ' + escHtml(v) + ')' : ''}. Quando o comprovante chegar, essa mesma linha fica paga.`);
    }
    if (it.tipo === 'pagamento') {
      const l = contaAbertaDoComprovante91(it);
      if (l) return box('var(--green)', `🔗 Paga a conta em aberto: ${escHtml(l.descricao)}. Essa mesma linha fica paga, com o comprovante.`);
    }
  } catch (e) {}
  return '';
}
// Comprovante que chega depois: acha a guia em aberto dele (código de barras; ou valor + data que cabe)
function contaAbertaDoComprovante91(c) {
  const abertas = (S.lancamentos || []).filter(l => l.tipo === 'Despesa' && l.status === 'Em Aberto' && l.docs && l.docs._guia && !l.docs.comprovante);
  if (!abertas.length) return null;
  const porBarras = abertas.filter(l => bateBarras91(l.docs._guia.blocos, c.texto));
  if (porBarras.length === 1) return porBarras[0];
  const vs = valoresComp91(c);
  const porValor = abertas.filter(l => vs.some(v => Math.abs(v - (Number(l.valor) || 0)) < 0.01) && (() => {
    const g = l.docs._guia, dp = dataPagamento91(c, g.emissao ? somaDias91(g.emissao, -3) : '');
    return !dp || dataCabe91(dp, '', g.emissao, g.vencimento);
  })());
  return porValor.length === 1 ? porValor[0] : null;
}
function baixarContaPeloComprovante91(item, upd) {
  const l = contaAbertaDoComprovante91(item); if (!l) return null;
  const g = l.docs._guia, dp = dataPagamento91(item, g.emissao ? somaDias91(g.emissao, -3) : '') || item.info.data || '';
  l.status = 'Pago'; if (dp) l.data = isoToBr(dp);
  l.docs.comprovante = upd.webViewLink; const idTx = item.info.pagamento && item.info.pagamento.idTransacao; if (idTx) l.docs.idTransacao = idTx;
  l.observacao = juntaObs91(String(l.observacao || '').replace(/ · vence \d{2}\/\d{2}\/\d{4}/, ''), 'Comprovante: ' + upd.name + (dp ? '' : ' · data do pagamento não lida (confira)'));
  logAction('editar', 'EXTRATO_CAIXA', l.id, `Pago: ${l.descricao} R$ ${Number(l.valor).toFixed(2)} (comprovante ${upd.name})`);
  return l;
}

// ── v92: nota fiscal (PDF + XML) vai para o pagamento que já está no extrato (botões NF-e e XML) ──
// Ex.: a nota sai com a razão social da empresa e o pagamento foi lançado com o nome fantasia: acha pelo CNPJ do extrato do banco ou pelo nome fantasia na descrição / e-mail da nota.
const chaveNota92 = it => { const i = (it && it.info) || {}; return i.chaveNfse || (/^\d{44}$/.test(i.chave || '') ? i.chave : ''); };
const ehNotaAdm92 = it => it && (it.tipo === 'nfse' || it.tipo === 'nfe') && (!it.processo || it.processo === '__ADM');
const NAO_NOME92 = /^(LTDA|EIRELI|EPP|COMERCIO|SERVICOS|SERVICO|PAGAMENTOS|PAGAMENTO|EMPRESA|BRASIL|BRAZIL|SISTEMAS|TECNOLOGIA|DESENVOLVIMENTO|INDUSTRIA|PRESTACAO|ENVIADO|BOLETO|DESPESAS|ADMINISTRATIVAS|SOFTWARE|OUTRAS|COMPROVANTE|REEMBOLSO|SOCIO)$/;
const palavras92 = t => [...new Set(semAc91(t).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !/^\d+$/.test(w) && !NAO_NOME92.test(w)))];
const cnpjsDoTexto92 = t => (String(t || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []).map(x => x.replace(/\D/g, '')).filter(x => x !== FU_SONG_CNPJ);
function textoNota92(it) {
  const i = it.info || {};
  // só quem emitiu, o serviço e o e-mail (o resto do PDF tem o tomador, endereços e cidade: daria falso "mesma empresa")
  return semAc91([i.emitNome, i.descricao, i.emitEmail].filter(Boolean).join(' '));
}
// o pagamento já lançado desta nota: mesma nota (chave), ou mesmo valor + data perto + mesma empresa (CNPJ, nome ou cadastro)
function linhaDaNota92(it, par) {
  const L = S.lancamentos || [];
  const ch = chaveNota92(it) || chaveNota92(par);
  if (ch) { const m = L.find(l => l.docs && l.docs._nota && l.docs._nota.chave === ch); if (m) return { linha: m, forte: true, por: 'mesma nota' }; }
  const v = Number(it.info.valor) || Number(par && par.info.valor) || 0; if (!v) return null;
  const d = it.info.data || (par && par.info.data) || '';
  const cnpj = String(it.info.emitCnpj || (par && par.info.emitCnpj) || '').replace(/\D/g, '');
  const txt = textoNota92(it) + ' ' + (par ? textoNota92(par) : '');
  const forn = cnpj ? (S.fornecedores || []).find(f => String(f.cnpj || '').replace(/\D/g, '') === cnpj) : null;
  const cands = L.filter(l => l.tipo === 'Despesa' && l.vinculo !== 'processo' && Math.abs((Number(l.valor) || 0) - v) < 0.01
    && !(l.docs && (l.docs.nfe || l.docs.nota || l.docs.xml || l.docs._nota))
    && (!d || !l.data || Math.abs((new Date(brToIso(l.data)) - new Date(d)) / 864e5) <= 10));
  const forte = cands.filter(l => {
    const lt = [l.empresa, l.descricao, l.observacao].join(' ');
    if (cnpj && cnpjsDoTexto92(lt).includes(cnpj)) return true;
    const nomes = palavras92(l.empresa || String(l.descricao || '').split('—').pop());
    if (nomes.some(w => txt.includes(w))) return true;
    return !!(forn && palavras92(forn.nome).some(w => semAc91(lt).includes(w)));
  });
  if (forte.length === 1) return { linha: forte[0], forte: true, por: cnpj && cnpjsDoTexto92([forte[0].empresa, forte[0].descricao, forte[0].observacao].join(' ')).includes(cnpj) ? 'CNPJ' : 'empresa, valor e data' };
  if (!forte.length && cands.length === 1) return { linha: cands[0], forte: false, por: 'valor e data' };
  return null;
}
// Na Caixa de Entrada: PDF e XML da mesma nota andam juntos; e cada nota mostra o pagamento que vai receber
function juntarNotas92(lista) {
  lista = lista || (S.entrada && S.entrada.itens) || [];
  lista.forEach(it => { delete it._parXml92; delete it._linha92; });
  const notas = lista.filter(ehNotaAdm92);
  const xmls = notas.filter(it => it.formato === 'xml'), pdfs = notas.filter(it => it.formato !== 'xml');
  xmls.forEach(x => {
    const ch = chaveNota92(x);
    const p = pdfs.find(y => !y._parXml92 && y.tipo === x.tipo && ((ch && chaveNota92(y) === ch)
      || (!chaveNota92(y) && x.info.numero && String(Number(y.info.numero || 0)) === String(Number(x.info.numero)) && Math.abs((Number(y.info.valor) || 0) - (Number(x.info.valor) || 0)) < 0.01)));
    if (!p) return;
    x._parXml92 = p.fileId; p._parXml92 = x.fileId;
    ['emitNome', 'emitCnpj', 'numero', 'chaveNfse', 'descricao', 'emitEmail'].forEach(k => { if (x.info[k]) p.info[k] = x.info[k]; });   // o XML é a fonte certa
    if (!(Number(p.info.valor) > 0) && x.info.valor) p.info.valor = x.info.valor;
    if (!p.info.data && x.info.data) p.info.data = x.info.data;
  });
  notas.forEach(it => {
    const par = it._parXml92 ? lista.find(y => y.fileId === it._parXml92) : null;
    const r = it.semLinha92 || (par && par.semLinha92) ? null : linhaDaNota92(it, par);   // "Não é esse pagamento"
    if (!r) return;
    it._linha92 = { id: r.linha.id, forte: r.forte, por: r.por };
    if (r.forte && !it.processo) it.processo = '__ADM';   // nota sem processo que é de um pagamento do mês já lançado
    if (r.forte && !it.categoriaManual && r.linha.categoria && !/^(Despesas administrativas|Outras despesas)$/.test(r.linha.categoria)) it.categoria = r.linha.categoria;
    if (it.confianca !== 'manual') it.confianca = r.forte ? 'alta' : 'media';
  });
  return lista;
}
function juntarTudo92(lista) { juntarGuias91(lista); juntarNotas92(lista); return lista; }
// "Não é esse pagamento": a nota (e o PDF/XML par dela) não liga na linha sugerida
function semLinhaNota92(fileId, voltar) {
  const E = S.entrada || { itens: [] };
  const it = E.itens.find(x => x.fileId === fileId); if (!it) return;
  const par = it._parXml92 ? E.itens.find(y => y.fileId === it._parXml92) : null;
  [it, par].filter(Boolean).forEach(x => { if (voltar) delete x.semLinha92; else x.semLinha92 = true; });
  try { juntarTudo92(E.itens); } catch (e) {}
  render();
}
// o que vai acontecer com a nota (aparece no cartão da Caixa de Entrada)
function linhaNota92(it) {
  if (!ehNotaAdm92(it) || it.processo !== '__ADM') return '';
  const box = (cor, html) => `<div style="margin-top:10px;font-size:12px;color:${cor}">${html}</div>`;
  const E = S.entrada || { itens: [] };
  const par = it._parXml92 ? E.itens.find(y => y.fileId === it._parXml92) : null;
  let h = par ? box('var(--green)', `🔗 ${it.formato === 'xml' ? 'XML' : 'PDF'} da mesma nota que <b>${escHtml(par.nome)}</b>: vão juntos (${it.formato === 'xml' ? 'XML no botão XML, PDF no botão NF-e' : 'PDF no botão NF-e, XML no botão XML'}).`) : '';
  const l = it._linha92 && (S.lancamentos || []).find(x => x.id === it._linha92.id);
  const fid = escHtml(String(it.fileId));
  const link = (txt, voltar) => ` <a href="#" onclick="semLinhaNota92('${fid}'${voltar ? ',true' : ''});return false" style="color:var(--accent);font-weight:600">${txt}</a>`;
  if (it.semLinha92 || (par && par.semLinha92)) return h + box('var(--yellow)', `🟡 Você marcou que a nota não é do pagamento parecido: ${it.tipo === 'nfse' ? 'ela vira uma despesa nova do mês (paga).' : 'ela fica guardada nos documentos do mês.'}${link('Ligar de novo', true)}`);
  if (l) h += it._linha92.forte ? box('var(--green)', `🔗 Vai para o pagamento já lançado: <b>${escHtml(l.descricao)}</b> (${escHtml(l.data || '—')}, pelo ${escHtml(it._linha92.por)}). Não cria outra linha.${link('Não é esse pagamento')}`)
    : box('var(--yellow)', `🟡 Parece o pagamento <b>${escHtml(l.descricao)}</b> (${escHtml(l.data || '—')}): mesmo valor e data, mas a empresa não aparece na nota. Confira antes de anexar.${link('Não é esse pagamento')}`);
  else h += box('var(--yellow)', it.tipo === 'nfse' ? `🟡 Nenhum pagamento de R$ ${fmt(it.info.valor || 0)} lançado perto dessa data: a nota vira despesa do mês (paga). Quando o comprovante ou o extrato chegar, liga nessa mesma linha.` : `🟡 Nenhum pagamento de R$ ${fmt(it.info.valor || 0)} lançado perto dessa data: a nota fica guardada nos documentos do mês.`);
  return h;
}
// Anexar: a nota (PDF e/ou XML) entra no pagamento já lançado; sem pagamento, a NFS-e vira despesa do mês (como antes)
function lancarNota92(pdf, updPdf, xml, updXml) {
  const base = xml || pdf, outro = xml ? pdf : null;
  const r = base.semLinha92 || (outro && outro.semLinha92) ? null : linhaDaNota92(base, outro);
  const i = base.info || {};
  const meta = { tipo: base.tipo, numero: i.numero || '', chave: chaveNota92(base) || chaveNota92(outro), cnpj: String(i.emitCnpj || '').replace(/\D/g, ''), emitente: i.emitNome || '', nomes: palavras92([i.emitNome, i.descricao, i.emitEmail].join(' ')).slice(0, 12) };
  const rot = (base.tipo === 'nfse' ? 'NFS-e ' : 'NF-e ') + (meta.numero || '') + (meta.emitente ? ' (' + meta.emitente + ')' : '');
  if (r) {
    const l = r.linha; l.docs = l.docs || {};
    if (updPdf && !l.docs.nfe) l.docs.nfe = updPdf.webViewLink;
    if (updXml && !l.docs.xml) l.docs.xml = updXml.webViewLink;
    const mesma = !!(l.docs._nota && meta.chave && l.docs._nota.chave === meta.chave);   // o PDF / XML que faltava da mesma nota
    l.docs._nota = Object.assign({}, l.docs._nota, meta);
    if (/^(Despesas administrativas|Outras despesas)?$/.test(l.categoria || '') && base.categoria) { l.categoria = base.categoria; l.descricao = base.categoria + ' — ' + (l.empresa || meta.emitente); }
    if (!mesma) l.observacao = juntaObs91(l.observacao, 'Nota: ' + rot.trim());
    // a empresa do pagamento (cadastro com o nome fantasia) passa a ter o CNPJ da nota: a próxima nota acha sozinha
    if (meta.cnpj && typeof fmtCnpj === 'function') {
      const f = (S.fornecedores || []).find(x => !String(x.cnpj || '').replace(/\D/g, '') && palavras92(x.nome).some(w => semAc91(l.empresa || '').includes(w)));
      if (f) f.cnpj = fmtCnpj(meta.cnpj);
    }
    logAction('editar', 'EXTRATO_CAIXA', l.id, `Nota anexada ao pagamento ${l.descricao} R$ ${Number(l.valor).toFixed(2)}: ${rot.trim()}`);
    return l;
  }
  if (base.tipo !== 'nfse' || typeof lancarDespesaDaNota !== 'function') return null;
  const obj = lancarDespesaDaNota(pdf || xml, updPdf || updXml);
  if (obj) {
    obj.docs = obj.docs || {};
    if (updPdf && !obj.docs.nfe) obj.docs.nfe = updPdf.webViewLink;
    if (updXml && !obj.docs.xml) obj.docs.xml = updXml.webViewLink;
    if (!updPdf && updXml && obj.docs.nota === updXml.webViewLink) delete obj.docs.nota;   // o XML fica no botão XML, não no NF-e
    obj.docs._nota = Object.assign({}, obj.docs._nota, meta);
  }
  return obj;
}
// Comprovante que chega depois da nota: acha a linha que a nota criou (CNPJ do recebedor, nome, ou a única com o mesmo valor)
function linhaDaNotaParaComprovante92(item) {
  const v = Number(item.info.valor) || 0; if (!v) return null;
  const pag = item.info.pagamento || {};
  const cnpjs = [String(pag.documento || '').replace(/\D/g, ''), ...cnpjsDoTexto92(item.texto)].filter(x => x.length === 14);
  const quem = palavras92([pag.recebedor, item.info.emitNome, item.nome].join(' '));
  const d = item.info.data || '';
  const cands = (S.lancamentos || []).filter(l => l.tipo === 'Despesa' && l.vinculo !== 'processo' && l.docs && l.docs._nota && !l.docs.comprovante && !l.docs._banco
    && Math.abs((Number(l.valor) || 0) - v) < 0.01 && (!d || !l.data || Math.abs((new Date(brToIso(l.data)) - new Date(d)) / 864e5) <= 10));
  const forte = cands.filter(l => (l.docs._nota.cnpj && cnpjs.includes(l.docs._nota.cnpj)) || quem.some(w => (l.docs._nota.nomes || []).includes(w) || semAc91(l.empresa || '').includes(w)));
  return forte.length === 1 ? forte[0] : (!forte.length && cands.length === 1 ? cands[0] : null);
}

// "FS260098 99 01" ou "FS2600989901" = FS260098, FS260099 e FS260101 (só os 2 últimos dígitos; se diminuir, vira a centena seguinte)
// Também a forma curta do PIX (campo de 30 caracteres): "FS 113 114" = FS260113 e FS260114; "109S"; "113x2" = 2 containers
// (o "xN" logo depois do número é a quantidade de containers daquele processo: o PIX é dividido por container)
function anoProcessos() {
  const ids = (S.processos || []).map(p => p.id).filter(id => /^FS\d{6}/.test(id)).sort();
  return ids.length ? ids[ids.length - 1].slice(2, 4) : String(new Date().getFullYear()).slice(2);
}
function processoAtual(id) { const a = (typeof aliasesProcesso === 'function' ? aliasesProcesso() : {})[id]; return a || id; }
function lerAbreviados(txt) {
  const T = String(txt || '').toUpperCase().replace(/(\d)\s*E\s*(?=\d{2,3}S?(?![\dA-DF-RT-Z]))/g, '$1 ').replace(/FS(\d{6})((?:\d{2}){1,3})(?!\d)/g, (m, a, b) => 'FS' + a + ' ' + b.match(/\d{2}/g).join(' ') + ' ');
  const out = [], pesos = {}, ano = anoProcessos();
  const re = /FS\s?(\d{3,6})(S?)((?:[\s,;+\/]*\d{2,3}S?(?:\s*X\s*\d{1,2})?(?=[\s.,;+\/\-_)]|$)|\s*X\s*\d{1,2}(?=[\s.,;+\/\-_)]|$))*)/g; let m;
  const add = (id, peso) => { id = processoAtual(id); if (!out.includes(id)) out.push(id); if (peso > 1) pesos[id] = peso; };
  while ((m = re.exec(T))) {
    if (m[1].length === 5) continue;
    let base = m[1].length === 6 ? Number(m[1]) : Number(ano + m[1].padStart(4, '0'));
    let ultimo = 'FS' + String(base).padStart(6, '0') + m[2];
    const toks = m[3].match(/\d{2,3}S?|X\s*\d{1,2}/g) || [];
    if (toks.length > 8) continue;
    let peso = 1;
    const fecha = () => { add(ultimo, peso); peso = 1; };
    toks.forEach(t => {
      if (/^X/.test(t)) { peso = Number(t.replace(/\D/g, '')) || 1; return; }
      fecha();
      const s = t.endsWith('S') ? 'S' : '', d = t.replace(/S$/, '');
      let n;
      if (d.length === 3) { n = Number(ano + '0' + d); if (Math.abs(n - base) > 100) return; }
      else { n = Math.floor(base / 100) * 100 + Number(d); if (n < base || (n === base && !s)) n += 100; }
      base = n; ultimo = 'FS' + String(n).padStart(6, '0') + s;
    });
    fecha();
  }
  return { processos: out, pesos };
}
function processosAbreviados(txt) { return lerAbreviados(txt).processos; }
// nome padrão das pastas organizadas: "2026-08-20 - Favorecido - R$ 1.200,00 - Desc",
// "FS - Desc - R$ 550,00 (parte do PIX de R$ 1.650,00 de 2026-06-19)", "... - Reembolsar Klismann"
function lerNomeArquivo(nome) {
  const N = String(nome || '').replace(/\.[a-z0-9]{2,5}$/i, ''), r = {};
  const parte = N.match(/R\$\s*([\d.]+,\d{2})\s*\(\s*parte do PIX de R\$\s*([\d.]+,\d{2})(?:\s*de\s*(\d{4}-\d{2}-\d{2}))?/i);
  if (parte) { r.valor = numBR(parte[1]); r.totalPix = numBR(parte[2]); if (parte[3]) r.data = parte[3]; }
  if (!r.valor) { const v = N.match(/R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{3})*)(?![\d,])/i); if (v) r.valor = numBR(v[1]); }
  if (!r.data) { const d = N.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); if (d && Number(d[2]) <= 12 && Number(d[3]) <= 31) r.data = d[0]; }
  const p = N.match(/^(20\d{2}-\d{2}-\d{2})\s+-\s+([^-]+?)\s+-\s+R\$/i); if (p) r.favorecido = p[2].trim();
  if (/REEMBOLSAR\s+KLISMANN/i.test(N)) r.reembolsar = true;
  if (/\(CANCELAD[AO]\)/i.test(N)) r.cancelada = true;
  // câmbio transferido de um processo para outro: "Adiantamento transferido para FS260107" / "Adiantamento do FS260103"
  { const m = N.toUpperCase().match(/TRANSFERID[OA]\s+PARA\s+(?:O\s+)?(FS\s?\d{6}S?)/); if (m) r.transferePara = m[1].replace(/\s/g, ''); }
  { const m = N.toUpperCase().match(/ADIANTAMENTO\s+DO\s+(FS\s?\d{6}S?)/); if (m) r.transfereDe = m[1].replace(/\s/g, ''); }
  return r;
}
function normTxt(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' '); }

function classificarDocumento(texto, nome) {
  const T = normTxt(texto), N = normTxt(nome);
  const C = T.replace(/\s+/g, '');
  // confirmação / atualização de booking (reserva no navio): não é o BL — só traz o booking (v78)
  if (!/SHIPPEDONBOARD/.test(C) && (/(ATUALIZA[CÇ][AÃ]O|CONFIRMA[CÇ][AÃ]O|ALTERA[CÇ][AÃ]O)\s+DE\s+(BOOKING|RESERVA)|BOOKING\s+(CONFIRMATION|AMENDMENT|UPDATE)/.test(T) || (/\bBOOKING\b/.test(N) && !/\bB\/?L\b|BILL OF LADING/.test(N)))) {
    return { tipo: 'booking', confianca: 'alta', motivo: 'confirmação de booking' };
  }
  if (/WAYBILL|BILLOFLADING/.test(C) && /SHIPPEDONBOARD|BOOKINGNO|PORTOFLOADING/.test(C) && !chavesDoTexto(String(texto || '')).length) {
    return { tipo: 'bl', confianca: 'alta', motivo: 'BL / waybill' };
  }
  // v91: guia de imposto (DARF / DCTFWeb / DAS) — a conta a pagar. Ela tem "AUTENTICAÇÃO MECÂNICA" no rodapé (o espaço do
  // carimbo do banco) e antes era lida como comprovante; o comprovante do banco é outro documento
  if (/DOCUMENTO DE ARRECADA[CÇ][AÃ]O (?:DE RECEITAS FEDERAIS|DO SIMPLES NACIONAL)|\bDARF\b[\s\S]{0,600}(?:PAGAR ESTE DOCUMENTO|PER[IÍ]ODO DE APURA)/.test(T)
      && !/COMPROVANTE DE (?:PAGAMENTO|ARRECADA)|VALOR PAGO|PAGAMENTO (?:EFETUADO|REALIZADO)|DATA D[OE] PAGAMENTO|AUTENTICA[CÇ][AÃ]O NO COMPROVANTE/.test(T)) {
    return { tipo: 'guia', confianca: 'alta', motivo: 'guia de imposto (Receita Federal)' };
  }
  // boleto de cobrança (conta a pagar) — diferente do comprovante de pagamento do boleto
  if (/REPRESENTA[CÇ][AÃ]O NUM[EÉ]RICA|PAG[AÁ]VEL (?:EM QUALQUER BANCO|PREFERENCIALMENTE)|LINHA DIGIT[AÁ]VEL/.test(T) && !/VALOR DO PAGAMENTO|COMPROVANTE DE PAGAMENTO|AUTENTICA[CÇ][AÃ]O NO COMPROVANTE/.test(T)) {
    return { tipo: 'boleto', confianca: 'alta', motivo: 'boleto de cobrança' };
  }
  // 1) chave de acesso → nota/CT-e/MDF-e
  const chaves = chavesDoTexto(String(texto || '') + ' ' + String(nome || ''));
  if (chaves.length) {
    const info = infoChave(chaves[0]);
    let tipo = tipoPorModelo(info.modelo);
    if (tipo === 'nfe' && (info.emitCnpj === FU_SONG_CNPJ || /\bCFOP\b[\s\S]{0,400}\b7\.?10[0-9]\b/.test(T))) tipo = 'nfeSaida';
    if (tipo) return { tipo, confianca: 'alta', motivo: 'chave de acesso ' + info.modelo, ...info, outrasChaves: chaves.slice(1) };
  }
  // 2) documentos do banco com leitor próprio
  const camb = lerCambio(texto);
  if (camb) return { tipo: 'comprovantes', confianca: 'alta', motivo: 'contrato de câmbio ' + (camb.referencia || ''), cambio: camb };
  const pag = lerPagamento(texto);
  if (pag) return { tipo: 'pagamento', confianca: 'alta', motivo: 'comprovante do banco', pagamento: pag };
  // 3) cabeçalho do documento (primeiros 500 caracteres), depois o texto todo, depois o nome
  const head = T.slice(0, 500);
  for (const [area, alvo, conf] of [['cabeçalho', head, 'alta'], ['texto', T, 'media']]) {
    for (const [tipo, re] of REGRAS_TIPO) {
      if (re.test(alvo)) return { tipo, confianca: conf, motivo: area };
    }
  }
  // 4) só o nome do arquivo (prints e fotos não têm texto)
  for (const [tipo, re] of REGRAS_NOME) {
    if (re.test(N)) return { tipo, confianca: 'media', motivo: 'nome do arquivo', categoria: categoriaPeloNome(N) };
  }
  return { tipo: '', confianca: 'nenhuma', motivo: texto ? 'tipo não reconhecido' : 'sem texto (imagem): escolha o tipo' };
}

// Índice de chaves já anexadas aos processos (para CT-e que cita NF-e etc.)
function indiceChaves() {
  const idx = {};
  (S.processos || []).forEach(p => {
    const files = (p.docs && p.docs._files) || {};
    Object.keys(files).forEach(k => (files[k] || []).forEach(f => { if (f.chave) idx[f.chave] = p.id; }));
    if (p.dueChave) idx[String(p.dueChave).replace(/\D/g, '')] = p.id;
  });
  return idx;
}

function identificarProcesso(info, texto, nome) {
  const T = normTxt(texto) + ' ' + normTxt(nome);
  const compact = T.replace(/[\s\-.\/]/g, '');
  const idx = indiceChaves();
  const cands = [];
  (S.processos || []).forEach(p => {
    let score = 0; const motivos = [];
    const id = String(p.id || '').toUpperCase();
    if (id && new RegExp('\\b' + id.replace(/[^A-Z0-9]/g, '') + 'S?\\b').test(T.replace(/[\s\-]/g, ' ').replace(/FS\s+(\d)/g, 'FS$1'))) { score += 100; motivos.push('número ' + id); }
    Object.entries(typeof aliasesProcesso === 'function' ? aliasesProcesso() : {}).filter(([, novo]) => novo === id).forEach(([antigo]) => {
      if (!score && new RegExp('\\b' + antigo + '\\b').test(T.replace(/FS\s+(\d)/g, 'FS$1'))) { score += 100; motivos.push('número antigo ' + antigo + ' (virou ' + id + ')'); }
    });
    const conts = [...(p.containers || []), p.container].filter(Boolean).map(c => String(c).toUpperCase().replace(/[\s\-]/g, ''));
    conts.forEach(c => { if (c.length >= 10 && compact.includes(c)) { score += 80; motivos.push('container ' + c); } });
    const bk = String(p.booking || '').replace(/\s/g, '').toUpperCase();
    if (bk.length >= 6 && compact.includes(bk)) { score += 60; motivos.push('booking ' + bk); }
    const due = String(p.dueNumero || '').replace(/\W/g, '').toUpperCase();
    const duesDoc = Object.keys((p.docs && p.docs._dues) || {}).map(k => k.replace(/\W/g, '').toUpperCase()).filter(k => /BR\d{9}/.test(k));
    const ehDue = !!(info.dueNumero || info.ruc || (info.nfsSaida || []).length);
    if (due.length >= 8 && compact.includes(due)) { score += ehDue ? 100 : 80; motivos.push('número da DU-E'); }
    else if (duesDoc.some(k => compact.includes(k))) { score += 100; motivos.push('número da DU-E'); }
    // DU-E: RUC igual ao do BL (ou de outra DU-E do processo) e nota de saída da Fu Song citada (13/10/2026)
    if (info.ruc) {
      const rucs = [((p.docs && p.docs._bl) || {}).ruc, ...Object.values((p.docs && p.docs._dues) || {}).map(x => x && x.ruc)].filter(Boolean);
      if (rucs.includes(info.ruc)) { score += 100; motivos.push('RUC do BL'); }
    }
    if ((info.nfsSaida || []).length) {
      const minhas = [...new Set(((p.docs && p.docs._files && p.docs._files.nfeSaida) || []).map(f => String(Number(f.numero || 0))).filter(n => n !== '0'))];
      const bate = info.nfsSaida.filter(n => minhas.includes(n));
      if (bate.length) { score += 100; motivos.push('nota de saída ' + bate.join(' e ')); }
    }
    const refs = [...(info.refs || []), ...(info.outrasChaves || [])];
    refs.forEach(ch => { if (idx[ch] === p.id) { score += 100; motivos.push('cita nota já anexada'); } });
    if (info.chave && idx[info.chave] === p.id) { score += 100; motivos.push('mesma chave já anexada'); }
    if (info.cambio && info.cambio.faturas.some(f => f.processo === id)) { score += 150; motivos.push('fatura no contrato de câmbio'); }
    if (info.refProcesso && info.refProcesso === id.replace(/S$/, '')) { score += 150; motivos.push('processo citado no documento (invoice)'); }
    if (info.pagamento && normTxt(info.pagamento.identificacao).replace(/\s/g, '').replace(/^(FS\d{6})S$/, '$1') === id.replace(/^(FS\d{6})S$/, '$1')) { score += 150; motivos.push('identificação no comprovante'); }
    if (score > 0) cands.push({ id: p.id, score, motivos: [...new Set(motivos)] });
  });
  return cands.sort((a, b) => b.score - a.score);
}

// Documento que cita outro do MESMO lote da Entrada (MDF-e → CT-e, CT-e → NF-e): vai para o mesmo processo,
// sem precisar anexar um antes do outro (13/10/2026). Escolha manual nunca é trocada.
const _ordemConf = { nenhuma: 0, media: 1, alta: 2, manual: 2 };
function ligarPeloLote(lista) {
  lista = lista || (S.entrada && S.entrada.itens) || [];
  const rotulo = it => { const t = (ENTRADA_TIPOS.find(x => x[0] === it.tipo) || [])[1] || it.tipo; return t + (it.info && it.info.numero ? ' ' + String(it.info.numero).replace(/^0+/, '') : ''); };
  for (let volta = 0; volta < 3; volta++) {
    const porChave = {};
    lista.forEach(it => { const ch = it.info && it.info.chave; if (ch && it.tipo && it.processo && it.processo !== '__ADM') porChave[ch] = it; });
    let mudou = false;
    lista.forEach(it => {
      if (!it.info || it.confianca === 'manual') return;
      if (it.processo && !it._peloLote) return;   // o próprio documento já disse o processo
      const fonte = [...(it.info.refs || []), ...(it.info.outrasChaves || [])].map(ch => porChave[ch]).find(x => x && x !== it);
      if (!fonte || it.processo === fonte.processo) return;
      if (it._confBase == null) it._confBase = it.confianca || 'nenhuma';
      it.processo = fonte.processo; it._peloLote = true;
      it.confianca = _ordemConf[fonte.confianca] >= 2 && _ordemConf[it._confBase] >= 2 ? 'alta' : (it.tipo ? 'media' : it._confBase);
      const mot = 'cita o ' + rotulo(fonte) + ' que está na Entrada (' + fonte.processo + ')';
      it.candidatos = [{ id: fonte.processo, score: 100, motivos: [mot] }].concat((it.candidatos || []).filter(c => c.id !== fonte.processo));
      it.duplicado = procurarDuplicado(it);
      mudou = true;
    });
    if (!mudou) break;
  }
  return lista;
}

function procurarDuplicado(item) {
  for (const p of S.processos || []) {
    const files = (p.docs && p.docs._files) || {};
    for (const k of Object.keys(files)) {
      for (const f of files[k] || []) {
        if (item.md5 && f.md5 && f.md5 === item.md5) return { processo: p.id, nome: f.name, motivo: 'arquivo idêntico' };
        if (item.info && item.info.chave && f.chave === item.info.chave && f.formato === item.formato) return { processo: p.id, nome: f.name, motivo: 'mesma chave de acesso' };
      }
    }
  }
  return null;
}

// ── Leitura da pasta ────────────────────────────────────────
async function lerEntrada() {
  const E = S.entrada;
  if (E.carregando) return;
  // cada leitura tem um número: uma leitura antiga que termina depois (ex.: abriu a Entrada e logo importou tudo) não apaga a nova
  const gen = window._lerEntradaGen = (window._lerEntradaGen || 0) + 1;
  E.carregando = true; E.erro = ''; E.progresso = 'Abrindo a pasta Entrada...'; render();
  try {
    await getAccessToken();
    await ensureTestSheet();
    const folderId = await getTesteFolder(ENTRADA_FOLDER);
    E.folderId = folderId;
    E.folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
    const q = `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
    const todos = await driveListAll(q, 'id,name,mimeType,size,md5Checksum,createdTime,webViewLink');
    const files = todos.filter(f => !/\.(ofx|html?|js|css)$/i.test(f.name || '') && !(/\.txt$/i.test(f.name || '') && Number(f.size || 0) < 300));
    E.ofxNaEntrada = todos.filter(f => /\.ofx$/i.test(f.name || '')).length;
    const itens = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      E.progresso = `Lendo ${i + 1} de ${files.length}: ${f.name}`; render();
      itens.push(await analisarArquivo(f));
    }
    const vistos = {};
    itens.forEach(it => { if (!it.md5) return; if (vistos[it.md5] && !it.duplicado) it.duplicado = { processo: 'Entrada', nome: vistos[it.md5], motivo: 'arquivo idêntico na Entrada' }; else vistos[it.md5] = it.nome; });
    if (gen !== window._lerEntradaGen) return;   // uma leitura mais nova já está valendo
    E.itens = itens; E.lido = true;
    try { ligarPeloLote(E.itens); } catch (e) { console.warn('lote', e); }
    try { juntarTudo92(E.itens); } catch (e) { console.warn('guias', e); }
    const planilhas = itens.filter(it => it.tipo === 'planilhaCambio');
    if (planilhas.length && typeof aplicarMapaCambio === 'function') {
      E.progresso = 'Aplicando a planilha de câmbio do banco...'; render();
      if (typeof carregarBanco === 'function') await carregarBanco();
      for (const it of planilhas) {
        await guardarMapaCambio(it.info.mapa);
        const n = aplicarMapaCambio(it.info.mapa);
        try { const dest = await getTesteFolder('🏦 Câmbio'); await driveAPI('PATCH', '/files/' + it.fileId, {}, 'addParents=' + dest + '&removeParents=' + folderId + '&fields=id'); } catch (e) {}
        logAction('importar', 'REGRAS', it.fileId, 'Planilha de câmbio do banco: ' + it.info.mapa.length + ' contratos (' + n + ' corrigidos)');
        showToast(`✅ Planilha de câmbio do banco: ${it.info.mapa.length} contratos lidos, ${n} processo(s) corrigidos`);
      }
      E.itens = itens.filter(it => it.tipo !== 'planilhaCambio');
      E.itens.forEach(it => { try { identificarItem(it); } catch (e) {} });
      try { ligarPeloLote(E.itens); } catch (e) {}
      try { juntarTudo92(E.itens); } catch (e) {}
      try { await saveToSheets(); } catch (e) {}
    }
  } catch (e) {
    if (gen === window._lerEntradaGen) E.erro = e.message || String(e);
  }
  if (gen === window._lerEntradaGen) { E.carregando = false; E.progresso = ''; }
  render();
}

async function analisarArquivo(f) {
  const nome = f.name || '';
  const isXml = /xml/i.test(f.mimeType) || /\.xml$/i.test(nome);
  const isPdf = /pdf/i.test(f.mimeType) || /\.pdf$/i.test(nome);
  const item = { fileId: f.id, nome, url: f.webViewLink, md5: f.md5Checksum || '', formato: isXml ? 'xml' : isPdf ? 'pdf' : 'outro', texto: '', info: {}, erro: '' };
  try {
    if ((isXml || isPdf) && Number(f.size || 0) < 15e6) {
      const buf = await driveDownload(f.id);
      if (isXml) {
        item.texto = new TextDecoder('utf-8').decode(buf);
        const x = lerXmlFiscal(item.texto) || lerXmlNfse(item.texto);
        if (x && x.tipo) { item.info = x; item.tipo = x.tipo; item.confianca = 'alta'; item.motivo = 'XML ' + (x.modelo === '57' ? 'CT-e' : x.modelo === '58' ? 'MDF-e' : x.modelo === 'NFS-e' ? 'NFS-e' : 'NF-e'); }
      } else {
        item.texto = await pdfTexto(buf);
      }
    }
  } catch (e) { item.erro = e.message || String(e); }
  // Planilha (xlsx/csv): pode ser a planilha de câmbio enviada ao banco (Nº Bacen → Nº processo)
  if (/\.(xlsx|xls|csv)$/i.test(nome) || /spreadsheet|excel|text\/csv/i.test(f.mimeType || '')) {
    try {
      const csv = /\.csv$/i.test(nome) ? new TextDecoder('utf-8').decode(await driveDownload(f.id)) : (typeof planilhaParaCsv === 'function' ? await planilhaParaCsv(f.id, nome) : '');
      const mapa = typeof lerPlanilhaCambio === 'function' ? lerPlanilhaCambio(csv) : null;
      if (mapa) { item.texto = csv; item.tipo = 'planilhaCambio'; item.confianca = 'alta'; item.motivo = 'planilha de câmbio do banco'; item.info = { mapa }; item._base = { tipo: item.tipo, confianca: 'alta', motivo: item.motivo }; item.processo = '__CAMBIO'; return item; }
    } catch (e) { item.erro = e.message || String(e); }
  }
  // Print/foto ou PDF escaneado: o Google Drive lê o texto (OCR)
  const isImg = /^image\//i.test(f.mimeType || '') || /\.(png|jpe?g|webp|heic)$/i.test(nome);
  if (!item.tipo && (isImg || (isPdf && String(item.texto || '').replace(/\s/g, '').length < 40)) && Number(f.size || 0) < 10e6 && typeof ocrDrive === 'function') {
    try { const t = await ocrDrive(f.id, nome); if (t && t.trim()) { item.texto = t; item.ocr = true; } } catch (e) { item.erroOcr = e.message || String(e); }
  }
  if (!item.tipo) {
    const c = classificarDocumento(item.texto, nome.replace(/^((?:FS\d{6}S?)(?:\+FS\d{6}S?)*|ADM) - /i, ''));
    item.tipo = c.tipo; item.confianca = c.confianca; item.motivo = c.motivo;
    item.info = c.chave ? { chave: c.chave, modelo: c.modelo, numero: c.numero, emitCnpj: c.emitCnpj, outrasChaves: c.outrasChaves, valor: (c.tipo === 'nfe' || c.tipo === 'nfeSaida') ? valorDanfe(item.texto) : 0 } : {};
    if (c.cambio) { item.info.cambio = c.cambio; item.info.valor = c.cambio.valorReais; item.info.data = brToIso(c.cambio.data); }
    if (c.pagamento) { completarPagamento(c.pagamento, item.texto); if (c.pagamento.valorIncerto) item.confianca = 'media'; if (!c.categoria) c.categoria = categoriaPeloNome(normTxt(nome + ' ' + (c.pagamento.recebedor || ''))); item.info.pagamento = c.pagamento; item.info.valor = c.pagamento.valor; item.info.emitNome = c.pagamento.recebedor; item.info.data = brToIso(c.pagamento.data); }
    if (c.categoria) item.categoria = c.categoria;
  }
  if (typeof enriquecerInfo === 'function') { try { enriquecerInfo(item); } catch (e) { console.warn('enriquecer', e); } }
  if (item.tipo === 'guia') preencherGuia91(item);
  if (/ADIANTAMENTO|ANTECIPA/i.test(nome + ' ' + ((item.info.pagamento && item.info.pagamento.identificacao) || ''))) item.info.adiantamento = true;
  // o que o documento não traz, o nome do arquivo diz (valor, data, favorecido, reembolso ao sócio)
  {
    const pn = lerNomeArquivo(nome.replace(/^((?:FS\d{6}S?)(?:\+FS\d{6}S?)*|ADM) - /i, ''));
    const usado = [];
    if (!(Number(item.info.valor) > 0) && pn.valor > 0 && !item.info.cambio) { item.info.valor = pn.valor; if (item.info.pagamento) item.info.pagamento.valor = pn.valor; usado.push('valor'); }
    if (!item.info.data && pn.data) { item.info.data = pn.data; usado.push('data'); }
    if (!item.info.emitNome && pn.favorecido) { item.info.emitNome = pn.favorecido; usado.push('favorecido'); }
    if (pn.totalPix) item.info.totalPix = pn.totalPix;
    if (pn.reembolsar && !item.pagoPor) item.pagoPor = 'socio';
    if (pn.cancelada) item.info.cancelada = true;
    if (usado.length) { item.info.peloNome = usado; item.motivo = (item.motivo ? item.motivo + ' · ' : '') + usado.join(', ') + ' pelo nome do arquivo'; }
  }
  if (['nfse', 'boleto', 'recibo', 'guia'].includes(item.tipo) && Number(item.info.valor) > 0 && item.info.emitNome && item.info.data && item.confianca !== 'alta') { item.confianca = 'alta'; item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'valor, data e emitente lidos'; }
  item._base = { tipo: item.tipo, confianca: item.confianca, motivo: item.motivo };
  return identificarItem(item);
}

// Decide o processo do arquivo já lido. Pode ser refeito (ex.: depois de criar os processos) sem ler o arquivo de novo.
function identificarItem(item) {
  const nome = item.nome || '';
  if (item._base) { item.tipo = item._base.tipo; item.confianca = item._base.confianca; item.motivo = item._base.motivo; }
  ['processo', 'pastaErrada', 'corrigido', 'aviso', 'processosExtras', 'divisao', 'admAuto', '_peloLote', '_confBase'].forEach(k => delete item[k]);
  if (item.tipo === 'planilhaCambio') { item.processo = '__CAMBIO'; return item; }
  // câmbio: número antigo → novo (FS260105 → FS260107) e "S" → principal (FS260109S recebe pelo FS260109)
  if (item.info && item.info.cambio && Array.isArray(item.info.cambio.faturas)) {
    const base = id => { id = typeof numeroCorrigido === 'function' ? numeroCorrigido(id) : processoAtual(id); return /^FS\d{6}S$/.test(id) && (S.processos || []).some(p => p.id === id.slice(0, -1)) ? id.slice(0, -1) : id; };
    const m = {};
    item.info.cambio.faturas.forEach(f => { const id = base(f.processo); if (m[id]) m[id].usd = Math.round((m[id].usd + (Number(f.usd) || 0)) * 100) / 100; else m[id] = Object.assign({}, f, { processo: id }); });
    item.info.cambio.faturas = Object.values(m);
    // nome do arquivo diz que o câmbio foi transferido (processo cancelado → outro): a fatura passa para o processo novo
    const tr = typeof transferenciaCambioDoNome === 'function' ? transferenciaCambioDoNome(item.nome, item.info.cambio) : null;
    if (tr) item.info.cambio.faturas = item.info.cambio.faturas.map(f => f.processo === tr.de ? Object.assign({}, f, { processo: tr.para, transferidoDe: tr.de }) : f);
  }
  // contrato de câmbio sem "FATURA": a planilha do banco diz de qual processo é
  if (item.info && item.info.cambio && !(item.info.cambio.faturas || []).some(x => !x.pelaPasta) && typeof mapaCambioGuardado === 'function') {
    const m = mapaCambioGuardado().find(x => x.ref === String(item.info.cambio.referencia || ''));
    const ids = m ? m.processos.filter(id => (S.processos || []).some(p => p.id === id)) : [];
    if (ids.length) { const usd = Math.round((Number(item.info.cambio.valorMoeda) || 0) / ids.length * 100) / 100; item.info.cambio.faturas = ids.map(id => ({ processo: id, usd, pelaPlanilha: true })); }
  }
  // Prefixo colocado pelo acervo: "FS260105+FS260107 - nome original"
  const mPasta = nome.match(/^((?:FS\d{6}S?)(?:\+FS\d{6}S?)*) - /i);
  item.pastaProcessos = mPasta ? [...new Set(mPasta[1].toUpperCase().split('+').map(processoAtual))] : [];
  const nomeSemPasta = mPasta ? nome.slice(mPasta[0].length) : nome;
  const pelaPasta = new Set(item.pastaProcessos);
  item.candidatos = identificarProcesso(item.info, item.texto, nomeSemPasta);       // só o documento
  // processo renumerado (ex.: FS260105 virou FS260107): o número antigo aponta para o novo
  item.candidatos = item.candidatos.reduce((acc, c) => { const id = processoAtual(c.id), j = acc.find(x => x.id === id); if (j) { j.score = Math.max(j.score, c.score); } else acc.push(Object.assign({}, c, { id })); return acc; }, []);
  const doDoc = item.candidatos[0] ? item.candidatos[0].id : '';
  // pasta do processo "S" (FS260109S) e documento que cita o principal (FS260109): é a mesma venda — vale a pasta
  const irmaoS = doDoc && [...pelaPasta].find(id => id === doDoc + 'S');
  if (irmaoS) {
    item.processo = irmaoS;
    item.candidatos = [{ id: irmaoS, score: 100, motivos: ['pasta ' + irmaoS + ' (o documento cita ' + doDoc + ', mesma venda)'] }].concat(item.candidatos.filter(c => c.id !== irmaoS));
  } else if (doDoc && pelaPasta.size && !pelaPasta.has(doDoc) && item.candidatos[0].score >= 100) {
    // Documento na pasta errada. Se a prova vem de DENTRO do documento (chave de acesso, nota citada,
    // container, DU-E, fatura do câmbio, identificação do comprovante, número no texto), vai direto
    // para a pasta certa. Se a única pista é o número escrito no nome do arquivo, pede conferência.
    const pasta = [...pelaPasta].join(' e ');
    const peloConteudo = item.texto || Object.keys(item.info || {}).length ? identificarProcesso(item.info, item.texto, '') : [];
    const forte = peloConteudo[0] && peloConteudo[0].id === doDoc && peloConteudo[0].score >= 100
      && (!peloConteudo[1] || peloConteudo[1].score < peloConteudo[0].score)
      && peloConteudo[0].motivos.some(mo => !/^número /.test(mo))
      && !item.pastaProcessos.some(id => normTxt(nomeSemPasta).includes(id));
    item.processo = doDoc;
    item.pastaErrada = { estava: [...pelaPasta], certo: doDoc, motivos: (forte ? peloConteudo[0] : item.candidatos[0]).motivos };
    if (forte) {
      if (item.confianca !== 'alta') item.confianca = 'alta';
      item.corrigido = `Estava na pasta ${pasta}, mas o documento é do ${doDoc} (${item.pastaErrada.motivos.join(', ')}). Vai para a pasta certa.`;
    } else {
      item.confianca = 'media';
      const nomeConcorda = item.pastaProcessos.find(id => normTxt(nomeSemPasta).includes(id));
      if (nomeConcorda) {
        // pasta e nome do arquivo dizem a mesma coisa: fica na pasta; o documento só cita outro processo
        item.processo = nomeConcorda; delete item.pastaErrada;
        item.aviso = `O documento cita ${doDoc}, mas o nome do arquivo e a pasta indicam ${nomeConcorda}. Ficou no ${nomeConcorda} — confira.`;
      } else {
        item.aviso = `Conflito: o documento indica ${doDoc}, mas ele estava na pasta ${pasta}. Confira antes de anexar.`;
      }
    }
  } else if (doDoc) {
    item.processo = doDoc;
  } else if (pelaPasta.size) {
    item.processo = item.pastaProcessos[0];
    item.candidatos = item.pastaProcessos.map(id => ({ id, score: 90, motivos: ['pasta de origem'] }));
  } else {
    item.processo = /^ADM\s*-/i.test(nome) ? '__ADM' : '';
  }
  // Mesmo arquivo em pastas de processos diferentes: anexa a todos (atalho nos outros)
  if (item.pastaProcessos.length > 1 && !item.aviso && !item.pastaErrada) {
    const ehCusto = typeof DOCS_COM_CUSTO !== 'undefined' && DOCS_COM_CUSTO.includes(item.tipo) && !(item.info && item.info.cambio);
    const peloDoc = doDoc && item.pastaProcessos.includes(doDoc) && item.candidatos[0].score >= 100 && (!item.candidatos[1] || item.candidatos[1].score < item.candidatos[0].score);
    if (ehCusto && peloDoc) item.processo = doDoc;   // nota/comprovante: o próprio documento diz de qual processo é
    else if (ehCusto) { item.confianca = 'media'; item.aviso = `Confira: este arquivo de custo estava nas pastas ${item.pastaProcessos.join(' e ')}. Escolha o processo (para o custo não entrar duas vezes).`; }
    else item.processosExtras = item.pastaProcessos.filter(id => id !== item.processo);
  }
  { const certo = typeof processoDoPagamento === 'function' ? processoDoPagamento(item.info.pagamento && item.info.pagamento.idTransacao) : '';
    if (certo && (S.processos || []).some(p => p.id === certo)) { item.processo = certo; delete item.pastaErrada; delete item.corrigido; item.processosExtras = []; } }
  // decisão sua sobre este arquivo (ex.: Recibo Mineração WL é do FS260096)
  { const d = typeof DECISOES_ENTRADA !== 'undefined' && DECISOES_ENTRADA.find(([re]) => re.test(item.nome || ''));
    if (d && (S.processos || []).some(p => p.id === d[1])) { item.processo = d[1]; item.processosExtras = []; delete item.pastaErrada; delete item.corrigido; item.aviso = ''; item.confianca = 'alta'; item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'decisão sua: ' + d[1]; } }
  // v91: guia de imposto da empresa (DCTFWeb, DAS...) é despesa do mês — só vai para um processo se o nome do arquivo ou a pasta disser
  if (item.tipo === 'guia' && !item.pastaProcessos.length && !/FS\s?\d{6}/i.test(nomeSemPasta)) { item.processo = '__ADM'; item.candidatos = []; item.processosExtras = []; delete item.pastaErrada; delete item.corrigido; }
  // despesa que nunca é de processo (Embraport: taxa atípica do porto) → comprovantes do mês
  if (typeof FORA_DOS_PROCESSOS !== 'undefined' && FORA_DOS_PROCESSOS.some(re => re.test(String((item.info.emitNome || '') + ' ' + ((item.info.pagamento || {}).recebedor || ''))))) { item.processo = '__ADM'; item.categoria = 'Porto / Taxas'; item.processosExtras = []; delete item.pastaErrada; delete item.corrigido; }
  // Comprovante de pagamento sem nenhuma pista de processo → sugere "despesa do mês" (confira)
  if (!item.processo && item.tipo === 'pagamento' && !(item.candidatos || []).length) {
    item.processo = '__ADM'; item.admAuto = true; if (item.confianca === 'alta') item.confianca = 'media';
    item.aviso = (item.aviso ? item.aviso + ' ' : '') + 'Não cita nenhum processo: vai para os comprovantes do mês. Se for custo de um processo, escolha o processo.';
  }
  if (!item.tipo && item.pastaProcessos.length && item.processo && item.processo !== '__ADM') { item.tipo = 'outros'; item.confianca = 'media'; item.motivo = 'arquivo da pasta do processo'; }
  if (item.processo === '__ADM' && !item.tipo) { item.tipo = 'pagamento'; item.confianca = 'media'; item.motivo = 'pasta de comprovantes do mês'; }
  // Contrato antigo sem "FATURA: FS…": o processo vem da pasta; o dólar é dividido igualmente entre as pastas onde ele estava
  if (item.info.cambio && (item.info.cambio.faturas || []).every(x => x.pelaPasta) && item.processo && item.processo !== '__ADM') {
    const ids = [...new Set([item.processo, ...(item.pastaProcessos || [])])].filter(id => (S.processos || []).some(p => p.id === id));
    if (ids.length) {
      const usd = Math.round((Number(item.info.cambio.valorMoeda) || 0) / ids.length * 100) / 100;
      item.info.cambio.faturas = ids.map(id => ({ processo: id, usd, pelaPasta: true }));
      item.aviso = (item.aviso ? item.aviso + ' ' : '') + `O contrato não cita a fatura: ligado pela pasta a ${ids.join(' + ')}.`;
    }
  }
  // Contrato de câmbio que paga mais de uma fatura: anexa a todos os processos citados
  if (item.info.cambio) item.processosExtras = item.info.cambio.faturas.map(f => f.processo).filter(id => id !== item.processo && (S.processos || []).some(p => p.id === id));
  item.processosExtras = (item.processosExtras || []).filter(id => (S.processos || []).some(p => p.id === id));
  if (item.processosExtras.length && !item.info.cambio) item.aviso = (item.aviso ? item.aviso + ' ' : '') + `Este mesmo arquivo estava também na pasta ${item.processosExtras.join(', ')}: será anexado a todos.`;
  if (item.info.cambio && item.info.cambio.faturas.length && item.info.cambio.faturas.some(f => !(S.processos || []).some(p => p.id === f.processo))) {
    item.aviso = (item.aviso ? item.aviso + ' ' : '') + 'Fatura sem processo no ERP: ' + item.info.cambio.faturas.filter(f => !(S.processos || []).some(p => p.id === f.processo)).map(f => f.processo).join(', ');
  }
  // comprovante com mais de um processo na identificação ("FS260096 FS260097"): divide igualmente
  const existe = id => (S.processos || []).some(p => p.id === id);
  let ab = lerAbreviados((item.info.pagamento && item.info.pagamento.identificacao) || '');
  let ids = ab.processos.filter(existe);
  if (!ids.length) ids = ((item.info.pagamento && item.info.pagamento.processos) || []).map(processoAtual).filter(existe);
  if (ids.length < 2) { const abN = lerAbreviados(nomeSemPasta), peloNome = abN.processos.filter(existe); if (peloNome.length > 1) { ids = peloNome; ab = abN; } }
  if (item._divPeso) { delete item.divisaoValores; delete item._divPeso; }
  // cada pasta tem a sua cópia com "R$ parte (parte do PIX de R$ total)": vale o valor de cada pasta
  const partes = item.md5 && window._partesPorMd5 && window._partesPorMd5[item.md5];
  if (partes && Object.keys(partes).filter(existe).length > 1 && (item.tipo === 'pagamento' || item.tipo === 'recibo')) {
    ids = Object.keys(partes).filter(existe); ab = { processos: ids, pesos: {} };
    item.divisaoValores = Object.fromEntries(ids.map(id => [id, partes[id]])); item._divPeso = true;
  }
  // comprovante / recibo salvo nas pastas de mais de um processo: pagou os dois → divide
  if (ids.length < 2 && (item.tipo === 'pagamento' || item.tipo === 'recibo') && (item.pastaProcessos || []).length > 1) ids = item.pastaProcessos.filter(id => (S.processos || []).some(p => p.id === id));
  if (ids.length > 1 && (item.tipo === 'pagamento' || item.tipo === 'recibo')) {
    item.processo = ids.includes(item.processo) ? item.processo : ids[0];
    item.processosExtras = ids.filter(id => id !== item.processo);
    item.divisao = ids.length;
    if (item.aviso && /^Confira: este arquivo de custo/.test(item.aviso)) { item.aviso = ''; if (item._base && item._base.confianca === 'alta') item.confianca = 'alta'; }
    // a pasta onde estava é um dos processos pagos: não é pasta errada
    if ((item.pastaProcessos || []).length && item.pastaProcessos.every(id => ids.includes(id))) { delete item.pastaErrada; delete item.corrigido; item.aviso = String(item.aviso || '').replace(/Conflito:[^.]*\.[^.]*\./, '').trim(); if (item._base && item._base.confianca === 'alta') item.confianca = 'alta'; }
    const f2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pesos = ids.map(id => (ab.pesos && ab.pesos[id]) || 1), somaP = pesos.reduce((a, x) => a + x, 0), total = Number(item.info.valor) || 0;
    if (item._divPeso && item.divisaoValores && ids.every(id => item.divisaoValores[id] != null) && !pesos.some(x => x > 1)) {
      item.aviso = (item.aviso ? item.aviso + ' ' : '') + `Pagamento de ${ids.join(' + ')}: valor de cada pasta pelo nome do arquivo (${ids.map(id => id + ' R$ ' + f2(item.divisaoValores[id])).join(' · ')}).`;
    } else if (pesos.some(x => x > 1) && !item.divisaoValores) {
      // "FS 113x2 114": divide por container (2 partes para o 113, 1 para o 114); o último leva os centavos que sobram
      const vals = pesos.map(w => Math.round(total * w / somaP * 100) / 100);
      vals[vals.length - 1] = Math.round((total - vals.slice(0, -1).reduce((a, x) => a + x, 0)) * 100) / 100;
      item.divisaoValores = Object.fromEntries(ids.map((id, k) => [id, vals[k]])); item._divPeso = true;
      item.aviso = (item.aviso ? item.aviso + ' ' : '') + `Pagamento de ${ids.join(' + ')}: dividido por container (${ids.map((id, k) => id + (pesos[k] > 1 ? ' x' + pesos[k] : '') + ' R$ ' + f2(vals[k])).join(' · ')}).`;
    } else {
      item.aviso = (item.aviso ? item.aviso + ' ' : '') + `Pagamento de ${ids.join(' + ')}: dividido igualmente (R$ ${f2(total / ids.length)} cada).`;
    }
  }
  if (item.processo === '__ADM' && !item.categoriaManual && typeof categoriaAdm === 'function') { const c = categoriaAdm(item); if (c) item.categoria = c; }
  if (item.tipo === 'guia' && !item.categoriaManual) item.categoria = (item.info.guia && item.info.guia.categoria) || 'Impostos federais';
  if (item.tipo === 'due') ajustarDue(item);
  item.duplicado = procurarDuplicado(item);
  return item;
}

// DU-E (13/10/2026): o par "S" (FS260109 + FS260109S) tem uma DU-E por container — a segunda DU-E de uma nota do
// principal vai para o "S"; e pista forte (número da DU-E, RUC do BL, nota de saída, chave de nota) = "identificado"
function ajustarDue(item) {
  const info = item.info || {}, num = String(info.dueNumero || '').replace(/\W/g, '').toUpperCase();
  const top = (item.candidatos || [])[0];
  if (!top || !item.processo || item.processo !== top.id) return;
  const P = (S.processos || []).find(p => p.id === item.processo), PS = P && (S.processos || []).find(q => q.id === P.id + 'S');
  if (P && PS && num) {
    const n = x => String(x || '').replace(/\W/g, '').toUpperCase();
    const daP = [n(P.dueNumero), ...Object.keys((P.docs && P.docs._dues) || {}).map(n)].filter(k => /BR\d{9}/.test(k));
    const doPS = Object.keys((PS.docs && PS.docs._dues) || {}).map(n).filter(k => /BR\d{9}/.test(k));
    if (daP.length && !daP.includes(num) && !doPS.length) {
      item.processo = PS.id;
      item.candidatos = [{ id: PS.id, score: top.score, motivos: top.motivos.concat(['segunda DU-E da venda ' + P.id + ' (uma por container): vai para o ' + PS.id]) }].concat(item.candidatos.filter(c => c.id !== PS.id));
      item.aviso = (item.aviso ? item.aviso + ' ' : '') + `O ${P.id} já tem a DU-E ${P.dueNumero || daP[0]}: esta é a do outro container, ficou no ${PS.id}.`;
    }
  }
  // aviso já na Caixa de Entrada: DU-E que não bate com a invoice do processo (peso ou valor) — 13/10/2026
  { const Q = (S.processos || []).find(p => p.id === item.processo);
    const par = Q && ((S.processos || []).some(q => q.id === Q.id + 'S') || /^FS\d{6}S$/.test(Q.id));   // venda dividida: confere pelo processo (soma das duas DU-Es)
    if (Q && !par) {
      const kg = (typeof toneladas === 'function' ? toneladas(Q) : 0) * 1000, peso = Number(info.pesoLiq) || 0, nk = n => Math.round(n).toLocaleString('pt-BR');
      const val = Number(info.vmcv || info.vmle) || 0, dR = Number(info.dueReais) || 0, nfR = typeof nfSaidaReais === 'function' ? nfSaidaReais(Q) : 0;
      const prob = [];
      if (peso && kg && Math.abs(peso - kg) > Math.max(50, kg * 0.005)) prob.push(`peso ${nk(peso)} kg na DU-E × ${nk(kg)} kg na invoice`);
      if (dR && nfR && Math.abs(dR - nfR) > Math.max(1, nfR * 0.005)) prob.push(`R$ ${fmt(dR)} na DU-E × R$ ${fmt(nfR)} na nota de saída`);
      if (val && dR && !(dR / val > 3 && dR / val < 8)) prob.push(`valor em dólar incoerente (USD ${fmt(val)} para R$ ${fmt(dR)})`);
      if (prob.length) item.aviso = (item.aviso ? item.aviso + ' ' : '') + `⚠️ Esta DU-E não bate com o ${Q.id}: ${prob.join('; ')}. Confira com o despachante (retificação).`;
    } }
  const c = item.candidatos[0], seg = item.candidatos[1];
  const forte = c && c.score >= 100 && (!seg || seg.score < c.score) && c.motivos.some(m => /DU-E|RUC|nota de saída|nota já anexada|segunda DU-E/.test(m));
  if (forte && item.confianca !== 'manual' && !item.pastaErrada) item.confianca = 'alta';
}

// ── Importar acervo existente (cópia; originais intactos) ───
// Percorre a pasta antiga (e subpastas), copia cada arquivo para a Entrada de teste.
// O processo vem da pasta onde o arquivo estava (ex.: "FS260109 - Lee 2 lítio");
// pastas de comprovantes do mês viram "ADM - ...".
const ACERVO_IGNORAR_PASTA = /^(ERP|EXTRATO)/i;
const ACERVO_IGNORAR_ARQ = /\.(html?|ofx|js|css)$/i;

async function driveListAll(q, fields) {
  let out = [], token = '';
  do {
    const r = await driveAPI('GET', '/files', null, 'q=' + encodeURIComponent(q) + '&fields=nextPageToken,files(' + fields + ')&pageSize=200' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    out = out.concat(r.files || []); token = r.nextPageToken || '';
  } while (token);
  return out;
}

async function importarAcervo(linkDado) {
  const E = S.entrada;
  let salvo = '';
  try { salvo = localStorage.getItem('teste:acervo-url') || ''; } catch (e) {}
  const link = linkDado || await uiPrompt('Cole o link da pasta do Drive (ex.: a pasta FS260096). Os arquivos serão COPIADOS para a Entrada de teste; os originais não mudam.', salvo, 'Importar pasta');
  if (!link) return;
  const m = String(link).match(/folders\/([A-Za-z0-9_-]{10,})/) || String(link).match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) { await uiAlert('Link de pasta inválido. Copie o endereço da pasta no Drive (…/folders/…).'); return; }
  try { localStorage.setItem('teste:acervo-url', link); } catch (e) {}
  const raiz = m[1];
  E.carregando = true; E.progresso = 'Lendo a pasta de origem...'; render();
  try {
    await ensureTestSheet();
    const entradaId = await getTesteFolder(ENTRADA_FOLDER);
    // md5 já presentes (Entrada + anexados) para não duplicar
    const ja = new Set();
    (await driveListAll(`'${entradaId}' in parents and trashed=false`, 'md5Checksum')).forEach(f => f.md5Checksum && ja.add(f.md5Checksum));
    (S.processos || []).forEach(p => Object.values(((p.docs || {})._files) || {}).forEach(arr => (arr || []).forEach(f => f.md5 && ja.add(f.md5))));
    // percorre a árvore
    let ctxRaiz = '';
    try { const meta = await driveAPI('GET', '/files/' + raiz, null, 'fields=id,name'); ctxRaiz = ((meta.name || '').toUpperCase().match(/FS\s?\d{6}/) || [''])[0].replace(/\s/g, ''); E.ultimaPastaProcesso = ctxRaiz; } catch (e) {}
    const fila = [{ id: raiz, contexto: ctxRaiz }], arquivos = [];
    while (fila.length) {
      const { id, contexto } = fila.shift();
      const filhos = await driveListAll(`'${id}' in parents and trashed=false`, 'id,name,mimeType,md5Checksum,size');
      for (const f of filhos) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (ACERVO_IGNORAR_PASTA.test(f.name.trim())) continue;
          const fs = (f.name.toUpperCase().match(/FS\s?\d{6}/) || [''])[0].replace(/\s/g, '');
          const ctx = fs || (/COMPROVANTE|DESPESA/i.test(f.name) ? 'ADM' : contexto);
          fila.push({ id: f.id, contexto: ctx });
        } else if (!/^application\/vnd\.google-apps/.test(f.mimeType) && !ACERVO_IGNORAR_ARQ.test(f.name)) {
          arquivos.push({ ...f, contexto });
        }
      }
      E.progresso = `Lendo a pasta de origem... ${arquivos.length} arquivo(s) encontrados`; render();
    }
    // mesmo conteúdo em várias pastas → uma cópia só, com todos os processos no prefixo
    const porMd5 = {};
    arquivos.forEach(f => { if (!f.md5Checksum) return; (porMd5[f.md5Checksum] = porMd5[f.md5Checksum] || new Set()).add(f.contexto); });
    const existe = id => (S.processos || []).some(p => p.id === id);
    let copiados = 0, pulados = 0, unificados = 0;
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      if (f.md5Checksum && ja.has(f.md5Checksum)) { pulados++; continue; }
      const ctxs = [...(f.md5Checksum ? porMd5[f.md5Checksum] : new Set([f.contexto]))].filter(c => c && c !== 'ADM');
      if (ctxs.length > 1) unificados++;
      const fsNome = ((f.name.toUpperCase().match(/FS\s?\d{6}S?/) || [''])[0]).replace(/\s/g, '');
      const fsValido = fsNome && existe(fsNome);
      let nome = f.name.trim();
      if (ctxs.length && !(fsNome && ctxs.length === 1 && ctxs[0] === fsNome && (fsValido || fsNome === ctxRaiz))) nome = `${ctxs.join('+')} - ${nome}`;   // FS ausente, errado (ex.: FS270098) ou várias pastas
      else if (!ctxs.length && f.contexto === 'ADM' && !fsValido) nome = `ADM - ${nome}`;
      E.progresso = `Copiando ${i + 1} de ${arquivos.length}: ${nome}`; render();
      try {
        await driveAPI('POST', '/files/' + f.id + '/copy', { name: nome, parents: [entradaId], description: 'Cópia do acervo (original: ' + f.id + ')' }, 'fields=id');
        if (f.md5Checksum) ja.add(f.md5Checksum);
        copiados++;
      } catch (e) { console.warn('copiar', f.name, e.message); }
    }
    E.progresso = '';
    E.carregando = false;
    E.ultimoAcervo = { copiados, pulados, unificados, total: arquivos.length };
    showToast(`✅ ${copiados} arquivo(s) copiados para a Entrada de teste${pulados ? ` · ${pulados} repetidos não copiados` : ''}${unificados ? ` · ${unificados} estavam em mais de um processo` : ''}`);
    E.lido = false;
    await lerEntrada();
  } catch (e) {
    E.carregando = false; E.erro = e.message || String(e); render();
  }
}

// ── Confirmação: move, renomeia e anexa ─────────────────────
function brToIso(d) { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }

function nomePadrao(item, p) {
  const ext = (item.nome.match(/\.[a-z0-9]{2,5}$/i) || [''])[0].toLowerCase();
  const partes = [p.id, tipoLabel(item.tipo).replace(/[^\wÀ-ú]+/g, '-')];
  if (item.info && item.info.numero) partes.push('n' + item.info.numero);
  if (item.info && item.info.emitNome) partes.push(item.info.emitNome.split(' ').slice(0, 2).join('-'));
  return partes.join('_').replace(/-+/g, '-') + ext;
}

// pasta do processo (oficial): cada documento vai para a subpasta de sempre
const SUBPASTA_DO_TIPO = { invoice: '01 Comercial', contrato: '01 Comercial', packingList: '01 Comercial', nfe: '02 Fiscal', nfeSaida: '02 Fiscal', nfse: '02 Fiscal', cte: '03 Transporte', mdfe: '03 Transporte', pesagem: '03 Transporte', bl: '04 Embarque', booking: '04 Embarque', due: '04 Embarque', certOrigem: '04 Embarque', seguro: '04 Embarque', pagamento: '05 Financeiro', comprovantes: '05 Financeiro', recibo: '05 Financeiro', faturaFrete: '05 Financeiro', outros: '06 Fotos' };
async function confirmarEntrada(i, silencioso) {
  const E = S.entrada, item = E.itens[i];
  if (!item || item.salvando) return;
  if (!item.tipo) { if (!silencioso) showToast('Escolha o tipo de documento'); return false; }
  if (item.processo === '__ADM') return confirmarAdm(i, silencioso);
  const p = S.processos.find(x => x.id === item.processo);
  if (!p) { if (!silencioso) showToast('Escolha o processo'); return false; }
  if (typeof somaDivisaoOk === 'function' && !somaDivisaoOk(item)) { if (!silencioso) showToast('A soma dos valores por processo precisa bater com o valor pago'); return false; }
  item.salvando = true; render();
  try {
    let folderId = p.docs && p.docs._folderId;
    if (!folderId) { const r = await criarPastaProcesso(p); folderId = r && r.folderId; }
    if (!folderId) throw new Error('Não foi possível criar a pasta do processo');
    if (ERP_ENV.subpastas) { const sub = SUBPASTA_DO_TIPO[item.tipo] || '05 Financeiro'; folderId = await getOrCreateFolder(sub, folderId); }
    else if (item.tipo === 'pagamento') folderId = await getOrCreateFolder('Comprovantes', folderId);
    const novoNome = nomePadrao(item, p);
    const upd = await driveAPI('PATCH', '/files/' + item.fileId,
      { name: novoNome, description: 'Nome original: ' + item.nome + ' · anexado pela Caixa de Entrada em ' + new Date().toLocaleString('pt-BR') },
      'addParents=' + folderId + '&removeParents=' + E.folderId + '&fields=id,name,webViewLink');
    const registro = proc => {
      const fatura = item.info.cambio ? item.info.cambio.faturas.find(f => f.processo === proc.id) : null;
      if (!proc.docs) proc.docs = {};
      if (!proc.docs._files) proc.docs._files = {};
      if (!proc.docs._files[item.tipo]) proc.docs._files[item.tipo] = [];
      proc.docs._files[item.tipo].push({
        id: upd.id, name: upd.name, url: upd.webViewLink, md5: item.md5, formato: item.formato,
        chave: item.info.chave || '', numero: item.info.numero || '',
        emitente: item.info.emitNome || '', valor: item.info.valor || 0, data: item.info.data || '',
        categoria: item.categoria || '',
        cambio: item.info.cambio ? { faturas: item.info.cambio.faturas, referencia: item.info.cambio.referencia, contratoExtrato: item.info.cambio.contratoExtrato, taxa: item.info.cambio.taxa, usdFatura: fatura ? fatura.usd : null, usdTotal: item.info.cambio.valorMoeda, reaisTotal: item.info.cambio.valorReais, data: item.info.cambio.data, liquidacao: item.info.cambio.liquidacao || '', embarque: item.info.cambio.embarque || '', modalidade: item.info.cambio.modalidade || '' } : undefined,
        pagamento: item.info.pagamento || undefined,
        origem: 'entrada', em: new Date().toISOString(), nomeOriginal: item.nome,
        atalho: proc.id !== p.id && !item.divisao ? true : undefined, divisao: item.divisao || undefined,
        campoCusto: item.campoCusto !== undefined ? item.campoCusto : undefined, valorManual: item.valorManual ? true : undefined,
        pastaOriginal: item.pastaErrada && proc.id === item.pastaErrada.certo ? item.pastaErrada.estava.join('+') : undefined,
      });
      if (!proc.docs[item.tipo]) proc.docs[item.tipo] = upd.webViewLink;
      logAction('anexar', 'PROCESSOS', proc.id, tipoLabel(item.tipo) + ': ' + upd.name + ' (Caixa de Entrada)' + (item.pastaErrada && proc.id === item.pastaErrada.certo ? ' — corrigido: estava na pasta ' + item.pastaErrada.estava.join('+') : ''));
    };
    registro(p);
    if (typeof cadastrarPeloDoc === 'function') { try { cadastrarPeloDoc(item); } catch (e) { console.warn('cadastro', e); } }
    if (typeof aplicarDocNoProcesso === 'function') aplicarDocNoProcesso(item, p, upd); else lancarFinanceiroDoDoc(item, p, upd);
    // Mesmo contrato de câmbio em outros processos: atalho na pasta de cada um (o arquivo existe uma vez só)
    for (const idExtra of item.processosExtras || []) {
      const px = S.processos.find(x => x.id === idExtra);
      if (!px) continue;
      let fx = px.docs && px.docs._folderId;
      if (!fx) { const r = await criarPastaProcesso(px); fx = r && r.folderId; }
      if (fx) {
        try { await driveAPI('POST', '/files', { name: upd.name, mimeType: 'application/vnd.google-apps.shortcut', parents: [fx], shortcutDetails: { targetId: upd.id } }, 'fields=id'); } catch (e) {}
      }
      registro(px);
      if ((item.info.cambio || item.divisao) && typeof aplicarDocNoProcesso === 'function') aplicarDocNoProcesso(item, px, upd);
    }
    E.itens.splice(i, 1);
    reidentificarPendentes();
    if (!silencioso) { await saveToSheets(); showToast('✅ ' + tipoLabel(item.tipo) + ' anexado ao ' + p.id); render(); }
    return true;
  } catch (e) {
    item.salvando = false; item.erro = e.message || String(e);
    if (!silencioso) render();
    return false;
  }
}

function reidentificarPendentes() {
  (S.entrada.itens || []).forEach(it => {
    if (it.processo && it.confianca === 'manual') return;
    const c = identificarProcesso(it.info, it.texto, it.nome);
    it.candidatos = c;
    if (it.info && it.info.cambio) {
      const existe = id => (S.processos || []).some(p => p.id === id);
      const fats = it.info.cambio.faturas || [];
      it.processosExtras = fats.map(f => f.processo).filter(id => id !== it.processo && existe(id));
      if (it.aviso && /Fatura sem processo/.test(it.aviso)) { const falt = fats.filter(f => !existe(f.processo)).map(f => f.processo); it.aviso = falt.length ? 'Fatura sem processo no ERP: ' + falt.join(', ') + ' (o câmbio entra nele quando for criado)' : ''; }
    }
    if ((!it.processo || it.admAuto) && c[0]) {
      it.processo = c[0].id;
      if (it.admAuto) { it.admAuto = false; it.aviso = String(it.aviso || '').replace(/Não cita nenhum processo:[^.]*\.[^.]*\./, '').trim(); }
    }
    it.duplicado = procurarDuplicado(it);
  });
}

// ── Financeiro a partir dos documentos ──────────────────────
// Comprovante de pagamento → despesa paga (com o comprovante); contrato de câmbio → receita de câmbio por fatura.
// Quando o extrato OFX for importado, a conciliação liga esses lançamentos à linha do banco (sem duplicar).
function lancarFinanceiroDoDoc(item, p, upd) {
  if (item.info.cambio) return lancarCambioDoContrato(item, p, upd);
  if (item.tipo !== 'pagamento') return;
  const pag = item.info.pagamento || {};
  const valor = Number(item.info.valor) || 0;
  S.lancamentos = S.lancamentos || [];
  if (S.lancamentos.some(x => x.docs && (x.docs.comprovante === upd.webViewLink || (pag.idTransacao && x.docs.idTransacao === pag.idTransacao)))) return;
  if (!p && baixarContaPeloComprovante91(item, upd)) return;   // v91: comprovante de uma guia / boleto em aberto → a mesma linha fica paga
  if (!valor) return;
  if (!p) {   // v92: a nota já criou a linha deste pagamento (a nota com a razão social e o comprovante com o nome fantasia)
    const ln = linhaDaNotaParaComprovante92(item);
    if (ln) {
      ln.docs.comprovante = upd.webViewLink; if (pag.idTransacao) ln.docs.idTransacao = pag.idTransacao; ln.status = 'Pago';
      ln.observacao = juntaObs91(ln.observacao, 'Comprovante: ' + upd.name);
      logAction('editar', 'EXTRATO_CAIXA', ln.id, `Comprovante anexado à linha da nota: ${ln.descricao} R$ ${Number(ln.valor).toFixed(2)}`);
      return;
    }
  }
  if (!p && typeof lancamentoParecido === 'function') { const ja = lancamentoParecido(valor, item.info.data, pag.recebedor || item.info.emitNome); if (ja) { ja.docs = ja.docs || {}; ja.docs.comprovante = ja.docs.comprovante || upd.webViewLink; return; } }
  const centroAdm = !p;
  const categoria = item.categoria || (centroAdm ? 'Despesas administrativas' : 'Outros custos do processo');
  const obj = {
    id: genId(), tipo: categoria === 'Empréstimo ao sócio' ? 'Transferência' : 'Despesa', status: 'Pago',
    descricao: categoria + ' — ' + (pag.recebedor || item.info.emitNome || item.nome.replace(/\.[a-z0-9]+$/i, '')),
    valor, data: item.info.data ? isoToBr(item.info.data) : '', empresa: pag.recebedor || item.info.emitNome || '',
    categoria, vinculo: centroAdm ? 'avulso' : 'processo', vinculoId: centroAdm ? 'ADM' : p.id,
    observacao: 'Comprovante: ' + upd.name + (item.processosExtras && item.processosExtras.length ? ' · também ligado a ' + item.processosExtras.join(', ') : '') + (pag.valorIncerto ? ' · valor lido do print (confira)' : ''),
    docs: { comprovante: upd.webViewLink, idTransacao: pag.idTransacao || '', _origem: 'entrada' },
  };
  S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, `Despesa ${obj.descricao} R$ ${valor.toFixed(2)} (comprovante)`);
}

function lancarCambioDoContrato(item, p, upd) {
  const c = item.info.cambio; if (!c || !p) return;
  const f = (c.faturas || []).find(x => x.processo === p.id); if (!f || !f.usd) return;
  S.lancamentos = S.lancamentos || [];
  if (S.lancamentos.some(x => x.categoria === 'Câmbio' && x.vinculoId === p.id && x.docs && x.docs._cambio && x.docs._cambio.referencia === c.referencia)) return;
  const taxa = Number(c.taxa) || (c.valorReais && c.valorMoeda ? c.valorReais / c.valorMoeda : 0);
  const reais = Math.round(f.usd * taxa * 100) / 100;
  const obj = {
    id: genId(), tipo: 'Receita', status: 'Pago', descricao: `Câmbio contrato ${c.referencia} — ${p.id} (USD ${f.usd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
    valor: reais, data: c.data || '', empresa: 'ITAU UNIBANCO', categoria: 'Câmbio', vinculo: 'processo', vinculoId: p.id,
    observacao: 'Contrato de câmbio ' + c.referencia + (c.contratoExtrato ? ' · extrato ' + c.contratoExtrato : ''),
    docs: { comprovante: upd.webViewLink, _cambio: { contrato: c.contratoExtrato || '', referencia: c.referencia, usd: f.usd, taxa }, _origem: 'entrada' },
  };
  S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, `Câmbio ${c.referencia} → ${p.id} R$ ${reais.toFixed(2)}`);
}

// Despesa do mês (sem processo): vai para "Comprovantes AAAA-MM" e entra na lista usada pela conciliação
// arquivos da despesa do mês → pasta "Comprovantes AAAA-MM", renomeados; uma linha cada na aba DOCUMENTOS
async function guardarNoMes91(itens, mes) {
  const E = S.entrada, pasta = await getTesteFolder('Comprovantes ' + mes), upds = [];
  for (const it of itens) {
    const novoNome = `${mes}_ADM_${tipoLabel(it.tipo).replace(/[^\wÀ-ú]+/g, '-')}_${it.nome.replace(/^ADM\s*-\s*/i, '')}`;
    upds.push(await driveAPI('PATCH', '/files/' + it.fileId, { name: novoNome, description: 'Nome original: ' + it.nome }, 'addParents=' + pasta + '&removeParents=' + E.folderId + '&fields=id,name,webViewLink'));
  }
  if (typeof gravarAba2 === 'function') {
    await ensureTabs2();
    const docs = await lerAba2('DOCUMENTOS');
    itens.forEach((it, k) => docs.push({ id: upds[k].id, nome: upds[k].name, url: upds[k].webViewLink, tipo: it.tipo, categoria: it.categoria || '', valor: it.info.valor || '', data: it.info.data || '', centro: 'ADM', md5: it.md5, criadoEm: new Date().toISOString() }));
    await gravarAba2('DOCUMENTOS', docs);
    if (S.banco) S.banco.docs = docs;
  }
  upds.forEach(u => logAction('anexar', 'DOCUMENTOS', u.id, 'ADM: ' + u.name + ' (Caixa de Entrada)'));
  return upds;
}
async function confirmarAdm(i, silencioso) {
  const E = S.entrada, item = E.itens[i];
  // v91: guia / boleto e o comprovante dele vão juntos (a mesma linha do extrato)
  const par = item._par91 ? E.itens.find(x => x !== item && x.fileId === item._par91.fileId && !x.salvando) : null;
  const ehConta = it => it && (it.tipo === 'guia' || it.tipo === 'boleto');
  const conta = ehConta(item) ? item : (ehConta(par) ? par : null);
  const comp = conta ? (conta === item ? par : item) : null;
  // v92: PDF e XML da mesma nota vão juntos (botões NF-e e XML da mesma linha)
  const nota = !conta && ehNotaAdm92(item);
  const parNota = nota && item._parXml92 ? E.itens.find(x => x !== item && x.fileId === item._parXml92 && !x.salvando) : null;
  const notaPdf = nota ? (item.formato === 'xml' ? parNota : item) : null, notaXml = nota ? (item.formato === 'xml' ? item : parNota) : null;
  const juntos = [item, par, parNota].filter(Boolean);
  juntos.forEach(it => { it.salvando = true; }); if (!silencioso) render();
  try {
    const mes = ((comp && comp.info.data) || item.info.data || new Date().toISOString()).slice(0, 7);
    const ordem = conta ? [conta, comp].filter(Boolean) : nota ? [notaPdf, notaXml].filter(Boolean) : [item];
    const upds = await guardarNoMes91(ordem, mes);
    const upd = upds[ordem.indexOf(item)];
    const cadastrar = it => {   // despesa geral: quem emitiu vira cadastro de "Despesas gerais (ADM)" (se ainda não existe)
      it._adm = true;
      if (typeof cadastrarPeloDoc === 'function') { try { cadastrarPeloDoc(it); } catch (e) { console.warn('cadastro', e); } }
    };
    if (!nota) ordem.forEach(cadastrar);
    let msg = '✅ Guardado como despesa do mês ' + mes.slice(5) + '/' + mes.slice(0, 4);
    if (conta) {
      const l = lancarConta91(conta, upds[0], comp, comp ? upds[1] : null);
      msg = comp ? `✅ ${rotuloConta91(conta)} e comprovante guardados juntos: ${l ? l.descricao + ' (pago em ' + (l.data || '—') + ')' : 'despesa do mês'}`
        : (l && l.status === 'Pago' ? `✅ ${rotuloConta91(conta)} anexada ao pagamento já lançado: ${l.descricao}` : `✅ ${rotuloConta91(conta)} guardada como conta a pagar${l && l.data ? ' (vence ' + l.data + ')' : ''}`);
    }
    else if (item.pagoPor === 'socio' && typeof lancarReembolsoSocio === 'function') { if (nota) cadastrar(notaXml || notaPdf); lancarReembolsoSocio(item, null, upd); }
    else if (nota) {
      const updPdf = notaPdf ? upds[ordem.indexOf(notaPdf)] : null, updXml = notaXml ? upds[ordem.indexOf(notaXml)] : null;
      const antes = (S.lancamentos || []).length;
      const l = lancarNota92(notaPdf, updPdf, notaXml, updXml);
      cadastrar(notaXml || notaPdf);   // depois de ligar: a empresa do pagamento já tem o CNPJ da nota (não cria cadastro repetido)
      if (l && (S.lancamentos || []).length === antes) {
        msg = `✅ Nota anexada ao pagamento já lançado: ${l.descricao}` + (notaPdf && notaXml ? ' (PDF e XML)' : '');
        // aprende a categoria para as próximas notas dessa empresa (a categoria da linha do pagamento)
        try {
          const base = notaXml || notaPdf, k = typeof chaveCategAdm === 'function' ? chaveCategAdm(base) : '';
          if (k && l.categoria && S.banco && !(S.banco.regras || []).some(x => x.tipo === 'catAdm' && x.valor === k)) {
            S.banco.regras = (S.banco.regras || []).concat([{ id: genId(), tipo: 'catAdm', valor: k, categoria: l.categoria, centro: 'ADM', criadoEm: new Date().toISOString() }]);
            if (typeof gravarAba2 === 'function') { await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras); }
          }
        } catch (e) { console.warn('regra categoria', e); }
      } else if (l) msg = `✅ Nota guardada como despesa do mês: ${l.descricao}`;
    }
    else if (['nfse', 'recibo'].includes(item.tipo) && typeof lancarDespesaDaNota === 'function') lancarDespesaDaNota(item, upd);
    else lancarFinanceiroDoDoc(item, null, upd);
    E.itens = E.itens.filter(x => !ordem.includes(x));
    if (!silencioso) { await saveToSheets(); showToast(msg); render(); }   // grava já a linha do extrato (antes ficava para o próximo salvamento)
    return true;
  } catch (e) { juntos.forEach(it => { it.salvando = false; }); item.erro = e.message || String(e); if (!silencioso) render(); return false; }
}

async function confirmarTodosEntrada(incluirConfira, semPerguntar) {
  const E = S.entrada;
  const ok1 = it => it.tipo && it.processo && !it.duplicado && (it.confianca === 'alta' || (incluirConfira && it.confianca !== 'nenhuma'));
  const prontos = E.itens.filter(ok1).length;
  if (!prontos) { if (!semPerguntar) showToast('Nenhum documento pronto para anexar'); return 0; }
  if (!semPerguntar && !await uiConfirm(incluirConfira
      ? `Anexar ${prontos} documento(s) que já têm tipo e processo, incluindo os marcados "confira" (reconhecidos pelo nome do arquivo)?`
      : `Anexar ${prontos} documento(s) identificados com confiança alta aos seus processos?`, 'Confirmar documentos', 'Anexar', 'Cancelar')) return;
  showSyncIndicator('Anexando documentos...');
  let ok = 0, rodada = 0, achou = true;
  while (achou && rodada++ < 5) {
    achou = false;
    for (let i = E.itens.length - 1; i >= 0; i--) {
      const it = E.itens[i];
      if (it && ok1(it)) { if (await confirmarEntrada(i, true)) { ok++; achou = true; } }   // guia + comprovante saem juntos (a lista diminui 2)
    }
  }
  await saveToSheets();
  hideSyncIndicator();
  if (!semPerguntar) { showToast(`✅ ${ok} documento(s) anexado(s)`); render(); }
  return ok;
}

async function moverDuplicado(i) {
  const E = S.entrada, item = E.itens[i];
  if (!item) return;
  try {
    const dup = await getTesteFolder(DUPLICADOS_FOLDER);
    await driveAPI('PATCH', '/files/' + item.fileId, {}, 'addParents=' + dup + '&removeParents=' + E.folderId + '&fields=id');
    E.itens.splice(i, 1);
    showToast('Movido para Duplicados (nada foi apagado)');
  } catch (e) { item.erro = e.message; }
  render();
}

function setInfoEntrada(i, campo, valor) {
  const it = S.entrada.itens[i];
  if (!it) return;
  it.info = it.info || {};
  if (campo === 'valor') { it.info.valor = numEntrada(valor) || 0; it.valorManual = true; if (it.info.pagamento) it.info.pagamento.valor = it.info.valor; }
  else it.info[campo] = valor;
  if (campo === 'data') it._dataManual91 = true;
  try { juntarTudo92(S.entrada.itens); } catch (e) {}
  render();
}
function setEntrada(i, campo, valor) {
  const it = S.entrada.itens[i];
  if (!it) return;
  it[campo] = valor;
  if (campo === 'tipo' || campo === 'processo') { it.confianca = 'manual'; it.duplicado = procurarDuplicado(it); }
  if (campo === 'tipo' && valor === 'guia' && !(it.info && it.info.guia)) { preencherGuia91(it); if (!it.processo) it.processo = '__ADM'; }
  if (campo === 'processo' || campo === 'tipo') { try { ligarPeloLote(S.entrada.itens); } catch (e) {} }   // quem cita este documento acompanha
  try { juntarTudo92(S.entrada.itens); } catch (e) {}
  render();
}

// ── Tela ────────────────────────────────────────────────────
function renderEntrada() {
  const E = S.entrada;
  if (!E.lido && !E.carregando && !E.erro && window._sheetsToken) setTimeout(lerEntrada, 50);
  const procOpts = (S.processos || []).map(p => p.id).sort().reverse();
  const conf = c => c === 'alta' ? ['var(--green)', 'identificado'] : c === 'media' ? ['var(--yellow)', 'confira'] : c === 'manual' ? ['var(--accent)', 'ajustado'] : ['var(--red)', 'escolher'];
  const prontos = E.itens.filter(it => it.tipo && it.processo && !it.duplicado && it.confianca === 'alta').length;
  const prontosTodos = E.itens.filter(it => it.tipo && it.processo && !it.duplicado && it.confianca !== 'nenhuma').length;

  const card = (it, i) => {
    const [cor, txt] = !it.tipo ? conf('nenhuma') : !it.processo ? ['var(--yellow)', 'falta o processo'] : conf(it.confianca);
    const det = [];
    if (it.info.numero) det.push('nº ' + it.info.numero);
    if (it.info.emitNome) det.push(it.info.emitNome);
    else if (it.info.emitCnpj) det.push('CNPJ ' + it.info.emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'));
    if (it.info.valor) det.push('R$ ' + fmt(it.info.valor));
    if (it.info.data) det.push(it.info.data.split('-').reverse().join('/'));
    if (it.info.cambio) det.push('USD ' + fmt(it.info.cambio.valorMoeda) + ' × ' + String(it.info.cambio.taxa).replace('.', ',') + (it.info.cambio.contratoExtrato ? ' · extrato LIQ EXPORT ' + it.info.cambio.contratoExtrato : ''));
    if (it.info.pagamento && it.info.pagamento.identificacao) det.push('identificação "' + it.info.pagamento.identificacao + '"');
    if (it.categoria) det.push('categoria sugerida: ' + it.categoria);
    if (it.info.guia && it.info.guia.periodo) det.push('período ' + it.info.guia.periodo);
    if ((it.tipo === 'guia' || it.tipo === 'boleto') && it.info.vencimento) det.push('vence ' + it.info.vencimento);
    const motivoProc = it.candidatos && it.candidatos.find(c => c.id === it.processo);
    return `<div class="card" style="padding:14px 16px;margin-bottom:10px;border-left:3px solid ${cor}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(it.nome)}</div>
          <div style="font-size:11px;color:var(--muted2);margin-top:2px">${escHtml(it.formato.toUpperCase())}${det.length ? ' · ' + escHtml(det.join(' · ')) : ''}</div>
          ${it.info.chave ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);margin-top:3px;word-break:break-all">${escHtml(it.info.chave)}</div>` : ''}
        </div>
        <span style="font-size:10px;font-weight:700;color:${cor};border:1px solid ${cor};border-radius:20px;padding:2px 9px;white-space:nowrap">${txt}</span>
      </div>
      ${it.duplicado ? `<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:rgba(239,68,68,0.08);color:var(--red);font-size:12px">Já anexado em ${escHtml(it.duplicado.processo)} (${escHtml(it.duplicado.motivo)}: ${escHtml(it.duplicado.nome)})</div>` : ''}
      ${it.erro ? `<div style="margin-top:10px;font-size:12px;color:var(--red)">⚠️ ${escHtml(it.erro)}</div>` : ''}
      ${it.aviso ? `<div style="margin-top:10px;font-size:12px;color:var(--yellow)">⚠️ ${escHtml(it.aviso)}</div>` : ''}
      ${it.corrigido ? `<div style="margin-top:10px;font-size:12px;color:var(--green)">↪️ ${escHtml(it.corrigido)}</div>` : ''}
      ${linhaPar91(it)}
      ${linhaNota92(it)}
      ${it.processo && it.processo !== '__ADM' && !(S.processos || []).some(p => p.id === it.processo) ? `<div style="margin-top:10px;font-size:12px;color:var(--red)">⚠️ O processo ${escHtml(it.processo)} não existe no ERP. Escolha o processo correto.</div>` : ''}
      ${it.info.cambio && it.info.cambio.faturas.length ? `<div style="margin-top:10px;font-size:12px;color:var(--muted2)">Faturas pagas por este câmbio: ${it.info.cambio.faturas.map(f => `<b style="color:var(--text)">${escHtml(f.processo)}</b> USD ${fmt(f.usd)}`).join(' · ')}${it.processosExtras && it.processosExtras.length ? ' — será anexado a todos' : ''}</div>` : ''}
      <div class="g2" style="margin-top:12px">
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-tipo-${i}">Tipo de documento</label>
          <select id="ent-tipo-${i}" onchange="setEntrada(${i},'tipo',this.value)">
            <option value="">— escolher —</option>
            ${ENTRADA_TIPOS.map(([k, l]) => `<option value="${k}"${it.tipo === k ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-proc-${i}">Processo</label>
          <select id="ent-proc-${i}" onchange="setEntrada(${i},'processo',this.value)">
            <option value="">— escolher —</option>
            <option value="__ADM"${it.processo === '__ADM' ? ' selected' : ''}>Administrativo (despesa do mês)</option>
            ${procOpts.map(id => `<option value="${escHtml(id)}"${it.processo === id ? ' selected' : ''}>${escHtml(id)}</option>`).join('')}
          </select></div>
      </div>
      ${typeof DOCS_COM_CUSTO !== 'undefined' && DOCS_COM_CUSTO.includes(it.tipo) && it.processo !== '__ADM' ? `
      <div class="g3" style="margin-top:10px">
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-cus-${i}">Custo do processo</label>
          <select id="ent-cus-${i}" onchange="setEntrada(${i},'campoCusto',this.value)">${opcoesCampoCusto(it.campoCusto || '')}</select></div>
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-val-${i}">Valor (R$)${!Number(it.info.valor) ? ' <span style="color:var(--red)">· não lido</span>' : ''}</label>
          <input id="ent-val-${i}" type="text" inputmode="decimal" value="${Number(it.info.valor) ? fmt(it.info.valor) : ''}" placeholder="0,00" onchange="setInfoEntrada(${i},'valor',this.value)"/></div>
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-dat-${i}">Data do pagamento</label>
          <input id="ent-dat-${i}" type="date" value="${escHtml(it.info.data || '')}" onchange="setInfoEntrada(${i},'data',this.value)"/></div>
      </div>` : ''}
      ${(it.tipo === 'pagamento' || it.tipo === 'recibo') && it.processo && it.processo !== '__ADM' && typeof blocoDivisao === 'function' ? blocoDivisao(it, i) : ''}
      ${it.processo && ['nfse', 'nfe', 'recibo', 'faturaFrete', 'cte', 'boleto', 'pagamento', 'outros'].includes(it.tipo) ? `
      <div class="ig" style="margin-top:10px;margin-bottom:0"><label class="lbl" for="ent-pp-${i}">Pago com</label>
        <select id="ent-pp-${i}" onchange="setPagoPor(${i},this.value)"><option value="empresa"${it.pagoPor !== 'socio' ? ' selected' : ''}>Conta da empresa</option><option value="socio"${it.pagoPor === 'socio' ? ' selected' : ''}>Cartão / conta pessoal do sócio (reembolsar)</option></select></div>` : ''}
      ${it.processo === '__ADM' && typeof categOpts === 'function' ? `
      <div class="ig" style="margin-top:10px;margin-bottom:0"><label class="lbl" for="ent-cat-${i}">Categoria da despesa${it.categoria ? '' : ' <span style="color:var(--yellow)">· escolha</span>'}</label>
        <select id="ent-cat-${i}" onchange="setCategoriaAdm(${i},this.value)">${categOpts(it.categoria || '')}</select></div>` : ''}
      ${['pagamento', 'recibo', 'nfse', 'nfe', 'boleto', 'guia', 'outros'].includes(it.tipo) && it.processo === '__ADM' ? `
      <div class="g2" style="margin-top:10px">
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-val-${i}">Valor (R$)${!Number(it.info.valor) ? ' <span style="color:var(--red)">· não lido</span>' : ''}</label>
          <input id="ent-val-${i}" type="text" inputmode="decimal" value="${Number(it.info.valor) ? fmt(it.info.valor) : ''}" placeholder="0,00" onchange="setInfoEntrada(${i},'valor',this.value)"/></div>
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-dat-${i}">${it.tipo === 'boleto' || it.tipo === 'guia' ? 'Data do documento' + (it.info.vencimento ? ' · vence ' + escHtml(it.info.vencimento) : '') : 'Data do pagamento'}</label>
          <input id="ent-dat-${i}" type="date" value="${escHtml(it.info.data || '')}" onchange="setInfoEntrada(${i},'data',this.value)"/></div>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">
        <span style="font-size:10.5px;color:var(--muted)">${escHtml(it.motivo || '')}${motivoProc ? ' · processo pelo ' + escHtml(motivoProc.motivos.join(', ')) : it.processo ? '' : ' · processo não encontrado no documento'}</span>
        <span style="display:flex;gap:6px">
          <a class="btn btn-secondary btn-xs" href="${sanitizeUrl(it.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Abrir ↗</a>
          ${it.duplicado ? `<button class="btn btn-secondary btn-xs" onclick="moverDuplicado(${i})">Mover para Duplicados</button>` : ''}
          ${typeof podeCriarProcesso === 'function' && podeCriarProcesso(it) ? `<button class="btn btn-secondary btn-xs" style="border-color:var(--green);color:var(--green)" onclick="criarProcessoDoDoc(${i})">➕ Criar processo ${escHtml(podeCriarProcesso(it))}</button>` : ''}
          <button class="btn btn-secondary btn-xs" onclick="ignorarEntrada(${i})" title="Não é documento: tira da Entrada (nada é apagado)">Ignorar</button>
          <button class="btn btn-primary btn-xs" ${it.salvando ? 'disabled' : ''} onclick="confirmarEntrada(${i})">${it.salvando ? 'Anexando...' : 'Anexar ao processo'}</button>
        </span>
      </div>
    </div>`;
  };

  return `
  ${backBtn()}
  <div class="page-header">
    <div>
      <div class="page-title">Caixa de Entrada</div>
      <div style="color:var(--muted);font-size:11px;margin-top:2px">Arquivos da pasta ${escHtml(ENTRADA_FOLDER)} · o ERP reconhece o documento e o processo; você confirma</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${E.folderUrl ? `<a class="btn btn-secondary btn-sm" href="${sanitizeUrl(E.folderUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">📂 Abrir pasta</a>` : ''}
      ${ERP_ENV.nome === 'oficial' ? '' : `<button class="btn btn-primary btn-sm" onclick="importarTudo()" ${E.carregando || (E.tudo && E.tudo.rodando) ? 'disabled' : ''}>🗂️ Importar tudo de uma pasta</button>
      <button class="btn btn-secondary btn-sm" onclick="importarPastaProcesso()" ${E.carregando ? 'disabled' : ''}>📂 Importar pasta de um processo</button>`}
      <button class="btn btn-secondary btn-sm" onclick="S.entrada.lido=false;lerEntrada()" ${E.carregando ? 'disabled' : ''}>🔄 Atualizar</button>
      <button class="btn btn-primary btn-sm" onclick="confirmarTodosEntrada()" ${prontos ? '' : 'disabled'}>✅ Anexar identificados (${prontos})</button>
      ${prontosTodos > prontos ? `<button class="btn btn-secondary btn-sm" onclick="confirmarTodosEntrada(true)">Anexar todos com processo (${prontosTodos})</button>` : ''}
    </div>
  </div>
  ${!window._sheetsToken ? `<div class="card" style="text-align:center;padding:30px;color:var(--muted)">Conecte ao Google Drive (botão no topo ou "Reconectar Drive" no menu) para ler a pasta Entrada.</div>` : ''}
  ${E.carregando ? `<div class="card" style="padding:18px;color:var(--muted);font-size:13px">⏳ ${escHtml(E.progresso || 'Lendo...')}</div>` : ''}
  ${E.erro ? `<div class="card" style="padding:16px;color:var(--red);font-size:13px">⚠️ ${escHtml(E.erro)}</div>` : ''}
  ${typeof blocoImportarTudo === 'function' ? blocoImportarTudo() : ''}
  ${E.ofxNaEntrada ? `<div class="card" style="padding:12px 14px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>🏦 ${E.ofxNaEntrada} extrato(s) OFX na Entrada.</span><button class="btn btn-primary btn-xs" onclick="nav('conciliacao');setTimeout(importarOFXDrive,300)">Importar na Conciliação</button></div>` : ''}
  ${E.lido && !E.carregando && !E.itens.length ? `<div class="card" style="text-align:center;padding:36px 20px">
      <div style="font-size:40px;margin-bottom:10px">📥</div>
      <div style="font-weight:600;margin-bottom:6px">Nenhum arquivo esperando</div>
      <div style="color:var(--muted2);font-size:12px;max-width:440px;margin:0 auto">Salve notas, CT-e, DU-E, BL, invoices e comprovantes na pasta ${escHtml(ENTRADA_FOLDER)} (pelo WhatsApp ou app do banco: Compartilhar → Drive) e toque em Atualizar.</div>
    </div>` : ''}
  ${E.itens.map(card).join('')}
  ${E.itens.length ? `<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6">Ao anexar, o arquivo é movido da Entrada para a pasta do processo e renomeado no padrão do ERP; o nome original fica na descrição do arquivo. Nada é apagado.</div>` : ''}`;
}

// CONFIG: grava a chave uma vez só (antes cada abertura acrescentava uma linha nova)
saveConfig = async function (key, value) {
  try {
    await ensureTestSheet();
    const r = await sheetsAPI('GET', `/${SHEET_ID}/values/CONFIG!A1:B200`);
    const rows = (r && r.values) || [];
    const i = rows.findIndex(x => x[0] === key);
    if (i >= 0) { if (rows[i][1] !== value) await sheetsAPI('PUT', `/${SHEET_ID}/values/CONFIG!A${i + 1}:B${i + 1}?valueInputOption=RAW`, { values: [[key, value]] }); }
    else await sheetsAPI('POST', `/${SHEET_ID}/values/CONFIG!A:B:append?valueInputOption=RAW`, { values: [[key, value]] });
    // tira as linhas repetidas que já existem
    const rep = rows.map((x, j) => ({ x, j })).filter(({ x, j }) => j > 0 && x[0] && rows.findIndex(y => y[0] === x[0]) !== j);
    if (rep.length) { const unicos = rows.filter((x, j) => j === 0 || !x[0] || rows.findIndex(y => y[0] === x[0]) === j); await sheetsAPI('POST', `/${SHEET_ID}/values:batchClear`, { ranges: ['CONFIG!A2:B200'] }); await sheetsAPI('PUT', `/${SHEET_ID}/values/CONFIG!A1:B${unicos.length}?valueInputOption=RAW`, { values: unicos.map(x => [x[0] || '', x[1] || '']) }); }
  } catch (e) {}
};

function enxugarDocs(p) {
  if (!p || !p.docs) return;
  const tam = () => JSON.stringify(p.docs).length;
  if (tam() < 40000) return;
  Object.values(p.docs._files || {}).forEach(arr => (arr || []).forEach(f => {
    delete f.em; delete f.origem; delete f.formato; if (!f.chave) delete f.chave; if (!f.numero) delete f.numero; if (!f.emitente) delete f.emitente; if (!f.categoria) delete f.categoria;
    if (f.pagamento) f.pagamento = { valor: f.pagamento.valor, data: f.pagamento.data, recebedor: f.pagamento.recebedor, identificacao: f.pagamento.identificacao, idTransacao: f.pagamento.idTransacao };
    if (f.cambio && f.atalho) f.cambio = { referencia: f.cambio.referencia, contratoExtrato: f.cambio.contratoExtrato, faturas: f.cambio.faturas, usdFatura: f.cambio.usdFatura, usdTotal: f.cambio.usdTotal, reaisTotal: f.cambio.reaisTotal, taxa: f.cambio.taxa, data: f.cambio.data };
  }));
  Object.values(p.docs._custoDocs || {}).forEach(reg => ['fiscais', 'pagos'].forEach(k => (reg[k] || []).forEach(d => { if (d.nome && d.nome.length > 60) d.nome = d.nome.slice(0, 60); })));
  if (tam() > 48000 && typeof showToast === 'function') showToast('⚠️ ' + p.id + ': muitos arquivos para uma célula da planilha — avise o suporte');
}
