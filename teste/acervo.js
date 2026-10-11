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

async function criarProcessoDoDoc(i, semPerguntar) {
  const E = S.entrada, it = E.itens[i];
  const id = podeCriarProcesso(it);
  if (!id) return;
  // junta invoice + contrato do mesmo processo que estejam na Entrada
  const irmaos = E.itens.filter(x => ['invoice', 'contrato'].includes(x.tipo) && numeroProcessoDoItem(x) === id);
  const docs = irmaos.map(docVendaDoItem).filter(Boolean);
  const inv = docs.find(d => !d.contrato) || null, ct = docs.find(d => d.contrato) || null;
  if (!inv && !ct) { if (semPerguntar) return null; await uiAlert('Não consegui ler os dados deste documento. Crie o processo pela tela de Processos.'); return; }
  const p = montarProcesso({ proc: id, nome: it.nome, id: '' }, inv, ct);
  const resumo = [
    'Cliente: ' + (p.cliente || '—'), 'Produto: ' + (p.produto || '—') + (p.ncm ? ' (NCM ' + p.ncm + ')' : ''),
    'Rota: ' + (p.pol || '—') + ' → ' + (p.pod || '—') + ' · ' + (p.incoterm || ''),
    'Valor: USD ' + (p.cambioInvoice ? p.cambioInvoice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—') + ' · Peso: ' + (p.peso || '—') + ' kg · Containers: ' + p.qtdContainer,
    'Lido de: ' + [inv ? 'invoice' : '', ct ? 'contrato' : ''].filter(Boolean).join(' + '),
  ].concat(p.docs._criadoDe.avisos.length ? ['⚠️ ' + p.docs._criadoDe.avisos.join('; ')] : []);
  if (!semPerguntar && !await uiConfirm('Criar o processo ' + id + ' com estes dados?\n\n' + resumo.join('\n') + '\n\nVocê pode editar tudo depois na tela do processo.', 'Novo processo pela ' + (inv ? 'invoice' : 'contrato'), 'Criar processo', 'Cancelar')) return;
  S.processos.push(p);
  garantirCliente(p);
  logAction('criar', 'PROCESSOS', p.id, (p.cliente || '') + ' · ' + (p.produto || '') + ' (pela invoice/contrato)');
  vincularCambiosExistentes(p);
  if (semPerguntar) return p;
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
const DOCS_COM_CUSTO = ['pagamento', 'recibo', 'nfe', 'cte', 'nfse', 'faturaFrete'];
const MESES_PT = { janeiro: '01', fevereiro: '02', marco: '03', 'março': '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s\/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ltda|S\.?a\.?|Me|Epp)\b/gi, x => x.toUpperCase()).replace(/([\s\/-])([A-Za-z]{2})$/, (m, a, b) => a + b.toUpperCase());
const dataBrDe = t => { const m = String(t || '').match(/\b(\d{2}\/\d{2}\/\d{4})\b/); return m ? m[1] : ''; };

function enriquecerInfo(item) {
  const T = String(item.texto || ''), U = T.replace(/\s+/g, ' ');
  const info = item.info = item.info || {};
  const mx = re => { const m = U.match(re); return m ? m[1].trim() : ''; };
  if (item.tipo === 'cte' || item.tipo === 'mdfe') {
    if (!info.transportadora) info.transportadora = info.emitNome || mx(/EMITENTE:\s*([A-ZÀ-Ú0-9 .&-]+?(?:LTDA|S\.?A\.?|EIRELI|ME)\b)/i) || mx(/\b([A-ZÀ-Ú][A-ZÀ-Ú .&-]{3,60}TRANSPORTES?\s+(?:LTDA|S\.?A\.?|EIRELI|ME))\b/);
    const RUIDO = /^(BRASIL|BRAZIL|LTDA|S\.?A\.?|ME|EIRELI|SALES|INSIDE|PAIS|FONE|CEP|MUNIC[IÍ]PIO|ENDERE[CÇ]O|DESTINAT[AÁ]RIO|REMETENTE|TOMADOR|EXPEDIDOR|RECEBEDOR|DA|DE|DO|PRESTA[CÇ][AÃ]O|ORIGEM|DESTINO|INDUSTR|-)$/;
    const cidades = [...U.replace(/(?:ORIGEM|DESTINO) DA PRESTA[CÇ][AÃ]O/gi, ' ').matchAll(/((?:[A-ZÀ-Ú.]+\s+){0,4}[A-ZÀ-Ú.]+)\s+-\s+([A-Z]{2})\s+-\s+(\d{7})\b/g)].map(m => {
      const w = m[1].trim().split(/\s+/); while (w.length > 1 && RUIDO.test(w[0])) w.shift();
      return { c: w.join(' '), uf: m[2] };
    });
    if (cidades.length && !info.munIni) { info.munIni = titulo(cidades[0].c) + ' / ' + cidades[0].uf; if (cidades[1]) info.munFim = titulo(cidades[1].c) + ' / ' + cidades[1].uf; }
    if (!info.data) { const d = dataBrDe(U); if (d) info.data = brToIso(d); }
    if (!info.valor) info.valor = numBR(mx(/VALOR A RECEBER\s+([\d.]+,\d{2})/i) || mx(/VALOR FRETE\s*([\d.]+,\d{2})/i) || mx(/([\d.]+,\d{2})\s*VALOR FRETE/i) || mx(/VALOR TOTAL DO SERVI[CÇ]O\s+(?:VALOR FRETE\s+)?([\d.]+,\d{2})/i));
    info.endEntrega = info.endEntrega || mx(/END\.?\s*ENT\.?:\s*(.+?)(?:\s{2,}|\s+OBSERVA|DADOS ESPEC|$)/i);
  }
  if (item.tipo === 'nfe') {
    if (!info.emitNome) info.emitNome = mx(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
    if (!info.valor) info.valor = valorDanfe(T);
    if (!info.data) { const d = mx(/DATA (?:DA )?EMISS[AÃ]O[\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
    if (!info.transpNome) info.transpNome = mx(/TRANSPORTADOR[\s\S]{0,140}?CNPJ \/ CPF\s+([A-ZÀ-Ú][A-ZÀ-Ú .&-]{3,60}?)\s+\d-/i);
  }
  if (item.tipo === 'nfse') {
    if (!info.emitNome) info.emitNome = mx(/Nome empresarial:\s*(.+?)\s+Endere[cç]o/i) || mx(/RECEBI\(EMOS\) DA EMPRESA:\s*(.+?)\s+A NOTA/i)
      || mx(/(?:EMITENTE DA NFS-?e|Prestador do Servi[cç]o)[\s\S]{0,120}?Nome \/ Nome Empresarial\s+(.+?)\s+(?:Inscri|CNPJ|CEP)/i) || mx(/Nome \/ Nome Empresarial\s+(.+?)\s+(?:Inscri|CNPJ|CEP)/i);
    if (!info.valor) info.valor = numBR(mx(/VALOR (?:TOTAL )?DOS? SERVI[CÇ]OS?:?\s*R?\$?\s*([\d.]+,\d{2})/i) || mx(/Valor l[ií]quido da NFS-?e[\s\S]{0,60}?([\d.]+,\d{2})/i) || mx(/VALOR TOTAL DA NFS-?E[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i));
    if (!info.data) { const d = mx(/EMITIDA EM\s+(\d{2}\/\d{2}\/\d{4})/i) || mx(/Data da emiss[aã]o da NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
  }
  if (item.tipo === 'recibo') {
    const J = U.replace(/\b([A-ZÀ-Ú]) (?=[A-ZÀ-Ú]\b)/g, '$1');   // "V A L O R T O T A L" → "VALORTOTAL"
    if (!info.valor) { const m = J.match(/VALOR\s*TOTAL\s*RECEBIDO[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i) || U.match(/R\$\s*([\d.]+,\d{2})/); if (m) info.valor = numBR(m[1]); }
    if (!info.emitNome) info.emitNome = mx(/RAZ\s?[AÃ]O SOCIAL\s+(.+?)\s+CNPJ/i) || mx(/RECEBI(?:\(EMOS\))?\s+DE\s+(.+?)\s+(?:A|O)\s+(?:QUANTIA|IMPORT)/i);
    if (!info.data) { const m = U.match(/(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/); if (m && MESES_PT[m[2].toLowerCase()]) info.data = `${m[3]}-${MESES_PT[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`; else { const d = dataBrDe(U); if (d) info.data = brToIso(d); } }
  }
  if (item.tipo === 'faturaFrete') {
    if (!info.valor) info.valor = numBR(mx(/Total\s+em\s*:?\s*R\$\s*([\d.]+,\d{2})/i) || mx(/TOTAL\s*(?:GERAL|A PAGAR)?\s*:?\s*R\$\s*([\d.]+,\d{2})/i));
    if (!info.emitNome) info.emitNome = mx(/\b([A-Z][A-Za-zÀ-ú .&-]{3,60}?(?:Log[ií]stic[as]?|Logistics|Shipping|Transportes?)[A-Za-zÀ-ú .&-]{0,40}?(?:Ltda|LTDA|S\.?A\.?))/) || mx(/\b([A-Z][A-Za-zÀ-ú .&-]{3,60}?\s(?:Ltda|LTDA))\s+CNPJ/);
    if (!info.data) { const d = mx(/Data de emiss[aã]o:?\s*(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
    info.vencimento = mx(/Vencimento:?\s*(\d{2}\/\d{2}\/\d{4})/i);
    info.refAgente = mx(/\b(EMIT[A-Z]?\d+\/\d{2})\b/);
    const conts = [...new Set(U.match(/[A-Z]{3}U\d{7}(?!\d)/g) || [])];
    info.containers = conts; if (conts[0]) info.container = conts[0];
    const toks = (U.match(/\b[A-Z]{2,5}\d{7,12}\b/g) || []).filter(t => !conts.includes(t) && !/^ACCESS/i.test(t) && !/^EMIT/i.test(t));
    info.booking = info.booking || toks[0] || '';
    const navio = U.match(/\b((?:MSC|MAERSK|COSCO|CMA CGM|HAPAG|EVERGREEN|ONE|HMM|ZIM|YANG MING|X-PRESS)\s+[A-Z][A-Z]+(?:\s+[A-Z]+)?)\b/);
    info.navio = navio ? navio[1] : '';
    const datas = (U.replace(/Vencimento:?\s*\d{2}\/\d{2}\/\d{4}/i, '').replace(/Data de emiss[aã]o:?\s*\d{2}\/\d{2}\/\d{4}/i, '').match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || []);
    if (/\bATD\b/i.test(U) && datas[0]) info.embarque = datas[0];   // ATD = saída real do navio
    if (/\bETA\b/i.test(U) && datas[1]) info.eta = datas[1];
    info.armador = /\bMSC\b/.test(info.navio) ? 'MSC' : /MAERSK/.test(info.navio) ? 'MAERSK' : /COSCO/.test(info.navio) ? 'COSCO' : /CMA/.test(info.navio) ? 'CMA CGM' : /HAPAG/.test(info.navio) ? 'Hapag-Lloyd' : /EVERGREEN/.test(info.navio) ? 'Evergreen' : '';
  }
  if (item.tipo === 'bl') {
    const C = T.replace(/\s+/g, '');
    const cx = re => { const m = C.match(re); return m ? m[1] : ''; };
    info.booking = info.booking || cx(/BookingNo\.?(\d{8,12})/i) || cx(/B\/LNo\.?:?(\d{8,12})/i) || cx(/B\/L:(\d{8,12})/i);
    const emb = cx(/ShippedonBoardDate(?:\(LocalTime\))?:?(\d{4}-\d{2}-\d{2})/i) || cx(/ShippedonBoard[^0-9]{0,40}(\d{4}-\d{2}-\d{2})/i);
    const emb2 = !emb && (C.match(/ShippedonBoard[^0-9]{0,40}(\d{2})[\/.-](\d{2})[\/.-](\d{4})/i));
    info.embarque = emb ? emb.split('-').reverse().join('/') : emb2 ? `${emb2[1]}/${emb2[2]}/${emb2[3]}` : '';
    info.dueNumero = info.dueNumero || cx(/DU-?E:?(\d{2}BR\d{9}-?\d)/i) || cx(/(\d{2}BR\d{9}-\d)/);
    info.refProcesso = cx(/INVOICEN[O°º.]*:?(FS\d{6})/i) || ((T.toUpperCase().match(/\bFS\s?\d{6}\b/) || [''])[0].replace(/\s/g, ''));
    const lacres = new Set((U.match(/\b[A-Z]{2}\s?-\s?[A-Z]{2}\d{5,9}\b/g) || []).map(x => x.replace(/\s/g, '')));
    info.containers = [...new Set((C.match(/[A-Z]{3}U\d{7}/g) || []))].filter(c => !lacres.has(c));
    info.lacre = [...lacres][0] || '';
    info.navio = (U.match(/V\s*e\s*s\s*s\s*e\s*l\s+(.{3,40}?)\s+V\s*o\s*y\s*a\s*g\s*e/i) || [])[1] || '';
    info.navio = info.navio.replace(/\s+(?=\S\s)/g, m => m).replace(/\s+/g, ' ').trim();
    info.armador = /MAEU|MAERSK/i.test(C) ? 'MAERSK' : /COSU|COSCO/i.test(C) ? 'COSCO' : /MSCU|\bMSC\b/i.test(C) ? 'MSC' : /CMDU|CMA/i.test(C) ? 'CMA CGM' : /HLCU|HAPAG/i.test(C) ? 'Hapag-Lloyd' : /EGLV|EVERGREEN/i.test(C) ? 'Evergreen' : /YMLU|YANGMING/i.test(C) ? 'Yang Ming' : '';
  }
  if (item.tipo === 'due') {
    info.dueNumero = info.dueNumero || mx(/\b(\d{2}BR\d{9}-?\d)\b/i);
    info.dueChave = info.dueChave || mx(/Chave de acesso:?\s*([0-9A-Z]{14})\b/i);
  }
  {
    const ct = U.match(/\b(FS\d{6})S?\s+(\d{9,10})\s+([A-Z]{4}\d{7})\b/);   // "FS260097 271229537 SEKU1633624"
    if (ct) { info.refProcesso = ct[1]; info.booking = ct[2]; info.container = ct[3]; }
    else { const c = U.match(/([A-Z]{3}U\d{7})(?!\d)/); if (c) info.container = info.container || c[1]; }
  }
  if (DOCS_COM_CUSTO.includes(item.tipo) && item.campoCusto === undefined) item.campoCusto = campoCustoSugerido(item);
}

function campoCustoSugerido(item) {
  if (item.tipo === 'cte') return 'custoFrete';
  if (item.tipo === 'faturaFrete') return 'custoMaritimo';
  const info = item.info || {};
  const quem = normTxt([item.nomeOriginal || item.nome, info.emitNome, info.pagamento && info.pagamento.recebedor, String(item.texto || '').slice(0, 800)].filter(Boolean).join(' '));
  const cat = categoriaPeloNome(normTxt([info.emitNome, info.pagamento && info.pagamento.recebedor].filter(Boolean).join(' ')))
    || item.categoria || categoriaPeloNome(normTxt(item.nomeOriginal || item.nome)) || categoriaPeloNome(quem);
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
  const peloBanco = p.docs._costBanco && p.docs._costBanco[campo];
  p[campo + '_status'] = peloBanco || (pago > 0 && pago + 0.01 >= total) ? 'Pago' : 'Em Aberto';
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
  }
  if (item.tipo === 'faturaFrete') {
    const set = (k, v) => { if (v && !p[k]) { p[k] = v; mud.push(k); } };
    set('booking', info.booking);
    set('saida', info.embarque);
    if (info.armador && (!p.companhia || p.companhia === 'MAERSK') && p.companhia !== info.armador && !(p.docs._bl)) { p.companhia = info.armador; mud.push('companhia'); }
    if (somarContainers(p, info.containers)) mud.push('container');
    p.docs._viagem = Object.assign({}, p.docs._viagem, { navio: info.navio, eta: info.eta, atd: info.embarque, refAgente: info.refAgente });
  }
  if (item.tipo === 'bl') {
    const set = (k, v) => { if (v && !p[k]) { p[k] = v; mud.push(k); } };
    set('booking', info.booking);
    set('saida', info.embarque);
    set('dueNumero', info.dueNumero);
    if (info.armador && (!p.companhia || p.companhia === 'MAERSK')) { if (p.companhia !== info.armador) mud.push('companhia'); p.companhia = info.armador; }
    if (somarContainers(p, info.containers)) mud.push('container');
    p.docs._bl = { booking: info.booking, embarque: info.embarque, navio: info.navio, lacre: info.lacre, containers: info.containers, due: info.dueNumero };
  }
  if (info.refProcesso === p.id && item.tipo !== 'bl') {
    if (info.booking && !p.booking) { p.booking = info.booking; mud.push('booking'); }
    if (somarContainers(p, [info.container])) mud.push('container');
  }
  // custos
  const campo = item.campoCusto !== undefined ? item.campoCusto : campoCustoSugerido(item);
  const valor = Math.round((Number(info.valor) || 0) / (item.divisao > 1 ? item.divisao : 1) * 100) / 100;
  if (campo && valor > 0 && DOCS_COM_CUSTO.includes(item.tipo)) {
    p.docs._custoDocs = p.docs._custoDocs || {};
    const reg = p.docs._custoDocs[campo] = p.docs._custoDocs[campo] || { fiscais: [], pagos: [] };
    const pago = item.tipo === 'pagamento' || item.tipo === 'recibo';
    const lista = pago ? reg.pagos : reg.fiscais;
    const chave = (!pago && info.chave) || url || item.fileId;
    const nf = x => String(x || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 10);
    const mesmaNota = !pago && lista.some(d => (Math.abs((Number(d.valor) || 0) - valor) < 0.01 && (!info.chave || !/^\d{44}$/.test(d.k)))
      || (d.tipo !== item.tipo && (d.tipo === 'faturaFrete' || item.tipo === 'faturaFrete') && nf(d.de) && nf(d.de) === nf(info.emitNome) && Math.abs((Number(d.valor) || 0) - valor) <= Math.max(5, valor * 0.05)));
    if (!lista.some(d => d.k === chave) && !mesmaNota) {
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
    // zera os custos que vieram de documentos (serão recalculados) — baixa pelo banco é mantida
    Object.keys(p.docs._custoDocs || {}).forEach(c => {
      if (!(p.docs._costBanco && p.docs._costBanco[c])) { p[c] = 0; p[c + '_status'] = 'Em Aberto'; }
      if (p.docs['_lanc_' + c]) { delete p.docs['_lanc_' + c].nfe; delete p.docs['_lanc_' + c].comprovante; }
      if (p.docs._costEmpresa) delete p.docs._costEmpresa[c];
    });
    p.docs._custoDocs = {}; delete p.docs._cambioDocs;
    const files = (p.docs._files) || {};
    for (const [tipo, arr] of Object.entries(files)) {
      if (['invoice', 'contrato', 'outros'].includes(tipo)) continue;
      for (const f of arr || []) {
        if (!f.id || (f.atalho && !f.divisao && tipo !== 'comprovantes')) continue;
        if (!f.nomeOriginal) { try { const m = await driveAPI('GET', '/files/' + f.id, null, 'fields=description'); const o = String(m.description || '').match(/Nome original:\s*(.+?)\s*(?:·|$)/); if (o) f.nomeOriginal = o[1].trim(); } catch (e) {} }
        if (!silencioso && S.entrada) { S.entrada.progresso = `Relendo ${p.id}: ${f.name}`; render(); }
        try {
          const it = await analisarArquivo({ id: f.id, name: f.name, mimeType: /\.xml$/i.test(f.name) ? 'application/xml' : /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.(png|jpe?g)$/i.test(f.name) ? 'image/png' : '', size: 1000 });
          it.tipo = tipo;                       // o tipo já foi confirmado ao anexar
          if (f.nomeOriginal) it.nomeOriginal = f.nomeOriginal;
          if (f.divisao) it.divisao = f.divisao;
          if ((!Number(it.info.valor) || f.valorManual) && Number(f.valor)) it.info.valor = Number(f.valor);
          if (!it.info.data && f.data) it.info.data = /^\d{4}-/.test(f.data) ? f.data : brToIso(f.data);
          delete it.campoCusto; enriquecerInfo(it);   // reler com o tipo confirmado
          if (f.campoCusto !== undefined) it.campoCusto = f.campoCusto;
          aplicarDocNoProcesso(it, p, { webViewLink: f.url, name: f.name });
        } catch (e) { console.warn('reler', f.name, e.message); }
      }
    }
    p.docs._docsV = 3; n++;
  }
  if (S.entrada) S.entrada.progresso = '';
  await saveToSheets();
  if (!silencioso) { showToast(`✅ ${n} processo(s) atualizados pelos documentos`); render(); }
}

// Processos anexados pela versão anterior: atualiza os campos uma vez (em segundo plano)
let _migrandoDocs = false;
async function migrarDocsV2() {
  if (_migrandoDocs || !window._sheetsToken) return;
  const ids = (S.processos || []).filter(p => p.docs && p.docs._files && Object.keys(p.docs._files).length && p.docs._docsV !== 3).map(p => p.id);
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

// Um processo pode ter vários containers (e um só BL): junta sem repetir
function somarContainers(p, novos) {
  const atuais = (p.containers || [p.container]).filter(Boolean).map(c => String(c).toUpperCase().replace(/[\s-]/g, ''));
  const add = (novos || []).filter(Boolean).map(c => String(c).toUpperCase().replace(/[\s-]/g, '')).filter(c => !atuais.includes(c));
  if (!add.length) return false;
  p.containers = atuais.concat(add); p.container = p.containers[0]; p.qtdContainer = String(p.containers.length);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Importar TUDO de uma pasta do Drive (acervo completo)
// 1. Lista as pastas e sugere quais importar (FS…, Comprovantes…, câmbio/DU-E, extratos)
// 2. Copia os arquivos para a Entrada (originais intactos; repetidos pelo conteúdo são pulados)
// 3. Cria os processos (pela invoice/contrato ou só pelo número da pasta)
// 4. Anexa o que foi identificado com segurança · o resto fica na Entrada para você conferir
// 5. Importa o OFX e faz a conciliação automática · mostra o que falta em cada processo
// ═══════════════════════════════════════════════════════════════
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const FS_DE = s => ((semAcento(s).match(/FS\s?\d{6}/) || [''])[0]).replace(/\s/g, '');
function tipoDaPasta(nome) {
  const u = semAcento(nome);
  if (/^FS\s?\d{6}/.test(u)) return 'processo';
  if (/^COMPROVANTE/.test(u)) return 'comprovantes';
  if (/EXTRATO/.test(u)) return 'extrato';
  if (/CAMBIO|CONTRATO|\bDUE\b|DU-E/.test(u)) return 'cambio';
  return '';
}
const ROTULO_PASTA = { processo: 'Processo', comprovantes: 'Despesas do mês', cambio: 'Câmbio / DU-E', extrato: 'Extrato do banco', soltos: 'Arquivos soltos', '': 'Não reconhecida' };
const ORDEM_PASTA = { processo: 0, cambio: 1, comprovantes: 2, extrato: 3, soltos: 4, '': 5 };

async function importarTudo(linkDado) {
  const E = S.entrada;
  const link = linkDado || await uiPrompt('Cole o link da pasta do Drive que tem todas as pastas (processos FS…, comprovantes, câmbio, extratos).\nOs arquivos são COPIADOS para a Entrada de teste; os originais não mudam.', 'https://drive.google.com/drive/folders/', 'Importar tudo de uma pasta');
  if (!link) return;
  const m = String(link).match(/folders\/([A-Za-z0-9_-]{10,})/) || String(link).trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) { await uiAlert('Link de pasta inválido. Copie o endereço da pasta no Drive (…/folders/…).'); return; }
  E.tudo = { etapa: 'Lendo as pastas...', rodando: true };
  render();
  try {
    await getAccessToken(); await ensureTestSheet();
    const filhos = await driveListAll(`'${m[1]}' in parents and trashed=false`, 'id,name,mimeType,md5Checksum,size');
    const pastas = [];
    for (const f of filhos.filter(x => x.mimeType === 'application/vnd.google-apps.folder')) {
      let tipo = tipoDaPasta(f.name);
      if (!tipo) {   // ex.: "maio a setembro": olha o que tem dentro
        const dentro = await driveListAll(`'${f.id}' in parents and trashed=false`, 'id,name,mimeType');
        if (dentro.some(x => /^CONTRATO\s*\d{6,}/.test(semAcento(x.name)) || /EXTRATO-?DUE/.test(semAcento(x.name))) || dentro.some(x => x.mimeType === 'application/vnd.google-apps.folder' && tipoDaPasta(x.name) === 'extrato')) tipo = 'cambio';
      }
      pastas.push({ id: f.id, nome: f.name.trim(), tipo, marcada: !!tipo });
    }
    const soltos = filhos.filter(x => x.mimeType !== 'application/vnd.google-apps.folder' && !/^application\/vnd\.google-apps/.test(x.mimeType));
    if (soltos.length) pastas.push({ id: '__soltos', nome: 'Arquivos soltos na pasta principal (' + soltos.length + '): ' + soltos.map(x => x.name).join(', '), tipo: 'soltos', marcada: false, arquivos: soltos });
    pastas.sort((a, b) => ORDEM_PASTA[a.tipo] - ORDEM_PASTA[b.tipo] || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
    E.tudo = { raiz: m[1], pastas, rodando: false };
  } catch (e) { E.tudo = { erro: e.message || String(e) }; }
  render();
}

async function executarImportacaoTudo() {
  const E = S.entrada, T = E.tudo;
  if (!T || T.rodando) return;
  const sel = T.pastas.filter(p => p.marcada);
  if (!sel.length) { showToast('Marque pelo menos uma pasta'); return; }
  T.rodando = true; T.erro = '';
  const rel = T.relatorio = { copiados: 0, pulados: 0, processosNovos: [], semInvoice: [], anexados: 0, pastaErrada: [], ofx: [], conc: null, inicio: Date.now() };
  const etapa = t => { T.etapa = t; render(); };
  try {
    await getAccessToken(); await ensureTestSheet();
    const entradaId = await getTesteFolder(ENTRADA_FOLDER);
    // ── 1. percorre as pastas marcadas ──
    const arquivos = [], ofx = [];
    const fila = [];
    sel.forEach(p => {
      if (p.tipo === 'soltos') p.arquivos.forEach(f => arquivos.push({ ...f, contexto: FS_DE(f.name) || '' }));
      else fila.push({ id: p.id, contexto: p.tipo === 'processo' ? FS_DE(p.nome) : p.tipo === 'comprovantes' ? 'ADM' : '', extrato: p.tipo === 'extrato', nome: p.nome });
    });
    while (fila.length) {
      const pasta = fila.shift();
      etapa(`Lendo a pasta ${pasta.nome}... (${arquivos.length} arquivos até agora)`);
      const filhos = await driveListAll(`'${pasta.id}' in parents and trashed=false`, 'id,name,mimeType,md5Checksum,size');
      for (const f of filhos) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          const t = tipoDaPasta(f.name), fs = FS_DE(f.name);
          // subpasta de câmbio dentro de um processo: o processo vem do contrato, não da pasta
          fila.push({ id: f.id, nome: pasta.nome + ' / ' + f.name.trim(), extrato: pasta.extrato || t === 'extrato', contexto: fs || (t === 'cambio' ? '' : t === 'comprovantes' ? 'ADM' : pasta.contexto) });
        } else if (/\.ofx$/i.test(f.name) || f.mimeType === 'application/x-ofx') {
          ofx.push(f);
        } else if (pasta.extrato) {
          // extratos mensais em PDF: ficam só guardados no Drive (o OFX já traz os movimentos)
        } else if (!/^application\/vnd\.google-apps/.test(f.mimeType) && !ACERVO_IGNORAR_ARQ.test(f.name)) {
          arquivos.push({ ...f, contexto: pasta.contexto, pasta: pasta.nome });
        }
      }
    }
    // ── 2. copia para a Entrada (pula o que já existe, pelo conteúdo) ──
    const ja = new Set();
    (await driveListAll(`'${entradaId}' in parents and trashed=false`, 'md5Checksum')).forEach(f => f.md5Checksum && ja.add(f.md5Checksum));
    (S.processos || []).forEach(p => Object.values(((p.docs || {})._files) || {}).forEach(arr => (arr || []).forEach(f => f.md5 && ja.add(f.md5))));
    ((S.banco && S.banco.docs) || []).forEach(d => d.md5 && ja.add(d.md5));
    const porMd5 = {};
    arquivos.forEach(f => { if (f.md5Checksum) (porMd5[f.md5Checksum] = porMd5[f.md5Checksum] || new Set()).add(f.contexto); });
    const copiadoMd5 = new Set();
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      if (f.md5Checksum && (ja.has(f.md5Checksum) || copiadoMd5.has(f.md5Checksum))) { if (ja.has(f.md5Checksum)) rel.pulados++; continue; }
      const ctxs = [...(f.md5Checksum ? porMd5[f.md5Checksum] : new Set([f.contexto]))].filter(c => c && c !== 'ADM');
      const fsNome = FS_DE(f.name);
      let nome = f.name.trim();
      if (ctxs.length && !(ctxs.length === 1 && fsNome === ctxs[0])) nome = `${ctxs.join('+')} - ${nome}`;
      else if (!ctxs.length && f.contexto === 'ADM' && !fsNome) nome = `ADM - ${nome}`;
      etapa(`Copiando ${i + 1} de ${arquivos.length}: ${f.name}`);
      try {
        await driveAPI('POST', '/files/' + f.id + '/copy', { name: nome, parents: [entradaId], description: 'Cópia do acervo (original: ' + f.id + (f.pasta ? ' · pasta: ' + f.pasta : '') + ')' }, 'fields=id');
        if (f.md5Checksum) copiadoMd5.add(f.md5Checksum);
        rel.copiados++;
      } catch (e) { console.warn('copiar', f.name, e.message); }
    }
    // ── 3. lê tudo (texto, OCR dos prints) ──
    etapa('Lendo os documentos (os prints passam pelo OCR do Google, pode demorar)...');
    E.lido = false; E.carregando = false;
    const progresso0 = setInterval(() => { if (E.progresso) { T.etapa = E.progresso; } }, 700);
    await lerEntrada();
    clearInterval(progresso0);
    if (E.erro) throw new Error(E.erro);
    // ── 4. cria os processos das pastas FS ──
    const ids = [...new Set(sel.filter(p => p.tipo === 'processo').map(p => FS_DE(p.nome)).filter(Boolean))];
    // processos citados pelas invoices/contratos soltos também
    E.itens.forEach(it => { const id = podeCriarProcesso(it); if (id && !ids.includes(id)) ids.push(id); });
    const novos = [];
    for (const id of ids.sort()) {
      if ((S.processos || []).some(p => p.id === id)) continue;
      etapa('Criando o processo ' + id + '...');
      const iDoc = E.itens.findIndex(it => podeCriarProcesso(it) === id);
      let p = iDoc >= 0 ? await criarProcessoDoDoc(iDoc, true) : null;
      if (!p) {
        p = montarProcesso({ proc: id, nome: id, id: '' }, null, null);
        S.processos.push(p);
        logAction('criar', 'PROCESSOS', p.id, 'pela pasta do Drive (sem invoice/contrato)');
        rel.semInvoice.push(id);
      }
      novos.push(p); rel.processosNovos.push(id);
    }
    if (novos.length) {
      await saveToSheets();
      for (const p of novos) { etapa('Criando a pasta do processo ' + p.id + ' no Drive...'); try { await criarPastaProcesso(p); } catch (e) { console.warn('pasta', p.id, e.message); } }
      await saveToSheets();
    }
    // ── 5. identifica de novo (agora os processos existem) e anexa o que é seguro ──
    E.itens.forEach(it => { try { identificarItem(it); } catch (e) { console.warn('identificar', it.nome, e); } });
    E.itens.forEach(it => {
      if (it.pastaErrada) rel.pastaErrada.push({ nome: (it.nome || '').replace(/^((?:FS\d{6}S?)(?:\+FS\d{6}S?)*|ADM) - /i, ''), estava: it.pastaErrada.estava.join(', '), certo: it.pastaErrada.certo, motivos: it.pastaErrada.motivos || [], auto: !!it.corrigido });
      else if (it.aviso && /^Conflito/.test(it.aviso)) rel.pastaErrada.push({ nome: it.nome, estava: (it.pastaProcessos || []).join(', '), certo: '?', motivos: [it.aviso], auto: false });
    });
    const existe = id => id === '__ADM' || (S.processos || []).some(p => p.id === id);
    const seguro = it => {
      if (!it.tipo || !it.processo || it.duplicado || it.confianca === 'nenhuma' || !existe(it.processo)) return false;
      if (it.info && it.info.pagamento && it.info.pagamento.valorIncerto) return false;
      if (DOCS_COM_CUSTO.includes(it.tipo) && !(Number(it.info && it.info.valor) > 0)) return false;
      if (it.confianca === 'alta') return true;
      if (it.pastaErrada && !it.corrigido) return false;
      if (/Conflito|confira/i.test(it.aviso || '') && !it.admAuto) return false;
      return true;
    };
    let rodada = 0, achou = true;
    while (achou && rodada++ < 5) {
      achou = false;
      for (let i = E.itens.length - 1; i >= 0; i--) {
        const it = E.itens[i];
        if (!seguro(it)) continue;
        etapa(`Anexando ${rel.anexados + 1}: ${it.nome}`);
        if (await confirmarEntrada(i, true)) { rel.anexados++; achou = true; }
      }
    }
    await saveToSheets();
    // ── 6. extrato OFX + conciliação automática ──
    if (ofx.length && typeof importarOFXBytes === 'function') {
      for (const f of ofx) {
        etapa('Importando o extrato ' + f.name + '...');
        try { const ok = await importarOFXBytes(new Uint8Array(await driveDownload(f.id)), f.name); rel.ofx.push({ nome: f.name, ok, texto: (S.banco.msg || {}).texto || '' }); }
        catch (e) { rel.ofx.push({ nome: f.name, ok: false, texto: e.message || String(e) }); }
      }
    }
    if (typeof autoConciliar === 'function' && S.banco && (S.banco.linhas || []).length) {
      etapa('Conferindo o extrato com os lançamentos...');
      try { await carregarBanco(); rel.conc = await autoConciliar(); } catch (e) { console.warn('conciliar', e); }
      await saveToSheets();
    }
    rel.paraConferir = E.itens.length;
    rel.fim = Date.now();
    T.rodando = false; T.pastas = null; T.etapa = '';
    showToast('✅ Importação concluída');
  } catch (e) {
    T.rodando = false; T.erro = (e.message || String(e)) + ' — pode tocar em "Importar" de novo: o que já entrou não é repetido.';
  }
  render();
}

function marcarPastaTudo(i, v) { const T = S.entrada.tudo; if (T && T.pastas && T.pastas[i]) T.pastas[i].marcada = v; render(); }

// O que falta em cada processo (lista única)
function relatorioFaltas() {
  return (S.processos || []).map(p => ({ id: p.id, cliente: p.cliente || '', faltas: (typeof pendenciasProcesso === 'function' ? pendenciasProcesso(p) : []), abertos: (typeof custosAbertos === 'function' ? custosAbertos(p) : []) }))
    .filter(x => x.faltas.length || x.abertos.length).sort((a, b) => a.id.localeCompare(b.id));
}

function blocoImportarTudo() {
  const E = S.entrada, T = E.tudo;
  if (!T) return '';
  const caixa = (corpo, cor) => `<div class="card" style="padding:16px;margin-bottom:12px;${cor ? 'border-left:3px solid ' + cor : ''}">${corpo}</div>`;
  if (T.erro && !T.pastas && !T.relatorio) return caixa(`<div style="color:var(--red);font-size:13px">⚠️ ${escHtml(T.erro)}</div>`, 'var(--red)');
  if (T.rodando) return caixa(`<div style="font-weight:700;font-size:14px;margin-bottom:6px">⏳ Importando…</div><div style="font-size:12.5px;color:var(--muted2)">${escHtml(T.etapa || '')}</div><div style="font-size:11.5px;color:var(--muted);margin-top:8px">Deixe esta tela aberta. Se parar no meio, é só importar de novo: o que já entrou não é repetido.</div>`, 'var(--accent)');
  if (T.pastas) {
    const linha = (p, i) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" style="width:auto;margin-top:3px" ${p.marcada ? 'checked' : ''} onchange="marcarPastaTudo(${i},this.checked)">
        <span style="min-width:0"><span style="font-size:13.5px;font-weight:600;word-break:break-word">${escHtml(p.nome)}</span>
        <span style="display:block;font-size:11.5px;color:${p.tipo ? 'var(--muted2)' : 'var(--muted)'}">${escHtml(ROTULO_PASTA[p.tipo])}</span></span></label>`;
    const n = T.pastas.filter(p => p.marcada).length;
    return caixa(`<div style="font-weight:700;font-size:14px">Quais pastas importar?</div>
      <div style="font-size:12px;color:var(--muted2);margin:4px 0 8px">As reconhecidas já vêm marcadas. Desmarque o que não tem a ver com o sistema.</div>
      ${T.pastas.map(linha).join('')}
      ${T.erro ? `<div style="color:var(--red);font-size:12.5px;margin-top:8px">⚠️ ${escHtml(T.erro)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" style="min-height:42px" onclick="executarImportacaoTudo()" ${n ? '' : 'disabled'}>Importar ${n} pasta(s)</button><button class="btn btn-secondary btn-sm" style="min-height:42px" onclick="S.entrada.tudo=null;render()">Cancelar</button></div>`, 'var(--accent)');
  }
  const R = T.relatorio; if (!R) return '';
  const faltas = relatorioFaltas();
  const min = Math.max(1, Math.round((R.fim - R.inicio) / 60000));
  const li = s => `<li style="margin:3px 0">${s}</li>`;
  return caixa(`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="font-weight:700;font-size:15px">✅ Importação concluída</div><button class="btn btn-secondary btn-xs" onclick="S.entrada.tudo=null;render()">Fechar</button></div>
    <ul style="font-size:13px;margin:8px 0 0 18px;padding:0">
      ${li(`${R.copiados} arquivo(s) copiados${R.pulados ? ` · ${R.pulados} já existiam (não repetidos)` : ''} · ${min} min`)}
      ${li(`${R.processosNovos.length} processo(s) criados${R.semInvoice.length ? ` · sem invoice/contrato: <b>${R.semInvoice.join(', ')}</b>` : ''}`)}
      ${li(`${R.anexados} documento(s) anexados automaticamente`)}
      ${R.paraConferir ? li(`<b>${R.paraConferir} ficaram aqui na Entrada para você conferir</b> (abaixo)`) : ''}
      ${R.ofx.map(o => li(`Extrato ${escHtml(o.nome)}: ${o.ok ? escHtml(o.texto.replace(/^Extrato íntegro: /, '')) : '⚠️ ' + escHtml(o.texto)}`)).join('')}
      ${R.conc ? li(`Conciliação automática: ${R.conc.cambio} câmbio(s), ${R.conc.baixas} pagamento(s) ligados, ${R.conc.regras} tarifas/regras, ${R.conc.rendimentos} rendimento(s) · ${R.conc.pendentes} movimento(s) do banco para conferir na Conciliação`) : ''}
    </ul>
    ${R.pastaErrada.length ? `<div style="font-weight:700;font-size:14px;margin-top:14px">📁 Arquivos em pasta errada (${R.pastaErrada.length})</div>
      <div style="font-size:12px;color:var(--muted2);margin-bottom:4px">Nada foi movido no seu Drive. ${R.pastaErrada.some(x => x.auto) ? '"Corrigido" = já foi anexado ao processo certo.' : ''}</div>
      ${R.pastaErrada.map(x => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--border)"><b>${escHtml(x.nome)}</b><br>estava em ${escHtml(x.estava || '—')} → ${x.certo === '?' ? 'confira' : 'é do <b>' + escHtml(x.certo) + '</b>'} ${x.auto ? '<span style="color:var(--green)">· corrigido</span>' : '<span style="color:var(--yellow)">· confira abaixo</span>'}<br><span style="color:var(--muted)">${escHtml((x.motivos || []).join(', '))}</span></div>`).join('')}` : ''}
    <div style="font-weight:700;font-size:14px;margin-top:14px">📋 O que falta em cada processo (${faltas.length})</div>
    ${faltas.length ? faltas.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:13.5px;font-weight:700;cursor:pointer;color:var(--accent)" onclick="abrirProcesso2('${escHtml(x.id)}')">${escHtml(x.id)} <span style="font-weight:400;color:var(--muted2)">${escHtml(x.cliente)}</span></div>
      <div style="font-size:12.5px;color:var(--muted2)">${escHtml(x.faltas.map(f => f.texto).concat(x.abertos.map(a => PROCESS_COST_FIELDS[a.campo] + ' a pagar ' + 'R$ ' + fmt(a.aberto))).join(' · '))}</div></div>`).join('') : '<div style="font-size:13px;color:var(--green)">Nenhuma pendência.</div>'}`, 'var(--green)');
}
