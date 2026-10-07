/* ═══════════════════════════════════════════════════════════
 * Fu Song ERP 2.0 (ambiente de testes) — Financeiro
 * ───────────────────────────────────────────────────────────
 *  • Conciliação bancária: importa o OFX do Itaú (ofx.js), confere
 *    pelos saldos diários, guarda cada linha do banco na aba
 *    EXTRATO_BANCO e liga cada uma a um lançamento.
 *  • Clientes & Resultado: saldo de cada cliente (câmbio recebido x
 *    invoices embarcadas) e resultado de cada processo.
 * Usa somente a planilha de testes (sheetsAPI já bloqueia a produção).
 * ═══════════════════════════════════════════════════════════ */

// ── Abas próprias da versão 2.0 ─────────────────────────────
const TABS2 = {
  EXTRATO_BANCO: ['chave', 'conta', 'data', 'valor', 'memo', 'favorecido', 'documento', 'contrato', 'fitid', 'lote', 'importadoEm', 'status', 'lancId', 'categoria', 'centro', 'obs'],
  REGRAS: ['id', 'tipo', 'valor', 'categoria', 'centro', 'criadoEm', 'criadoPor'],
  DOCUMENTOS: ['id', 'nome', 'url', 'tipo', 'categoria', 'valor', 'data', 'centro', 'md5', 'criadoEm'],
};
S.banco = S.banco || { linhas: [], regras: [], carregado: false, carregando: false, filtro: 'pendente', limite: 40, msg: null, erro: '' };

let _tabsInfo = null;
async function ensureTabs2() {
  await ensureTestSheet();
  if (!_tabsInfo) {
    const info = await sheetsAPI('GET', `/${SHEET_ID}?fields=sheets.properties.title`);
    _tabsInfo = new Set(info.sheets.map(s => s.properties.title));
  }
  const faltam = Object.keys(TABS2).filter(t => !_tabsInfo.has(t));
  if (faltam.length) {
    await sheetsAPI('POST', `/${SHEET_ID}:batchUpdate`, { requests: faltam.map(t => ({ addSheet: { properties: { title: t } } })) });
    await sheetsAPI('POST', `/${SHEET_ID}/values:batchUpdate`, {
      valueInputOption: 'RAW', data: faltam.map(t => ({ range: `${t}!A1`, values: [TABS2[t]] })),
    });
    faltam.forEach(t => _tabsInfo.add(t));
  }
}

async function lerAba2(nome) {
  const r = await sheetsAPI('GET', `/${SHEET_ID}/values/${encodeURIComponent(nome)}`);
  const v = r.values || [];
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1).map(row => { const o = {}; h.forEach((k, i) => { o[k] = row[i] === undefined ? '' : row[i]; }); return o; });
}

async function gravarAba2(nome, objs) {
  const h = TABS2[nome];
  await sheetsAPI('POST', `/${SHEET_ID}/values:batchClear`, { ranges: [`${nome}!A2:Z`] });
  if (!objs.length) return;
  await sheetsAPI('POST', `/${SHEET_ID}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [{ range: `${nome}!A2`, values: objs.map(o => h.map(k => o[k] === undefined || o[k] === null ? '' : String(o[k]))) }],
  });
}

async function carregarBanco(force) {
  const B = S.banco;
  if (B.carregando || (B.carregado && !force)) return;
  B.carregando = true; B.erro = ''; render();
  try {
    await ensureTabs2();
    const [linhas, regras, docs] = await Promise.all([lerAba2('EXTRATO_BANCO'), lerAba2('REGRAS'), lerAba2('DOCUMENTOS')]);
    linhas.forEach(l => { l.valor = Number(l.valor) || 0; });
    B.linhas = linhas; B.regras = regras; B.docs = docs; B.carregado = true;
  } catch (e) { B.erro = e.message || String(e); }
  B.carregando = false; render();
}

async function salvarBanco() {
  await gravarAba2('EXTRATO_BANCO', S.banco.linhas);
}

// Regras no formato do leitor OFX
function regrasOFX() {
  return (S.banco.regras || []).map(r => r.tipo === 'doc'
    ? { doc: r.valor, categoria: r.categoria, centro: r.centro }
    : { texto: r.valor, categoria: r.categoria, centro: r.centro });
}

// ── Categorias e centros de custo ───────────────────────────
const CATEGORIAS2 = [
  ...Object.values(PROCESS_COST_FIELDS),
  'Tarifa de câmbio', 'Assessoria', 'Imposto COOP', 'Laboratório',
  'Tarifas bancárias', 'IOF', 'Impostos federais', 'Taxas e impostos municipais', 'Taxas de órgãos',
  'Contabilidade', 'Aluguel / Coworking', 'Combustível', 'Cartório', 'Seguros', 'Software', 'Outras despesas',
  'Rendimentos financeiros', 'Outras receitas', 'Câmbio',
  'Retirada de sócio', 'Aporte de sócio', 'Transferência entre contas',
];
const CATEG_TRANSFER = ['Retirada de sócio', 'Aporte de sócio', 'Transferência entre contas'];

function projetos2() {
  const set = new Set(['Quartzo Oliveira dos Brejinhos', 'Espodumênio']);
  (S.lancamentos || []).forEach(l => { if (l.vinculo === 'projeto' && l.vinculoId) set.add(l.vinculoId); });
  return [...set];
}
// centro: 'ADM' | 'P:<processo>' | 'J:<projeto>'
function centroOpts(sel) {
  const procs = (S.processos || []).map(p => p.id).sort().reverse();
  return `<option value="">— centro de custo —</option>
    <option value="ADM"${sel === 'ADM' ? ' selected' : ''}>Administrativo (gasto do mês)</option>
    <optgroup label="Processos">${procs.map(id => `<option value="P:${escHtml(id)}"${sel === 'P:' + id ? ' selected' : ''}>${escHtml(id)}</option>`).join('')}</optgroup>
    <optgroup label="Projetos">${projetos2().map(n => `<option value="J:${escHtml(n)}"${sel === 'J:' + n ? ' selected' : ''}>${escHtml(n)}</option>`).join('')}<option value="__novo">+ Novo projeto…</option></optgroup>`;
}
function categOpts(sel) {
  return `<option value="">— categoria —</option>` + CATEGORIAS2.map(c => `<option${c === sel ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}

const isoToBr = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
const brToIso2 = d => { const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const diasEntre = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

// ── Importação do OFX ───────────────────────────────────────
function ehOFX(bytes) {
  const ini = new TextDecoder('latin1').decode(bytes.slice(0, 4000)).toUpperCase();
  return ini.includes('<OFX') || ini.includes('OFXHEADER');
}

// Arquivo escolhido no aparelho (computador ou celular)
async function importarOFX(file) {
  const B = S.banco;
  if (!file) return;
  B.msg = { tipo: 'ok', texto: 'Lendo ' + file.name + '...' }; render();
  let buf;
  try { buf = await file.arrayBuffer(); }
  catch (e) { B.msg = { tipo: 'erro', texto: 'Não foi possível abrir o arquivo no aparelho: ' + (e.message || e) + '. Tente pela pasta 📥 Entrada do Drive.' }; render(); return; }
  await importarOFXBytes(new Uint8Array(buf), file.name);
  render();
}

// OFX salvo na pasta 📥 Entrada do Drive (prático no celular: Compartilhar → Drive)
async function importarOFXDrive() {
  const B = S.banco;
  try {
    await getAccessToken(); await ensureTestSheet();
    const ent = await getTesteFolder(ENTRADA_FOLDER);
    const q = `'${ent}' in parents and trashed=false and (name contains '.ofx' or name contains '.OFX' or mimeType='application/x-ofx')`;
    const r = await driveAPI('GET', '/files', null, 'q=' + encodeURIComponent(q) + '&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=50');
    const files = r.files || [];
    if (!files.length) { B.msg = { tipo: 'erro', texto: 'Nenhum arquivo OFX na pasta 📥 Entrada. Baixe o extrato no app do Itaú e salve (Compartilhar → Drive) na pasta "Fu Song ERP — TESTE / 📥 Entrada".' }; render(); return; }
    const pastaExtratos = await getTesteFolder('🏦 Extratos');
    const msgs = []; let erro = false;
    for (const f of files) {
      B.msg = { tipo: 'ok', texto: 'Lendo ' + f.name + '...' }; render();
      const bytes = new Uint8Array(await driveDownload(f.id));
      const ok = await importarOFXBytes(bytes, f.name);
      msgs.push(f.name + ': ' + B.msg.texto);
      if (ok) await driveAPI('PATCH', '/files/' + f.id, {}, 'addParents=' + pastaExtratos + '&removeParents=' + ent + '&fields=id');
      else erro = true;
    }
    B.msg = { tipo: erro ? 'erro' : 'ok', texto: msgs.join(' | '), lote: files.length === 1 && !erro ? B.msg.lote : undefined };
  } catch (e) {
    B.msg = { tipo: 'erro', texto: 'Não foi possível importar do Drive: ' + (e.message || e) };
  }
  render();
}

async function importarOFXBytes(bytes, nome) {
  const B = S.banco;
  if (!window.FusongOFX) { B.msg = { tipo: 'erro', texto: 'Leitor de OFX não carregado. Recarregue a página.' }; return false; }
  if (!ehOFX(bytes)) { B.msg = { tipo: 'erro', texto: `"${nome}" não é um extrato OFX. No app do Itaú escolha Extrato → Exportar → formato OFX (Money/Quicken).` }; return false; }
  try {
    await carregarBanco();
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const r = FusongOFX.parse(bytes, { regras: regrasOFX(), hoje });
    if (!r.movimentos.length) { B.msg = { tipo: 'erro', texto: `"${nome}" não tem movimentos.` }; return false; }
    if (!r.validacao.ok) {
      B.msg = { tipo: 'erro', texto: `Importação bloqueada: o saldo do banco não confere em ${r.validacao.divergencias.length} dia(s) (${r.validacao.divergencias.map(d => isoToBr(d.dia) + ': diferença R$ ' + fmt(d.diferenca)).join('; ')}). Baixe o extrato de novo.` };
      return false;
    }
    const existentes = new Set(B.linhas.map(l => l.chave));
    const novos = r.movimentos.filter(t => !existentes.has(t.chave) && t.data < hoje);
    const ignoradosHoje = r.movimentos.filter(t => !existentes.has(t.chave) && t.data >= hoje).length;
    const lote = 'L' + new Date().toISOString().replace(/\D/g, '').slice(0, 12);
    const conta = `${r.conta.banco}-${r.conta.conta}`;
    novos.forEach(t => B.linhas.push({
      chave: t.chave, conta, data: t.data, valor: t.valor, memo: t.memo, favorecido: t.favorecido,
      documento: t.documento, contrato: t.contrato, fitid: t.fitid, lote, importadoEm: new Date().toISOString(),
      status: 'pendente', lancId: '', categoria: t.classificacao.categoria || '', centro: t.classificacao.centro || '', obs: '',
    }));
    B.linhas.sort((a, b) => a.data.localeCompare(b.data));
    await salvarBanco();
    logAction('importar', 'EXTRATO_BANCO', lote, `${novos.length} movimentos novos (${conta})`);
    B.ultimoSaldo = r.checkpoints.length ? r.checkpoints[r.checkpoints.length - 1] : null;
    B.msg = { tipo: 'ok', texto: `Extrato íntegro: ${r.validacao.verificados} saldos diários conferidos. ${novos.length} movimento(s) novo(s) importado(s); ${r.movimentos.length - novos.length - ignoradosHoje} já estavam no sistema${ignoradosHoje ? `; ${ignoradosHoje} de hoje ficam para a próxima importação` : ''}.`, lote };
    B.filtro = 'pendente';
    return true;
  } catch (e) {
    B.msg = { tipo: 'erro', texto: 'Não foi possível importar: ' + (e.message || e) };
    return false;
  }
}

async function desfazerLote(lote) {
  const B = S.banco;
  const doLote = B.linhas.filter(l => l.lote === lote);
  if (doLote.some(l => l.status !== 'pendente')) { await uiAlert('Este lote já tem movimentos conciliados. Desfaça as conciliações antes.'); return; }
  if (!await uiConfirm(`Remover os ${doLote.length} movimentos importados no lote ${lote}?`, 'Desfazer importação', 'Desfazer', 'Cancelar')) return;
  B.linhas = B.linhas.filter(l => l.lote !== lote);
  await salvarBanco();
  B.msg = { tipo: 'ok', texto: 'Importação desfeita.' };
  render();
}

// ── Sugestões de conciliação ────────────────────────────────
// Contratos de câmbio anexados aos processos (Caixa de Entrada)
function contratosCambio() {
  const m = {};
  (S.processos || []).forEach(p => {
    (((p.docs || {})._files || {}).comprovantes || []).forEach(f => {
      if (f.cambio && f.cambio.contratoExtrato) {
        const k = f.cambio.contratoExtrato;
        m[k] = m[k] || { contrato: k, referencia: f.cambio.referencia, taxa: f.cambio.taxa, usdTotal: f.cambio.usdTotal, reaisTotal: f.cambio.reaisTotal, data: f.cambio.data, url: f.url, faturas: [] };
        if (!m[k].faturas.some(x => x.processo === p.id)) m[k].faturas.push({ processo: p.id, usd: Number(f.cambio.usdFatura) || 0 });
      }
    });
  });
  return m;
}

// Comprovantes anexados (com valor) que ainda não foram ligados ao banco
function comprovantesUsados() {
  const u = new Set();
  (S.lancamentos || []).forEach(x => { const c = x.docs && x.docs.comprovante; if (c) u.add(c); });
  (S.processos || []).forEach(p => Object.values((p.docs && p.docs._costComp) || {}).forEach(c => c && u.add(c)));
  return u;
}
function comprovantesPagamento(incluirUsados) {
  const out = [];
  (S.processos || []).forEach(p => {
    (((p.docs || {})._files || {}).pagamento || []).forEach(f => out.push({ processo: p.id, valor: Number(f.valor) || 0, data: f.data || '', categoria: f.categoria || '', nome: f.name, url: f.url, idTransacao: f.pagamento && f.pagamento.idTransacao }));
  });
  (S.banco.docs || []).forEach(d => out.push({ processo: '', valor: Number(d.valor) || 0, data: d.data || '', categoria: d.categoria || '', nome: d.nome, url: d.url }));
  if (incluirUsados) return out;
  const usados = comprovantesUsados();
  return out.filter(c => !c.url || !usados.has(c.url));
}

function sugestaoLinha(l) {
  const v = Math.abs(l.valor);
  // 1) já há um lançamento em aberto com o mesmo valor → dar baixa
  if (l.valor < 0) {
    const abertos = buildAllEntries().filter(e => e.tipo === 'Despesa' && e.status === 'Em Aberto' && Math.abs((Number(e.valor) || 0) - v) < 0.01
      && (!e.data || diasEntre(brToIso2(e.data) || l.data, l.data) <= 10));
    if (abertos.length) {
      // vários em aberto com o mesmo valor → prefere o processo que tem comprovante com esse valor e data
      let escolhido = abertos[0];
      if (abertos.length > 1) {
        const comps = comprovantesPagamento().filter(c => c.processo && Math.abs(c.valor - v) < 0.01 && (!c.data || diasEntre(c.data, l.data) <= 3));
        const hit = abertos.find(e => e.vinculo === 'processo' && comps.some(c => c.processo === e.vinculoId));
        if (hit) escolhido = hit;
      }
      return { acao: 'baixar', entry: escolhido, unico: abertos.length === 1, texto: `Dar baixa em "${escolhido.descricao}"` + (abertos.length > 1 ? ` (+${abertos.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 1b) lançamento já pago (criado a partir de um comprovante) que ainda não foi ligado ao extrato
  {
    const tipoL = l.valor < 0 ? 'Despesa' : 'Receita';
    const pagos = (S.lancamentos || []).filter(x => x.status === 'Pago' && x.tipo === tipoL && x.categoria !== 'Câmbio'
      && !(x.docs && x.docs._banco) && x.docs && x.docs.comprovante
      && Math.abs((Number(x.valor) || 0) - v) < 0.01 && diasEntre(brToIso2(x.data) || l.data, l.data) <= 4);
    if (pagos.length) {
      pagos.sort((a, b) => diasEntre(brToIso2(a.data) || l.data, l.data) - diasEntre(brToIso2(b.data) || l.data, l.data));
      return { acao: 'baixar', entry: pagos[0], unico: pagos.length === 1, texto: `Ligar ao lançamento do comprovante "${pagos[0].descricao}"` + (pagos.length > 1 ? ` (+${pagos.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 2) comprovante anexado ao processo com o mesmo valor
  const comp = comprovantesPagamento().find(c => Math.abs(c.valor - v) < 0.01 && (!c.data || diasEntre(c.data, l.data) <= 3));
  if (comp) return { acao: 'lancar', centro: comp.processo ? 'P:' + comp.processo : 'ADM', categoria: l.categoria || comp.categoria || '', texto: comp.processo ? `Comprovante do ${comp.processo} com o mesmo valor` : `Comprovante de despesa do mês: ${comp.nome}`, comp };
  // 3) regra aprendida / regra do banco
  if (l.categoria) return { acao: 'lancar', centro: l.centro || '', categoria: l.categoria, texto: 'Regra: ' + l.categoria };
  return null;
}

// ── Ações ───────────────────────────────────────────────────
function lerControles(chave) {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const k = chave.replace(/[^a-zA-Z0-9]/g, '').slice(-24);
  return { categoria: g('bc-cat-' + k), centro: g('bc-cen-' + k), regra: (document.getElementById('bc-reg-' + k) || {}).checked };
}

async function escolherCentro(sel, chave) {
  if (sel.value !== '__novo') return;
  const nome = await uiPrompt('Nome do projeto (ex.: Quartzo Oliveira dos Brejinhos):', '', 'Novo projeto');
  if (!nome) { sel.value = ''; return; }
  S.banco.projetoNovo = S.banco.projetoNovo || [];
  const opt = document.createElement('option'); opt.value = 'J:' + nome.trim(); opt.textContent = nome.trim();
  sel.querySelector('optgroup[label="Projetos"]').insertBefore(opt, sel.querySelector('option[value="__novo"]'));
  sel.value = opt.value;
}

function novoLancamentoDeLinha(l, categoria, centro, extraDocs) {
  const transfer = CATEG_TRANSFER.includes(categoria);
  const tipo = transfer ? 'Transferência' : l.valor >= 0 ? 'Receita' : 'Despesa';
  let vinculo = 'avulso', vinculoId = '';
  if (centro.startsWith('P:')) { vinculo = 'processo'; vinculoId = centro.slice(2); }
  else if (centro.startsWith('J:')) { vinculo = 'projeto'; vinculoId = centro.slice(2); }
  else if (centro === 'ADM') { vinculo = 'avulso'; vinculoId = 'ADM'; }
  const obj = {
    id: genId(), tipo, status: 'Pago',
    descricao: (categoria ? categoria + ' — ' : '') + (l.favorecido || l.memo),
    valor: Math.abs(l.valor), data: isoToBr(l.data), empresa: l.favorecido || '',
    categoria, vinculo, vinculoId, observacao: 'Extrato: ' + l.memo,
    docs: Object.assign({ _banco: l.chave }, extraDocs || {}),
  };
  S.lancamentos = S.lancamentos || [];
  S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, `${tipo}: ${obj.descricao} (R$ ${obj.valor.toFixed(2)}) via conciliação`);
  return obj;
}

// Baixa num lançamento existente (manual ou automático do processo / custo fixo)
function darBaixa(entry, l) {
  const data = isoToBr(l.data);
  if (entry._computed) {
    if (entry._sourceProcessoId) {
      const p = S.processos.find(x => x.id === entry._sourceProcessoId);
      if (!p) return false;
      if (!p.docs) p.docs = {};
      if (entry._sourceField === 'cambioReais') { p.cambioStatus = 'Pago'; if (!p.cambioRecebimento) p.cambioRecebimento = data; }
      else {
        p[entry._sourceStatusField] = 'Pago';
        p.docs._costData = p.docs._costData || {}; p.docs._costData[entry._sourceField] = data;
        p.docs._costBanco = p.docs._costBanco || {}; p.docs._costBanco[entry._sourceField] = l.chave;
      }
      return true;
    }
    if (entry._sourceFixoField !== undefined) {
      const m = (S.custosMensais || [])[entry._sourceFixoIdx];
      if (!m) return false;
      m.docs = m.docs || {};
      m.docs._fixoStatus = m.docs._fixoStatus || {}; m.docs._fixoStatus[entry._sourceFixoField] = 'Pago';
      m.docs._fixoData = m.docs._fixoData || {}; m.docs._fixoData[entry._sourceFixoField] = data;
      return true;
    }
    return false;
  }
  const lm = (S.lancamentos || []).find(x => String(x.id) === String(entry.id));
  if (!lm) return false;
  lm.status = 'Pago'; lm.data = data; lm.docs = lm.docs || {}; lm.docs._banco = l.chave;
  return true;
}

async function persistir2() {
  await saveToSheets();
  await salvarBanco();
}

async function conciliarLinha(chave, modo, silencioso) {
  const B = S.banco;
  const l = B.linhas.find(x => x.chave === chave);
  if (!l) return;
  const sug = sugestaoLinha(l);
  try {
    if (modo === 'baixar' && sug && sug.acao === 'baixar') {
      if (!darBaixa(sug.entry, l)) throw new Error('Não foi possível dar baixa no lançamento.');
      // liga o comprovante (se houver) para ele não ser sugerido de novo em outra linha
      const pid = sug.entry.vinculo === 'processo' ? sug.entry.vinculoId : '';
      const cp = comprovantesPagamento().find(c => Math.abs(c.valor - Math.abs(l.valor)) < 0.01 && (pid ? c.processo === pid : !c.processo) && (!c.data || diasEntre(c.data, l.data) <= 3));
      if (cp && cp.url) {
        if (sug.entry._sourceField && pid) {
          const pr = (S.processos || []).find(x => x.id === pid);
          if (pr) { pr.docs = pr.docs || {}; pr.docs._costComp = pr.docs._costComp || {}; pr.docs._costComp[sug.entry._sourceField] = cp.url; }
        } else {
          const lm = (S.lancamentos || []).find(x => String(x.id) === String(sug.entry.id));
          if (lm) { lm.docs = lm.docs || {}; lm.docs.comprovante = cp.url; }
        }
      }
      l.status = 'conciliado'; l.lancId = sug.entry.id; l.categoria = sug.entry.categoria || l.categoria;
      l.centro = sug.entry.vinculo === 'processo' ? 'P:' + sug.entry.vinculoId : sug.entry.vinculo === 'fixo' ? 'ADM' : l.centro;
    } else {
      const c = lerControles(chave);
      const categoria = c.categoria || (sug && sug.categoria) || '';
      const centro = c.centro || (sug && sug.centro) || '';
      if (!categoria) { showToast('Escolha a categoria'); return; }
      if (!centro && !CATEG_TRANSFER.includes(categoria)) { showToast('Escolha o centro de custo'); return; }
      const extra = sug && sug.comp ? { comprovante: sug.comp.url } : {};
      const obj = novoLancamentoDeLinha(l, categoria, centro, extra);
      l.status = 'conciliado'; l.lancId = obj.id; l.categoria = categoria; l.centro = centro;
      if (c.regra) await aprenderRegra(l, categoria, centro);
    }
    if (silencioso) return true;
    await persistir2();
    showToast('✅ Conciliado');
  } catch (e) { if (silencioso) return false; showToast('⚠️ ' + (e.message || e)); }
  render();
}

async function aprenderRegra(l, categoria, centro) {
  const r = l.documento
    ? { id: genId(), tipo: 'doc', valor: l.documento, categoria, centro: centro.startsWith('P:') ? '' : centro }
    : { id: genId(), tipo: 'texto', valor: l.favorecido, categoria, centro: centro.startsWith('P:') ? '' : centro };
  if (!r.valor) return;
  r.criadoEm = new Date().toISOString();
  try { r.criadoPor = JSON.parse(sessionStorage.getItem('teste:erp-user') || '{}').email || ''; } catch (e) {}
  S.banco.regras = (S.banco.regras || []).filter(x => !(x.tipo === r.tipo && x.valor === r.valor));
  S.banco.regras.push(r);
  await gravarAba2('REGRAS', S.banco.regras);
  // aplica às outras linhas pendentes iguais
  S.banco.linhas.forEach(x => {
    if (x.status !== 'pendente' || x.categoria) return;
    if ((r.tipo === 'doc' && x.documento === r.valor) || (r.tipo === 'texto' && x.favorecido === r.valor)) { x.categoria = categoria; x.centro = r.centro; }
  });
}

async function ignorarLinha(chave) {
  const l = S.banco.linhas.find(x => x.chave === chave);
  if (!l) return;
  const motivo = await uiPrompt('Motivo (ex.: aplicação automática, transferência entre contas próprias):', '', 'Ignorar movimento');
  if (motivo === null) return;
  l.status = 'ignorado'; l.obs = motivo;
  await salvarBanco(); render();
}

async function reabrirLinha(chave) {
  const l = S.banco.linhas.find(x => x.chave === chave);
  if (!l) return;
  if (l.status === 'conciliado' && l.lancId && !String(l.lancId).startsWith('cambio:')) {
    const lm = (S.lancamentos || []).find(x => String(x.id) === String(l.lancId) && x.docs && x.docs._banco === l.chave && String(x.observacao || '').startsWith('Extrato:'));
    if (lm && !await uiConfirm('Reabrir este movimento e excluir o lançamento criado na conciliação?', 'Reabrir', 'Reabrir', 'Cancelar')) return;
    if (lm) S.lancamentos = S.lancamentos.filter(x => x !== lm);
  }
  l.status = 'pendente'; l.lancId = ''; l.obs = '';
  await persistir2(); render();
}

// Câmbio: grupo de linhas do mesmo contrato + tarifa
function gruposCambio(pendentes) {
  const g = {};
  pendentes.filter(l => l.contrato && l.valor > 0).forEach(l => {
    const k = l.data + '|' + l.contrato;
    g[k] = g[k] || { k, data: l.data, contrato: l.contrato, linhas: [], total: 0, tarifas: [] };
    g[k].linhas.push(l); g[k].total = Math.round((g[k].total + l.valor) * 100) / 100;
  });
  pendentes.filter(l => /^TAR CAMB/i.test(l.memo)).forEach(l => {
    const gr = Object.values(g).find(x => x.data === l.data && !x.tarifas.length);
    if (gr) gr.tarifas.push(l);
  });
  return Object.values(g);
}

async function conciliarCambio(k, silencioso) {
  const B = S.banco;
  const pend = B.linhas.filter(l => l.status === 'pendente');
  const gr = gruposCambio(pend).find(x => x.k === k);
  if (!gr) return;
  const ct = contratosCambio()[gr.contrato];
  let faturas = ct ? ct.faturas.filter(f => f.usd > 0) : [];
  if (!faturas.length) {
    const sel = document.getElementById('bc-camb-' + gr.contrato);
    const proc = sel ? sel.value : '';
    if (!proc) { if (!silencioso) showToast('Anexe o contrato de câmbio na Caixa de Entrada ou escolha o processo'); return false; }
    faturas = [{ processo: proc, usd: 0 }];
  }
  const usdSoma = faturas.reduce((a, f) => a + f.usd, 0);
  // reparte o valor em reais (e a tarifa) proporcionalmente ao USD de cada fatura
  const parte = f => usdSoma > 0 ? f.usd / usdSoma : 1 / faturas.length;
  const tarifa = gr.tarifas.reduce((a, l) => a + Math.abs(l.valor), 0);
  faturas.forEach(f => {
    const reais = Math.round(gr.total * parte(f) * 100) / 100;
    const ja = (S.lancamentos || []).find(x => x.categoria === 'Câmbio' && x.vinculoId === f.processo && !(x.docs && x.docs._banco)
      && x.docs && x.docs._cambio && String(x.docs._cambio.contrato) === String(gr.contrato));
    if (ja) {
      // o banco é a verdade: valor e data do extrato; o contrato fica como comprovante
      ja.valor = reais; ja.data = isoToBr(gr.data); ja.status = 'Pago';
      ja.docs._banco = gr.linhas.map(l => l.chave).join(','); ja.observacao = 'Extrato: LIQ EXPORT ' + gr.contrato;
    }
    const obj = ja || {
      id: genId(), tipo: 'Receita', status: 'Pago', descricao: `Câmbio contrato ${gr.contrato} — ${f.processo}` + (f.usd ? ` (USD ${fmt(f.usd)})` : ''),
      valor: reais, data: isoToBr(gr.data), empresa: '', categoria: 'Câmbio', vinculo: 'processo', vinculoId: f.processo,
      observacao: 'Extrato: LIQ EXPORT ' + gr.contrato, docs: { _banco: gr.linhas.map(l => l.chave).join(','), _cambio: { contrato: gr.contrato, usd: f.usd, taxa: ct ? ct.taxa : null }, comprovante: ct ? ct.url : '' },
    };
    if (!ja) S.lancamentos.unshift(obj);
    if (tarifa) {
      S.lancamentos.unshift({
        id: genId(), tipo: 'Despesa', status: 'Pago', descricao: `Tarifa de câmbio ${gr.contrato} — ${f.processo}`,
        valor: Math.round(tarifa * parte(f) * 100) / 100, data: isoToBr(gr.data), empresa: 'ITAU UNIBANCO', categoria: 'Tarifa de câmbio',
        vinculo: 'processo', vinculoId: f.processo, observacao: 'Extrato: TAR CAMB REC RECURS', docs: { _banco: gr.tarifas.map(l => l.chave).join(',') },
      });
    }
    logAction('criar', 'EXTRATO_CAIXA', obj.id, `Câmbio ${gr.contrato} → ${f.processo} R$ ${reais.toFixed(2)}`);
  });
  [...gr.linhas, ...gr.tarifas].forEach(l => { l.status = 'conciliado'; l.lancId = 'cambio:' + gr.contrato; l.categoria = l.valor > 0 ? 'Câmbio' : 'Tarifa de câmbio'; l.centro = faturas.map(f => 'P:' + f.processo).join(' '); });
  if (silencioso) return true;
  try { await persistir2(); showToast('✅ Câmbio conciliado'); } catch (e) { showToast('⚠️ ' + e.message); }
  render();
}

async function lancarRendimentos(mes, silencioso) {
  const B = S.banco;
  const ls = B.linhas.filter(l => l.status === 'pendente' && /^RENDIMENTOS/i.test(l.memo) && l.data.slice(0, 7) === mes);
  if (!ls.length) return;
  const total = Math.round(ls.reduce((a, l) => a + l.valor, 0) * 100) / 100;
  const ultimo = ls[ls.length - 1].data;
  const obj = {
    id: genId(), tipo: 'Receita', status: 'Pago', descricao: `Rendimentos da aplicação automática ${mes.slice(5)}/${mes.slice(0, 4)}`,
    valor: total, data: isoToBr(ultimo), empresa: 'ITAU UNIBANCO', categoria: 'Rendimentos financeiros', vinculo: 'avulso', vinculoId: 'ADM',
    observacao: `Extrato: ${ls.length} linhas de rendimento`, docs: { _banco: 'rendimentos:' + mes },
  };
  S.lancamentos.unshift(obj);
  ls.forEach(l => { l.status = 'conciliado'; l.lancId = obj.id; l.categoria = 'Rendimentos financeiros'; l.centro = 'ADM'; });
  if (silencioso) return true;
  await persistir2(); showToast('✅ Rendimentos lançados'); render();
}

// Conciliação automática: só o que tem prova (contrato de câmbio, comprovante/lançamento único com o mesmo valor, rendimentos)
async function autoConciliar() {
  const B = S.banco;
  const r = { cambio: 0, baixas: 0, rendimentos: 0, regras: 0 };
  const ct = contratosCambio();
  for (const gr of gruposCambio(B.linhas.filter(l => l.status === 'pendente'))) {
    if (ct[gr.contrato] && await conciliarCambio(gr.k, true)) r.cambio++;
  }
  for (const l of B.linhas.filter(x => x.status === 'pendente')) {
    if (/^RENDIMENTOS/i.test(l.memo)) continue;
    const sug = sugestaoLinha(l);
    if (sug && sug.acao === 'baixar' && sug.unico && await conciliarLinha(l.chave, 'baixar', true)) r.baixas++;
  }
  // regra do banco com categoria E centro definidos (tarifas, seguros, regras aprendidas para ADM)
  r.regras = 0;
  for (const l of B.linhas.filter(x => x.status === 'pendente' && !/^RENDIMENTOS/i.test(x.memo) && x.categoria && x.centro && !x.contrato)) {
    const obj = novoLancamentoDeLinha(l, l.categoria, l.centro);
    l.status = 'conciliado'; l.lancId = obj.id; r.regras++;
  }
  const meses = [...new Set(B.linhas.filter(l => l.status === 'pendente' && /^RENDIMENTOS/i.test(l.memo)).map(l => l.data.slice(0, 7)))];
  for (const m of meses) if (await lancarRendimentos(m, true)) r.rendimentos++;
  await persistir2();
  r.pendentes = B.linhas.filter(l => l.status === 'pendente').length;
  return r;
}

// ── Tela: Conciliação ───────────────────────────────────────
function renderConciliacao() {
  const B = S.banco;
  if (!B.carregado && !B.carregando && !B.erro && window._sheetsToken) setTimeout(() => carregarBanco(), 30);
  const pend = B.linhas.filter(l => l.status === 'pendente');
  const cont = { pendente: pend.length, conciliado: B.linhas.filter(l => l.status === 'conciliado').length, ignorado: B.linhas.filter(l => l.status === 'ignorado').length };
  const cambios = gruposCambio(pend);
  const noCambio = new Set(cambios.flatMap(g => [...g.linhas, ...g.tarifas]).map(l => l.chave));
  const rend = {};
  pend.filter(l => /^RENDIMENTOS/i.test(l.memo)).forEach(l => { const m = l.data.slice(0, 7); rend[m] = rend[m] || { n: 0, t: 0 }; rend[m].n++; rend[m].t += l.valor; });
  const contratos = contratosCambio();
  const procOpts = (S.processos || []).map(p => p.id).sort().reverse();
  const k8 = c => c.replace(/[^a-zA-Z0-9]/g, '').slice(-24);

  let lista = B.filtro === 'todos' ? B.linhas : B.linhas.filter(l => l.status === B.filtro);
  if (B.filtro === 'pendente') lista = lista.filter(l => !noCambio.has(l.chave) && !/^RENDIMENTOS/i.test(l.memo));
  lista = lista.slice().sort((a, b) => b.data.localeCompare(a.data));
  const total = lista.length;
  lista = lista.slice(0, B.limite);

  const cardLinha = l => {
    const k = k8(l.chave);
    const sug = l.status === 'pendente' ? sugestaoLinha(l) : null;
    const cor = l.valor >= 0 ? 'var(--green)' : 'var(--text)';
    return `<div class="card" style="padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:13px">${escHtml(l.favorecido || l.memo)}</div>
          <div style="font-size:10.5px;color:var(--muted)">${isoToBr(l.data)} · ${escHtml(l.memo)}</div>
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;color:${cor};white-space:nowrap">${l.valor < 0 ? '−' : '+'} R$ ${fmt(Math.abs(l.valor))}</div>
      </div>
      ${l.status === 'pendente' ? `
        ${sug ? `<div style="margin-top:8px;font-size:11.5px;color:var(--accent2)">💡 ${escHtml(sug.texto)}</div>` : ''}
        <div class="g2" style="margin-top:8px">
          <select id="bc-cat-${k}" aria-label="Categoria">${categOpts((sug && sug.categoria) || l.categoria)}</select>
          <select id="bc-cen-${k}" aria-label="Centro de custo" onchange="escolherCentro(this,'${escHtml(l.chave)}')">${centroOpts((sug && sug.centro) || l.centro)}</select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          <label style="font-size:11px;color:var(--muted2);display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="bc-reg-${k}" style="width:auto">Sempre classificar ${l.documento ? 'este CNPJ/CPF' : 'este favorecido'} assim</label>
          <span style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-xs" onclick="ignorarLinha('${escHtml(l.chave)}')">Ignorar</button>
            ${sug && sug.acao === 'baixar' ? `<button class="btn btn-success btn-xs" onclick="conciliarLinha('${escHtml(l.chave)}','baixar')">Dar baixa</button>` : ''}
            <button class="btn btn-primary btn-xs" onclick="conciliarLinha('${escHtml(l.chave)}','lancar')">Lançar</button>
          </span>
        </div>` : `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:var(--muted2);gap:8px;flex-wrap:wrap">
          <span>${l.status === 'conciliado' ? '🟢 ' + escHtml(l.categoria || '') + (l.centro ? ' · ' + escHtml(l.centro.replace(/P:/g, '').replace(/J:/g, 'Projeto ')) : '') : '⚫ Ignorado' + (l.obs ? ': ' + escHtml(l.obs) : '')}</span>
          <button class="btn btn-secondary btn-xs" onclick="reabrirLinha('${escHtml(l.chave)}')">Reabrir</button>
        </div>`}
    </div>`;
  };

  const cardCambio = g => {
    const ct = contratos[g.contrato];
    return `<div class="card" style="padding:14px 16px;margin-bottom:10px;border-left:3px solid var(--green)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-weight:700;font-size:13px">Câmbio · contrato ${escHtml(g.contrato)}</div>
          <div style="font-size:11px;color:var(--muted)">${isoToBr(g.data)} · ${g.linhas.length} entrada(s)${g.tarifas.length ? ' · tarifa R$ ' + fmt(g.tarifas.reduce((a, l) => a + Math.abs(l.valor), 0)) : ''}</div></div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--green)">+ R$ ${fmt(g.total)}</div>
      </div>
      ${ct ? `<div style="margin-top:8px;font-size:12px;color:var(--muted2)">Contrato ${escHtml(ct.referencia || '')} anexado: USD ${fmt(ct.usdTotal)} × ${String(ct.taxa).replace('.', ',')} · ${ct.faturas.map(f => `<b style="color:var(--text)">${escHtml(f.processo)}</b> USD ${fmt(f.usd)}`).join(' · ')}</div>
        ${Math.abs((ct.reaisTotal || 0) - g.total) > 0.05 ? `<div style="margin-top:4px;font-size:11.5px;color:var(--yellow)">⚠️ Contrato diz R$ ${fmt(ct.reaisTotal)}; banco creditou R$ ${fmt(g.total)}</div>` : ''}
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-xs" onclick="conciliarCambio('${escHtml(g.k)}')">Conciliar e dividir entre os processos</button></div>`
      : `<div style="margin-top:8px;font-size:11.5px;color:var(--yellow)">Contrato de câmbio não encontrado. Salve o PDF do contrato na pasta Entrada para dividir automaticamente, ou escolha o processo:</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><select id="bc-camb-${escHtml(g.contrato)}" style="flex:1;min-width:140px"><option value="">— processo —</option>${procOpts.map(id => `<option>${escHtml(id)}</option>`).join('')}</select>
        <button class="btn btn-primary btn-xs" onclick="conciliarCambio('${escHtml(g.k)}')">Conciliar</button></div>`}
    </div>`;
  };

  const msg = B.msg ? `<div class="card" style="padding:12px 14px;font-size:12.5px;color:${B.msg.tipo === 'erro' ? 'var(--red)' : 'var(--green)'};display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <span>${B.msg.tipo === 'erro' ? '⚠️' : '✅'} ${escHtml(B.msg.texto)}</span>
      ${B.msg.lote ? `<button class="btn btn-secondary btn-xs" onclick="desfazerLote('${escHtml(B.msg.lote)}')">Desfazer importação</button>` : ''}</div>` : '';

  return `
  ${backBtn()}
  <div class="page-header">
    <div><div class="page-title">Conciliação bancária</div>
      <div style="color:var(--muted);font-size:11px;margin-top:2px">Extrato do banco → lançamentos. O banco é a verdade: valor e data vêm do extrato.</div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <label class="btn btn-primary btn-sm" for="ofx-file" style="cursor:pointer">📥 Importar extrato OFX</label>
      <button class="btn btn-secondary btn-sm" onclick="importarOFXDrive()">☁️ OFX da pasta Entrada</button>
    </div>
    <input type="file" id="ofx-file" hidden onchange="importarOFX(this.files[0]);this.value=''">
  </div>
  ${B.carregando ? `<div class="card" style="padding:14px;color:var(--muted);font-size:13px">⏳ Carregando extrato...</div>` : ''}
  ${B.erro ? `<div class="card" style="padding:14px;color:var(--red);font-size:13px">⚠️ ${escHtml(B.erro)}</div>` : ''}
  ${!window._sheetsToken ? `<div class="card" style="padding:14px;color:var(--muted);font-size:13px">Conecte ao Google Drive para usar a conciliação.</div>` : ''}
  ${msg}
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    ${[['pendente', '🟡 Pendentes'], ['conciliado', '🟢 Conciliados'], ['ignorado', '⚫ Ignorados'], ['todos', 'Todos']].map(([f, t]) => `
      <button class="tab ${B.filtro === f ? 'active' : ''}" style="border:1px solid var(--border2)" onclick="S.banco.filtro='${f}';S.banco.limite=40;render()">${t} <b>${f === 'todos' ? B.linhas.length : cont[f]}</b></button>`).join('')}
  </div>
  ${B.filtro === 'pendente' && cambios.length ? `<div class="sec-divider"><div class="sec-divider-line"></div><div class="sec-divider-label">Câmbio recebido</div><div class="sec-divider-line"></div></div>${cambios.map(cardCambio).join('')}` : ''}
  ${B.filtro === 'pendente' && Object.keys(rend).length ? `<div class="sec-divider"><div class="sec-divider-line"></div><div class="sec-divider-label">Rendimentos</div><div class="sec-divider-line"></div></div>
    <div class="card" style="padding:12px 14px">${Object.entries(rend).sort().map(([m, r]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;gap:8px">
      <span>${m.slice(5)}/${m.slice(0, 4)} · ${r.n} linhas</span><span style="display:flex;gap:10px;align-items:center"><b class="num">R$ ${fmt(r.t)}</b><button class="btn btn-secondary btn-xs" onclick="lancarRendimentos('${m}')">Lançar o mês</button></span></div>`).join('')}</div>` : ''}
  ${B.filtro === 'pendente' && lista.length ? `<div class="sec-divider"><div class="sec-divider-line"></div><div class="sec-divider-label">Pagamentos e outros</div><div class="sec-divider-line"></div></div>` : ''}
  ${lista.map(cardLinha).join('')}
  ${total > lista.length ? `<div style="text-align:center;margin:12px 0"><button class="btn btn-secondary btn-sm" onclick="S.banco.limite+=40;render()">Mostrar mais (${total - lista.length})</button></div>` : ''}
  ${B.carregado && !B.linhas.length ? `<div class="card" style="text-align:center;padding:30px;color:var(--muted)">Nenhum extrato importado ainda. Baixe o OFX no app do Itaú e toque em "Importar extrato OFX".</div>` : ''}`;
}

// ── Clientes & Resultado ────────────────────────────────────
const EMBARCADOS = ['Embarcado', 'No Destino', 'Concluído'];

function resultadoProcesso(p) {
  const es = buildAllEntries({ filtroProcessoId: p.id }).filter(e => e.status !== 'Cancelado');
  const cambioLanc = es.filter(e => e.tipo === 'Receita' && e.categoria === 'Câmbio' && !e._computed);
  const cambioAuto = es.filter(e => e.tipo === 'Receita' && e._computed);
  const reaisCambio = cambioLanc.length ? cambioLanc.reduce((a, e) => a + (Number(e.valor) || 0), 0) : cambioAuto.reduce((a, e) => a + (Number(e.valor) || 0), 0);
  const usdCambio = cambioLanc.reduce((a, e) => a + ((e.docs && e.docs._cambio && Number(e.docs._cambio.usd)) || 0), 0);
  const custos = es.filter(e => e.tipo === 'Despesa');
  const custo = custos.reduce((a, e) => a + (Number(e.valor) || 0), 0);
  const custoAberto = custos.filter(e => e.status === 'Em Aberto').reduce((a, e) => a + (Number(e.valor) || 0), 0);
  const nfs = (((p.docs || {})._files || {}).nfeSaida || []);
  const nfMap = {}; nfs.forEach(f => { if (f.chave) nfMap[f.chave] = Number(f.valor) || 0; else nfMap[f.id] = Number(f.valor) || 0; });
  const nfValor = Object.values(nfMap).reduce((a, v) => a + v, 0);
  const invoiceUsd = Number(p.cambioInvoice) || 0;
  const pendencias = [];
  if (!nfValor) pendencias.push('NF-e de saída');
  if (invoiceUsd && usdCambio && usdCambio + 0.01 < invoiceUsd) pendencias.push(`câmbio parcial (USD ${fmt(usdCambio)} de ${fmt(invoiceUsd)})`);
  if (!reaisCambio) pendencias.push('câmbio');
  if (custoAberto > 0) pendencias.push(`custos em aberto R$ ${fmt(custoAberto)}`);
  const receitaBase = reaisCambio || nfValor;
  return {
    reaisCambio, usdCambio, custo, custoAberto, nfValor, invoiceUsd,
    lucroNF: nfValor ? nfValor - custo : null,
    variacao: nfValor && reaisCambio ? reaisCambio - nfValor : null,
    resultado: receitaBase - custo,
    taxaMedia: usdCambio ? reaisCambio / usdCambio : null,
    provisorio: pendencias.length > 0, pendencias,
  };
}

function nomeCliente(p) { return String(p.cliente || 'Sem cliente').trim(); }

function contaClientes() {
  const cli = {};
  (S.processos || []).forEach(p => {
    const n = nomeCliente(p);
    cli[n] = cli[n] || { nome: n, recebidoUsd: 0, embarcadoUsd: 0, processos: [] };
    cli[n].processos.push(p);
    if (EMBARCADOS.includes(p.status)) cli[n].embarcadoUsd += Number(p.cambioInvoice) || 0;
  });
  // câmbio recebido: contratos anexados (fatura → processo → cliente); sem contrato: lançamentos de câmbio
  const vistos = new Set();
  Object.values(contratosCambio()).forEach(ct => {
    ct.faturas.forEach(f => {
      const p = S.processos.find(x => x.id === f.processo);
      if (!p) return;
      cli[nomeCliente(p)].recebidoUsd += f.usd;
      vistos.add(f.processo);
    });
    const alocado = ct.faturas.reduce((a, f) => a + f.usd, 0);
    if (ct.usdTotal && ct.usdTotal - alocado > 0.01 && ct.faturas[0]) {
      const p = S.processos.find(x => x.id === ct.faturas[0].processo);
      if (p) cli[nomeCliente(p)].recebidoUsd += ct.usdTotal - alocado; // valor sem fatura = crédito do cliente
    }
  });
  (S.processos || []).forEach(p => {
    if (vistos.has(p.id)) return;
    const usd = (normalizeStatus(p.cambioStatus) === 'Pago') ? (Number(p.cambioRecebido) || 0) : 0;
    cli[nomeCliente(p)].recebidoUsd += usd;
  });
  return Object.values(cli).map(c => ({ ...c, saldoUsd: c.recebidoUsd - c.embarcadoUsd })).sort((a, b) => b.processos.length - a.processos.length);
}

function renderResultados() {
  const clientes = contaClientes();
  const tab = S.resTab || 'clientes';
  const tabs = `<div class="tabs"><button class="tab ${tab === 'clientes' ? 'active' : ''}" onclick="S.resTab='clientes';render()">🤝 Saldo dos clientes</button><button class="tab ${tab === 'processos' ? 'active' : ''}" onclick="S.resTab='processos';render()">📦 Resultado por processo</button></div>`;
  const usd = n => 'USD ' + fmt(n);

  const clientesHtml = clientes.map(c => {
    const cor = c.saldoUsd > 0.01 ? 'var(--green)' : c.saldoUsd < -0.01 ? 'var(--red)' : 'var(--muted2)';
    const rotulo = c.saldoUsd > 0.01 ? 'crédito do cliente (adiantamento)' : c.saldoUsd < -0.01 ? 'cliente deve' : 'quitado';
    return `<div class="card" style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0"><div style="font-weight:800;font-size:14px">${escHtml(c.nome)}</div>
          <div style="font-size:11px;color:var(--muted)">${c.processos.length} processo(s)</div></div>
        <div style="text-align:right"><div style="font-family:'Outfit',sans-serif;font-weight:800;font-size:18px;color:${cor}">${usd(Math.abs(c.saldoUsd))}</div>
          <div style="font-size:10.5px;color:${cor}">${rotulo}</div></div>
      </div>
      <div class="g2" style="margin-top:10px;font-size:12px">
        <div class="total-box" style="margin-top:0"><span style="color:var(--muted)">Câmbio recebido</span><span class="num">${usd(c.recebidoUsd)}</span></div>
        <div class="total-box" style="margin-top:0"><span style="color:var(--muted)">Invoices embarcadas</span><span class="num">${usd(c.embarcadoUsd)}</span></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted2)">${c.processos.map(p => `${escHtml(p.id)} (${escHtml(p.status || '—')}${p.cambioInvoice ? ', ' + usd(p.cambioInvoice) : ''})`).join(' · ')}</div>
    </div>`;
  }).join('');

  const procHtml = (S.processos || []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id))).map(p => {
    const r = resultadoProcesso(p);
    const cor = r.resultado >= 0 ? 'var(--green)' : 'var(--red)';
    const linha = (l, v, c) => `<div class="cost-row"><span class="c-label">${l}</span><span class="c-val" style="${c ? 'color:' + c : ''}">${v}</span></div>`;
    return `<div class="card" style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:6px">
        <div><div style="font-weight:800;font-size:14px">${escHtml(p.id)} <span style="font-weight:400;color:var(--muted2);font-size:12px">${escHtml(nomeCliente(p))}</span></div>
          <div style="margin-top:3px">${badge(p.status)} <span style="font-size:10px;font-weight:700;color:${r.provisorio ? 'var(--yellow)' : 'var(--green)'};margin-left:4px">${r.provisorio ? 'RESULTADO PROVISÓRIO' : 'RESULTADO DEFINITIVO'}</span></div></div>
        <div style="text-align:right"><div style="font-family:'Outfit',sans-serif;font-weight:800;font-size:18px;color:${cor}">${r.resultado < 0 ? '−' : ''}R$ ${fmt(Math.abs(r.resultado))}</div>
          <div style="font-size:10.5px;color:var(--muted)">${r.resultado >= 0 ? 'lucro' : 'prejuízo'}</div></div>
      </div>
      ${linha('Receita: NF-e de saída', r.nfValor ? 'R$ ' + fmt(r.nfValor) : '— falta NF-e', r.nfValor ? '' : 'var(--yellow)')}
      ${linha('(−) Custos do processo', 'R$ ' + fmt(r.custo) + (r.custoAberto ? ` (R$ ${fmt(r.custoAberto)} em aberto)` : ''))}
      ${r.lucroNF !== null ? linha('Lucro sobre a NF-e', 'R$ ' + fmt(r.lucroNF), r.lucroNF >= 0 ? 'var(--green)' : 'var(--red)') : ''}
      ${linha('Câmbio recebido para o processo', r.reaisCambio ? 'R$ ' + fmt(r.reaisCambio) + (r.usdCambio ? ` (${usd(r.usdCambio)} · taxa ${r.taxaMedia.toFixed(4).replace('.', ',')})` : '') : '—')}
      ${r.variacao !== null ? linha('Variação cambial (câmbio − NF-e)', (r.variacao >= 0 ? '+' : '−') + 'R$ ' + fmt(Math.abs(r.variacao)), r.variacao >= 0 ? 'var(--green)' : 'var(--red)') : ''}
      ${r.pendencias.length ? `<div style="margin-top:8px;font-size:11px;color:var(--yellow)">Falta para fechar: ${escHtml(r.pendencias.join(' · '))}</div>` : ''}
    </div>`;
  }).join('');

  return `
  ${backBtn()}
  <div class="page-header"><div><div class="page-title">Clientes & Resultado</div>
    <div style="color:var(--muted);font-size:11px;margin-top:2px">Saldo em dólar de cada cliente e lucro ou prejuízo de cada processo</div></div></div>
  ${tabs}
  ${tab === 'clientes' ? clientesHtml || '<div class="card" style="padding:20px;color:var(--muted)">Nenhum cliente.</div>' : procHtml}
  <div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.6">${tab === 'clientes'
    ? 'Câmbio recebido vem dos contratos de câmbio anexados (com as faturas de cada processo) ou, sem contrato, do valor recebido informado no processo. Invoices embarcadas contam processos com status Embarcado, No Destino ou Concluído.'
    : 'Resultado = câmbio recebido para o processo (ou, sem câmbio, a NF-e de saída) menos os custos. Fica provisório enquanto faltar NF-e de saída, câmbio ou houver custos em aberto.'}</div>`;
}
