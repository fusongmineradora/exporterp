// ═══════════════════════════════════════════════════════════════
// ERP 2.0 · AMBIENTE DE TESTES — leitura de Invoice / Sales Contract e OCR de prints
// · Na Caixa de Entrada, uma invoice ou contrato de um processo que ainda não existe
//   mostra o botão "➕ Criar processo FS……", que preenche o cadastro com os dados do documento.
// · Prints/fotos de comprovantes são lidos pelo OCR do Google Drive.
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
  ['_branch', /BRANCH\s+NUMBER/gi],
  ['_iban', /\bIBAN\s*:/gi],
  ['_account', /ACCOUNT\s+WITH\s*:/gi],
  ['_swift', /SWIFT\s+CODE\s*:/gi],
  ['_benef', /(?:FINAL\s+)?BENEFICIARY(?:\s+BANK)?\s*\(FIELD/gi],
  ['_further', /FOR\s+FURTHER\s+CREDIT/gi],
  ['_favor', /IN\s+FAVOR\s+OF\s*:/gi],
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
  if (linha) { if (!v.produto) v.produto = linha[1].trim().replace(/^\d+\s+/, ''); if (!v.ncm) v.ncm = linha[2]; if (!v.peso) v.peso = linha[3] + ' KG'; }
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

function normNome(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function montarProcesso(pasta, inv, ct) {
  const d = Object.assign({}, ct || {}, Object.fromEntries(Object.entries(inv || {}).filter(([, x]) => x !== '' && x !== 0 && x != null)));
  const n = parseInt(pasta.proc.slice(2), 10);
  const avisos = [];
  if (inv && inv.numero && inv.numero.replace(/S$/, '') !== pasta.proc) avisos.push(`invoice diz ${inv.numero}`);
  if (inv && ct && inv.totalUsd && ct.totalUsd && Math.abs(inv.totalUsd - ct.totalUsd) > 0.01) avisos.push(`invoice USD ${inv.totalUsd} ≠ contrato USD ${ct.totalUsd}`);
  const qtd = (ct && ct.qtdContainer) || '1';
  const p = {
    id: pasta.proc, embarque: String(9 + (n - 260096)).padStart(2, '0'), status: 'A Coletar',
    cliente: d.cliente || '',
    usci: d.usci || '', clienteTel: d.tel || '', clienteEmail: d.email || '', clienteAdd: d.end || '',
    produto: d.produto || '', ncm: d.ncm || '', moeda: d.moeda || 'USD',
    pol: d.pol || '', pod: d.pod || '', origem: d.origem || '', destino: d.destino || '',
    incoterm: d.incoterm || '', pagamento: d.pagamento || '', peso: d.peso || '',
    qtdContainer: qtd, containers: Array.from({ length: parseInt(qtd, 10) || 1 }, () => ''), container: '',
    cambioInvoice: d.totalUsd || 0, cambioBanco: 'Itaú', cambioStatus: 'Em Aberto',
    invoiceNum: 'Invoice - ' + pasta.proc, contratoNum: 'Contrato - ' + pasta.proc,
    docs: { _criadoDe: { arquivo: pasta.nome, emitida: d.emitida || '', avisos } },
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
    logAction('criar', 'CLIENTES', c.id, c.nome + ' (pela invoice)');
  } else {
    ['usci', 'tel', 'email', 'end'].forEach(k => { const v = { usci: p.usci, tel: p.clienteTel, email: p.clienteEmail, end: p.clienteAdd }[k]; if (!c[k] && v) c[k] = v; });
  }
}


// ── Criar processo a partir da invoice / contrato que está na Entrada ──
function docVendaDoItem(it) {
  if (!it || !['invoice', 'contrato'].includes(it.tipo)) return null;
  if (it._venda === undefined) it._venda = lerDocVenda(it.texto) || null;
  return it._venda;
}
function numeroProcessoDoItem(it) {
  const d = docVendaDoItem(it);
  const n = (d && d.numero) || ((String(it.nome || '').toUpperCase().match(/FS\s?\d{6}/) || [''])[0]);
  return n.replace(/\s/g, '').replace(/^(FS\d{6})S$/, '$1');
}
function podeCriarProcesso(it) {
  if (!it || !['invoice', 'contrato'].includes(it.tipo)) return '';
  const id = numeroProcessoDoItem(it);
  if (!id || (S.processos || []).some(p => p.id === id)) return '';
  return id;
}

async function criarProcessoDoDoc(i) {
  const E = S.entrada, it = E.itens[i];
  const id = podeCriarProcesso(it);
  if (!id) return;
  // junta invoice + contrato do mesmo processo que estejam na Entrada
  const irmaos = E.itens.filter(x => ['invoice', 'contrato'].includes(x.tipo) && numeroProcessoDoItem(x) === id);
  const docs = irmaos.map(docVendaDoItem).filter(Boolean);
  const inv = docs.find(d => !d.contrato) || null, ct = docs.find(d => d.contrato) || null;
  if (!inv && !ct) { await uiAlert('Não consegui ler os dados deste documento. Crie o processo pela tela de Processos.'); return; }
  const p = montarProcesso({ proc: id, nome: it.nome, id: '' }, inv, ct);
  const resumo = [
    'Cliente: ' + (p.cliente || '—'), 'Produto: ' + (p.produto || '—') + (p.ncm ? ' (NCM ' + p.ncm + ')' : ''),
    'Rota: ' + (p.pol || '—') + ' → ' + (p.pod || '—') + ' · ' + (p.incoterm || ''),
    'Valor: USD ' + (p.cambioInvoice ? p.cambioInvoice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—') + ' · Peso: ' + (p.peso || '—') + ' kg · Containers: ' + p.qtdContainer,
    'Lido de: ' + [inv ? 'invoice' : '', ct ? 'contrato' : ''].filter(Boolean).join(' + '),
  ].concat(p.docs._criadoDe.avisos.length ? ['⚠️ ' + p.docs._criadoDe.avisos.join('; ')] : []);
  if (!await uiConfirm('Criar o processo ' + id + ' com estes dados?\n\n' + resumo.join('\n') + '\n\nVocê pode editar tudo depois na tela do processo.', 'Novo processo pela ' + (inv ? 'invoice' : 'contrato'), 'Criar processo', 'Cancelar')) return;
  S.processos.push(p);
  garantirCliente(p);
  logAction('criar', 'PROCESSOS', p.id, (p.cliente || '') + ' · ' + (p.produto || '') + ' (pela invoice/contrato)');
  try {
    await saveToSheets();
    await criarPastaProcesso(p);
    await saveToSheets();
  } catch (e) { showToast('⚠️ ' + (e.message || e)); }
  reidentificarPendentes();
  showToast('✅ Processo ' + id + ' criado — agora é só anexar os arquivos');
  render();
}

// ── Importar a pasta de UM processo pelo link ────────────────
// copia os arquivos (originais intactos), lê tudo e, se o processo não existe, oferece criá-lo
async function importarPastaProcesso() {
  const link = await uiPrompt('Cole o link da pasta do processo no Drive (ex.: …/folders/… da pasta FS260096).\nOs arquivos são COPIADOS para a Entrada de teste; os originais não mudam.', 'https://drive.google.com/drive/folders/', 'Importar pasta de um processo');
  if (!link || !/folders\/[A-Za-z0-9_-]{10,}|^[A-Za-z0-9_-]{20,}$/.test(link.trim())) { if (link) await uiAlert('Link de pasta inválido.'); return; }
  const E = S.entrada;
  E.ultimaPastaProcesso = '';
  await importarAcervo(link.trim());
  const id = E.ultimaPastaProcesso;
  if (!id || (S.processos || []).some(p => p.id === id)) return;
  const iDoc = E.itens.findIndex(it => podeCriarProcesso(it) === id);
  if (iDoc >= 0) { await criarProcessoDoDoc(iDoc); return; }
  // sem invoice/contrato legível: cria o processo só com o número (você completa depois)
  if (!await uiConfirm(`O processo ${id} ainda não existe e não achei a invoice ou o contrato da Fu Song nesta pasta.\n\nCriar o processo ${id} só com o número? Você completa cliente, produto e valores na tela do processo.`, 'Criar processo ' + id, 'Criar processo', 'Agora não')) return;
  const p = montarProcesso({ proc: id, nome: id, id: '' }, null, null);
  S.processos.push(p);
  logAction('criar', 'PROCESSOS', p.id, 'pela pasta do Drive (sem invoice)');
  try { await saveToSheets(); await criarPastaProcesso(p); await saveToSheets(); } catch (e) { showToast('⚠️ ' + (e.message || e)); }
  reidentificarPendentes();
  showToast('✅ Processo ' + id + ' criado — confira e anexe os arquivos');
  render();
}
