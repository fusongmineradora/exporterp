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
  vincularCambiosExistentes(p);
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
  vincularCambiosExistentes(p);
  try { await saveToSheets(); await criarPastaProcesso(p); await saveToSheets(); } catch (e) { showToast('⚠️ ' + (e.message || e)); }
  reidentificarPendentes();
  showToast('✅ Processo ' + id + ' criado — confira e anexe os arquivos');
  render();
}

// ═══════════════════════════════════════════════════════════════
// Documentos → campos do processo
// · notas/CT-e/NFS-e = valor devido do custo (Em Aberto); comprovante/recibo = pago
// · CT-e/MDF-e = transportadora, cidade de origem, data de embarque, endereço de entrega
// · DU-E = número e chave · contrato de câmbio = USD, taxa, reais, datas
// Tudo é refeito a partir de docs._custoDocs / _cambioDocs (sem somar duas vezes o mesmo arquivo).
// ═══════════════════════════════════════════════════════════════
const CAMPO_POR_CATEG = {
  'Frete Marítimo': 'custoMaritimo', 'Frete Rodoviário': 'custoFrete', 'Certificado de Origem': 'custoCertificado',
  'Armazém': 'custoArmazem', 'Porto / Taxas': 'custoPorto', 'Despachante': 'custoDespachante',
  'Serviços de Terceiros': 'custoServTerceiros', 'Impostos': 'custoImpostos', 'Produto': 'custoProduto',
};
const DOCS_COM_CUSTO = ['pagamento', 'recibo', 'nfe', 'cte', 'nfse'];
const MESES_PT = { janeiro: '01', fevereiro: '02', marco: '03', 'março': '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s\/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ltda|S\.?a\.?|Me|Epp)\b/gi, x => x.toUpperCase()).replace(/([\s\/-])([A-Za-z]{2})$/, (m, a, b) => a + b.toUpperCase());
const dataBrDe = t => { const m = String(t || '').match(/\b(\d{2}\/\d{2}\/\d{4})\b/); return m ? m[1] : ''; };

function enriquecerInfo(item) {
  const T = String(item.texto || ''), U = T.replace(/\s+/g, ' ');
  const info = item.info = item.info || {};
  const mx = re => { const m = U.match(re); return m ? m[1].trim() : ''; };
  if (item.tipo === 'cte' || item.tipo === 'mdfe') {
    if (!info.transportadora) info.transportadora = info.emitNome || mx(/EMITENTE:\s*([A-ZÀ-Ú0-9 .&-]+?(?:LTDA|S\.?A\.?|EIRELI|ME)\b)/i) || mx(/\b([A-ZÀ-Ú][A-ZÀ-Ú .&-]{3,60}TRANSPORTES?\s+(?:LTDA|S\.?A\.?|EIRELI|ME))\b/);
    const rota = U.replace(/(?:ORIGEM|DESTINO) DA PRESTA[CÇ][AÃ]O/gi, '|').match(/\|[\s|]*([A-ZÀ-Ú][A-ZÀ-Ú ]+?)\s+-\s+([A-Z]{2})\s+-\s+\d{7}[\s|]{0,20}?([A-ZÀ-Ú][A-ZÀ-Ú ]+?)\s+-\s+([A-Z]{2})\s+-\s+\d{7}/);
    if (rota && !info.munIni) { info.munIni = titulo(rota[1]) + ' / ' + rota[2]; info.munFim = titulo(rota[3]) + ' / ' + rota[4]; }
    if (!info.data) { const d = dataBrDe(U); if (d) info.data = brToIso(d); }
    if (!info.valor) info.valor = numBR(mx(/VALOR A RECEBER\s+([\d.]+,\d{2})/i) || mx(/VALOR TOTAL DO SERVI[CÇ]O\s+(?:VALOR FRETE\s+)?([\d.]+,\d{2})/i));
    info.endEntrega = info.endEntrega || mx(/END\.?\s*ENT\.?:\s*(.+?)(?:\s{2,}|DADOS ESPEC|$)/i);
  }
  if (item.tipo === 'nfe') {
    if (!info.emitNome) info.emitNome = mx(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
    if (!info.valor) info.valor = valorDanfe(T);
    if (!info.data) { const d = mx(/DATA (?:DA )?EMISS[AÃ]O[\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
    if (!info.transpNome) info.transpNome = mx(/TRANSPORTADOR[\s\S]{0,140}?CNPJ \/ CPF\s+([A-ZÀ-Ú][A-ZÀ-Ú .&-]{3,60}?)\s+\d-/i);
  }
  if (item.tipo === 'nfse') {
    if (!info.emitNome) info.emitNome = mx(/Nome empresarial:\s*(.+?)\s+Endere[cç]o/i) || mx(/RECEBI\(EMOS\) DA EMPRESA:\s*(.+?)\s+A NOTA/i);
    if (!info.valor) info.valor = numBR(mx(/VALOR (?:TOTAL )?DO SERVI[CÇ]O:?\s*R?\$?\s*([\d.]+,\d{2})/i) || mx(/Valor l[ií]quido da NFS-?e[\s\S]{0,60}?([\d.]+,\d{2})/i));
    if (!info.data) { const d = mx(/EMITIDA EM\s+(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
  }
  if (item.tipo === 'recibo') {
    const J = U.replace(/\b([A-ZÀ-Ú]) (?=[A-ZÀ-Ú]\b)/g, '$1');   // "V A L O R T O T A L" → "VALORTOTAL"
    if (!info.valor) { const m = J.match(/VALOR\s*TOTAL\s*RECEBIDO[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i) || U.match(/R\$\s*([\d.]+,\d{2})/); if (m) info.valor = numBR(m[1]); }
    if (!info.emitNome) info.emitNome = mx(/RAZ\s?[AÃ]O SOCIAL\s+(.+?)\s+CNPJ/i) || mx(/RECEBI(?:\(EMOS\))?\s+DE\s+(.+?)\s+(?:A|O)\s+(?:QUANTIA|IMPORT)/i);
    if (!info.data) { const m = U.match(/(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/); if (m && MESES_PT[m[2].toLowerCase()]) info.data = `${m[3]}-${MESES_PT[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`; else { const d = dataBrDe(U); if (d) info.data = brToIso(d); } }
  }
  if (item.tipo === 'due') {
    info.dueNumero = info.dueNumero || mx(/\b(\d{2}BR\d{9}-?\d)\b/i);
    info.dueChave = info.dueChave || mx(/Chave de acesso:?\s*([0-9A-Z]{14})\b/i);
  }
  if (DOCS_COM_CUSTO.includes(item.tipo) && item.campoCusto === undefined) item.campoCusto = campoCustoSugerido(item);
}

function campoCustoSugerido(item) {
  if (item.tipo === 'cte') return 'custoFrete';
  const info = item.info || {};
  const quem = normTxt([item.nome, info.emitNome, info.pagamento && info.pagamento.recebedor, String(item.texto || '').slice(0, 800)].filter(Boolean).join(' '));
  const cat = item.categoria || categoriaPeloNome(normTxt([item.nome, info.emitNome, info.pagamento && info.pagamento.recebedor].filter(Boolean).join(' '))) || categoriaPeloNome(quem);
  if (CAMPO_POR_CATEG[cat]) return CAMPO_POR_CATEG[cat];
  if (item.tipo === 'nfe') return 'custoProduto';
  if (item.tipo === 'nfse') return 'custoServTerceiros';
  return '';   // pagamento sem pista: você escolhe (ou vira lançamento avulso do processo)
}

function opcoesCampoCusto(sel) {
  return `<option value="">— não é custo do processo —</option>` + Object.entries(PROCESS_COST_FIELDS).map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
}

function recalcularCustos(p, campo) {
  const reg = p.docs._custoDocs[campo]; if (!reg) return;
  const fiscal = (reg.fiscais || []).reduce((a, d) => a + (Number(d.valor) || 0), 0);
  const pix = (reg.pagos || []).filter(d => d.tipo !== 'recibo').reduce((a, d) => a + (Number(d.valor) || 0), 0);
  const recibo = Math.max(0, ...(reg.pagos || []).filter(d => d.tipo === 'recibo').map(d => Number(d.valor) || 0));
  const pago = Math.max(pix, recibo);   // recibo é quitação: já inclui os PIX daquele pagamento
  const total = fiscal || pago;
  p[campo] = Math.round(total * 100) / 100;
  p[campo + '_status'] = pago > 0 && pago + 0.01 >= total ? 'Pago' : 'Em Aberto';
  const datas = (reg.pagos || []).map(d => d.data).filter(Boolean).sort();
  if (datas.length) { p.docs._costData = p.docs._costData || {}; p.docs._costData[campo] = datas[datas.length - 1]; }
  const comp = (reg.pagos || []).find(d => d.url);
  if (comp) { p.docs._costComp = p.docs._costComp || {}; p.docs._costComp[campo] = comp.url; }
  p.docs._costPago = p.docs._costPago || {}; p.docs._costPago[campo] = Math.round(pago * 100) / 100;
  // botões do lançamento (Comprov. / NF-e) já ficam marcados com os arquivos
  const lanc = p.docs['_lanc_' + campo] = p.docs['_lanc_' + campo] || {};
  if (comp && !lanc.comprovante) lanc.comprovante = comp.url;
  const nota = (reg.fiscais || []).find(d => d.url);
  if (nota && !lanc.nfe) lanc.nfe = nota.url;
  const emp = [...(reg.fiscais || []), ...(reg.pagos || [])].map(d => d.de).find(Boolean);
  if (emp) { p.docs._costEmpresa = p.docs._costEmpresa || {}; if (!p.docs._costEmpresa[campo]) p.docs._costEmpresa[campo] = titulo(emp); }
}

function aplicarCambioNoProcesso(p, c, url) {
  const f = (c.faturas || []).find(x => x.processo === p.id || x.processo.replace(/S$/, '') === p.id);
  if (!f || !f.usd) return false;
  const taxa = Number(c.taxa) || (c.valorReais && c.valorMoeda ? c.valorReais / c.valorMoeda : 0);
  p.docs._cambioDocs = p.docs._cambioDocs || {};
  p.docs._cambioDocs[c.referencia || url] = { usd: f.usd, taxa, reais: Math.round(f.usd * taxa * 100) / 100, data: c.data || '', contrato: c.contratoExtrato || '', url };
  const cs = Object.values(p.docs._cambioDocs);
  const usd = cs.reduce((a, x) => a + x.usd, 0), reais = cs.reduce((a, x) => a + x.reais, 0);
  p.cambioRecebido = Math.round(usd * 100) / 100;
  p.cambioReais = Math.round(reais * 100) / 100;
  p.cambioTaxa = usd ? reais / usd : 0;
  const datas = cs.map(x => x.data).filter(Boolean).sort((a, b) => brToIso(a).localeCompare(brToIso(b)));
  if (datas.length) { p.cambioFechamento = datas[0]; p.cambioRecebimento = datas[datas.length - 1]; }
  p.cambioBanco = p.cambioBanco || 'Itaú';
  p.cambioStatus = 'Pago';
  return true;
}

function aplicarDocNoProcesso(item, p, upd) {
  if (!p) return;
  p.docs = p.docs || {};
  const info = item.info || {}, url = (upd && upd.webViewLink) || item.url || '';
  const mud = [];
  if (info.cambio) { if (aplicarCambioNoProcesso(p, info.cambio, url)) mud.push('câmbio'); }
  // logística
  if (item.tipo === 'cte' || item.tipo === 'mdfe') {
    const set = (k, v) => { if (v && (!p[k] || (v.length > p[k].length && v.toUpperCase().startsWith(p[k].toUpperCase())))) { p[k] = v; mud.push(k); } };
    set('logTransportadora', titulo(info.transportadora || info.emitNome || ''));
    set('logCidade', info.munIni ? titulo(info.munIni.split(' / ')[0]) + ' / ' + (info.munIni.split(' / ')[1] || '') : '');
    set('logEmbarque', info.data ? isoToBr(info.data) : '');
    set('logEnd', info.endEntrega ? titulo(info.endEntrega) : '');
    if (info.munFim && !p.logArmazem && /CUBAT|SANTOS|GUARUJ/i.test(info.munFim)) { p.logArmazem = titulo(info.munFim.split(' / ')[0]); }
  }
  if (item.tipo === 'nfe' && info.transpNome && !p.logTransportadora) { p.logTransportadora = titulo(info.transpNome); mud.push('logTransportadora'); }
  if (item.tipo === 'due') {
    if (info.dueNumero && !p.dueNumero) { p.dueNumero = info.dueNumero; mud.push('dueNumero'); }
    if (info.dueChave && !p.dueChave) { p.dueChave = info.dueChave; mud.push('dueChave'); }
    if (p.status === 'A Coletar' || p.status === 'No Armazém') p.status = 'No Porto';
  }
  if (item.tipo === 'bl' && ['A Coletar', 'No Armazém', 'No Porto'].includes(p.status)) p.status = 'Embarcado';
  // custos
  const campo = item.campoCusto !== undefined ? item.campoCusto : campoCustoSugerido(item);
  const valor = Number(info.valor) || 0;
  if (campo && valor > 0 && DOCS_COM_CUSTO.includes(item.tipo)) {
    p.docs._custoDocs = p.docs._custoDocs || {};
    const reg = p.docs._custoDocs[campo] = p.docs._custoDocs[campo] || { fiscais: [], pagos: [] };
    const pago = item.tipo === 'pagamento' || item.tipo === 'recibo';
    const lista = pago ? reg.pagos : reg.fiscais;
    const chave = (!pago && info.chave) || url || item.fileId;
    if (!lista.some(d => d.k === chave)) {
      lista.push({ k: chave, url, valor, tipo: item.tipo, data: info.data ? isoToBr(info.data) : (info.pagamento && info.pagamento.data) || '', nome: (upd && upd.name) || item.nome, de: info.emitNome || (info.pagamento && info.pagamento.recebedor) || '' });
      recalcularCustos(p, campo);
      mud.push(PROCESS_COST_FIELDS[campo] + (pago ? ' pago' : ' devido') + ' R$ ' + valor.toFixed(2));
    }
  } else if (item.tipo === 'pagamento' && valor > 0 && !campo) {
    // pagamento sem custo definido: lançamento avulso do processo (aparece no financeiro do processo)
    lancarFinanceiroDoDoc(item, p, upd);
  }
  if (mud.length) logAction('editar', 'PROCESSOS', p.id, 'Pelos documentos: ' + mud.join(', '));
  return mud;
}

// Reler os documentos já anexados e atualizar os campos (corrige processos importados antes desta versão)
async function atualizarProcessosPelosDocs(ids, silencioso) {
  const lista = (S.processos || []).filter(p => !ids || ids.includes(p.id));
  let n = 0;
  for (const p of lista) {
    p.docs = p.docs || {};
    // lançamentos criados pela versão anterior a partir de documentos do processo viram campos do processo
    S.lancamentos = (S.lancamentos || []).filter(l => !(l.docs && l.docs._origem === 'entrada' && l.vinculo === 'processo' && l.vinculoId === p.id && !l.docs._banco));
    p.docs._custoDocs = {}; delete p.docs._cambioDocs;
    const files = (p.docs._files) || {};
    for (const [tipo, arr] of Object.entries(files)) {
      if (['invoice', 'contrato', 'outros'].includes(tipo)) continue;
      for (const f of arr || []) {
        if (!f.id) continue;
        if (!silencioso && S.entrada) { S.entrada.progresso = `Relendo ${p.id}: ${f.name}`; render(); }
        try {
          const it = await analisarArquivo({ id: f.id, name: f.name, mimeType: /\.xml$/i.test(f.name) ? 'application/xml' : /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.(png|jpe?g)$/i.test(f.name) ? 'image/png' : '', size: 1000 });
          it.tipo = tipo;                       // o tipo já foi confirmado ao anexar
          if ((!Number(it.info.valor) || f.valorManual) && Number(f.valor)) it.info.valor = Number(f.valor);
          if (!it.info.data && f.data) it.info.data = /^\d{4}-/.test(f.data) ? f.data : brToIso(f.data);
          delete it.campoCusto; enriquecerInfo(it);   // reler com o tipo confirmado
          if (f.campoCusto !== undefined) it.campoCusto = f.campoCusto;
          aplicarDocNoProcesso(it, p, { webViewLink: f.url, name: f.name });
        } catch (e) { console.warn('reler', f.name, e.message); }
      }
    }
    p.docs._docsV = 2; n++;
  }
  if (S.entrada) S.entrada.progresso = '';
  await saveToSheets();
  if (!silencioso) { showToast(`✅ ${n} processo(s) atualizados pelos documentos`); render(); }
}

// Processos anexados pela versão anterior: atualiza os campos uma vez (em segundo plano)
let _migrandoDocs = false;
async function migrarDocsV2() {
  if (_migrandoDocs || !window._sheetsToken) return;
  const ids = (S.processos || []).filter(p => p.docs && p.docs._files && Object.keys(p.docs._files).length && p.docs._docsV !== 2).map(p => p.id);
  if (!ids.length) return;
  _migrandoDocs = true;
  try { await atualizarProcessosPelosDocs(ids, true); showToast(`✅ ${ids.length} processo(s) atualizados pelos documentos anexados`); render(); }
  catch (e) { console.warn('migrar docs', e); }
  _migrandoDocs = false;
}

// Contrato de câmbio já anexado a outro processo que também paga a fatura deste (ex.: FS260096 + FS260097)
function vincularCambiosExistentes(p) {
  let n = 0;
  (S.processos || []).forEach(q => {
    if (q.id === p.id) return;
    (((q.docs || {})._files || {}).comprovantes || []).forEach(f => {
      const c = f.cambio; if (!c || !(c.faturas || []).some(x => x.processo === p.id)) return;
      p.docs = p.docs || {}; p.docs._files = p.docs._files || {}; p.docs._files.comprovantes = p.docs._files.comprovantes || [];
      if (p.docs._files.comprovantes.some(x => x.id === f.id)) return;
      const fat = c.faturas.find(x => x.processo === p.id);
      p.docs._files.comprovantes.push(Object.assign({}, f, { cambio: Object.assign({}, c, { usdFatura: fat.usd }) }));
      if (!p.docs.comprovantes) p.docs.comprovantes = f.url;
      aplicarCambioNoProcesso(p, { referencia: c.referencia, taxa: c.taxa, valorReais: c.reaisTotal, valorMoeda: c.usdTotal, data: c.data, contratoExtrato: c.contratoExtrato, faturas: c.faturas }, f.url);
      if (p.docs._folderId && f.id) driveAPI('POST', '/files', { name: f.name, mimeType: 'application/vnd.google-apps.shortcut', parents: [p.docs._folderId], shortcutDetails: { targetId: f.id } }, 'fields=id').catch(() => {});
      n++;
    });
  });
  if (n) logAction('editar', 'PROCESSOS', p.id, `câmbio vinculado a partir de ${n} contrato(s) já anexado(s)`);
  return n;
}
