/* ═══════════════════════════════════════════════════════════
 * Fu Song ERP — Melhorias (12/10/2026)
 * 1. Teste: "Atualizar com os dados oficiais" (copia a planilha oficial para a de testes)
 * 2. Cópia de segurança diária da planilha (guarda as 30 últimas) + botão manual
 * 3. Dividir um câmbio entre processos (tela)
 * 5. Conferência de documentos: contrato × BL (containers), DU-E × invoice (peso e VMLE)
 * 6. Pacote do contador: pasta do mês com atalhos dos documentos + resumo em CSV
 * 7. Texto de cobrança por cliente (inglês) para câmbio em aberto
 * (4. Bradesco OFX fica em ofx.js; 8. resumo semanal é uma tarefa agendada fora do site)
 * ═══════════════════════════════════════════════════════════ */

const PLANILHA_OFICIAL = '1JYKfcws3T9839njEjlYAT9v3NKpHNG0G9psK5uF-qf4';
const ehTeste = () => !!(window.ERP_ENV && ERP_ENV.nome === 'teste');
const isoDe = s => { s = String(s || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const idDoArquivo = url => { const m = String(url || '').match(/\/d\/([\w-]{10,})/) || String(url || '').match(/[?&]id=([\w-]{10,})/); return m ? m[1] : ''; };
const ehProcessoS = p => /^FS\d{6}S$/.test(p.id) && (S.processos || []).some(q => q.id === p.id.slice(0, -1));
function nomeUsuario() { try { return (JSON.parse(sessionStorage.getItem('teste:erp-user') || '{}').name) || ''; } catch (e) { return ''; } }
async function emLotes(itens, n, fn) { const out = []; for (let i = 0; i < itens.length; i += n) out.push(...await Promise.all(itens.slice(i, i + n).map(fn))); return out; }

// ── 1. TESTE ← OFICIAL ──────────────────────────────────────
async function atualizarTesteComOficial() {
  if (!ehTeste()) return;
  if (!await uiConfirm('Os dados do TESTE serão substituídos por uma cópia dos dados oficiais de agora (todas as abas).\n\nO oficial não é alterado — só é lido. Depois a página recarrega.', 'Atualizar teste com os dados oficiais', 'Atualizar', 'Cancelar')) return;
  showSyncIndicator('Copiando os dados oficiais...');
  try {
    await getAccessToken(); await ensureTestSheet();
    if (SHEET_ID === PLANILHA_OFICIAL) throw new Error('planilha de testes igual à oficial');
    const meta = await sheetsAPI('GET', `/${PLANILHA_OFICIAL}?fields=sheets.properties.title`);
    const abas = meta.sheets.map(s => s.properties.title);
    const vals = await sheetsAPI('GET', `/${PLANILHA_OFICIAL}/values:batchGet?${abas.map(t => 'ranges=' + encodeURIComponent(`'${t}'`)).join('&')}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    const metaT = await sheetsAPI('GET', `/${SHEET_ID}?fields=sheets.properties.title`);
    const tem = new Set(metaT.sheets.map(s => s.properties.title));
    const faltam = abas.filter(t => !tem.has(t));
    if (faltam.length) await sheetsAPI('POST', `/${SHEET_ID}:batchUpdate`, { requests: faltam.map(t => ({ addSheet: { properties: { title: t } } })) });
    await sheetsAPI('POST', `/${SHEET_ID}/values:batchClear`, { ranges: abas.map(t => `'${t}'`) });
    const data = (vals.valueRanges || []).map((vr, i) => ({ range: `'${abas[i]}'!A1`, values: vr.values || [] })).filter(d => d.values.length);
    if (data.length) await sheetsAPI('POST', `/${SHEET_ID}/values:batchUpdate`, { valueInputOption: 'RAW', data });
    try { localStorage.removeItem('teste:erp-local-backup'); } catch (e) {}
    hideSyncIndicator();
    showToast(`✅ Teste atualizado: ${data.length} aba(s) copiadas do oficial`);
    setTimeout(() => location.reload(), 900);
  } catch (e) { hideSyncIndicator(); showToast('⚠️ Não foi possível copiar: ' + (e.message || e)); }
}

// ── 2. CÓPIA DE SEGURANÇA ───────────────────────────────────
const PASTA_COPIAS = '💾 Cópias de segurança';
const MAX_COPIAS = 30;
async function copiaDeSeguranca(manual) {
  await ensureTestSheet();
  const pasta = await getTesteFolder(PASTA_COPIAS);
  const hoje = hojeISO();
  const base = `ERP ${ehTeste() ? 'TESTE' : 'oficial'} — cópia ${hoje}`;
  const lista = await driveAPI('GET', '/files', null, 'q=' + encodeURIComponent(`'${pasta}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`) + '&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=200');
  const fs = lista.files || [];
  if (!manual && fs.some(f => f.name.startsWith(base))) return { ja: true, pasta };
  const nome = manual ? base + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : base;
  const nova = await driveAPI('POST', '/files/' + SHEET_ID + '/copy', { name: nome, parents: [pasta] }, 'fields=id,name');
  // guarda as 30 mais novas; as antigas vão para a lixeira do Drive (não são apagadas de vez)
  const velhas = fs.slice(MAX_COPIAS - 1);
  for (const f of velhas) { try { await driveAPI('PATCH', '/files/' + f.id, { trashed: true }, 'fields=id'); } catch (e) {} }
  try { localStorage.setItem('teste:copia-dia', hoje); } catch (e) {}
  return { nova, pasta, removidas: velhas.length };
}
async function copiaManual() {
  showSyncIndicator('Fazendo cópia de segurança...');
  try { const r = await copiaDeSeguranca(true); hideSyncIndicator(); showToast(`✅ Cópia de segurança feita (${PASTA_COPIAS}${r.removidas ? `; ${r.removidas} antiga(s) para a lixeira` : ''})`); }
  catch (e) { hideSyncIndicator(); showToast('⚠️ Cópia não feita: ' + (e.message || e)); }
}
// oficial: uma cópia por dia, na primeira abertura do dia (depois que os dados carregaram)
let _copiaAuto = false;
function agendarCopiaDiaria() {
  if (ehTeste() || _copiaAuto) return;
  const t = setInterval(async () => {
    if (_copiaAuto) { clearInterval(t); return; }
    if (!window._sheetsToken || !(S.processos || []).length) return;
    let dia = ''; try { dia = localStorage.getItem('teste:copia-dia') || ''; } catch (e) {}
    _copiaAuto = true; clearInterval(t);
    if (dia === hojeISO()) return;
    try { const r = await copiaDeSeguranca(false); if (r && r.nova) console.info('Cópia de segurança do dia feita'); } catch (e) { console.warn('cópia diária', e); _copiaAuto = false; }
  }, 20000);
}
agendarCopiaDiaria();

// ── 3. DIVIDIR CÂMBIO ENTRE PROCESSOS ───────────────────────
function contratosDeCambio() {
  const m = {};
  (S.processos || []).forEach(p => (((p.docs || {})._files || {}).comprovantes || []).forEach(f => {
    const c = f.cambio; if (!c || !c.referencia) return;
    const x = m[c.referencia] = m[c.referencia] || { ref: c.referencia, usd: Number(c.usdTotal) || 0, data: c.data || '', contrato: c.contratoExtrato || '', faturas: {} };
    (c.faturas || []).forEach(ft => { if (ft.processo) x.faturas[ft.processo] = Number(ft.usd) || 0; });
    if (!(c.faturas || []).length) x.faturas[p.id] = Number(c.usdFatura) || x.usd;
  }));
  return Object.values(m).sort((a, b) => (isoDe(b.data) || '').localeCompare(isoDe(a.data) || ''));
}
function dividirCambioUI(procId) {
  const todos = contratosDeCambio();
  if (!todos.length) { uiAlert('Nenhum contrato de câmbio anexado ainda.'); return; }
  const doProc = todos.filter(c => procId && c.faturas[procId] != null);
  const ini = (doProc[0] || todos[0]).ref;
  const ids = (S.processos || []).filter(p => p.status !== 'Cancelado' && !ehProcessoS(p)).map(p => p.id).sort().reverse();
  _uiCloseModal();
  const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay';
  const optsProc = sel => `<option value="">—</option>` + ids.map(id => `<option ${id === sel ? 'selected' : ''}>${escHtml(id)}</option>`).join('');
  const linhaHtml = (id, v) => `<div class="dc-linha" style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px"><select class="dc-proc" aria-label="Processo">${optsProc(id)}</select><input class="dc-usd" inputmode="decimal" placeholder="USD da invoice" value="${v === '' ? '' : String(v).replace('.', ',')}" aria-label="Valor em dólar"><button class="btn btn-secondary btn-xs" type="button" onclick="this.parentNode.remove()" aria-label="Remover">✕</button></div>`;
  // valor sugerido: a divisão já guardada; senão o valor da invoice de cada processo
  const sugerido = (c, id, v) => { const g = (mapaCambioGuardado().find(x => x.ref === c.ref) || {}).pesos; if (g && g[id] != null) return g[id]; const p = (S.processos || []).find(x => x.id === id); return (p && (Number(p.docs && p.docs._invoiceUsd) || Number(p.cambioInvoice))) || v; };
  const linhas = c => { const fs = Object.entries(c.faturas).map(([id, v]) => [id, c.ref ? sugerido(c, id, v) : v]); while (fs.length < 2) fs.push(['', '']); return fs.map(([id, v]) => linhaHtml(id, v)).join(''); };
  const desenhar = ref => {
    const c = todos.find(x => x.ref === ref) || todos[0];
    modal.innerHTML = `<div class="modal" style="max-width:520px;width:94%">
      <div class="modal-title">Dividir câmbio entre processos</div>
      <label style="font-size:12px;color:var(--muted2)">Contrato de câmbio</label>
      <select id="dc-ref" style="width:100%;margin:4px 0 10px">${todos.map(x => `<option value="${escHtml(x.ref)}" ${x.ref === c.ref ? 'selected' : ''}>${escHtml(x.ref)} · USD ${fmt(x.usd)}${x.data ? ' · ' + escHtml(x.data) : ''} · ${escHtml(Object.keys(x.faturas).join(' + '))}</option>`).join('')}</select>
      <div style="font-size:12.5px;color:var(--muted2);margin-bottom:8px">Valor recebido: <b>USD ${fmt(c.usd)}</b>. Informe o valor da invoice de cada processo; a diferença (tarifa do banco intermediário) é dividida na mesma proporção.</div>
      <div id="dc-linhas">${linhas(c)}</div>
      <button class="btn btn-secondary btn-xs" type="button" id="dc-mais">+ processo</button>
      <div id="dc-soma" style="font-size:12.5px;margin:10px 0;color:var(--muted2)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-secondary" id="dc-cancelar">Cancelar</button><button class="btn btn-primary" id="dc-ok">Salvar divisão</button></div></div>`;
    const somar = () => { const v = [...modal.querySelectorAll('.dc-usd')].reduce((a, i) => a + (numBR(i.value) || 0), 0); const dif = c.usd - v; modal.querySelector('#dc-soma').innerHTML = `Soma das invoices: USD ${fmt(v)}${v ? (Math.abs(dif) < 0.01 ? ' · igual ao recebido' : ` · ${dif > 0 ? 'sobra' : 'falta'} USD ${fmt(Math.abs(dif))}${Math.abs(dif) <= 120 ? ' (tarifa do intermediário)' : ''}`) : ''}`; };
    modal.querySelector('#dc-ref').onchange = e => desenhar(e.target.value);
    modal.querySelector('#dc-mais').onclick = () => { modal.querySelector('#dc-linhas').insertAdjacentHTML('beforeend', linhaHtml('', '')); };
    modal.querySelector('#dc-linhas').oninput = somar; somar();
    modal.querySelector('#dc-cancelar').onclick = () => _uiCloseModal();
    modal.querySelector('#dc-ok').onclick = async () => {
      const pesos = {}; [...modal.querySelectorAll('.dc-linha')].forEach(l => { const id = l.querySelector('.dc-proc').value, v = numBR(l.querySelector('.dc-usd').value) || 0; if (id && v > 0) pesos[id] = Math.round(((pesos[id] || 0) + v) * 100) / 100; });
      if (!Object.keys(pesos).length) { showToast('Escolha ao menos um processo com valor'); return; }
      _uiCloseModal();
      await salvarDivisaoCambio(c.ref, pesos);
    };
  };
  document.body.appendChild(modal); desenhar(ini);
}
async function salvarDivisaoCambio(ref, pesos) {
  showSyncIndicator('Dividindo o câmbio...');
  try {
    if (typeof carregarBanco === 'function' && !(S.banco && S.banco.carregado)) await carregarBanco();
    const processos = Object.keys(pesos);
    S.banco.regras = (S.banco.regras || []).filter(r => !(r.tipo === 'cambioProc' && r.valor === ref));
    S.banco.regras.push({ id: genId(), tipo: 'cambioProc', valor: ref, categoria: processos.join('+'), centro: JSON.stringify(pesos), criadoEm: new Date().toISOString(), criadoPor: nomeUsuario() });
    await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras);
    const n = aplicarMapaCambio([{ ref, processos, pesos }]);
    logAction('editar', 'REGRAS', ref, 'Câmbio dividido: ' + processos.map(id => id + ' USD ' + fmt(pesos[id])).join(' + '));
    await saveToSheets(); try { await salvarBanco(); } catch (e) {}
    hideSyncIndicator(); showToast(n ? '✅ Câmbio dividido: ' + processos.join(' + ') : 'Divisão salva (já estava assim)'); render();
  } catch (e) { hideSyncIndicator(); showToast('⚠️ ' + (e.message || e)); }
}

// ── 5. CONFERÊNCIA DE DOCUMENTOS ────────────────────────────
function divergenciasDocs(p) {
  if (!p || p.status === 'Cancelado' || ehProcessoS(p)) return [];
  const d = p.docs || {}, out = [];
  const cc = Number(d._contratoCont) || 0, bl = ((d._bl && d._bl.containers) || []).filter(Boolean).length;
  if (cc && bl && cc !== bl) out.push(`Sales Contract com ${cc} container(s) e BL com ${bl}`);
  const dues = Object.entries(d._dues || {});
  // DU-E anexada a mais de um processo: não dá para comparar com uma invoice só
  const compartilhada = dues.some(([k]) => (S.processos || []).some(q => q !== p && q.docs && q.docs._dues && q.docs._dues[k]));
  if (dues.length && !compartilhada) {
    const peso = dues.reduce((a, [, x]) => a + (Number(x.peso) || 0), 0), vmle = dues.reduce((a, [, x]) => a + (Number(x.vmle) || 0), 0);
    const kg = (typeof toneladas === 'function' ? toneladas(p) : 0) * 1000;
    if (peso && kg && Math.abs(peso - kg) > Math.max(50, kg * 0.005)) out.push(`DU-E com ${Math.round(peso).toLocaleString('pt-BR')} kg e invoice com ${Math.round(kg).toLocaleString('pt-BR')} kg`);
    const inv = Number(d._invoiceUsd) || Number(p.cambioInvoice) || 0, inc = String(p.incoterm || '').toUpperCase();
    if (vmle && inv) {
      if (/FOB|FCA|EXW/.test(inc) && Math.abs(vmle - inv) > 1) out.push(`VMLE da DU-E (USD ${fmt(vmle)}) diferente da invoice ${inc} (USD ${fmt(inv)})`);
      else if (!/FOB|FCA|EXW/.test(inc) && vmle > inv + 1) out.push(`VMLE da DU-E (USD ${fmt(vmle)}) maior que a invoice (USD ${fmt(inv)})`);
    }
  }
  divergenciasVenda(p).forEach(t => out.push(t));
  return out;
}
// invoice × contrato × BL: 27.000 kg por container, a conta da tabela, campo a campo e a conta bancária
const CONTA_FU_SONG = { agencia: '8262', conta: '00994992' };
const kgBR = n => Math.round(Number(n) || 0).toLocaleString('pt-BR');
function divergenciasVenda(p) {
  const d = p.docs || {}, out = [], inv = d._invoice, ct = d._contrato;
  const temS = (S.processos || []).some(q => q.id === p.id + 'S');   // venda dividida com o processo "S": pesos e containers somam os dois
  const nBl = ((d._bl && d._bl.containers) || []).filter(Boolean).length, nCt = Number(d._contratoCont) || 0;
  if (!temS) {
    const n = nBl || nCt;
    const kgInv = (inv && inv.kg) || 0;
    if (kgInv && n && Math.abs(kgInv - n * KG_POR_CONTAINER) > 1) out.push(`Invoice com ${kgBR(kgInv)} kg, mas ${n} container(s) ${nBl ? 'no BL' : 'no contrato'} = ${kgBR(n * KG_POR_CONTAINER)} kg`);
    if (ct && ct.kg && nCt && Math.abs(ct.kg - nCt * KG_POR_CONTAINER) > 1) out.push(`Sales Contract com ${kgBR(ct.kg)} kg e ${nCt} container(s) (seria ${kgBR(nCt * KG_POR_CONTAINER)} kg)`);
  }
  // a conta da tabela: quantidade × preço por kg = total
  [['Invoice', inv], ['Sales Contract', ct]].forEach(([nome, x]) => {
    if (!x || !x.linhas) return;
    // o preço impresso pode estar arredondado (0,383 de 0,38333…): tolera meia casa do último dígito
    x.linhas.forEach(l => { const c = Math.round(l.kg * l.preco * 100) / 100, tol = Math.max(0.5, l.kg * 0.5 * Math.pow(10, -(l.dec == null ? 2 : l.dec))); if (Math.abs(c - l.total) > tol) out.push(`${nome}: ${kgBR(l.kg)} kg × USD ${String(l.preco).replace('.', ',')} = USD ${fmt(c)}, mas a linha diz USD ${fmt(l.total)}`); });
    const soma = x.linhas.reduce((a, l) => a + l.total, 0);
    if (x.total && Math.abs(soma - x.total) > 0.5) out.push(`${nome}: soma das linhas USD ${fmt(soma)} diferente do total USD ${fmt(x.total)}`);
  });
  // invoice × contrato, campo a campo (o valor total já é conferido à parte)
  if (inv && ct) {
    const nt = s => semAcento(String(s || '')).replace(/[^A-Z0-9%]/g, '');
    if (inv.produto && ct.produto && nt(inv.produto) !== nt(ct.produto)) out.push(`Produto diferente: invoice "${inv.produto}" × contrato "${ct.produto}"`);
    if (inv.kg && ct.kg && Math.abs(inv.kg - ct.kg) > 1) out.push(`Quantidade diferente: invoice ${kgBR(inv.kg)} kg × contrato ${kgBR(ct.kg)} kg`);
    const pi = inv.linhas && inv.linhas[0] && inv.linhas[0].preco, pc = ct.linhas && ct.linhas[0] && ct.linhas[0].preco;
    if (pi && pc && Math.abs(pi - pc) > 0.0001) out.push(`Preço por kg diferente: invoice USD ${String(pi).replace('.', ',')} × contrato USD ${String(pc).replace('.', ',')}`);
    const cidade = s => nt(String(s || '').split(',')[0]);
    if (inv.pod && ct.pod && cidade(inv.pod) !== cidade(ct.pod)) out.push(`Porto de destino diferente: invoice ${inv.pod} × contrato ${ct.pod}`);
    if (inv.containers && nCt && inv.containers !== nCt) out.push(`Containers: invoice ${inv.containers} × contrato ${nCt}`);
  }
  // conta bancária impressa na invoice
  if (inv && inv.conta && (inv.conta.agencia !== CONTA_FU_SONG.agencia || inv.conta.conta !== CONTA_FU_SONG.conta)) out.push(`Invoice com conta bancária diferente da Fu Song (agência ${inv.conta.agencia} / conta ${inv.conta.conta}; o certo é 8262 / 0099499-2)`);
  return out;
}
if (typeof pendenciasProcesso === 'function' && !pendenciasProcesso._div) {
  const _pendBase = pendenciasProcesso;
  pendenciasProcesso = function (p) { const out = _pendBase.apply(this, arguments); try { divergenciasDocs(p).forEach(t => out.push({ tipo: 'doc', texto: t, divergencia: true })); } catch (e) { console.warn('divergências', e); } return out; };
  pendenciasProcesso._div = true;
}
// lê de novo os PDFs de Sales Contract e DU-E já anexados (processos importados antes da conferência existir)
async function conferirDocumentos() {
  const ps = (S.processos || []).filter(p => p.status !== 'Cancelado' && !ehProcessoS(p));
  const tarefas = [];
  ps.forEach(p => {
    const d = p.docs = p.docs || {};
    if (!d._contrato) arquivos(p, 'contrato').filter(f => !/ADEMIR/i.test(semAcento(f.name || ''))).slice(0, 1).forEach(f => tarefas.push({ p, tipo: 'contrato', f }));
    if (!d._invoice) arquivos(p, 'invoice').filter(f => !/ADEMIR/i.test(semAcento(f.name || ''))).slice(0, 1).forEach(f => tarefas.push({ p, tipo: 'invoice', f }));
    arquivos(p, 'due').forEach(f => { const ja = Object.values(d._dues || {}).length && (d._duesLidos || []).includes(idDoArquivo(f.url)); if (!ja) tarefas.push({ p, tipo: 'due', f }); });
  });
  const lidos = tarefas.filter(t => idDoArquivo(t.f.url));
  if (!lidos.length) { showToast('Tudo já conferido'); return; }
  let feitos = 0, erros = 0;
  showSyncIndicator(`Conferindo documentos (0 de ${lidos.length})...`);
  await emLotes(lidos, 3, async t => {
    try {
      const id = idDoArquivo(t.f.url);
      const texto = await pdfTexto(await driveDownload(id));
      if (t.tipo === 'contrato' || t.tipo === 'invoice') {
        const v = lerDocVenda(texto);
        if (v && (!v.numero || v.numero.replace(/S$/, '') === t.p.id.replace(/S$/, ''))) {
          v.contrato = t.tipo === 'contrato';
          guardarDadosVenda(t.p, v);
          if (v.contrato && v.qtdContainer) t.p.docs._contratoCont = Number(v.qtdContainer) || 0;
          if (v.contrato && v.totalUsd && !t.p.docs._contratoUsd) t.p.docs._contratoUsd = v.totalUsd;
          ajustarContainersPelosDocs(t.p);
        }
      } else {
        const it = { tipo: 'due', texto, info: {} }; enriquecerInfo(it);
        if (it.info.vmle || it.info.pesoLiq) { t.p.docs._dues = t.p.docs._dues || {}; t.p.docs._dues[it.info.dueNumero || id] = { vmle: Number(it.info.vmle) || 0, peso: Number(it.info.pesoLiq) || 0 }; }
        t.p.docs._duesLidos = [...new Set([...(t.p.docs._duesLidos || []), id])];
      }
    } catch (e) { erros++; console.warn('conferir', t.p.id, e); }
    feitos++; showSyncIndicator(`Conferindo documentos (${feitos} de ${lidos.length})...`);
  });
  hideSyncIndicator();
  await saveToSheets();
  const div = []; (S.processos || []).forEach(p => divergenciasDocs(p).forEach(t => div.push(p.id + ': ' + t)));
  render();
  await uiAlert(`${feitos - erros} documento(s) lido(s)${erros ? `, ${erros} não puderam ser lidos (imagem ou PDF escaneado)` : ''}.\n\n${div.length ? 'Divergências encontradas:\n• ' + div.join('\n• ') : 'Nenhuma divergência entre invoice, contrato, BL e DU-E.'}`, 'Conferência de documentos');
}

// ── 6. PACOTE DO CONTADOR ───────────────────────────────────
function mesAnterior() { const d = new Date(Date.now() - 3 * 3600e3); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); }
function itensDoMes(mes) {
  const no = s => (isoDe(s) || '').slice(0, 7) === mes, out = [];
  (S.processos || []).forEach(p => {
    Object.entries((p.docs && p.docs._custoDocs) || {}).forEach(([campo, reg]) => {
      (reg.fiscais || []).forEach(d => { if (no(d.data)) out.push({ data: isoDe(d.data), origem: 'Nota/fatura de custo', centro: p.id, descricao: PROCESS_COST_FIELDS[campo] || campo, empresa: d.de || '', valor: -(Number(d.valor) || 0), url: d.url || '' }); });
      (reg.pagos || []).forEach(d => { if (no(d.data)) out.push({ data: isoDe(d.data), origem: 'Comprovante de pagamento', centro: p.id, descricao: PROCESS_COST_FIELDS[campo] || campo, empresa: d.de || '', valor: -(Number(d.valor) || 0), url: d.url || '' }); });
    });
    Object.entries((p.docs && p.docs._cambioDocs) || {}).forEach(([ref, c]) => { if (no(c.data)) out.push({ data: isoDe(c.data), origem: 'Contrato de câmbio', centro: p.id, descricao: `Câmbio ${ref} · USD ${fmt(c.usd)} × ${(Number(c.taxa) || 0).toFixed(4).replace('.', ',')}`, empresa: 'Itaú', valor: Number(c.reais) || 0, url: c.url || '' }); });
    arquivos(p, 'nfeSaida').forEach(f => { if (no(f.data)) out.push({ data: isoDe(f.data), origem: 'NF-e de saída', centro: p.id, descricao: 'NF-e ' + (f.numero || ''), empresa: '', valor: Number(f.valor) || 0, url: f.url || '' }); });
  });
  (S.lancamentos || []).filter(l => l.status !== 'Cancelado' && no(l.data)).forEach(l => {
    const urls = [l.docs && l.docs.comprovante, l.docs && l.docs.nfe, l.docs && l.docs.fatura].filter(Boolean);
    out.push({ data: isoDe(l.data), origem: 'Lançamento · ' + (l.tipo || ''), centro: l.vinculoId || l.vinculo || '', descricao: [l.categoria, l.descricao].filter(Boolean).join(' · '), empresa: l.empresa || '', valor: (l.tipo === 'Despesa' ? -1 : 1) * Math.abs(Number(l.valor) || 0), url: urls[0] || '', urls, status: l.status });
  });
  ((S.banco && S.banco.linhas) || []).filter(l => no(l.data)).forEach(l => out.push({ data: l.data, origem: 'Extrato ' + (/^0*237-/.test(String(l.conta || '')) ? 'Bradesco' : 'Itaú'), centro: l.centro || '', descricao: l.memo, empresa: l.favorecido || '', valor: Number(l.valor) || 0, url: '', status: l.status }));
  return out.sort((a, b) => a.data.localeCompare(b.data));
}
function csvContador(itens) {
  const q = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const linhas = [['Data', 'Origem', 'Processo / centro', 'Descrição', 'Empresa', 'Valor (R$)', 'Situação', 'Documento']].concat(itens.map(x => [isoToBr(x.data), x.origem, x.centro, x.descricao, x.empresa, num(x.valor), x.status || '', x.url]));
  return '﻿' + linhas.map(r => r.map(q).join(';')).join('\r\n');
}
async function pacoteContador(mesDado) {
  const mes = mesDado || await uiPrompt('Mês do pacote (AAAA-MM)', mesAnterior(), 'Pacote do contador');
  if (!mes) return;
  if (!/^\d{4}-\d{2}$/.test(mes)) { showToast('Use o formato AAAA-MM, por exemplo ' + mesAnterior()); return; }
  showSyncIndicator('Montando o pacote do contador...');
  try {
    if (typeof carregarBanco === 'function' && !(S.banco && S.banco.carregado)) await carregarBanco();
    const itens = itensDoMes(mes);
    const raiz = await getTesteFolder('📒 Contador');
    const pasta = await getOrCreateFolder(mes, raiz);
    // atalhos (não copia nem move o arquivo original); refazer o pacote não duplica
    const ja = await driveAPI('GET', '/files', null, 'q=' + encodeURIComponent(`'${pasta}' in parents and trashed=false`) + '&fields=files(id,name,mimeType,shortcutDetails(targetId))&pageSize=1000');
    const alvos = new Set((ja.files || []).map(f => f.shortcutDetails && f.shortcutDetails.targetId).filter(Boolean));
    const nomesJa = new Set((ja.files || []).map(f => f.name));
    const docs = []; itens.forEach(x => (x.urls || [x.url]).forEach(u => { const id = idDoArquivo(u); if (id && !alvos.has(id)) { alvos.add(id); docs.push({ x, id }); } }));
    const san = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    let criados = 0;
    const nomeAtalho = x => san(`${x.data} ${x.centro} ${x.origem} ${x.descricao} R$ ${fmt(Math.abs(x.valor))}`);
    const novos = docs.filter(d => !nomesJa.has(nomeAtalho(d.x)));
    await emLotes(novos, 5, async ({ x, id }) => { try { await driveAPI('POST', '/files', { name: nomeAtalho(x), mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: id }, parents: [pasta] }, 'fields=id'); criados++; } catch (e) { console.warn('atalho', e); } });
    // resumo CSV (abre no Excel); refeito a cada vez
    const nomeCsv = `Resumo ${mes}.csv`;
    for (const f of (ja.files || []).filter(f => f.name === nomeCsv)) { try { await driveAPI('PATCH', '/files/' + f.id, { trashed: true }, 'fields=id'); } catch (e) {} }
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify({ name: nomeCsv, parents: [pasta], mimeType: 'text/csv' })], { type: 'application/json' }));
    fd.append('file', new Blob([csvContador(itens)], { type: 'text/csv' }));
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + await getAccessToken() }, body: fd });
    if (!r.ok) throw new Error('resumo não enviado (' + r.status + ')');
    S._pacote = { mes, url: 'https://drive.google.com/drive/folders/' + pasta, itens: itens.length, atalhos: criados, total: alvos.size };
    logAction('exportar', 'CONTADOR', mes, `${itens.length} itens, ${criados} atalhos novos`);
    hideSyncIndicator(); render();
  } catch (e) { hideSyncIndicator(); showToast('⚠️ Pacote não montado: ' + (e.message || e)); }
}
function blocoPacote() {
  const k = S._pacote; if (!k) return '';
  return `<div class="card" style="padding:12px 14px;border-left:3px solid var(--green);font-size:12.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
    <div>📒 Pacote do contador de <b>${escHtml(k.mes.slice(5) + '/' + k.mes.slice(0, 4))}</b>: ${k.itens} linha(s) no resumo, ${k.total} documento(s) na pasta${k.atalhos < k.total ? ` (${k.atalhos} novos)` : ''}.</div>
    <span style="display:flex;gap:6px"><a class="btn btn-primary btn-xs" style="text-decoration:none" href="${sanitizeUrl(k.url)}" target="_blank" rel="noopener noreferrer">Abrir pasta ↗</a><button class="btn btn-secondary btn-xs" onclick="S._pacote=null;render()">Fechar</button></span></div>`;
}

// ── 7. COBRANÇA POR CLIENTE (inglês) ────────────────────────
function abertosPorCliente() {
  const g = {};
  (S.processos || []).filter(p => p.status !== 'Cancelado' && !ehProcessoS(p) && (EMBARCADOS.includes(p.status) || faseProcesso(p) >= 3)).forEach(p => {
    const inv = Number(p.cambioInvoice) || 0, rec = Number(p.cambioRecebido) || 0, falta = Math.round((inv - rec) * 100) / 100;
    if (!(inv > 0) || falta <= tolIntermediario(p)) return;
    const n = nomeCliente(p); (g[n] = g[n] || { nome: n, itens: [], total: 0 }).itens.push({ p, inv, rec, falta }); g[n].total += falta;
  });
  return Object.values(g).sort((a, b) => b.total - a.total);
}
function textoCobranca(nome) {
  const c = abertosPorCliente().find(x => x.nome === nome); if (!c) return '';
  const us = n => 'USD ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dEn = s => { const d = brParaDate(s); return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; };
  const linhas = c.itens.sort((a, b) => a.p.id.localeCompare(b.p.id)).map(x => {
    const bl = x.p.docs && x.p.docs._bl, emb = dEn(x.p.saida || (bl && bl.embarque));
    return `• Invoice ${x.p.id} — ${us(x.inv)}${emb ? ` — shipped on ${emb}` : ''}${x.p.booking ? ` (booking ${x.p.booking})` : ''}${x.rec ? ` — received ${us(x.rec)}` : ''} — outstanding ${us(x.falta)}`;
  });
  const outros = [...new Set(c.itens.flatMap(x => [x.p.docs && x.p.docs._comprador, x.p.docs && x.p.docs._consignatario]).filter(Boolean))];
  const nomes = [...new Set([...outros, c.nome].map(n => n.trim()))].filter((n, i, a) => a.findIndex(m => semAcento(m).replace(/[^A-Z]/g, '') === semAcento(n).replace(/[^A-Z]/g, '')) === i);
  return `Dear ${nomes.join(' / ')},

I hope you are doing well. According to our records, the following invoice${c.itens.length > 1 ? 's are' : ' is'} still open:

${linhas.join('\n')}

Total outstanding: ${us(c.total)}

Could you please let us know the expected payment date? If the payment has already been sent, kindly share the SWIFT copy (MT103) so we can follow up with our bank.

Thank you very much.

Best regards,
${nomeUsuario() || 'Fu Song'}
FU SONG INSIDE SALES LTDA`;
}
async function copiarCobranca(nome) {
  const t = textoCobranca(nome); if (!t) return;
  try { await navigator.clipboard.writeText(t); showToast('✅ Texto de cobrança copiado'); }
  catch (e) { S._cobrancaVer = nome; render(); showToast('Selecione o texto e copie'); }
}
function blocoCobranca() {
  const cs = abertosPorCliente(); if (!cs.length) return '';
  return `<div class="card" style="padding:14px 16px;border-left:3px solid var(--yellow)">
    <div style="font-weight:800;font-size:14px;margin-bottom:6px">📨 Cobrança de câmbio em aberto</div>
    ${cs.map(c => `<div style="padding:8px 0;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="min-width:0"><div style="font-weight:700;font-size:13px">${escHtml(c.nome)}</div><div style="font-size:11.5px;color:var(--muted2)">${c.itens.map(x => escHtml(x.p.id) + ' · falta USD ' + fmt(x.falta)).join(' · ')}</div></div>
        <span style="display:flex;gap:6px;align-items:center"><b class="num" style="color:var(--yellow)">USD ${fmt(c.total)}</b>
          <button class="btn btn-secondary btn-xs" onclick="copiarCobranca(${escHtml(JSON.stringify(c.nome))})">Copiar texto (inglês)</button>
          <button class="btn btn-secondary btn-xs" onclick="S._cobrancaVer=S._cobrancaVer===${escHtml(JSON.stringify(c.nome))}?null:${escHtml(JSON.stringify(c.nome))};render()">${S._cobrancaVer === c.nome ? 'Esconder' : 'Ver'}</button></span>
      </div>
      ${S._cobrancaVer === c.nome ? `<textarea readonly style="width:100%;min-height:220px;margin-top:8px;font-size:12px;line-height:1.5" onfocus="this.select()">${escHtml(textoCobranca(c.nome))}</textarea>` : ''}
    </div>`).join('')}
  </div>`;
}

// ── Telas: botões novos ─────────────────────────────────────
const botaoFerramenta = (txt, acao, cor) => `<button class="btn btn-secondary btn-sm" style="min-height:40px;${cor ? 'border-color:' + cor + ';color:' + cor : ''}" onclick="${acao}">${txt}</button>`;
if (typeof renderInicio === 'function' && !renderInicio._mel) {
  const base = renderInicio;
  renderInicio = function () {
    const h = base.apply(this, arguments);
    const ferr = `<section style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:24px;display:flex;flex-direction:column;gap:10px">
      <h2 style="margin:0;font-family:'Outfit',sans-serif;font-size:15px">Ferramentas</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${botaoFerramenta('🔎 Conferir documentos', 'conferirDocumentos()')}
        ${botaoFerramenta('📇 Padrões dos fornecedores', 'padroesFornecedores()')}
        ${botaoFerramenta('📒 Pacote do contador', 'pacoteContador()')}
        ${botaoFerramenta('💾 Cópia de segurança agora', 'copiaManual()')}
        ${ehTeste() ? botaoFerramenta('⟳ Atualizar teste com os dados oficiais', 'atualizarTesteComOficial()', '#B45309') : ''}
      </div>
      <div style="font-size:11.5px;color:var(--muted2)">Conferir: Sales Contract × BL (containers) e DU-E × invoice (peso e VMLE). Cópia de segurança: ${ehTeste() ? 'da planilha de testes' : 'a planilha oficial é copiada sozinha uma vez por dia (guarda 30)'} na pasta "${PASTA_COPIAS}".</div>
    </section>`;
    const i = h.lastIndexOf('</div>');
    return i > 0 ? h.slice(0, i) + ferr + h.slice(i) : h + ferr;
  };
  renderInicio._mel = true;
}
if (typeof renderProcesso2 === 'function' && !renderProcesso2._mel) {
  const base = renderProcesso2;
  renderProcesso2 = function () {
    const h = base.apply(this, arguments); const p = S.sub;
    if (!p || !p.id || ehProcessoS(p)) return h;
    const btn = `<button class="btn btn-secondary btn-xs" onclick="dividirCambioUI('${escHtml(p.id)}')">Dividir câmbio entre processos</button>`;
    const div = divergenciasDocs(p);
    const fp = typeof foraDoPadrao === 'function' ? foraDoPadrao(p) : [];
    const aviso = div.length ? `<div style="font-size:12.5px;color:var(--orange);background:rgba(251,146,60,.14);border-radius:8px;padding:8px 10px">⚠️ ${div.map(t => { const x = fp.find(y => t.endsWith(y.texto)); return escHtml(t) + (x ? ` <button class="btn btn-secondary btn-xs" onclick="valorEstaCerto('${escHtml(p.id)}','${x.campo}')">Valor está certo</button>` : ''); }).join('<br>⚠️ ')}</div>` : '';
    let out = h.replace(`font-size:17px">Receita</h2></div>`, `font-size:17px">Receita</h2>${btn}</div>`);
    const cp = p.docs && p.docs._comprador, cs = p.docs && p.docs._consignatario;
    if (cp || cs) {
      const iguais = cp && cs && semAcento(cp).replace(/[^A-Z]/g, '') === semAcento(cs).replace(/[^A-Z]/g, '');
      const linha = iguais || !cs ? `Comprador: ${escHtml(cp)}` : !cp ? `Consignatário: ${escHtml(cs)}` : `Comprador: ${escHtml(cp)} · Consignatário (recebe): ${escHtml(cs)} — o câmbio pode vir de qualquer um dos dois`;
      out = out.replace(`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">`, `<div style="font-size:12.5px;color:#E0E7FF">${linha}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">`);
    }
    if (aviso) out = out.replace(/(font-size:17px">Documentos<\/h2><span style="font-size:12.5px;color:var\(--muted2\)">\d+ de \d+<\/span><\/div>)/, (m) => m + aviso);
    return out;
  };
  renderProcesso2._mel = true;
}
if (typeof renderConciliacao === 'function' && !renderConciliacao._mel) {
  const base = renderConciliacao;
  renderConciliacao = function () {
    const h = base.apply(this, arguments);
    return h.replace(`<button class="btn btn-secondary btn-sm" onclick="abrirRelCambio()">🏦 Relatório de câmbio (DU-E)</button>`,
      `<button class="btn btn-secondary btn-sm" onclick="abrirRelCambio()">🏦 Relatório de câmbio (DU-E)</button>
      <button class="btn btn-secondary btn-sm" onclick="pacoteContador()">📒 Pacote do contador</button>`).replace(`<input type="file" id="ofx-file"`, blocoPacote() + `<input type="file" id="ofx-file"`);
  };
  renderConciliacao._mel = true;
}
if (typeof renderResultados === 'function' && !renderResultados._mel) {
  const base = renderResultados;
  renderResultados = function () {
    const h = base.apply(this, arguments);
    if ((S.resTab || 'clientes') !== 'clientes') return h;
    const i = h.indexOf('<div class="tabs">'); if (i < 0) return h;
    const j = h.indexOf('</div>', i) + 6;
    return h.slice(0, j) + blocoCobranca() + h.slice(j);
  };
  renderResultados._mel = true;
}
// faixa do teste: botão de atualizar
setTimeout(function () {   // depois do carimbo da versão (que reescreve o texto da faixa)
  if (!ehTeste()) return;
  const f = document.getElementById('teste-faixa'); if (!f || f.querySelector('button')) return;
  f.insertAdjacentHTML('beforeend', ` · <button type="button" onclick="atualizarTesteComOficial()" style="background:#fff;color:#B45309;border:none;border-radius:6px;font:700 11px Inter,sans-serif;padding:3px 8px;cursor:pointer">Atualizar com os dados oficiais</button>`);
}, 1200);

// ═══════════════════════════════════════════════════════════════
// 9. CADASTRO ORGANIZADO (12/10/2026, revisado com você)
// Cada um no seu lugar: Fornecedor = produto · Transportadora = frete rodoviário · Despachante ·
// Agente de Carga = frete marítimo · Armazém / terminal · Serviço de Terceiros · Despesas gerais (ADM) = fora dos processos.
// O tipo do cadastro decide em qual custo entra o documento; o CNPJ (da chave da nota ou do comprovante) identifica a empresa.
// ═══════════════════════════════════════════════════════════════
const TIPO_ADM = 'Despesas gerais (ADM)';
const CAMPO_DO_TIPO = { 'Fornecedor': 'custoProduto', 'Transportadora': 'custoFrete', 'Despachante': 'custoDespachante', 'Agente de Carga': 'custoMaritimo', 'Armazém': 'custoArmazem', 'Serviço de Terceiros': 'custoServTerceiros', [TIPO_ADM]: '' };
// [tipo, nome, CNPJ, outros nomes, custo (quando diferente do padrão do tipo)]
const CADASTRO_REVISADO = [
  ['Fornecedor', 'Omar Mineracao', '42.918.857/0001-35', ['Omar Mineração LTDA']],
  ['Fornecedor', 'AWM Mineração (Terra Branca)', '47.170.772/0001-35', ['Mineracao Terra Branca', 'AWM Mineracao', 'AWM Mineracao LTDA']],   // mesma empresa (mesmo CNPJ); nome AWM — decidido em 12/10
  ['Fornecedor', 'Cooperativa Dos Garimpeiros De Novo Horizonte', '13.215.054/0001-16', []],
  ['Fornecedor', 'Mineracao Thomazini', '36.346.393/0001-37', ['Mineracao Thomazini LTDA']],
  ['Fornecedor', 'Cooperativa Mineral Da Bahia - Cmb', '08.020.967/0001-47', []],
  ['Fornecedor', 'Cooperativa Agro Mineral Sem Fronteiras Limitada', '34.060.871/0002-01', []],
  ['Fornecedor', 'Mineracao WL', '54.633.528/0001-27', ['Mineracao WL LTDA']],
  ['Transportadora', 'Italiana Transportes', '46.003.223/0001-03', ['Italiana Tra', 'Italiana Transportes LTDA']],
  ['Despachante', 'Cga - Despachos Aduaneiros LTDA', '09.721.207/0001-20', ['Cga Comex LTDA', 'CGA Comex', 'Despachante (CGA)']],
  ['Agente de Carga', 'Access Logistics', '21.239.198/0001-30', ['Access Global Logistics Transporte Internacional LTDA']],
  ['Armazém', 'T5s - Terminal E Armazem', '48.621.063/0001-91', []],
  ['Armazém', 'Embraport Empresa BR', '02.805.610/0001-98', [], 'custoPorto'],
  ['Armazém', 'Brasil Terminal Portuario S.A.', '04.887.625/0001-78', [], 'custoPorto'],
  ['Armazém', 'Tecon Salvador S A', '03.642.342/0001-01', [], 'custoPorto'],
  ['Serviço de Terceiros', 'Ademir / FFA Comercio E Desenvolvimento', '51.660.510/0001-26', ['Ffa Comercio E Desenvolvimento', 'Ademir Furtado Filho', 'Assessoria (Ademir / FFA)']],
  ['Serviço de Terceiros', 'Laboratorio Analitico Teixeira', '43.238.050/0001-14', ['A P Teixeira']],
  ['Serviço de Terceiros', 'Henrique Azevedo Guidi', '53.119.499/0001-17', ['Henrique Azevedo GU']],
  ['Serviço de Terceiros', 'Dc Engenharia E Topografia', '47.982.679/0001-25', []],
];
// despesas mensais da empresa (nenhuma entra em processo)
const CADASTRO_ADM = ['Osmane Gomes Novaes', 'Serventia Extrajudicial Do Oficio Unico', 'Oliveira Dos Brejinhos Prefeit', 'Crea 3 Regiao', 'Sueli Canziani Gazaniga', 'Gilmara Vanderlinde Medeiros', 'Reginaldo Cota', 'Agencia Nacional De Mineracao', 'Agrega Workspace Coworking', 'Contabilidade Carboni', 'Tagplus', 'Pousada Elshaday Conquista LTDA', 'Municipio De Itajai', 'Otoni E Martins LTDA', 'Iata International Air Transpo', 'O Ponto Da Construcao', 'Posto Italo', 'Jose Augusto De Souza Filho', 'Receita Federal'];
const CLIENTE_HK = { nome: 'Hong Kong Sanjiang International Holdings Limited', usci: '79679646', tel: '13815645557 / 15751200205', email: '675086881@qq.com', end: 'Room 1, 22/F, Times Trade Centre, 1 Mei Wan Street, Tsuen Wan, Hong Kong' };

const chaveNome = t => semAcento(limparNomeCadastro(String(t || ''))).replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SA|MEI|LIMITADA)\b\.?/g, '').replace(/[^A-Z0-9]/g, '');
const soDigitos = t => String(t || '').replace(/\D/g, '');
const raizCnpj = t => { const d = soDigitos(t); return d.length === 14 ? d.slice(0, 8) : d; };
function revisadoDe(nome, cnpj) {
  const r = raizCnpj(cnpj), k = chaveNome(nome);
  return CADASTRO_REVISADO.find(x => (r && r.length === 8 && raizCnpj(x[2]) === r) || (k && (chaveNome(x[1]) === k || (x[3] || []).some(a => chaveNome(a) === k))));
}
// cadastro de quem emitiu / recebeu (pelo CNPJ ou por qualquer nome conhecido)
function acharCadastro(nome, cnpj) {
  const fs = S.fornecedores || [];
  const rv = revisadoDe(nome, cnpj);
  if (rv) { const f = fs.find(x => chaveNome(x.nome) === chaveNome(rv[1]) || (raizCnpj(x.cnpj).length === 8 && raizCnpj(x.cnpj) === raizCnpj(rv[2]))); if (f) return f; }
  const r = raizCnpj(cnpj), k = chaveNome(nome);
  return fs.find(x => (r && r.length >= 8 && raizCnpj(x.cnpj) === r)) || (k && fs.find(x => chaveNome(x.nome) === k)) || null;
}
const campoDoCadastro = f => { if (!f) return undefined; const rv = revisadoDe(f.nome, f.cnpj); return rv && rv[4] ? rv[4] : CAMPO_DO_TIPO[f.tipo]; };
const nomeCanonico = (nome, cnpj) => { const rv = revisadoDe(nome, cnpj); if (rv) return rv[1]; const f = acharCadastro(nome, cnpj); return f ? f.nome : nome; };

// documento que chega: quem é (CNPJ da nota, do comprovante ou do texto) e para qual custo vai
function cadastroDoItem(item) {
  const info = item.info || {}, pag = info.pagamento || {};
  const cnpjs = [info.emitCnpj, pag.documento, ...((String(item.texto || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []))].map(soDigitos).filter(c => c && c !== FU_SONG_CNPJ);
  const nomes = [info.emitNome, info.transportadora, pag.recebedor].filter(Boolean);
  for (const c of cnpjs) { const f = acharCadastro('', c); if (f) return f; }
  for (const n of nomes) { const f = acharCadastro(n, ''); if (f) return f; }
  return null;
}
if (typeof campoCustoSugerido === 'function' && !campoCustoSugerido._cad) {
  const base = campoCustoSugerido;
  campoCustoSugerido = function (item) {
    if (item && (item.tipo === 'cte' || item.tipo === 'mdfe')) return base.apply(this, arguments);
    try { const f = cadastroDoItem(item || {}); const c = campoDoCadastro(f); if (c) return c; } catch (e) { console.warn('cadastro → custo', e); }
    return base.apply(this, arguments);
  };
  campoCustoSugerido._cad = true;
}
// documento novo de alguém já cadastrado (com outro nome): não cria cadastro repetido
if (typeof garantirFornecedor === 'function' && !garantirFornecedor._cad) {
  const base = garantirFornecedor;
  garantirFornecedor = function (d) {
    try { const f = acharCadastro(d && d.nome, d && d.cnpj); if (f) { const c = soDigitos(d.cnpj); if (!f.cnpj && c && cnpjValido(c)) f.cnpj = fmtCnpj(c); return f; } } catch (e) {}
    return base.apply(this, arguments);
  };
  garantirFornecedor._cad = true;
}

// roda ao abrir (não regrava se já estiver tudo certo)
function organizarCadastro() {
  let n = 0;
  S.fornecedores = S.fornecedores || [];
  // 1) tipos e nomes revisados; junta os repetidos (outros nomes / mesmo CNPJ)
  CADASTRO_REVISADO.forEach(([tipo, nome, cnpj, outros]) => {
    const iguais = S.fornecedores.filter(x => chaveNome(x.nome) === chaveNome(nome) || (outros || []).some(a => chaveNome(a) === chaveNome(x.nome)) || (raizCnpj(x.cnpj).length === 8 && raizCnpj(x.cnpj) === raizCnpj(cnpj)));
    let f = iguais.find(x => chaveNome(x.nome) === chaveNome(nome)) || iguais[0];
    if (!f) { f = { id: genId(), tipo, nome, cnpj, ie: '', cep: '', email: '', end: '', banco: '', agencia: '', conta: '', pix: '' }; S.fornecedores.push(f); n++; }
    iguais.filter(x => x !== f).forEach(x => { ['ie', 'cep', 'end', 'email', 'banco', 'agencia', 'conta', 'pix'].forEach(k => { if (!f[k] && x[k]) f[k] = x[k]; }); S.fornecedores.splice(S.fornecedores.indexOf(x), 1); n++; });
    if (f.tipo !== tipo) { f.tipo = tipo; n++; }
    if (f.nome !== nome) { f.nome = nome; n++; }
    if (!f.cnpj && cnpj) { f.cnpj = cnpj; n++; }
  });
  S.fornecedores.forEach(f => { if (CADASTRO_ADM.some(a => chaveNome(a) === chaveNome(f.nome)) && f.tipo !== TIPO_ADM) { f.tipo = TIPO_ADM; n++; } });
  // 2) clientes: "Lee" é o contato (não é empresa); Hong Kong Sanjiang é comprador do FS260116
  S.clientes = S.clientes || [];
  const antesCli = S.clientes.length;
  S.clientes = S.clientes.filter(c => chaveNome(c.nome) !== 'LEE');
  if (S.clientes.length !== antesCli) n++;
  if (!S.clientes.some(c => chaveNome(c.nome) === chaveNome(CLIENTE_HK.nome))) { S.clientes.push(Object.assign({ id: genId() }, CLIENTE_HK)); n++; }
  const p116 = (S.processos || []).find(p => p.id === 'FS260116');
  if (p116) { p116.docs = p116.docs || {}; if (!p116.docs._comprador) { p116.docs._comprador = CLIENTE_HK.nome; n++; } if (!p116.docs._consignatario) { p116.docs._consignatario = 'Xiamen Xingchangsheng Trading Co., Ltd'; n++; } }
  // 4) FS260106: a NFS-e de R$ 900 do Laboratório Teixeira estava no frete marítimo (é análise, já lançada como serviço de terceiros do processo)
  const p106 = (S.processos || []).find(p => p.id === 'FS260106');
  const reg106 = p106 && p106.docs && p106.docs._custoDocs && p106.docs._custoDocs.custoMaritimo;
  if (reg106) {
    const lab = (reg106.fiscais || []).filter(d => /TEIXEIRA/i.test(semAcento(d.de || d.nome || '')));
    if (lab.length) {
      reg106.fiscais = reg106.fiscais.filter(d => !lab.includes(d));
      const l = (S.lancamentos || []).find(x => x.vinculoId === 'FS260106' && /TEIXEIRA/i.test(semAcento(x.empresa || '')));
      if (l) { l.docs = l.docs || {}; if (!l.docs.nfe && lab[0].url) l.docs.nfe = lab[0].url; }
      if (p106.docs._lanc_custoMaritimo && lab.some(d => d.url === p106.docs._lanc_custoMaritimo.nfe)) delete p106.docs._lanc_custoMaritimo.nfe;
      try { recalcularCustos(p106, 'custoMaritimo'); } catch (e) {}
      n++;
    }
  }
  // 3) documentos dos processos: nome de quem emitiu pelo CNPJ da chave (CT-e sem nome), "chave" no lugar do nome, empresa errada no custo
  (S.processos || []).forEach(p => {
    const cd = (p.docs && p.docs._custoDocs) || {};
    Object.entries(cd).forEach(([campo, reg]) => {
      (reg.fiscais || []).forEach(d => { const k = soDigitos(d.k); if (!d.de && k.length === 44) { const f = acharCadastro('', k.slice(6, 20)); if (f) { d.de = f.nome; p.docs._costEmpresa = p.docs._costEmpresa || {}; if (!p.docs._costEmpresa[campo]) p.docs._costEmpresa[campo] = titulo(f.nome); n++; } } });
      const emissores = [...new Set((reg.fiscais || []).map(d => d.de).filter(Boolean).map(x => nomeCanonico(x)))];
      (reg.pagos || []).forEach(d => { if (/^chave$/i.test(String(d.de || '').trim()) && emissores.length === 1) { d.de = emissores[0]; n++; } });
      const emp = p.docs._costEmpresa && p.docs._costEmpresa[campo];
      if (emissores.length === 1 && emp && !/ADEMIR|FFA|ASSESSORIA|PREVIST|ESTIMAD/i.test(semAcento(emp)) && chaveNome(nomeCanonico(emp)) !== chaveNome(emissores[0])) { p.docs._costEmpresa[campo] = emissores[0]; n++; }
      // nome da empresa no custo igual ao do cadastro (ex.: "Mineracao Terra Branca" → "AWM Mineração (Terra Branca)")
      const emp2 = p.docs._costEmpresa && p.docs._costEmpresa[campo], rv = emp2 && !(p.docs._previsto && p.docs._previsto[campo]) && !/ADEMIR|FFA|ASSESSORIA|PREVIST|ESTIMAD/i.test(semAcento(emp2)) ? revisadoDe(emp2, '') : null;
      if (rv && emp2 !== rv[1]) { p.docs._costEmpresa[campo] = rv[1]; n++; }
    });
  });
  // 5) lançamentos: engenheiro de minas (Henrique) = serviço de terceiros; nome limpo
  (S.lancamentos || []).forEach(l => {
    const emp = String(l.empresa || '');
    // (o laboratório do FS260106 continua lançamento próprio do processo, "Laboratório": se virasse "Serviços de Terceiros" o sistema juntaria com a conta da assessoria Ademir/FFA)
    if (/TEIXEIRA/i.test(semAcento(emp)) && l.vinculoId === 'FS260106' && !/terceiros/i.test(l.descricao || '')) { l.descricao = 'Laboratório Analítico Teixeira — análise (serviço de terceiros do processo)'; n++; }
    if (/HENRIQUE\s+AZEVEDO/i.test(semAcento(emp)) && (l.empresa !== 'Henrique Azevedo Guidi' || l.categoria !== 'Serviços de Terceiros')) { l.empresa = 'Henrique Azevedo Guidi'; l.categoria = 'Serviços de Terceiros'; l.descricao = 'Serviços de Terceiros — Henrique Azevedo Guidi (engenheiro de minas)'; n++; }
  });
  if (n) logAction('editar', 'FORNECEDORES', '-', `Cadastro organizado (${n} ajuste(s))`);
  return n;
}

// documento lançado no custo errado (pelo tipo do cadastro de quem emitiu)
function custoNoLugarErrado(p) {
  const out = [], cd = (p.docs && p.docs._custoDocs) || {};
  Object.entries(cd).forEach(([campo, reg]) => [...(reg.fiscais || []), ...(reg.pagos || [])].forEach(d => {
    const k = soDigitos(d.k), f = acharCadastro(d.de, k.length === 44 ? k.slice(6, 20) : ''); if (!f) return;
    const certo = campoDoCadastro(f);
    if (certo === '' ) out.push(`${f.nome} é despesa geral (ADM), mas está em ${PROCESS_COST_FIELDS[campo]}`);
    else if (certo && certo !== campo && !(certo === 'custoArmazem' && campo === 'custoPorto') && !(certo === 'custoPorto' && campo === 'custoArmazem')) out.push(`${f.nome} (${f.tipo}) está em ${PROCESS_COST_FIELDS[campo]} — o certo seria ${PROCESS_COST_FIELDS[certo]}`);
  }));
  return [...new Set(out)];
}

// ── Padrões de valor por fornecedor (aprendidos dos processos) ──
// frete rodoviário: por container, pela cidade de origem · marítimo: por container, pelo armador e porto · armazém e assessoria: por container
// despachante: por processo · produto: por kg, por fornecedor e produto. Precisa de 3 processos de comparação; avisa acima de 20%.
const MARGEM_PADRAO = 0.2, MINIMO_AMOSTRAS = 3;
function unidadeDoCusto(p, campo) {
  const q = qtdContainers(p), kg = (typeof toneladas === 'function' ? toneladas(p) : 0) * 1000;
  const cidade = semAcento(String(p.logCidade || '').split('/')[0]).trim();
  if (campo === 'custoFrete') return cidade ? { div: q, chave: 'cidade ' + cidade, rotulo: 'por container saindo de ' + titulo(cidade.toLowerCase()) } : null;
  if (campo === 'custoMaritimo') return { div: q, chave: (p.companhia || '?') + ' ' + (ehSalvador(p) ? 'SSA' : 'SSZ'), rotulo: `por container (${p.companhia || 'armador?'}, ${ehSalvador(p) ? 'Salvador' : 'Santos'})` };
  if (campo === 'custoArmazem' || campo === 'custoServTerceiros') return { div: q, chave: '', rotulo: 'por container' };
  if (campo === 'custoDespachante') return { div: 1, chave: '', rotulo: 'por processo' };
  if (campo === 'custoProduto') return kg ? { div: kg, chave: grupoProduto(p), rotulo: 'por kg (' + grupoProduto(p) + ')', kg: true } : null;
  return null;
}
let _amostras = { t: 0, v: null };
function amostrasDeCusto() {
  if (_amostras.v && Date.now() - _amostras.t < 800) return _amostras.v;   // a tela pede várias vezes seguidas
  const out = [];
  (S.processos || []).forEach(p => {
    if (p.status === 'Cancelado' || ehProcessoS(p) || (S.processos || []).some(q => q.id === p.id + 'S')) return;
    Object.keys(PROCESS_COST_FIELDS).forEach(campo => {
      const v = Number(p[campo]) || 0; if (!v) return;
      if (p.docs && p.docs._previsto && p.docs._previsto[campo]) return;
      if (p.docs && p.docs._costAdiant && p.docs._costAdiant[campo]) return;
      const u = unidadeDoCusto(p, campo); if (!u || !u.div) return;
      let emp = (p.docs && p.docs._costEmpresa && p.docs._costEmpresa[campo]) || '';
      if (/ESTIMAD|PREVIST/i.test(semAcento(emp))) emp = '';   // nome que sobrou do previsto
      out.push({ p, campo, quem: chaveNome(nomeCanonico(emp)), nome: nomeCanonico(emp), chave: u.chave, unit: v / u.div, u, v });
    });
  });
  _amostras = { t: Date.now(), v: out };
  return out;
}
const mediana = xs => { const a = xs.slice().sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function foraDoPadrao(p, amostras) {
  const out = [], todas = amostras || amostrasDeCusto(), ok = (p.docs && p.docs._padraoOk) || {};
  todas.filter(a => a.p === p).forEach(a => {
    if (ok[a.campo] != null && Math.abs(Number(ok[a.campo]) - a.v) < 0.01) return;   // você confirmou este valor
    const comp = todas.filter(b => b.p !== p && b.campo === a.campo && b.chave === a.chave && (a.campo === 'custoFrete' || a.campo === 'custoMaritimo' || b.quem === a.quem)).map(b => b.unit);
    if (comp.length < MINIMO_AMOSTRAS) return;
    const m = mediana(comp); if (!m) return;
    if (Math.abs(a.unit - m) / m > MARGEM_PADRAO) {
      const f = x => a.u.kg ? 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : 'R$ ' + fmt(Math.round(x * 100) / 100);
      out.push({ campo: a.campo, valor: a.v, texto: `${PROCESS_COST_FIELDS[a.campo]}${a.nome ? ' (' + a.nome + ')' : ''}: ${f(a.unit)} ${a.u.rotulo}; o normal é ${f(m)} (${comp.length} processos)` });
    }
  });
  return out;
}
async function valorEstaCerto(id, campo) {
  const p = (S.processos || []).find(x => x.id === id); if (!p) return;
  p.docs._padraoOk = Object.assign({}, p.docs._padraoOk, { [campo]: Number(p[campo]) || 0 });
  logAction('editar', 'PROCESSOS', id, PROCESS_COST_FIELDS[campo] + ': valor fora do padrão confirmado por você');
  await saveToSheets(); render();
}
// entram nas pendências do processo (junto com as divergências dos documentos)
if (typeof divergenciasDocs === 'function' && !divergenciasDocs._cad) {
  const base = divergenciasDocs;
  divergenciasDocs = function (p) {
    const out = base.apply(this, arguments);
    if (!p || p.status === 'Cancelado') return out;
    try { custoNoLugarErrado(p).forEach(t => out.push(t)); } catch (e) { console.warn('custo no lugar', e); }
    try { foraDoPadrao(p).forEach(x => out.push('Valor fora do padrão — ' + x.texto)); } catch (e) { console.warn('padrão', e); }
    return out;
  };
  divergenciasDocs._cad = true;
}
// tela "Padrões dos fornecedores": o que o sistema aprendeu de cada um
function padroesFornecedores() {
  const am = amostrasDeCusto(), grupos = {};
  am.forEach(a => { const k = a.campo + '|' + (a.campo === 'custoFrete' || a.campo === 'custoMaritimo' ? '' : a.quem) + '|' + a.chave; (grupos[k] = grupos[k] || { campo: a.campo, nome: a.campo === 'custoFrete' || a.campo === 'custoMaritimo' ? '' : a.nome, rotulo: a.u.rotulo, kg: a.u.kg, xs: [], ps: [], quem: new Set() }); grupos[k].xs.push(a.unit); grupos[k].ps.push(a.p.id); if (a.nome) grupos[k].quem.add(a.nome); });
  const f = (g, x) => g.kg ? 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : 'R$ ' + fmt(Math.round(x * 100) / 100);
  const linhas = Object.values(grupos).sort((a, b) => Object.keys(PROCESS_COST_FIELDS).indexOf(a.campo) - Object.keys(PROCESS_COST_FIELDS).indexOf(b.campo) || b.xs.length - a.xs.length).map(g => `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--border)">${escHtml(PROCESS_COST_FIELDS[g.campo])}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border)">${escHtml(g.nome || [...g.quem].join(', '))}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border)">${escHtml(g.rotulo)}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace;white-space:nowrap">${f(g, mediana(g.xs))}</td><td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11.5px;color:var(--muted2)">${g.xs.length} · ${f(g, Math.min(...g.xs))} a ${f(g, Math.max(...g.xs))}</td></tr>`).join('');
  const cad = Object.keys(CAMPO_DO_TIPO).map(t => { const fs = (S.fornecedores || []).filter(x => x.tipo === t); return fs.length ? `<div style="margin-top:8px"><b>${escHtml(t)}</b>${CAMPO_DO_TIPO[t] ? ` <span style="color:var(--muted2);font-size:11.5px">→ ${escHtml(PROCESS_COST_FIELDS[CAMPO_DO_TIPO[t]])}</span>` : ' <span style="color:var(--muted2);font-size:11.5px">→ fora dos processos</span>'}<div style="font-size:12px;color:var(--muted2)">${fs.map(x => escHtml(x.nome) + (x.cnpj ? ' (' + escHtml(x.cnpj) + ')' : '')).join(' · ')}</div></div>` : ''; }).join('');
  _uiCloseModal();
  const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal" style="max-width:760px;width:96%;max-height:88vh;overflow:auto">
    <div class="modal-title">Padrões dos fornecedores</div>
    <div style="font-size:12.5px;color:var(--muted2);margin-bottom:8px">Aprendido dos processos (valores reais, sem previstos). Com 3 ou mais processos de comparação, um valor 20% fora do normal vira pendência no processo — se estiver certo, confirme lá.</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="text-align:left;color:var(--muted2)"><th style="padding:6px 8px">Custo</th><th style="padding:6px 8px">Quem</th><th style="padding:6px 8px">Unidade</th><th style="padding:6px 8px">Normal</th><th style="padding:6px 8px">Processos · faixa</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div style="font-weight:700;margin-top:16px">Cadastro por tipo (o tipo decide o custo do documento)</div>${cad}
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-primary" onclick="_uiCloseModal()">Fechar</button></div></div>`;
  document.body.appendChild(modal);
}
