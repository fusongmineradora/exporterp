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
  // escreve primeiro e depois limpa só as linhas que sobraram (se a escrita falhar, nada se perde)
  if (objs.length) await sheetsAPI('POST', `/${SHEET_ID}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [{ range: `${nome}!A2`, values: objs.map(o => h.map(k => o[k] === undefined || o[k] === null ? '' : String(o[k]))) }],
  });
  await sheetsAPI('POST', `/${SHEET_ID}/values:batchClear`, { ranges: [`${nome}!A${objs.length + 2}:Z`] });
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
  return (S.banco.regras || []).filter(r => !['fixo', 'catAdm', 'cambioProc'].includes(r.tipo)).map(r => r.tipo === 'doc'
    ? { doc: r.valor, categoria: r.categoria, centro: r.centro }
    : { texto: r.valor, categoria: r.categoria, centro: r.centro });
}

// ── Categorias e centros de custo ───────────────────────────
const CATEGORIAS2 = [
  ...Object.values(PROCESS_COST_FIELDS),
  'Tarifa de câmbio', 'Assessoria', 'Imposto COOP', 'Laboratório',
  'Tarifas bancárias', 'IOF', 'Impostos federais', 'Taxas e impostos municipais', 'Taxas de órgãos',
  'Contabilidade', 'Aluguel / Coworking', 'Combustível', 'Cartório', 'Seguros', 'Software',
  'Reembolso ao sócio', 'Viagem', 'Registro e licenças', 'Equipamentos', 'Materiais e embalagens', 'Alimentação', 'Acordos e parcelamentos', 'Outras despesas',
  'Rendimentos financeiros', 'Outras receitas', 'Câmbio',
  'Retirada de sócio', 'Aporte de sócio', 'Empréstimo ao sócio', 'Devolução de empréstimo do sócio', 'Transferência entre contas',
];
const CATEG_TRANSFER = ['Retirada de sócio', 'Aporte de sócio', 'Empréstimo ao sócio', 'Devolução de empréstimo do sócio', 'Transferência entre contas'];

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
  if (await importarOFXBytes(new Uint8Array(buf), file.name)) await conciliarDepoisDoOFX();
  render();
}

// Depois de importar o extrato: concilia sozinho o que tem prova (o resto fica pendente para você)
async function conciliarDepoisDoOFX() {
  const B = S.banco;
  if (!B.linhas.some(l => l.status === 'pendente')) return;
  const antes = B.msg && B.msg.texto ? B.msg.texto : '';
  B.msg = { tipo: 'ok', texto: antes + ' Conciliando...', lote: B.msg && B.msg.lote }; render();
  try {
    const r = await autoConciliar();
    B.msg = { tipo: 'ok', lote: B.msg.lote, texto: `${antes} Conciliado sozinho: ${r.cambio} câmbio(s), ${r.baixas} pagamento(s), ${r.regras} tarifa(s)/regra(s), ${r.rendimentos} rendimento(s)${r.reembolsos ? `, ${r.reembolsos} reembolso(s) ao sócio` : ''}. ${r.pendentes} linha(s) para você conferir.` };
  } catch (e) { B.msg = { tipo: 'erro', texto: antes + ' Erro na conciliação automática: ' + (e.message || e) }; }
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
    if (!files.length) { B.msg = { tipo: 'erro', texto: 'Nenhum arquivo OFX na pasta 📥 Entrada. Baixe o extrato (OFX) no app do Itaú ou do Bradesco e salve (Compartilhar → Drive) na pasta ' + ENTRADA_FOLDER + '.' }; render(); return; }
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
    if (msgs.length > (erro ? 1 : 0)) await conciliarDepoisDoOFX();
  } catch (e) {
    B.msg = { tipo: 'erro', texto: 'Não foi possível importar do Drive: ' + (e.message || e) };
  }
  render();
}

async function importarOFXBytes(bytes, nome) {
  const B = S.banco;
  if (!window.FusongOFX) { B.msg = { tipo: 'erro', texto: 'Leitor de OFX não carregado. Recarregue a página.' }; return false; }
  if (!ehOFX(bytes)) { B.msg = { tipo: 'erro', texto: `"${nome}" não é um extrato OFX. No app do banco (Itaú ou Bradesco) escolha Extrato → Exportar → formato OFX (Money/Quicken).` }; return false; }
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
        (f.cambio.faturas || []).forEach(x => { m[k].todas = m[k].todas || []; if (x.processo && !m[k].todas.includes(x.processo)) m[k].todas.push(x.processo); });
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

// Um comprovante dividido entre processos (FS260098 + FS260099 + FS260101): no banco é UM pagamento só
function gruposDivididos() {
  const g = {};
  (S.processos || []).forEach(p => Object.entries(((p.docs || {})._custoDocs) || {}).forEach(([campo, reg]) => (reg.pagos || []).forEach(d => {
    if (!d.url || d.tipo === 'socio') return;
    (g[d.url] = g[d.url] || []).push({ p, campo, valor: Number(d.valor) || 0, data: d.data || '' });
  })));
  return Object.entries(g).filter(([, parts]) => new Set(parts.map(x => x.p.id)).size > 1)
    .map(([url, parts]) => ({ url, parts, total: Math.round(parts.reduce((a, x) => a + x.valor, 0) * 100) / 100, data: (parts.find(x => x.data) || {}).data || '' }));
}
// custo previsto (estimado): não é dívida real — o extrato não dá baixa nele sozinho (muitos processos têm o mesmo valor)
function ehPrevisto(e) {
  if (!e || !e._sourceField || !e._sourceProcessoId) return false;
  const p = (S.processos || []).find(x => x.id === e._sourceProcessoId);
  return !!(p && p.docs && p.docs._previsto && p.docs._previsto[e._sourceField]);
}
function sugestaoLinha(l) {
  const v = Math.abs(l.valor);
  if (l.valor < 0) {
    const gs = gruposDivididos().filter(g => Math.abs(g.total - v) < 0.01 && g.parts.some(x => !(x.p.docs._costBanco && x.p.docs._costBanco[x.campo]))
      && (!g.data || diasEntre(brToIso2(g.data) || l.data, l.data) <= 4));
    if (gs.length) {
      const g = gs[0];
      return { acao: 'baixarGrupo', grupo: g, unico: gs.length === 1 && !!g.data, texto: `Pagamento dividido entre ${g.parts.map(x => x.p.id).join(' + ')} (${g.parts.map(x => 'R$ ' + fmt(x.valor)).join(' + ')})` };
    }
  }
  // 0) despesa já lançada pelo comprovante (sem extrato), mesmo valor e data perto → liga a ela (não cria outra)
  if (l.valor < 0) {
    const datasL = x => { const ds = [brToIso2(x.data) || ''].filter(Boolean); (String(x.observacao || '').match(/20\d{2}-\d{2}-\d{2}/g) || []).forEach(d => ds.push(d)); return ds; };
    const jaPago = (S.lancamentos || []).filter(x => (x.tipo === 'Despesa' || x.tipo === 'Transferência') && x.status === 'Pago' && !(x.docs && x.docs._banco) && Math.abs((Number(x.valor) || 0) - v) < 0.01 && datasL(x).some(d => diasEntre(d, l.data) <= 7));
    if (jaPago.length > 1) {   // mais de um com o mesmo valor: fica com o do mesmo favorecido
      const nf = t => String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const fav = nf(l.favorecido || l.memo);
      const mesmo = jaPago.filter(x => { const w = nf(x.empresa).split(/\s+/).filter(p => p.length >= 4); return w.length && w.slice(0, 2).every(p => fav.includes(p)); });
      if (mesmo.length) jaPago.splice(0, jaPago.length, ...mesmo);
    }
    if (jaPago.length) {
      const e = buildAllEntries().find(x => !x._computed && String(x.id) === String(jaPago[0].id));
      if (e) return { acao: 'baixar', entry: e, unico: jaPago.length === 1, texto: `Já lançado pelo comprovante: "${jaPago[0].descricao}"` + (jaPago.length > 1 ? ` (+${jaPago.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 1) já há um lançamento em aberto com o mesmo valor → dar baixa
  if (l.valor < 0) {
    const dataRef = e => {
      if (e.data) return brToIso2(e.data);
      const pr = e._sourceField && (S.processos || []).find(x => x.id === e._sourceProcessoId);
      const f = pr && pr.docs && pr.docs._custoDocs && pr.docs._custoDocs[e._sourceField] && (pr.docs._custoDocs[e._sourceField].fiscais || [])[0];
      return f && f.data ? brToIso2(f.data) : '';
    };
    const abertos = buildAllEntries().filter(e => e.tipo === 'Despesa' && e.status === 'Em Aberto' && !ehPrevisto(e) && Math.abs((Number(e.valor) || 0) - v) < 0.01).filter(e => {
      const d = dataRef(e); e._dataRef = d;
      if (!d) return true;                                   // sem data: só sugestão (não é automático)
      return e.data ? diasEntre(d, l.data) <= 10 : (l.data >= d ? diasEntre(d, l.data) <= 75 : diasEntre(d, l.data) <= 5);
    });
    if (abertos.length) {
      // vários em aberto com o mesmo valor → prefere o processo que tem comprovante com esse valor e data
      let escolhido = abertos[0];
      if (abertos.length > 1) {
        const comps = comprovantesPagamento().filter(c => c.processo && Math.abs(c.valor - v) < 0.01 && (!c.data || diasEntre(c.data, l.data) <= 3));
        const hit = abertos.find(e => e.vinculo === 'processo' && comps.some(c => c.processo === e.vinculoId));
        if (hit) escolhido = hit;
      }
      return { acao: 'baixar', entry: escolhido, unico: abertos.length === 1 && !!escolhido._dataRef, texto: `Dar baixa em "${escolhido.descricao}"` + (abertos.length > 1 ? ` (+${abertos.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 1a) custo em aberto do mesmo fornecedor com diferença pequena (centavos / juros) → sugere baixa, você confirma
  if (l.valor < 0) {
    const nf = s2 => String(s2 || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '');
    const fav = nf(l.favorecido || l.memo);
    const cands = buildAllEntries().filter(e => e._computed && e._sourceField && e.status === 'Em Aberto' && !ehPrevisto(e) && Number(e.valor) > 0).filter(e => {
      const pr = (S.processos || []).find(x => x.id === e._sourceProcessoId) || {};
      const emp = nf((pr.docs && pr.docs._costEmpresa && pr.docs._costEmpresa[e._sourceField]) || e.empresa);
      const tol = Math.max(5, Number(e.valor) * 0.01);
      return emp.length >= 6 && fav.length >= 6 && (emp.startsWith(fav.slice(0, 10)) || fav.startsWith(emp.slice(0, 10))) && Math.abs(Number(e.valor) - v) <= tol;
    });
    if (cands.length) return { acao: 'baixar', entry: cands[0], unico: false, texto: `Dar baixa em "${cands[0].descricao}" (R$ ${fmt(cands[0].valor)} na nota; o banco pagou R$ ${fmt(v)})` + (cands.length > 1 ? ` (+${cands.length - 1} parecido — confira)` : '') };
  }
  // 1b) lançamento já pago (criado a partir de um comprovante) que ainda não foi ligado ao extrato
  {
    const tipoL = l.valor < 0 ? 'Despesa' : 'Receita';
    const pagos = (S.lancamentos || []).filter(x => x.status === 'Pago' && x.tipo === tipoL && x.categoria !== 'Câmbio'
      && !(x.docs && x.docs._banco) && x.docs && x.docs.comprovante
      && Math.abs((Number(x.valor) || 0) - v) < 0.01 && diasEntre(brToIso2(x.data) || l.data, l.data) <= 4);
    // custo do processo já pago (preenchido pelos comprovantes) e ainda sem linha do banco
    if (l.valor < 0) buildAllEntries().filter(e => e._computed && e._sourceField && e.status === 'Pago' && Math.abs((Number(e.valor) || 0) - v) < 0.01).forEach(e => {
      const pr = (S.processos || []).find(x => x.id === e._sourceProcessoId);
      const ja = pr && pr.docs && pr.docs._costBanco && pr.docs._costBanco[e._sourceField];
      if (!ja && (!e.data || diasEntre(brToIso2(e.data) || l.data, l.data) <= 4)) pagos.push(e);
    });
    if (pagos.length) {
      pagos.sort((a, b) => diasEntre(brToIso2(a.data) || l.data, l.data) - diasEntre(brToIso2(b.data) || l.data, l.data));
      return { acao: 'baixar', entry: pagos[0], unico: pagos.length === 1, texto: `Ligar ao lançamento do comprovante "${pagos[0].descricao}"` + (pagos.length > 1 ? ` (+${pagos.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 1c) comprovante que já está dentro de um custo do processo (pagamento parcial ou total) e ainda sem a linha do banco
  if (l.valor < 0) {
    const ligadas = (S.banco.linhas || []).filter(x => x.status === 'conciliado' && x !== l);
    const hits = [];
    (S.processos || []).forEach(p => Object.entries((p.docs && p.docs._custoDocs) || {}).forEach(([campo, reg]) => (reg.pagos || []).forEach(d => {
      if (d.tipo === 'banco' || d.tipo === 'socio' || Math.abs((Number(d.valor) || 0) - v) >= 0.01) return;
      if (d.data && diasEntre(brToIso2(d.data) || l.data, l.data) > 4) return;
      if (ligadas.some(x => Math.abs(Math.abs(x.valor) - v) < 0.01 && String(x.lancId || '').includes(p.id) && String(x.lancId || '').includes(campo))) return;
      if (!hits.some(h => h.p === p && h.campo === campo)) hits.push({ p, campo, d });
    })));
    if (hits.length) {
      const h = hits[0];
      const e = buildAllEntries().find(x => x._computed && x._sourceProcessoId === h.p.id && x._sourceField === h.campo);
      if (e) return { acao: 'baixar', entry: e, unico: hits.length === 1, texto: `Pagamento do ${h.p.id} — ${PROCESS_COST_FIELDS[h.campo] || h.campo} (comprovante de R$ ${fmt(v)})` + (hits.length > 1 ? ` (+${hits.length - 1} com o mesmo valor — confira)` : '') };
    }
  }
  // 2) comprovante anexado ao processo com o mesmo valor
  const comp = comprovantesPagamento().find(c => Math.abs(c.valor - v) < 0.01 && (!c.data || diasEntre(c.data, l.data) <= 3));
  if (comp) return { acao: 'lancar', centro: comp.processo ? 'P:' + comp.processo : 'ADM', categoria: comp.processo ? (comp.categoria || l.categoria || '') : (l.categoria || comp.categoria || ''), texto: comp.processo ? `Comprovante do ${comp.processo} com o mesmo valor` : `Comprovante de despesa do mês: ${comp.nome}`, comp };
  // 3) regra aprendida / regra do banco
  if (l.categoria) return { acao: 'lancar', centro: l.centro || '', categoria: l.categoria, texto: 'Regra: ' + l.categoria };
  return null;
}

// id único de cada linha do extrato na tela (antes: últimos 24 caracteres — linhas do mesmo favorecido se misturavam)
function idLinha(chave) { let h = 5381; const t = String(chave || ''); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return 'L' + h.toString(36) + t.replace(/[^a-zA-Z0-9]/g, '').slice(-8); }
// ── Ações ───────────────────────────────────────────────────
function lerControles(chave) {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const k = idLinha(chave);
  return { categoria: g('bc-cat-' + k), centro: g('bc-cen-' + k), regra: (document.getElementById('bc-reg-' + k) || {}).checked, fixa: (document.getElementById('bc-fix-' + k) || {}).checked };
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
  // reembolso ao sócio: quita as despesas já lançadas como "pagas pelo sócio" (a despesa não entra duas vezes)
  let quitados = [];
  if (categoria === 'Reembolso ao sócio' && l.valor < 0 && typeof reembolsosAbertos === 'function') {
    let soma = 0; const alvo = Math.abs(l.valor);
    reembolsosAbertos().slice().sort((a, b) => (brToIso(a.data) || '').localeCompare(brToIso(b.data) || '')).forEach(a => { if (soma + a.valor <= alvo + 0.01) { soma = Math.round((soma + a.valor) * 100) / 100; quitados.push(a); } });
    quitados.forEach(a => { a.status = 'Pago'; a.docs._banco = l.chave; a.observacao = (a.observacao || '') + ' · reembolsado em ' + isoToBr(l.data); });
    if (quitados.length && Math.abs(soma - alvo) >= 0.01) showToast(`Reembolso quitou ${quitados.length} despesa(s) (R$ ${fmt(soma)}); sobraram R$ ${fmt(alvo - soma)} sem despesa ligada — confira`);
  }
  const transfer = CATEG_TRANSFER.includes(categoria) || quitados.length > 0;
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
        // custo com notas/comprovantes: o status sai da conta (pagamento parcial continua "Em Aberto")
        if (p.docs._custoDocs && p.docs._custoDocs[entry._sourceField] && typeof recalcularCustos === 'function') recalcularCustos(p, entry._sourceField);
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
  if (!silencioso) {
    const c0 = modo === 'baixar' && sug && sug.entry ? (sug.entry.vinculo === 'processo' ? 'P:' + sug.entry.vinculoId : '') : (lerControles(chave).centro || (sug && sug.centro) || '');
    const pr = c0.startsWith('P:') ? (S.processos || []).find(x => x.id === c0.slice(2)) : null;
    const ref = pr && (brToIso2(pr.saida) || brToIso2(pr.logEmbarque));
    if (ref && diasEntre(ref, l.data) > 90 && l.data > ref) {
      if (!await uiConfirm(`Este pagamento é de ${isoToBr(l.data)}, mas o ${pr.id} embarcou/saiu em ${isoToBr(ref)} (${Math.round(diasEntre(ref, l.data))} dias antes). Tem certeza que é deste processo?`, 'Confira o processo', 'Sim, é deste processo', 'Cancelar')) return;
    }
  }
  try {
    if (modo === 'baixar' && sug && sug.acao === 'baixarGrupo') {
      const data = isoToBr(l.data);
      sug.grupo.parts.forEach(({ p, campo }) => {
        p.docs = p.docs || {};
        p.docs._costBanco = p.docs._costBanco || {}; p.docs._costBanco[campo] = l.chave;
        p.docs._costData = p.docs._costData || {}; p.docs._costData[campo] = data;
        p.docs._costComp = p.docs._costComp || {}; if (!p.docs._costComp[campo]) p.docs._costComp[campo] = sug.grupo.url;
        p[campo + '_status'] = 'Pago';
      });
      const c1 = sug.grupo.parts[0].campo;
      l.status = 'conciliado'; l.lancId = 'grupo:' + sug.grupo.parts.map(x => x.p.id + '/' + x.campo).join(',');
      l.categoria = PROCESS_COST_FIELDS[c1] || l.categoria; l.centro = [...new Set(sug.grupo.parts.map(x => 'P:' + x.p.id))].join(' ');
    } else if (modo === 'baixar' && sug && sug.acao === 'baixar') {
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
      if (c.fixa && typeof marcarComoFixa === 'function') await marcarComoFixa(l);
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
  try { r.criadoPor = JSON.parse(sessionStorage.getItem('oficial:erp-user') || '{}').email || ''; } catch (e) {}
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
  if (typeof corrigirFaturasDigitadas === 'function' && corrigirFaturasDigitadas()) { try { await saveToSheets(); } catch (e) {} }
  const ct = contratosCambio()[gr.contrato];
  // contrato que paga faturas de processos ainda não criados: não reparte (o valor iria todo para os que existem)
  const faltam = ct && ct.todas ? ct.todas.filter(id => !(S.processos || []).some(p => p.id === id)) : [];
  if (faltam.length) { if (!silencioso) showToast('Crie antes o processo ' + faltam.join(', ') + ' — este câmbio também paga a fatura dele'); return false; }
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
  // o banco credita uma linha por fatura (USD da fatura × taxa do contrato): liga cada linha ao seu processo
  const taxa = ct && Number(ct.taxa);
  const linhaDe = {};
  if (taxa && faturas.length > 1 && gr.linhas.length === faturas.length && faturas.every(f => f.usd > 0)) {
    const livres = gr.linhas.slice();
    const ok = faturas.every(f => {
      const esperado = f.usd * taxa;
      let melhor = -1, dif = Infinity;
      livres.forEach((l, i) => { const d = Math.abs(l.valor - esperado); if (d < dif) { dif = d; melhor = i; } });
      if (melhor < 0 || dif > Math.max(1, esperado * 0.002)) return false;
      linhaDe[f.processo] = livres.splice(melhor, 1)[0];
      return true;
    });
    if (!ok) {
      // o extrato manda: uma linha por fatura mesmo com a taxa diferente → maior USD com a maior linha
      Object.keys(linhaDe).forEach(k => delete linhaDe[k]);
      const ls = gr.linhas.slice().sort((a, b) => b.valor - a.valor);
      faturas.slice().sort((a, b) => b.usd - a.usd).forEach((f, i) => { linhaDe[f.processo] = ls[i]; });
    }
  }
  faturas.forEach(f => {
    const minha = linhaDe[f.processo];
    const reais = minha ? minha.valor : Math.round(gr.total * parte(f) * 100) / 100;
    const chaves = minha ? minha.chave : gr.linhas.map(l => l.chave).join(',');
    const ja = (S.lancamentos || []).find(x => x.categoria === 'Câmbio' && x.vinculoId === f.processo && !(x.docs && x.docs._banco)
      && x.docs && x.docs._cambio && String(x.docs._cambio.contrato) === String(gr.contrato));
    if (ja) {
      // o banco é a verdade: valor e data do extrato; o contrato fica como comprovante
      ja.valor = reais; ja.data = isoToBr(gr.data); ja.status = 'Pago';
      ja.docs._banco = chaves; ja.observacao = 'Extrato: LIQ EXPORT ' + gr.contrato + (ct && ct.referencia ? ' · contrato ' + ct.referencia : '');
    }
    const obj = ja || {
      id: genId(), tipo: 'Receita', status: 'Pago', descricao: `Câmbio contrato ${gr.contrato} — ${f.processo}` + (f.usd ? ` (USD ${fmt(f.usd)})` : ''),
      valor: reais, data: isoToBr(gr.data), empresa: '', categoria: 'Câmbio', vinculo: 'processo', vinculoId: f.processo,
      observacao: 'Extrato: LIQ EXPORT ' + gr.contrato + (ct && ct.referencia ? ' · contrato ' + ct.referencia : ''), docs: { _banco: chaves, _cambio: { contrato: gr.contrato, usd: f.usd, taxa: ct ? ct.taxa : null }, comprovante: ct ? ct.url : '' },
    };
    if (!ja) S.lancamentos.unshift(obj);
    const pr = (S.processos || []).find(x => x.id === f.processo);
    if (pr && typeof cambioPeloBanco === 'function') cambioPeloBanco(pr, gr.contrato, reais, gr.data);
    logAction('criar', 'EXTRATO_CAIXA', obj.id, `Câmbio ${gr.contrato} → ${f.processo} R$ ${reais.toFixed(2)}`);
  });
  // tarifa do câmbio: fica no Câmbio (despesa da empresa), fora do custo dos processos
  if (tarifa && !(S.lancamentos || []).some(x => x.categoria === 'Tarifa de câmbio' && String(x.descricao || '').includes(String(gr.contrato)))) {
    S.lancamentos.unshift({
      id: genId(), tipo: 'Despesa', status: 'Pago', descricao: `Tarifa de câmbio ${gr.contrato} (${faturas.map(f => f.processo).join(' + ')})`,
      valor: Math.round(tarifa * 100) / 100, data: isoToBr(gr.data), empresa: 'ITAU UNIBANCO', categoria: 'Tarifa de câmbio',
      vinculo: 'avulso', vinculoId: 'ADM', observacao: 'Extrato: TAR CAMB REC RECURS', docs: { _banco: gr.tarifas.map(l => l.chave).join(','), _cambio: { contrato: gr.contrato, processos: faturas.map(f => f.processo) } },
    });
  }
  const procDaLinha = l => { const f = faturas.find(x => linhaDe[x.processo] === l); return f ? 'P:' + f.processo : faturas.map(x => 'P:' + x.processo).join(' '); };
  [...gr.linhas, ...gr.tarifas].forEach(l => { l.status = 'conciliado'; l.lancId = 'cambio:' + gr.contrato; l.categoria = l.valor > 0 ? 'Câmbio' : 'Tarifa de câmbio'; l.centro = l.valor > 0 ? procDaLinha(l) : 'ADM'; });
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
    if (sug && (sug.acao === 'baixar' || sug.acao === 'baixarGrupo') && sug.unico && await conciliarLinha(l.chave, 'baixar', true)) r.baixas++;
  }
  // reembolso ao sócio: PIX da empresa para o sócio que fecha (somando do mais antigo) despesas pagas no cartão pessoal
  r.reembolsos = 0;
  const abertos = typeof reembolsosAbertos === 'function' ? reembolsosAbertos().slice().sort((a, b) => (brToIso(a.data) || '').localeCompare(brToIso(b.data) || '')) : [];
  if (abertos.length) {
    let nomeUser = ''; try { nomeUser = (JSON.parse(sessionStorage.getItem('oficial:erp-user') || '{}').name) || ''; } catch (e) {}
    const socio = [...new Set(semAcentoF(nomeUser + ' KLISMANN').split(/\s+/).filter(w => w.length >= 4))];
    for (const l of B.linhas.filter(x => x.status === 'pendente' && x.valor < 0)) {
      const txt = semAcentoF(l.favorecido + ' ' + l.memo);
      if (!socio.some(w => txt.includes(w))) continue;
      const alvo = Math.abs(l.valor); let soma = 0; const usados = [];
      for (const a of abertos) { if (a.status === 'Pago') continue; if (soma + a.valor > alvo + 0.01) continue; soma = Math.round((soma + a.valor) * 100) / 100; usados.push(a); if (Math.abs(soma - alvo) < 0.01) break; }
      if (!usados.length || Math.abs(soma - alvo) >= 0.01) continue;
      usados.forEach(a => { a.status = 'Pago'; a.docs._banco = l.chave; a.observacao = (a.observacao || '') + ' · reembolsado em ' + isoToBr(l.data); });
      l.status = 'conciliado'; l.lancId = 'reembolso:' + usados.map(a => a.id).join(','); l.categoria = 'Reembolso ao sócio'; l.centro = 'ADM';
      r.reembolsos++;
    }
  }
  // regra do banco com categoria E centro definidos (tarifas, seguros, regras aprendidas para ADM)
  r.regras = 0;
  for (const l of B.linhas.filter(x => x.status === 'pendente' && !/^RENDIMENTOS/i.test(x.memo) && x.categoria && x.centro && !x.contrato)) {
    // tem comprovante ou lançamento candidato (mesmo valor): fica para você decidir, a regra não cria outro lançamento
    const sg = sugestaoLinha(l); if (sg && (sg.acao === 'baixar' || sg.acao === 'baixarGrupo' || sg.comp)) continue;
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
  const k8 = idLinha;

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
          <div style="font-size:10.5px;color:var(--muted)">${isoToBr(l.data)}${/^0*237-/.test(String(l.conta || '')) ? ' · <b style="color:#CC092F">Bradesco</b>' : ''} · ${escHtml(l.memo)}</div>
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
          <span style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--muted2);display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="bc-reg-${k}" style="width:auto">Sempre classificar ${l.documento ? 'este CNPJ/CPF' : 'este favorecido'} assim</label>
          ${l.valor < 0 ? `<label style="font-size:11px;color:var(--muted2);display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="bc-fix-${k}" style="width:auto">Despesa fixa (repete todo mês)</label>` : ''}
          </span>
          <span style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-xs" onclick="ignorarLinha('${escHtml(l.chave)}')">Ignorar</button>
            ${sug && (sug.acao === 'baixar' || sug.acao === 'baixarGrupo') ? `<button class="btn btn-success btn-xs" onclick="conciliarLinha('${escHtml(l.chave)}','baixar')">Dar baixa</button>` : ''}
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
      <button class="btn btn-secondary btn-sm" style="border-color:var(--green);color:var(--green)" onclick="conciliarAutomatico()">⚡ Conciliar automático</button>
      <button class="btn btn-secondary btn-sm" onclick="abrirRelCambio()">🏦 Relatório de câmbio (DU-E)</button>
    </div>
    <input type="file" id="ofx-file" hidden onchange="importarOFX(this.files[0]);this.value=''">
  </div>
  ${S._relCambio ? blocoRelCambio() : ''}
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
  ${B.carregado && !B.linhas.length ? `<div class="card" style="text-align:center;padding:30px;color:var(--muted)">Nenhum extrato importado ainda. Baixe o OFX no app do Itaú ou do Bradesco e toque em "Importar extrato OFX".</div>` : ''}
  ${typeof blocoFixos === 'function' && B.carregado ? `<div style="margin-top:18px">${blocoFixos()}</div>` : ''}`;
}

// ── Clientes & Resultado ────────────────────────────────────
const EMBARCADOS = ['Embarcado', 'No Destino', 'Concluído'];

function resultadoProcesso(p) {
  const es = buildAllEntries({ filtroProcessoId: p.id }).filter(e => e.status !== 'Cancelado');
  const cambioLanc = es.filter(e => e.tipo === 'Receita' && e.categoria === 'Câmbio' && !e._computed);
  const cambioAuto = es.filter(e => e.tipo === 'Receita' && e._computed);
  const reaisCambio = cambioLanc.length ? cambioLanc.reduce((a, e) => a + (Number(e.valor) || 0), 0) : cambioAuto.reduce((a, e) => a + (Number(e.valor) || 0), 0);
  const usdCambio = cambioLanc.reduce((a, e) => a + ((e.docs && e.docs._cambio && Number(e.docs._cambio.usd)) || 0), 0) || (cambioLanc.length ? 0 : Number(p.cambioRecebido) || 0);
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

async function conciliarAutomatico() {
  const B = S.banco;
  if (!B.linhas.some(l => l.status === 'pendente')) { showToast('Nada pendente para conciliar'); return; }
  if (!await uiConfirm('Conciliar sozinho só o que tem prova:\n• câmbio com o contrato anexado\n• pagamento com comprovante/custo do mesmo valor (um só candidato)\n• tarifas e regras com categoria e centro definidos\n• rendimentos do mês\n\nO resto continua pendente para você decidir.', 'Conciliar automático', 'Conciliar', 'Cancelar')) return;
  showSyncIndicator('Conciliando...');
  try {
    const r = await autoConciliar();
    B.msg = { tipo: 'ok', texto: `Conciliação automática: ${r.cambio} câmbio(s), ${r.baixas} pagamento(s) ligados a comprovantes/custos, ${r.regras} tarifa(s)/regra(s), ${r.rendimentos} mês(es) de rendimento${r.reembolsos ? `, ${r.reembolsos} reembolso(s) ao sócio` : ''}. ${r.pendentes} linha(s) continuam pendentes.` };
  } catch (e) { B.msg = { tipo: 'erro', texto: 'Erro na conciliação automática: ' + (e.message || e) }; }
  hideSyncIndicator(); render();
}


// ═══════════════════════════════════════════════════════════════
// Relatório de câmbio para o banco (pendências documentais do Itaú):
// cada contrato com os processos que ele paga, a DU-E e a chave de acesso de cada um.
// Tudo vem do contrato de câmbio e da DU-E anexados — nada é digitado.
// ═══════════════════════════════════════════════════════════════
function contratosParaBanco() {
  const m = {};
  (S.processos || []).forEach(p => (((p.docs || {})._files || {}).comprovantes || []).forEach(f => {
    const c = f.cambio; if (!c || !c.referencia) return;
    const r = m[c.referencia] = m[c.referencia] || { referencia: c.referencia, data: c.data || '', liquidacao: c.liquidacao || '', embarque: c.embarque || '', modalidade: c.modalidade || '', usd: Number(c.usdTotal) || 0, faturas: (c.faturas || []).map(x => x.processo), arquivo: f };
    ['liquidacao', 'embarque', 'modalidade'].forEach(k => { if (!r[k] && c[k]) r[k] = c[k]; });
    if (!r.faturas.length && !r.faturas.includes(p.id)) r.faturas.push(p.id);
  }));
  return Object.values(m).map(r => {
    const procs = r.faturas.map(id => (S.processos || []).find(p => p.id === id) || { id });
    const faltaDue = procs.filter(p => !p.dueNumero).map(p => p.id);
    return { ...r, modalidade: r.modalidade || 'PAEX', liquidacao: r.liquidacao || r.data, procs, faltaDue,
      processos: r.faturas.join(' + '), dues: procs.map(p => p.dueNumero || '—').join(' / '), chaves: procs.map(p => p.dueChave || '—').join(' / ') };
  }).sort((a, b) => (brToIso(b.data) || '').localeCompare(brToIso(a.data) || ''));
}
// contratos anexados antes desta versão: relê o PDF para pegar liquidação e previsão de embarque
async function completarContratosAntigos() {
  let mudou = 0;
  for (const r of contratosParaBanco().filter(x => !x.embarque && x.arquivo && x.arquivo.id)) {
    try {
      const c = lerCambio(await pdfTexto(await driveDownload(r.arquivo.id)));
      if (!c) continue;
      (S.processos || []).forEach(p => (((p.docs || {})._files || {}).comprovantes || []).forEach(f => {
        if (f.cambio && f.cambio.referencia === r.referencia) { f.cambio.liquidacao = c.liquidacao; f.cambio.embarque = c.embarque; f.cambio.modalidade = c.modalidade; mudou++; }
      }));
    } catch (e) { console.warn('reler contrato', r.referencia, e.message); }
  }
  if (mudou) { try { await saveToSheets(); } catch (e) {} }
  return mudou;
}
async function abrirRelCambio() {
  S._relCambio = { sel: null, carregando: true }; render();
  await completarContratosAntigos();
  const lista = contratosParaBanco();
  S._relCambio = { sel: Object.fromEntries(lista.map(r => [r.referencia, true])), carregando: false };
  render();
}
const COLS_BANCO = ['Modalidade', 'Número Bacen', 'Dt. Contrato', 'Dt. Liquidação', 'Dt. Prev. Embarque', 'Moeda', 'Valor do Contrato', 'Saldo do Contrato', 'Nº processo', 'Número da DI / RE / DUE', 'Chave de Acesso (DUE)', 'Valor a Aplicar', 'Nº último Protocolo DI (para Importação)', 'CNPJ de registro DI (Importação)'];
const linhaBanco = r => [r.modalidade, r.referencia, r.data, r.liquidacao, r.embarque || '', '220', fmt(r.usd), fmt(r.usd), r.processos, r.dues, r.chaves, fmt(r.usd), 'Não se aplica', 'Não se aplica'];
function selecionadosBanco() { const R = S._relCambio || {}; return contratosParaBanco().filter(r => R.sel && R.sel[r.referencia]); }
async function copiarRelCambio() {
  const rows = selecionadosBanco(); if (!rows.length) { showToast('Marque pelo menos um contrato'); return; }
  const td = 'style="border:1px solid #999;padding:3px 6px;font:11px Arial;white-space:nowrap"';
  const html = `<table style="border-collapse:collapse"><tr>${COLS_BANCO.map(c => `<th ${td.replace('font:11px', 'font:bold 11px')} bgcolor="#cfe2f3">${c}</th>`).join('')}</tr>${rows.map(r => `<tr>${linhaBanco(r).map(v => `<td ${td}>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</table>`;
  const tsv = [COLS_BANCO].concat(rows.map(linhaBanco)).map(l => l.join('\t')).join('\n');
  try {
    if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
    else await navigator.clipboard.writeText(tsv);
    showToast('✅ Tabela copiada — cole na resposta do e-mail do banco');
  } catch (e) { showToast('⚠️ Não consegui copiar: ' + e.message); }
}
function baixarRelCambio() {
  const rows = selecionadosBanco(); if (!rows.length) { showToast('Marque pelo menos um contrato'); return; }
  const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = '﻿' + [COLS_BANCO].concat(rows.map(linhaBanco)).map(l => l.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'Pendencias cambio Itau ' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}
function blocoRelCambio() {
  const R = S._relCambio;
  if (R.carregando) return `<div class="card" style="padding:16px;font-size:13px;color:var(--muted)">⏳ Montando o relatório de câmbio…</div>`;
  const lista = contratosParaBanco();
  const n = lista.filter(r => R.sel[r.referencia]).length;
  return `<div class="card" style="padding:16px;margin-bottom:14px;border-left:3px solid var(--accent)">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
      <div><div style="font-weight:700;font-size:15px">🏦 Relatório de câmbio para o banco</div>
      <div style="font-size:12px;color:var(--muted2)">Contratos de câmbio com o processo, a DU-E e a chave de acesso de cada exportação. Marque os que o banco pediu.</div></div>
      <button class="btn btn-secondary btn-xs" onclick="S._relCambio=null;render()">Fechar</button></div>
    ${lista.length ? `<div style="overflow-x:auto;margin-top:10px"><table style="border-collapse:collapse;font-size:12px;min-width:640px;width:100%">
      <tr style="text-align:left;color:var(--muted2)"><th style="padding:6px"></th><th style="padding:6px">Contrato</th><th style="padding:6px">Data</th><th style="padding:6px">Prev. emb.</th><th style="padding:6px">USD</th><th style="padding:6px">Processos</th><th style="padding:6px">DU-E</th><th style="padding:6px">Chave</th></tr>
      ${lista.map(r => `<tr style="border-top:1px solid var(--border)">
        <td style="padding:6px"><input type="checkbox" style="width:auto" ${R.sel[r.referencia] ? 'checked' : ''} onchange="S._relCambio.sel['${r.referencia}']=this.checked;render()"></td>
        <td style="padding:6px;font-family:'JetBrains Mono',monospace">${escHtml(r.referencia)}</td><td style="padding:6px">${escHtml(r.data)}</td><td style="padding:6px">${escHtml(r.embarque || '—')}</td><td class="num" style="padding:6px">${fmt(r.usd)}</td>
        <td style="padding:6px">${r.procs.map(p => `<b>${escHtml(p.id)}</b>`).join(' + ')}</td>
        <td style="padding:6px;font-family:'JetBrains Mono',monospace;${r.faltaDue.length ? 'color:var(--yellow)' : ''}">${escHtml(r.dues)}</td><td style="padding:6px;font-family:'JetBrains Mono',monospace">${escHtml(r.chaves)}</td></tr>
        ${r.faltaDue.length ? `<tr><td style="padding:6px"></td><td colspan="7" style="font-size:11.5px;color:var(--yellow);padding:0 6px 6px">Falta a DU-E de ${escHtml(r.faltaDue.join(', '))} — anexe o extrato da DU-E na Caixa de Entrada</td></tr>` : ''}`).join('')}
    </table></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" style="min-height:42px" onclick="copiarRelCambio()" ${n ? '' : 'disabled'}>📋 Copiar tabela (${n}) para o e-mail</button><button class="btn btn-secondary btn-sm" style="min-height:42px" onclick="baixarRelCambio()" ${n ? '' : 'disabled'}>⬇️ Baixar planilha</button></div>`
    : '<div style="font-size:13px;color:var(--muted2);margin-top:10px">Nenhum contrato de câmbio anexado ainda.</div>'}
  </div>`;
}

function semAcentoF(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
