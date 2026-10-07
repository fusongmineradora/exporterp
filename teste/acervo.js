// ═══════════════════════════════════════════════════════════════
// ERP 2.0 · AMBIENTE DE TESTES — Recomeçar do zero a partir do acervo do Drive
// 1) apaga os dados da planilha TESTE (menos CONFIG) e arquiva a pasta TESTE antiga
// 2) cria processos e clientes a partir da Invoice / Sales Contract de cada pasta FS......
// 3) copia todos os arquivos para a Entrada, lê (PDF, XML, OCR de prints) e anexa a cada processo
//    — comprovantes viram despesas pagas; contratos de câmbio viram receitas de câmbio
// 4) importa o(s) extrato(s) OFX encontrados no acervo e concilia o que tem prova
// Os originais do link NUNCA são alterados (só leitura + cópia). Produção não é tocada.
// ═══════════════════════════════════════════════════════════════

// ── Leitura de Invoice / Sales Contract da Fu Song ──────────
const ROTULOS_INV = [
  ['cliente', /(?:THE\s+)?(?:BUYER|CONSIGNEE|NOTIFY)\s*:/gi],
  ['end', /\bADD\s*[：:]/g],                       // "ADD:" (maiúsculo) do comprador; "Add.:" é do vendedor
  ['usci', /\(?\bUSCI\b\)?\s*[：:]/gi],
  ['tel', /\bTEL\s*[：:]/gi],
  ['email', /\bE-?MAIL\s*[：:]/gi],
  ['ncm', /HS\s*CODE\s*\/\s*NCM\.?\s*:/gi],
  ['produto', /\bCOMMODITY\s*:/gi],
  ['pol', /\bPOL\s*:/g],
  ['pod', /\bPOD\s*:/g],
  ['origem', /\bORIGIN\s*:/gi],
  ['destino', /\bDESTINATION\s*:/gi],
  ['moeda', /\bCURRENCY\s*:/gi],
  ['incoterm', /\bINCOTERM\s*:/gi],
  ['pagamento', /\bPAYMENT\s+TERMS?\s*:/gi],
  ['peso', /\bWEIGHT\s*:/gi],
  ['_report', /\bREPORT\s*:/gi],
  ['_issued', /\bISSUED\s*:/gi],
  ['_shipper', /\bSHIPPER\s*:/gi],
  ['_seller', /THE\s+SELLER/gi],
  ['_addv', /\bAdd\.\s*:/g],
  ['_n1', /\bN[°ºo]\s*1\b/g],
  ['_inv', /INVOICE\s+N[°ºo]/gi],
  ['_ct', /SALES\s+CONTRACT\s+N[°ºo]/gi],
  ['_desc', /DESCRIPTION\s+OF\s+GOODS/gi],
  ['_vat', /\bVAT\.?\s*:/gi],
  ['_banco', /INTERMEDIATE\s+BANK/gi],
  ['_cnpj', /44\.962\.707\/0001-54/g],
];

function lerRotulos(texto, defs) {
  const T = String(texto || '').replace(/\s+/g, ' ');
  const marcas = [];
  defs.forEach(([k, re]) => { re.lastIndex = 0; let m; while ((m = re.exec(T))) marcas.push({ k, ini: m.index, fim: m.index + m[0].length }); });
  marcas.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const out = {};
  marcas.forEach((m, i) => {
    if (m.k[0] === '_' || out[m.k]) return;
    const prox = marcas.slice(i + 1).find(x => x.ini >= m.fim);
    const v = T.slice(m.fim, prox ? prox.ini : m.fim + 200).trim().replace(/^[：:\s]+|[,;\s]+$/g, '');
    if (v) out[m.k] = v;
  });
  return { T, v: out };
}

const MESES_EN = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function lerDocVenda(texto) {
  const { T, v } = lerRotulos(texto, ROTULOS_INV);
  const num = (T.match(/(?:INVOICE|SALES\s+CONTRACT)\s+N[°ºo]\s*(FS\s?\d{6}S?)/i) || [])[1];
  if (!num && !v.cliente && !v.produto) return null;
  let kg;
  const tot = T.match(/TOTAL\s+(?:CFR|CRF|FOB|CIF|EXW|DAP|DDP)\s*:?\s*([\d.]+,\d{2})/i);
  const usdTodos = [...T.matchAll(/([\d.]+,\d{2})\s*USD/gi)].map(m => numBR(m[1]));
  const dt = T.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/i);
  const cont = T.match(/TOTAL\s+OF\s+CONTAINERS?\s*:?\s*0*(\d+)\s*CONTAINERS?\s*(\d{2})?/i);
  // linha da tabela de mercadorias (serve quando só há o contrato)
  const linha = T.match(/TOTAL\s+PRICE\s+USD\s+(.+?)\s+(\d{8})\s+([\d.,]+)\s+[\d.,]+\s*USD/i);
  if (linha) { if (!v.produto) v.produto = linha[1].trim(); if (!v.ncm) v.ncm = linha[2]; if (!v.peso) v.peso = linha[3] + ' KG'; }
  const chega = T.match(/ARRIVES\s+PORT\s*:\s*([^)\d]+?)(?:\s+\d\)|$)/i);
  if (chega && !v.pod) v.pod = chega[1].trim().replace(/,\s*CHINA$/i, ', China').replace(/^(\w)(\w*)/, (m, a, b) => a + b.toLowerCase());
  return {
    numero: num ? num.replace(/\s/g, '').toUpperCase() : '',
    contrato: /SALES\s+CONTRACT/i.test(T),
    cliente: (v.cliente || '').replace(/\(?USCI\)?.*$/i, '').trim(),
    usci: ((v.usci || T.match(/USCI\)?\s*[：:]\s*([0-9A-Z]{18})/i)?.[1] || '').match(/[0-9A-Z]{18}/) || [''])[0],
    tel: (v.tel || '').replace(/\s+/g, ' ').trim(),
    email: ((v.email || '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0],
    end: v.end || '',
    ncm: String(v.ncm || '').replace(/\D/g, '').slice(0, 8),
    produto: v.produto || '',
    pol: v.pol || '', pod: v.pod || '', origem: v.origem || '', destino: v.destino || '',
    moeda: (String(v.moeda || '').match(/\b[A-Z]{3}\b/) || ['USD'])[0],
    incoterm: (String(v.incoterm || '').match(/\b[A-Z]{3}\b/) || [''])[0],
    pagamento: v.pagamento || '',
    peso: (kg = String(v.peso || '').match(/[\d.,]+/)) ? String(Math.round(numBR(kg[0].includes(',') ? kg[0] : kg[0].replace(/\./g, '') + ',00'))) : '',
    totalUsd: tot ? numBR(tot[1]) : (usdTodos.length ? Math.max(...usdTodos) : 0),
    emitida: dt ? `${dt[2].padStart(2, '0')}/${MESES_EN[dt[1].slice(0, 3).toLowerCase()]}/${dt[3]}` : '',
    qtdContainer: cont ? String(parseInt(cont[1], 10)) : '',
    tamanhoContainer: cont && cont[2] ? cont[2] : '',
  };
}

// ── OCR pelo Google Drive (prints, fotos e PDFs escaneados) ──
async function ocrDrive(fileId, nome) {
  const pasta = await getTesteFolder('🧪 OCR temporário');
  const cp = await driveAPI('POST', '/files/' + fileId + '/copy',
    { name: 'ocr - ' + (nome || fileId), mimeType: 'application/vnd.google-apps.document', parents: [pasta] }, 'ocrLanguage=pt&fields=id');
  try {
    const token = await getAccessToken();
    const r = await fetch(DRIVE_API + '/files/' + cp.id + '/export?mimeType=text/plain', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('OCR ' + r.status);
    return await r.text();
  } finally {
    // apaga só a cópia temporária que acabamos de criar
    try { await fetch(DRIVE_API + '/files/' + cp.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + (await getAccessToken()) } }); } catch (e) {}
  }
}

// ── Estado do assistente ────────────────────────────────────
const RECOMECO = { rodando: false, etapas: [], resumo: null, erro: '' };
function etapa(txt, ok) {
  const last = RECOMECO.etapas[RECOMECO.etapas.length - 1];
  const t = new Date().toLocaleTimeString('pt-BR');
  if (last && last.ok === null) { last.txt = txt; last.t = t; if (ok !== undefined) last.ok = ok; }   // linha em andamento é atualizada
  else RECOMECO.etapas.push({ txt, ok: ok === undefined ? null : ok, t });
  if (S.entrada) S.entrada.progresso = txt;
  render();
}

function normNome(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function zerarDadosTeste() {
  if (!SHEET_ID || SHEET_ID === PROD_SHEET_ID) throw new Error('Planilha de teste não definida — operação bloqueada.');
  S.processos = []; S.clientes = []; S.fornecedores = []; S.lancamentos = []; S.custosMensais = [];
  await saveToSheets();
  try { await sheetsAPI('POST', `/${SHEET_ID}/values:batchClear`, { ranges: ['LOG!A2:ZZ100000'] }); } catch (e) {}
  if (typeof ensureTabs2 === 'function') {
    await ensureTabs2();
    for (const t of Object.keys(TABS2)) await gravarAba2(t, []);
    Object.assign(S.banco, { linhas: [], regras: [], docs: [], carregado: true, msg: null, filtro: 'pendente' });
  }
  // pasta TESTE antiga: renomeada (arquivada), nada é apagado
  try {
    const antiga = await getRootFolderId();
    const carimbo = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
    await driveAPI('PATCH', '/files/' + antiga, { name: ROOT_FOLDER_NAME + ' (arquivo ' + carimbo + ')' }, 'fields=id');
  } catch (e) { console.warn('arquivar pasta teste', e.message); }
  window._rootFolderId = null; window._testeFolders = {};
  try { await saveConfig('drive_root_folder_id', ''); } catch (e) {}
  Object.assign(S.entrada, { itens: [], lido: false, folderId: '', folderUrl: '', ofxNaEntrada: 0 });
}

async function lerPastasDoAcervo(raiz) {
  // processos = pastas cujo nome começa com FS + 6 dígitos (em qualquer nível)
  const fila = [raiz], pastas = [], ofx = [];
  while (fila.length) {
    const id = fila.shift();
    const filhos = await driveListAll(`'${id}' in parents and trashed=false`, 'id,name,mimeType,size,md5Checksum,createdTime');
    for (const f of filhos) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const m = f.name.trim().toUpperCase().match(/^(FS\s?\d{6})S?\b/);
        if (m) pastas.push({ id: f.id, nome: f.name.trim(), proc: m[1].replace(/\s/g, '') });
        if (!/^ERP$/i.test(f.name.trim())) fila.push(f.id);
      } else if (/\.ofx$/i.test(f.name) || f.mimeType === 'application/x-ofx') ofx.push(f);
    }
  }
  return { pastas, ofx };
}

async function docsVendaDaPasta(pasta) {
  const arqs = [];
  const fila = [pasta.id];
  while (fila.length) {
    const id = fila.shift();
    for (const f of await driveListAll(`'${id}' in parents and trashed=false`, 'id,name,mimeType,size')) {
      if (f.mimeType === 'application/vnd.google-apps.folder') fila.push(f.id);
      else if (/pdf/i.test(f.mimeType) || /\.pdf$/i.test(f.name)) arqs.push(f);
    }
  }
  const ehInv = f => /INVOICE/i.test(f.name) && !/DESPACHANTE|NFE?S|NOTA/i.test(f.name);
  const ehCt = f => /SALES\s*CONTRACT|CONTRATO\s+DE\s+VENDA/i.test(f.name);
  const ler = async f => { try { const t = await pdfTexto(await driveDownload(f.id)); return lerDocVenda(t); } catch (e) { return null; } };
  const invs = arqs.filter(ehInv), cts = arqs.filter(ehCt);
  // prefere o arquivo cujo nome tem o número do processo
  const pref = l => l.sort((a, b) => (b.name.toUpperCase().includes(pasta.proc) ? 1 : 0) - (a.name.toUpperCase().includes(pasta.proc) ? 1 : 0));
  const inv = invs.length ? await ler(pref(invs)[0]) : null;
  const ct = cts.length ? await ler(pref(cts)[0]) : null;
  return { inv, ct };
}

function montarProcesso(pasta, inv, ct) {
  const d = Object.assign({}, ct || {}, Object.fromEntries(Object.entries(inv || {}).filter(([, x]) => x !== '' && x !== 0 && x != null)));
  const n = parseInt(pasta.proc.slice(2), 10);
  const avisos = [];
  if (!inv) avisos.push('sem invoice');
  if (!ct) avisos.push('sem contrato');
  if (inv && inv.numero && inv.numero.replace(/S$/, '') !== pasta.proc) avisos.push(`invoice diz ${inv.numero}`);
  if (inv && ct && inv.totalUsd && ct.totalUsd && Math.abs(inv.totalUsd - ct.totalUsd) > 0.01) avisos.push(`invoice USD ${inv.totalUsd} ≠ contrato USD ${ct.totalUsd}`);
  const qtd = (ct && ct.qtdContainer) || '1';
  const p = {
    id: pasta.proc, embarque: String(9 + (n - 260096)).padStart(2, '0'), status: 'A Coletar',
    cliente: d.cliente || pasta.nome.replace(/^FS\s?\d{6}S?\s*-?\s*/i, '').trim(),
    usci: d.usci || '', clienteTel: d.tel || '', clienteEmail: d.email || '', clienteAdd: d.end || '',
    produto: d.produto || '', ncm: d.ncm || '', moeda: d.moeda || 'USD',
    pol: d.pol || '', pod: d.pod || '', origem: d.origem || '', destino: d.destino || '',
    incoterm: d.incoterm || '', pagamento: d.pagamento || '', peso: d.peso || '',
    qtdContainer: qtd, containers: Array.from({ length: parseInt(qtd, 10) || 1 }, () => ''), container: '',
    cambioInvoice: d.totalUsd || 0, cambioBanco: 'Itaú', cambioStatus: 'Em Aberto',
    invoiceNum: 'Invoice - ' + pasta.proc, contratoNum: 'Contrato - ' + pasta.proc,
    docs: { _acervo: { pasta: pasta.nome, pastaId: pasta.id, emitida: d.emitida || '', avisos } },
  };
  return p;
}

function garantirCliente(p) {
  if (!p.cliente) return;
  S.clientes = S.clientes || [];
  let c = S.clientes.find(x => (p.usci && x.usci === p.usci) || normNome(x.nome) === normNome(p.cliente));
  if (!c) {
    c = { id: genId(), nome: p.cliente, usci: p.usci, tel: p.clienteTel, email: p.clienteEmail, end: p.clienteAdd };
    S.clientes.push(c);
    logAction('criar', 'CLIENTES', c.id, c.nome + ' (acervo)');
  } else {
    ['usci', 'tel', 'email', 'end'].forEach(k => { const v = { usci: p.usci, tel: p.clienteTel, email: p.clienteEmail, end: p.clienteAdd }[k]; if (!c[k] && v) c[k] = v; });
  }
}

function atualizarStatusPelosDocs() {
  (S.processos || []).forEach(p => {
    const f = (p.docs && p.docs._files) || {};
    if ((f.bl || []).length) p.status = 'Embarcado';
    else if ((f.due || []).length || (f.nfeSaida || []).length) p.status = p.status === 'A Coletar' ? 'No Porto' : p.status;
  });
}

async function recomecarDoAcervo() {
  if (RECOMECO.rodando) return;
  let salvo = '';
  try { salvo = localStorage.getItem('teste:acervo-url') || ''; } catch (e) {}
  const link = await uiPrompt('Link da pasta do Drive com o acervo (pastas FS……, comprovantes do mês, extrato OFX). Os originais NÃO são alterados.', salvo || 'https://drive.google.com/drive/folders/', 'Recomeçar do zero pelo acervo');
  if (!link) return;
  const m = String(link).match(/folders\/([A-Za-z0-9_-]{10,})/) || String(link).match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) { await uiAlert('Link de pasta inválido.'); return; }
  const conf = await uiPrompt('Isto APAGA todos os dados do ambiente de TESTE (processos, clientes, lançamentos, extrato, regras) e começa de novo a partir do acervo. A produção não é tocada.\n\nDigite APAGAR para confirmar:', '', 'Confirmar recomeço');
  if (String(conf || '').trim().toUpperCase() !== 'APAGAR') { showToast('Cancelado'); return; }
  try { localStorage.setItem('teste:acervo-url', link); } catch (e) {}
  Object.assign(RECOMECO, { rodando: true, etapas: [], resumo: null, erro: '' });
  S.page = 'entrada'; render();
  const resumo = { processos: 0, clientes: 0, avisos: [], anexados: 0, pendentes: 0, despesas: 0, cambios: 0 };
  try {
    await getAccessToken(); await ensureTestSheet();
    etapa('Apagando dados do ambiente de teste...');
    await zerarDadosTeste();
    etapa('Apagando dados do ambiente de teste...', true);

    etapa('Lendo as pastas do acervo...');
    const { pastas, ofx } = await lerPastasDoAcervo(m[1]);
    const unicas = []; const vistos = new Set();
    pastas.sort((a, b) => a.proc.localeCompare(b.proc)).forEach(p => { if (!vistos.has(p.proc)) { vistos.add(p.proc); unicas.push(p); } else resumo.avisos.push(`${p.proc}: pasta repetida "${p.nome}" (arquivos entram no mesmo processo)`); });
    etapa(`Lendo as pastas do acervo... ${unicas.length} processo(s), ${ofx.length} extrato(s) OFX`, true);

    for (let i = 0; i < unicas.length; i++) {
      const pasta = unicas[i];
      etapa(`Criando processo ${pasta.proc} (${i + 1}/${unicas.length}) pela invoice e contrato...`);
      const { inv, ct } = await docsVendaDaPasta(pasta);
      const p = montarProcesso(pasta, inv, ct);
      S.processos.push(p);
      garantirCliente(p);
      logAction('criar', 'PROCESSOS', p.id, (p.cliente || '') + ' · ' + (p.produto || '') + ' (acervo)');
      if (p.docs._acervo.avisos.length) resumo.avisos.push(`${p.id}: ${p.docs._acervo.avisos.join(', ')}`);
      resumo.processos++;
    }
    resumo.clientes = S.clientes.length;
    await saveToSheets();
    for (const p of S.processos) { etapa(`Criando pasta do ${p.id} no Drive de teste...`); await criarPastaProcesso(p); }
    await saveToSheets();
    etapa(`${resumo.processos} processo(s) e ${resumo.clientes} cliente(s) criados`, true);

    etapa('Copiando todos os arquivos do acervo para a Entrada e lendo cada um (PDF, XML e prints)...');
    await importarAcervo(link);
    etapa('Arquivos copiados e lidos', true);

    etapa('Anexando cada arquivo ao seu processo / comprovantes do mês...');
    resumo.anexados = await confirmarTodosEntrada(true, true) || 0;
    atualizarStatusPelosDocs();
    await saveToSheets();
    resumo.pendentes = (S.entrada.itens || []).length;
    resumo.despesas = (S.lancamentos || []).filter(x => x.tipo === 'Despesa').length;
    resumo.cambios = (S.lancamentos || []).filter(x => x.categoria === 'Câmbio').length;
    etapa(`${resumo.anexados} arquivo(s) anexados · ${resumo.despesas} despesa(s) e ${resumo.cambios} câmbio(s) lançados`, true);

    if (ofx.length && typeof importarOFXBytes === 'function') {
      for (const f of ofx.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)))) {
        etapa(`Importando extrato ${f.name}...`);
        const ok = await importarOFXBytes(new Uint8Array(await driveDownload(f.id)), f.name);
        etapa(`Extrato ${f.name}: ${S.banco.msg ? S.banco.msg.texto : ''}`, ok);
        if (!ok) resumo.avisos.push(`OFX ${f.name}: ${S.banco.msg ? S.banco.msg.texto : 'não importado'}`);
      }
      etapa('Conciliando extrato com câmbios e comprovantes...');
      const r = await autoConciliar();
      Object.assign(resumo, { concCambio: r.cambio, concBaixas: r.baixas, concRend: r.rendimentos, extratoPendente: r.pendentes });
      etapa(`Conciliação: ${r.cambio} câmbio(s), ${r.baixas} pagamento(s) ligados a comprovantes, ${r.regras} tarifa(s)/regra(s), ${r.rendimentos} mês(es) de rendimento · ${r.pendentes} linha(s) para você decidir`, true);
    }
    RECOMECO.resumo = resumo;
    logAction('importar', 'PROCESSOS', 'acervo', `Recomeço: ${resumo.processos} processos, ${resumo.anexados} arquivos`);
    showToast('✅ Ambiente de teste montado a partir do acervo');
  } catch (e) {
    RECOMECO.erro = e.message || String(e);
    etapa('Parou: ' + RECOMECO.erro, false);
  }
  RECOMECO.rodando = false;
  if (S.entrada) { S.entrada.progresso = ''; S.entrada.carregando = false; }
  render();
}

function painelRecomeco() {
  if (!RECOMECO.etapas.length) return '';
  const r = RECOMECO.resumo;
  return `<div class="card" style="padding:14px 16px;font-size:12.5px">
    <div style="font-weight:700;margin-bottom:8px">${RECOMECO.rodando ? '⏳ Montando o ambiente de teste a partir do acervo — não feche a página' : RECOMECO.erro ? '⚠️ Recomeço interrompido' : '✅ Recomeço concluído'}</div>
    ${RECOMECO.etapas.map(e => `<div style="padding:3px 0;color:${e.ok === false ? 'var(--red)' : e.ok ? 'var(--text)' : 'var(--muted)'}">${e.ok === null ? '•' : e.ok ? '✓' : '✗'} <span style="color:var(--muted)">${e.t}</span> ${escHtml(e.txt)}</div>`).join('')}
    ${r ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-xs" onclick="nav('processos')">📦 Ver processos</button>
      <button class="btn btn-secondary btn-xs" onclick="nav('conciliacao')">🏦 Conciliação</button>
      <button class="btn btn-secondary btn-xs" onclick="nav('resultados')">📊 Clientes & Resultado</button></div>
      ${r.avisos.length ? `<div style="margin-top:10px;color:var(--yellow)"><b>Confira:</b><br>${r.avisos.map(escHtml).join('<br>')}</div>` : ''}
      ${r.pendentes ? `<div style="margin-top:8px;color:var(--muted)">${r.pendentes} arquivo(s) ficaram na lista abaixo para você escolher tipo/processo.</div>` : ''}` : ''}
  </div>`;
}
