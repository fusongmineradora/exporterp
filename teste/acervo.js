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
  const id = n.replace(/\s/g, '').replace(/^(FS\d{6})S$/, '$1');
  return id ? processoAtual(id) : id;
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
    // NFS-e de prefeitura (hotéis etc.): vale o VALOR LÍQUIDO; a DATA FATO GERADOR é o dia do pagamento
    if (!info.valor) { const w = U.match(/VALOR L[IÍ]QUIDO\s*\(R\$\)([\s\S]{0,400})/i); if (w) { const vs = (w[1].match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(numBR); if (vs.length && Math.max(...vs) > 0) info.valor = Math.max(...vs); } }
    if (!info.data) { const d = mx(/DATA FATO GERADOR[\s\S]{0,250}?(\d{2}\/\d{2}\/\d{4})/i); if (d) info.data = brToIso(d); }
    if (!info.emitNome) info.emitNome = mx(/Nome empresarial:\s*(.+?)\s+Endere[cç]o/i) || mx(/RECEBI\(EMOS\) DA EMPRESA:\s*(.+?)\s+A NOTA/i)
      || mx(/(?:EMITENTE DA NFS-?e|Prestador do Servi[cç]o)[\s\S]{0,120}?Nome \/ Nome Empresarial\s+(.+?)\s+(?:Inscri|CNPJ|CEP)/i) || mx(/Nome \/ Nome Empresarial\s+(.+?)\s+(?:Inscri|CNPJ|CEP)/i);
    if (!info.valor) info.valor = numBR(mx(/VALOR (?:TOTAL )?DOS? SERVI[CÇ]OS?:?\s*R?\$?\s*([\d.]+,\d{2})/i) || mx(/Valor l[ií]quido da NFS-?e[\s\S]{0,60}?([\d.]+,\d{2})/i) || mx(/VALOR TOTAL DA NFS-?E[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i));
    // NFS-e municipal (layout "VALOR SERVIÇO (R$) ... ISS (R$) 450,00", prestador no fim)
    if (!info.valor) info.valor = numBR(mx(/VALOR SERVI[CÇ]O \(R\$\)[\s\S]{0,200}?([\d.]+,\d{2})/i));
    if (!info.valor) {   // último recurso: o valor que se repete (valor do serviço = base de cálculo = valor líquido)
      const cont = {}; (U.match(/(?<![\d.,])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d])/g) || []).map(numBR).filter(v => v > 0).forEach(v => { cont[v] = (cont[v] || 0) + 1; });
      const rep = Object.entries(cont).filter(([, n]) => n >= 2).map(([v]) => Number(v)).sort((a, b) => b - a);
      if (rep.length) info.valor = rep[0];
    }
    if (!info.emitNome) { const r = [...U.matchAll(/Raz[aã]o Social:\s*(.+?)\s+(?:Endere[cç]o|Nome Fantasia)/gi)].map(m => m[1].trim()).find(n => !/FU\s?SONG/i.test(n)); if (r) info.emitNome = r; }
    if (!info.emitCnpj) { const c = [...U.matchAll(/CPF\/CNPJ:\s*([\d.\/-]{14,18})/gi)].map(m => m[1].replace(/\D/g, '')).filter(x => x.length === 14 && x !== FU_SONG_CNPJ); if (c.length) info.emitCnpj = c[c.length - 1]; }
    if (!info.data) { const d = mx(/EMITID[OA] EM\s+(\d{2}\/\d{2}\/\d{4})/i); if (d) info.data = brToIso(d); }
    if (!info.data) { const d = mx(/EMITIDA EM\s+(\d{2}\/\d{2}\/\d{4})/i) || mx(/Data da emiss[aã]o da NFS-?e\s+(\d{2}\/\d{2}\/\d{4})/i) || dataBrDe(U); if (d) info.data = brToIso(d); }
  }
  if (item.tipo === 'recibo') {
    const J = U.replace(/\b([A-ZÀ-Ú]) (?=[A-ZÀ-Ú]\b)/g, '$1');   // "V A L O R T O T A L" → "VALORTOTAL"
    if (!info.valor) {
      // o valor total é o maior do recibo (o texto do PDF pode vir fora de ordem: "VALOR TOTAL RECEBIDO" seguido da parte em DINHEIRO)
      const todos = [...U.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m => numBR(m[1])).filter(v => v > 0);
      const m = J.match(/VALOR\s*TOTAL\s*RECEBIDO[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i);
      info.valor = todos.length ? Math.max(...todos) : (m ? numBR(m[1]) : 0);
    }
    { const pix = U.match(/PIX\s*[—-]?\s*[A-ZÀ-Ú]*\s*R\$\s*([\d.]+,\d{2})/i), din = U.match(/DINHEIRO\s*R\$\s*([\d.]+,\d{2})/i);
      if (pix) info.reciboPix = numBR(pix[1]); if (din) info.reciboDinheiro = numBR(din[1]); }
    if (!info.emitCnpj) { const c = (U.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || []).map(x => x.replace(/\D/g, '')).find(x => x !== FU_SONG_CNPJ); if (c) info.emitCnpj = c; }
    if (!info.emitNome) { const n = U.match(/C\s*N\s*PJ\s+([A-ZÀ-Ú][A-ZÀ-Ú .&-]{3,60}?(?:LTDA|S\.?A\.?|EIRELI|ME))\b/); if (n) info.emitNome = n[1]; }
    if (!info.emitNome) info.emitNome = mx(/RAZ\s?[AÃ]O SOCIAL\s+(.+?)\s+CNPJ/i) || mx(/RECEBI(?:\(EMOS\))?\s+DE\s+(.+?)\s+(?:A|O)\s+(?:QUANTIA|IMPORT)/i);
    if (!info.data) { const m = U.match(/(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/); if (m && MESES_PT[m[2].toLowerCase()]) info.data = `${m[3]}-${MESES_PT[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`; else { const d = dataBrDe(U); if (d) info.data = brToIso(d); } }
  }
  if (item.tipo === 'boleto') {   // boleto de cobrança (a conta a pagar, não o comprovante)
    if (!info.valor) info.valor = numBR(mx(/VALOR DO DOCUMENTO[\s\S]{0,120}?R\$\s*([\d.]+,\d{2})/i) || mx(/R\$\s*([\d.]+,\d{2})/));
    const d = U.match(/Data Emiss[aã]o\s+Data Vencimento[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (d) { if (!info.data) info.data = brToIso(d[1]); info.vencimento = d[2]; }
    else { if (!info.data) { const x = dataBrDe(U); if (x) info.data = brToIso(x); } info.vencimento = mx(/VENCIMENTO[\s\S]{0,60}?(\d{2}\/\d{2}\/\d{4})/i); }
    if (!info.emitNome) {
      const pares = [...U.matchAll(/([A-ZÀ-Ú][A-Za-zÀ-ú0-9 .&-]{3,90}?)\s+(?:CNPJ:?\s*)?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g)].filter(m => m[2].replace(/\D/g, '') !== FU_SONG_CNPJ && !/FU\s?SONG/i.test(m[1]));
      const par = pares.filter(m => !/\d/.test(m[1])).pop() || pares.pop();
      if (par) { info.emitNome = par[1].split(/\.\s+/).pop().replace(/^(Endere[cç]o|Benefici[aá]rio)\s+/i, '').trim(); info.emitCnpj = par[2].replace(/\D/g, ''); }
    }
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
    || item.categoria || categoriaPeloNome(normTxt(item.nomeOriginal || item.nome)) || (item.tipo === 'nfe' || item.tipo === 'nfse' ? '' : categoriaPeloNome(quem));   // NF-e de compra: o texto da nota (porto, frete…) não muda o custo
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
  const recibos = (reg.pagos || []).filter(d => d.tipo === 'recibo').map(d => Number(d.valor) || 0);
  const recibo = Math.max(0, ...recibos), reciboSoma = recibos.reduce((a, v) => a + v, 0);
  // recibo do valor total = quitação (já inclui os PIX); recibo menor que a nota = parte paga em dinheiro → soma com os PIX
  const quitaTudo = recibo > 0 && (!fiscal || recibo + 0.01 >= fiscal * 0.98);
  const pago = !recibo ? pix : quitaTudo ? Math.max(pix, recibo) : pix + reciboSoma;
  // marítimo, armazém e serviços de terceiros: vale o que foi pago (a fatura/nota é opcional e às vezes é de outra coisa)
  const total = ['custoMaritimo', 'custoArmazem', 'custoServTerceiros', 'custoDespachante'].includes(campo) ? Math.max(fiscal, pago) : (fiscal || pago);
  const manual = p.docs._valorManual && p.docs._valorManual[campo] != null ? Number(p.docs._valorManual[campo]) : null;
  p[campo] = Math.round((manual != null ? manual : total) * 100) / 100;
  const peloBanco = p.docs._costBanco && p.docs._costBanco[campo];
  // adiantamento ao fornecedor sem a nota ainda: fica "Em Aberto" até chegar a nota (e o saldo, se houver)
  const adiant = (reg.pagos || []).filter(d => d.adiant).reduce((a, d) => a + (Number(d.valor) || 0), 0);
  p.docs._costAdiant = p.docs._costAdiant || {};
  if (adiant > 0 && !fiscal) p.docs._costAdiant[campo] = Math.round(adiant * 100) / 100; else delete p.docs._costAdiant[campo];
  const alvo = manual != null ? manual : total;
  p[campo + '_status'] = p.docs._statusManual && p.docs._statusManual[campo] ? p.docs._statusManual[campo] : adiant > 0 && !fiscal && manual == null ? 'Em Aberto' : (peloBanco && manual == null && (!pago || pago + 0.01 >= alvo * 0.98)) || (pago > 0 && pago + 0.01 >= alvo) ? 'Pago' : 'Em Aberto';
  const datas = (reg.pagos || []).map(d => d.data).filter(Boolean).sort();
  if (datas.length) { p.docs._costData = p.docs._costData || {}; p.docs._costData[campo] = datas[datas.length - 1]; }
  const comp = (reg.pagos || []).find(d => d.url);
  if (comp) { p.docs._costComp = p.docs._costComp || {}; p.docs._costComp[campo] = comp.url; }
  p.docs._costPago = p.docs._costPago || {}; p.docs._costPago[campo] = Math.round(pago * 100) / 100;
  if (p.docs._previsto && p.docs._previsto[campo] && ((reg.fiscais || []).length || (reg.pagos || []).length)) delete p.docs._previsto[campo];   // chegou o real
  // botões do lançamento (Comprov. / NF-e) já ficam marcados com os arquivos
  const lanc = p.docs['_lanc_' + campo] = p.docs['_lanc_' + campo] || {};
  if (comp && !lanc.comprovante) lanc.comprovante = comp.url;
  const nota = (reg.fiscais || []).find(d => d.url);
  if (nota && !lanc.nfe) lanc.nfe = nota.url;
  const emp = [...(reg.fiscais || []), ...(reg.pagos || [])].map(d => d.de).find(Boolean);
  if (emp) { p.docs._costEmpresa = p.docs._costEmpresa || {}; if (!p.docs._costEmpresa[campo]) p.docs._costEmpresa[campo] = titulo(emp); }
}

function aplicarCambioNoProcesso(p, c, url) {
  // processo "S" (FS260109S) é a mesma venda do FS260109: receita e câmbio ficam só no principal
  if (/^FS\d{6}S$/.test(p.id) && (S.processos || []).some(q => q.id === p.id.slice(0, -1))) return false;
  const f = (c.faturas || []).find(x => x.processo === p.id || x.processo.replace(/S$/, '') === p.id);
  if (!f || !f.usd) return false;
  const taxa = Number(c.taxa) || (c.valorReais && c.valorMoeda ? c.valorReais / c.valorMoeda : 0);
  p.docs._cambioDocs = p.docs._cambioDocs || {};
  // o extrato (OFX) é a verdade: se a linha do banco já foi conciliada, o valor em reais é o do banco
  const antes = p.docs._cambioDocs[c.referencia || url];
  const banco = antes && antes.banco != null && Math.abs((antes.usd || 0) - f.usd) < 0.01 ? antes.banco : null;
  p.docs._cambioDocs[c.referencia || url] = { usd: f.usd, taxa, reais: banco != null ? banco : Math.round(f.usd * taxa * 100) / 100, data: (antes && antes.dataBanco) || c.data || '', contrato: c.contratoExtrato || '', url };
  if (banco != null) { p.docs._cambioDocs[c.referencia || url].banco = banco; p.docs._cambioDocs[c.referencia || url].dataBanco = antes.dataBanco; }
  const cs = Object.values(p.docs._cambioDocs);
  const usd = cs.reduce((a, x) => a + x.usd, 0), reais = cs.reduce((a, x) => a + x.reais, 0);
  p.cambioRecebido = Math.round(usd * 100) / 100;
  p.cambioReais = Math.round(reais * 100) / 100;
  p.cambioTaxa = usd ? Math.round(reais / usd * 10000) / 10000 : 0;
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
  // invoice / sales contract da Fu Song (a "versão Ademir" não vale): invoice dá o valor; o contrato só confirma
  if ((item.tipo === 'invoice' || item.tipo === 'contrato') && !/ADEMIR/i.test(semAcento(item.nome || (upd && upd.name) || ''))) {
    const d = docVendaDoItem(item);
    if (d && d.totalUsd && !p.docs._invoiceCorrigida && (!d.numero || processoAtual(d.numero) === p.id || d.numero === p.id)) {
      if (d.contrato) { p.docs._contratoUsd = d.totalUsd; }
      else {
        p.docs._invoiceUsd = d.totalUsd;
        if (!(Number(p.cambioInvoice) > 0)) { p.cambioInvoice = d.totalUsd; mud.push('cambioInvoice'); }
        ['cliente', 'produto', 'ncm', 'pol', 'pod', 'incoterm', 'pagamento', 'peso'].forEach(k => { if (d[k] && !p[k]) { p[k] = d[k]; mud.push(k); } });
      }
    }
  }
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
  const valor = item.divisaoValores && item.divisaoValores[p.id] != null ? Math.round(Number(item.divisaoValores[p.id]) * 100) / 100
    : Math.round((Number(info.valor) || 0) / (item.divisao > 1 ? item.divisao : 1) * 100) / 100;
  if (campo && valor > 0 && DOCS_COM_CUSTO.includes(item.tipo)) {
    p.docs._custoDocs = p.docs._custoDocs || {};
    const reg = p.docs._custoDocs[campo] = p.docs._custoDocs[campo] || { fiscais: [], pagos: [] };
    const pago = item.tipo === 'pagamento' || item.tipo === 'recibo';
    const lista = pago ? reg.pagos : reg.fiscais;
    const chave = (!pago && info.chave) || url || item.fileId;
    const nf = x => String(x || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, 10);
    const mesmaNota = !pago && lista.some(d => (Math.abs((Number(d.valor) || 0) - valor) < 0.01 && (!info.chave || !/^\d{44}$/.test(d.k)))
      || (d.tipo !== item.tipo && (d.tipo === 'faturaFrete' || item.tipo === 'faturaFrete') && nf(d.de) && nf(d.de) === nf(info.emitNome) && Math.abs((Number(d.valor) || 0) - valor) <= Math.max(5, valor * 0.05)));
    // a mesma nota (chave de acesso) já lançada em outro custo do processo — ex.: o PDF da NF cujo XML já entrou: não lança de novo
    const jaEmOutro = !pago && info.chave && Object.entries(p.docs._custoDocs).some(([c, r]) => c !== campo && (r.fiscais || []).some(d => d.k === info.chave));
    if (!lista.some(d => d.k === chave) && !mesmaNota && !jaEmOutro) {
      lista.push({ k: chave, url, valor, tipo: item.tipo, adiant: info.adiantamento && pago ? true : undefined, data: info.data ? isoToBr(info.data) : (info.pagamento && info.pagamento.data) || '', nome: (upd && upd.name) || item.nome, de: info.emitNome || (info.pagamento && info.pagamento.recebedor) || '' });
      // pago com o cartão / conta pessoal do sócio: conta como pago no processo e vira reembolso a fazer
      if (!pago && item.pagoPor === 'socio' && !reg.pagos.some(d => d.k === 'socio:' + chave)) reg.pagos.push({ k: 'socio:' + chave, url, valor, tipo: 'socio', data: info.data ? isoToBr(info.data) : '', nome: 'pago pelo sócio (reembolsar)', de: info.emitNome || '' });
      recalcularCustos(p, campo);
      mud.push(PROCESS_COST_FIELDS[campo] + (pago ? ' pago' : ' devido') + ' R$ ' + valor.toFixed(2));
      if (item.pagoPor === 'socio') lancarReembolsoSocio(item, p, upd);
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
const FS_DE = s => ((semAcento(s).match(/FS\s?\d{6}(?:S(?![A-Z0-9]))?/) || [''])[0]).replace(/\s/g, '');   // inclui o "S" (FS260109S)
function tipoDaPasta(nome) {
  const u = semAcento(nome);
  if (/^99\s*-?\s*ARQUIVO|ORIGINAIS/.test(u)) return '';   // "99 Arquivo - Originais Câmbio": o ERP não lê (valem as cópias FS na 05 Financeiro)
  if (/CANCELAD/.test(u) && !/^FS\s?\d{6}/.test(u)) return 'cancelados';
  if (/^FS\s?\d{6}/.test(u)) return 'processo';
  if (/^COMPROVANTE|DESPESAS GERAIS|^20\d{2}(-\d{2})?\b|EMPRESTIMOS? (?:DO |AO )?SOCIO/.test(u)) return 'comprovantes';   // organização nova: Despesas Gerais / 2026 / 2026-08 Agosto, Empréstimos sócio
  if (/EXTRATO/.test(u)) return 'extrato';
  if (/CAMBIO|CONTRATO|\bDUE\b|DU-E/.test(u)) return 'cambio';
  return '';
}
// Nome de pasta no padrão "FS2601xx - Booking - Cliente - Produto - Destino" (partes podem faltar)
function lerNomePastaProcesso(nome) {
  const partes = String(nome || '').split(/\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
  const cab = partes[0] || ''; const id0 = FS_DE(cab); if (!id0) return null; const id = processoAtual(id0);
  const ids = [id];
  // "FS260109 + 109S" → FS260109 e FS260109S
  (cab.toUpperCase().match(/\+\s*(?:FS\s?)?\d{2,6}S?/g) || []).forEach(t => {
    const tok = t.replace(/[^0-9S]/g, ''), dig = tok.replace(/S$/, '');
    ids.push('FS' + id.slice(2, 8 - dig.length) + dig + (tok.endsWith('S') ? 'S' : ''));
  });
  const r = { id, ids: [...new Set(ids.map(processoAtual))], cancelado: /CANCELAD/i.test(nome), nome: String(nome || '').trim() };
  const resto = partes.slice(1).filter(x => !/^(booking\s+pendente|pendente|cancelad[oa])$/i.test(x));
  const bk = resto[0] ? resto[0].split(/\s*\+\s*/) : null;
  if (bk && bk.every(x => /^[A-Z0-9]{6,20}$/i.test(x) && /\d/.test(x))) { r.bookings = bk.map(x => x.toUpperCase()); r.booking = r.bookings[0]; resto.shift(); }
  if (resto.length >= 3) { r.cliente = resto[0]; r.produto = resto.slice(1, -1).join(' - '); r.destino = resto[resto.length - 1]; }
  else if (resto.length === 2) { r.cliente = resto[0]; r.destino = resto[1]; }
  else if (resto.length === 1) r.cliente = resto[0];
  return r;
}
function nomePastaPadrao(p) {
  const curto = t => String(t || '').replace(/\s*(Co\.?,?\s*Ltd\.?|Trading|LTDA|Limited)\b.*$/i, '').trim().split(/\s+/).slice(0, 3).join(' ');
  const destino = String(p.pod || p.destino || '').split(',')[0].trim();
  return [p.id, p.booking || '', curto(p.cliente), String(p.produto || '').trim(), destino].map(x => String(x).replace(/[\/\\]/g, ' ')).join(' - ').replace(/(\s-\s)+$/, '');
}
const ROTULO_PASTA = { cancelados: 'Processos cancelados', processo: 'Processo', comprovantes: 'Despesas do mês', cambio: 'Câmbio / DU-E', extrato: 'Extrato do banco', soltos: 'Arquivos soltos', '': 'Não reconhecida' };
const ORDEM_PASTA = { cancelados: 0.5, processo: 0, cambio: 1, comprovantes: 2, extrato: 3, soltos: 4, '': 5 };

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
    const fila = [], pastasFS = [];
    const anotarFS = (nome, cancelado) => { const info = lerNomePastaProcesso(nome); if (info) { if (cancelado) info.cancelado = true; pastasFS.push(info); } };
    sel.forEach(p => {
      if (p.tipo === 'soltos') p.arquivos.filter(f => !ACERVO_IGNORAR_ARQ.test(f.name)).forEach(f => arquivos.push({ ...f, contexto: FS_DE(f.name) || '' }));
      else { if (p.tipo === 'processo') anotarFS(p.nome, false); fila.push({ id: p.id, contexto: p.tipo === 'processo' ? FS_DE(p.nome) : p.tipo === 'comprovantes' ? 'ADM' : '', extrato: p.tipo === 'extrato', nome: p.nome, cancelado: p.tipo === 'cancelados' }); }
    });
    while (fila.length) {
      const pasta = fila.shift();
      etapa(`Lendo a pasta ${pasta.nome}... (${arquivos.length} arquivos até agora)`);
      const filhos = await driveListAll(`'${pasta.id}' in parents and trashed=false`, 'id,name,mimeType,md5Checksum,size');
      for (const f of filhos) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (/^99\s*-?\s*ARQUIVO|ORIGINAIS/.test(semAcento(f.name))) continue;
          const t = tipoDaPasta(f.name), fs = FS_DE(f.name);
          if (fs) anotarFS(f.name, pasta.cancelado);
          // subpasta de câmbio dentro de um processo: o processo vem do contrato, não da pasta
          fila.push({ id: f.id, nome: pasta.nome + ' / ' + f.name.trim(), cancelado: pasta.cancelado, extrato: pasta.extrato || t === 'extrato', dossie: pasta.dossie || /DOSSI/.test(semAcento(f.name)), contexto: fs || (t === 'cambio' ? '' : t === 'comprovantes' ? 'ADM' : pasta.contexto) });
        } else if (/\.ofx$/i.test(f.name) || f.mimeType === 'application/x-ofx') {
          ofx.push(f);
        } else if (pasta.extrato && /\.(xlsx|xls|csv)$/i.test(f.name)) {
          arquivos.push({ ...f, contexto: '', pasta: pasta.nome });   // planilha do banco (contrato → processo / DU-E)
        } else if (pasta.extrato) {
          // extratos mensais em PDF: ficam só guardados no Drive (o OFX já traz os movimentos)
        } else if (!/^application\/vnd\.google-apps/.test(f.mimeType) && !ACERVO_IGNORAR_ARQ.test(f.name)) {
          arquivos.push({ ...f, contexto: pasta.contexto, pasta: pasta.nome, dossie: !!pasta.dossie });
        }
      }
    }
    // ── 2. copia para a Entrada (pula o que já existe, pelo conteúdo) ──
    const ja = new Set();
    (await driveListAll(`'${entradaId}' in parents and trashed=false`, 'md5Checksum')).forEach(f => f.md5Checksum && ja.add(f.md5Checksum));
    (S.processos || []).forEach(p => Object.values(((p.docs || {})._files) || {}).forEach(arr => (arr || []).forEach(f => f.md5 && ja.add(f.md5))));
    ((S.banco && S.banco.docs) || []).forEach(d => d.md5 && ja.add(d.md5));
    try { const pc = await getTesteFolder('🏦 Câmbio'); (await driveListAll(`'${pc}' in parents and trashed=false`, 'md5Checksum')).forEach(f => f.md5Checksum && ja.add(f.md5Checksum)); } catch (e) {}
    const porMd5 = {};
    // "FS260100 - Assessoria - R$ 600,00 (parte do PIX de R$ 5.400,00 …)": o valor de cada pasta para o mesmo comprovante
    window._partesPorMd5 = window._partesPorMd5 || {};
    arquivos.forEach(f => { const ctx = f.contexto; if (!f.md5Checksum || !/^FS\d{6}S?$/.test(ctx || '')) return; const v = /parte do PIX|rateio/i.test(f.name) ? lerNomeArquivo(f.name).valor : 0; if (v > 0) (window._partesPorMd5[f.md5Checksum] = window._partesPorMd5[f.md5Checksum] || {})[processoAtual(ctx)] = v; });
    // cópia guardada num dossiê (ex.: "07 Dossiê RFB" do FS260113 com os contratos de outros processos) não liga o arquivo ao processo do dossiê
    arquivos.filter(f => !f.dossie).forEach(f => { if (f.md5Checksum) (porMd5[f.md5Checksum] = porMd5[f.md5Checksum] || new Set()).add(f.contexto); });
    arquivos.filter(f => f.dossie).forEach(f => { if (f.md5Checksum && !porMd5[f.md5Checksum]) porMd5[f.md5Checksum] = new Set([f.contexto]); });
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
    const ids = [...new Set(pastasFS.flatMap(x => x.ids))];
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
    // o nome da pasta ("FS260113 - 276143168 - Thomas - Lítio - Xiamen") completa o que faltar; "99 Cancelados" → status Cancelado
    pastasFS.forEach(info => info.ids.forEach((id, k) => {
      const p = (S.processos || []).find(q => q.id === id); if (!p) return;
      const bk = (info.bookings || [])[k] || (info.ids.length === 1 ? info.booking : '');
      if (bk && !p.booking) p.booking = bk;
      p.docs = p.docs || {};
      if (info.cliente) { p.docs._apelido = info.cliente; if (!p.cliente) p.cliente = info.cliente; }
      if (info.produto && !p.produto) p.produto = info.produto;
      if (info.destino && !p.pod) p.pod = info.destino;
      if (info.ids.length === 1 || info.ids[0] === id) p.docs._nomePasta = info.nome;
      if (info.cancelado && p.status !== 'Cancelado') { p.status = 'Cancelado'; logAction('editar', 'PROCESSOS', p.id, 'Cancelado (pasta 99 Cancelados)'); }
    }));
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

// ═══════════════════════════════════════════════════════════════
// Cadastros automáticos: quem emitiu a nota / recebeu o pagamento vira fornecedor
// (Fornecedor, Transportadora, Despachante, Agente de Carga, Armazém, Serviço de Terceiros).
// Clientes vêm da invoice / contrato (garantirCliente). Não duplica: procura pelo CNPJ e pelo nome.
// ═══════════════════════════════════════════════════════════════
const TIPO_FORN_POR_CAMPO = { custoFrete: 'Transportadora', custoMaritimo: 'Agente de Carga', custoDespachante: 'Despachante', custoArmazem: 'Armazém', custoProduto: 'Fornecedor', custoServTerceiros: 'Serviço de Terceiros', custoPorto: 'Serviço de Terceiros', custoCertificado: 'Serviço de Terceiros' };
const fmtCnpj = d => d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
function garantirFornecedor(d) {
  let nome = limparNomeCadastro(d.nome);
  let cnpj = String(d.cnpj || '').replace(/\D/g, '');
  if (cnpj && !cnpjValido(cnpj)) cnpj = '';
  if (/^(chave|pix|transferencia)$/i.test(nome) || /KLISMANN/i.test(nome)) return null;   // palavra do print / o próprio sócio
  if (!nome || nome.length < 3 || !/[A-Za-zÀ-ú]{3}/.test(nome)) return null;
  if (cnpj === FU_SONG_CNPJ || /FU\s?SONG/i.test(nome) || /^(ITAU|BANCO|PIX|TRANSFER)/i.test(nome)) return null;
  if (nome === nome.toUpperCase()) nome = titulo(nome);
  S.fornecedores = S.fornecedores || [];
  const base = t => normNome(String(t || '').replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SA|MEI)\b\.?/gi, ''));
  const primeira = t => (String(t || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).find(w => w.length >= 3) || '');
  let f = S.fornecedores.find(x => (cnpj && String(x.cnpj || '').replace(/\D/g, '') === cnpj) || base(x.nome) === base(nome))
    // sem CNPJ (ex.: print do PIX com o nome fantasia): mesmo tipo e mesma primeira palavra = mesma empresa
    || (!cnpj && S.fornecedores.find(x => x.tipo === (d.tipo || 'Fornecedor') && primeira(x.nome) && primeira(x.nome) === primeira(nome)));
  if (f) {
    if (!f.cnpj && cnpj) f.cnpj = fmtCnpj(cnpj);
    if (!f.ie && d.ie) f.ie = d.ie; if (!f.cep && d.cep) f.cep = d.cep; if (!f.end && d.end) f.end = d.end;
    return f;
  }
  f = { id: genId(), tipo: d.tipo || 'Fornecedor', nome, cnpj: cnpj ? fmtCnpj(cnpj) : '', ie: d.ie || '', cep: d.cep || '', email: '', end: d.end || '', banco: '', agencia: '', conta: '', pix: '' };
  S.fornecedores.push(f);
  logAction('criar', 'FORNECEDORES', f.id, f.tipo + ': ' + f.nome + ' (pelo documento ' + (d.origem || '') + ')');
  (S._cadastrosNovos = S._cadastrosNovos || []).push(f.tipo + ': ' + f.nome);
  return f;
}
function cadastrarPeloDoc(item) {
  const info = item.info || {};
  if (!['nfe', 'cte', 'mdfe', 'nfse', 'recibo', 'faturaFrete', 'pagamento'].includes(item.tipo)) return null;
  const pag = info.pagamento || null;
  const nome = item.tipo === 'cte' || item.tipo === 'mdfe' ? (info.transportadora || info.emitNome) : item.tipo === 'pagamento' ? (pag && pag.recebedor) : info.emitNome;
  let cnpj = info.emitCnpj || '';
  if (!cnpj && item.tipo === 'pagamento') {   // CNPJ/CPF do recebedor no comprovante (o primeiro que não é da Fu Song)
    const docs = (String(item.texto || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []).map(x => x.replace(/\D/g, '')).filter(x => x !== FU_SONG_CNPJ);
    cnpj = docs[0] || '';
  }
  const campo = item.campoCusto || (typeof campoCustoSugerido === 'function' ? campoCustoSugerido(item) : '') || CAMPO_POR_CATEG[item.categoria] || '';
  const tipo = item.tipo === 'cte' || item.tipo === 'mdfe' ? 'Transportadora' : item.tipo === 'faturaFrete' ? 'Agente de Carga' : item.tipo === 'nfe' ? 'Fornecedor' : (TIPO_FORN_POR_CAMPO[campo] || 'Serviço de Terceiros');
  return garantirFornecedor({ nome, cnpj, tipo, ie: info.emitIE, cep: info.emitCep, end: info.emitEnd, origem: tipoLabel(item.tipo) });
}
// Completa os cadastros com o que já está anexado nos processos (roda ao abrir; não duplica)
function cadastrosPelosArquivos() {
  const antes = (S.fornecedores || []).length + (S.clientes || []).length;
  (S.processos || []).forEach(p => {
    garantirCliente(p);
    Object.entries(((p.docs || {})._files) || {}).forEach(([tipo, arr]) => (arr || []).forEach(f => {
      if (f.atalho) return;
      const ch = String(f.chave || '').replace(/\D/g, '');
      cadastrarPeloDoc({ tipo, campoCusto: f.campoCusto, categoria: f.categoria, texto: '', info: { emitNome: f.emitente, emitCnpj: ch.length === 44 ? ch.slice(6, 20) : '', pagamento: f.pagamento } });
    }));
  });
  return (S.fornecedores || []).length + (S.clientes || []).length - antes;
}
setTimeout(async function esperarDados() {
  if (!S.processos || !S.processos.length || typeof saveToSheets !== 'function') { if (!window._cadastrosTentativas || window._cadastrosTentativas++ < 40) { window._cadastrosTentativas = window._cadastrosTentativas || 1; setTimeout(esperarDados, 3000); } return; }
  try {
    let mudou = 0;
    const comoNaPlanilha = (aba, itens) => { const h = (typeof SHEET_SCHEMA !== 'undefined' && SHEET_SCHEMA[aba]) || null; return (itens || []).map(o => h ? h.map(k => { const v = o[k]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }).join('\u0001') : JSON.stringify(o)).join('\n'); };
    const foto = () => [['PROCESSOS', S.processos], ['EXTRATO_CAIXA', S.lancamentos], ['CLIENTES', S.clientes], ['FORNECEDORES', S.fornecedores], ['CUSTOS_FIXOS', S.custosMensais]].map(([a, i]) => comoNaPlanilha(a, i)).join('\n\n');
    const fotoBanco = () => JSON.stringify(((S.banco && S.banco.linhas) || []).map(l => [l.chave, l.status, l.lancId, l.categoria, l.centro, l.obs]));
    let f0 = null, b0 = null;
    // planilha do banco (contrato → processo) manda sobre a pasta
    try { if (typeof carregarBanco === 'function' && !(S.banco && S.banco.carregado)) await carregarBanco(); f0 = foto(); b0 = fotoBanco(); mudou += aplicarMapaCambio(mapaCambioGuardado()); } catch (e) { console.warn('mapa câmbio', e); }
    // contratos de câmbio antigos (sem "FATURA: FS…") anexados com USD 0: divide o contrato entre os processos onde ele está
    const semFatura = {};
    (S.processos || []).forEach(p => ((((p.docs || {})._files || {}).comprovantes) || []).forEach(f => {
      const c = f.cambio; if (!c || !c.referencia || (c.faturas || []).some(x => x.usd > 0)) return;
      const g = semFatura[c.referencia] = semFatura[c.referencia] || { c, itens: [] };
      if (!g.itens.some(x => x.p === p)) g.itens.push({ p, f });
    }));
    Object.values(semFatura).forEach(({ c, itens }) => {
      const usd = Math.round((Number(c.usdTotal) || 0) / itens.length * 100) / 100; if (!usd) return;
      const faturas = itens.map(x => ({ processo: x.p.id, usd, pelaPasta: true }));
      itens.forEach(({ p, f }) => {
        f.cambio.faturas = faturas; f.cambio.usdFatura = usd;
        if (aplicarCambioNoProcesso(p, { referencia: c.referencia, taxa: c.taxa, valorReais: c.reaisTotal, valorMoeda: c.usdTotal, data: c.data, contratoExtrato: c.contratoExtrato, faturas }, f.url)) mudou++;
      });
    });
    // refaz os totais de custo com a regra atual (ex.: recibo em dinheiro soma com os PIX)
    (S.processos || []).forEach(p => Object.keys(((p.docs || {})._custoDocs) || {}).forEach(campo => {
      const antes = p[campo] + '|' + p[campo + '_status'];
      recalcularCustos(p, campo);
      if (p[campo] + '|' + p[campo + '_status'] !== antes) mudou++;
    }));
    // arquivos da pasta FS2601xxS que foram para o principal (importação de 11/10): voltam para o S
    try { mudou += await criarProcessoSFaltando(); } catch (e) { console.warn('processo S', e); }
    try { mudou += await devolverArquivosDoS(); } catch (e) { console.warn('arquivos S', e); }
    try { mudou += await corrigirPartesPeloNome(); } catch (e) { console.warn('partes', e); }
    // (a planilha de custos do Ademir é só para conferência: não é aplicada no ERP)
    try { mudou += await despesasForaDosProcessos(); } catch (e) { console.warn('fora dos processos', e); }
    try { mudou += ajustesDaConferencia(); } catch (e) { console.warn('ajustes', e); }
    try { mudou += await nomesDasPastas(); } catch (e) { console.warn('nomes das pastas', e); }
    try { mudou += limparCadastros() + despesasDuplicadas() + lancamentosViramCusto() + arredondarTaxas(); } catch (e) { console.warn('auditoria', e); }
    try { mudou += await corrigirCambioDossie(); } catch (e) { console.warn('dossiê', e); }
    mudou += corrigirFaturasDigitadas();
    mudou += moverPagamentosMarcados();
    mudou += notasDuplicadasEmCustos();
    { const t = tarifasCambioForaDosProcessos(); if (t) { mudou += t; try { if (typeof salvarBanco === 'function') await salvarBanco(); } catch (e) {} } }
    mudou += lancamentosDeCustoViramBaixa();
    { const t = transferirCambiosPeloNome(); if (t) { mudou += t; try { if (typeof salvarBanco === 'function') await salvarBanco(); } catch (e) {} } }
    mudou += ajustarInvoiceTransferida();
    // processo renumerado (FS260105 → FS260107) e custos previstos
    mudou += juntarProcessosRenumerados();
    (S.processos || []).forEach(p => { mudou += aplicarPrevistos(p); });
    try { mudou += lancamentosRepetidos(); mudou += vinculosDoBanco(); } catch (e) { console.warn('vínculos do banco', e); }
    try { mudou += assessoriaPeloSaldo(); } catch (e) { console.warn('assessoria', e); }
    const novosCad = cadastrosPelosArquivos();
    // só grava se algo mudou de verdade (evita regravar a planilha inteira a cada vez que abre)
    if (novosCad > 0 || (f0 == null ? mudou : foto() !== f0)) saveToSheets().catch(() => {});
    if (b0 != null && fotoBanco() !== b0 && typeof salvarBanco === 'function') salvarBanco().catch(() => {});
  } catch (e) { console.warn('cadastros', e); }
}, 4000);

// ═══════════════════════════════════════════════════════════════
// Categoria das despesas do mês (ADM): pelo nome do arquivo, quem recebeu e o texto;
// quando você escolhe a categoria, o sistema aprende para o mesmo fornecedor.
// ═══════════════════════════════════════════════════════════════
const CATEG_ADM_REGRAS = [
  [/EMPRESTIMO/, 'Empréstimo ao sócio'],
  [/ESCAVADEIRA|CARREGADEIRA|RETROESCAV|HORA MAQUINA|LOCACAO DE (MAQUINA|EQUIPAMENTO)/, 'Equipamentos'],
  [/RENOVACAO AMBIENTAL|TAXA AMBIENTAL|LICENCA AMBIENTAL/, 'Registro e licenças'],
  [/HOTEL|POUSADA|HOSPEDAG|PASSAGE|LATAM|\bGOL\b|AZUL LINHAS|AEREO|AEREA|UBER|RODOVIARIA|BUSER|CLICKBUS|VIAGEM/, 'Viagem'],
  [/\bPOSTO\b|COMBUST|GASOLINA|DIESEL|ETANOL|IPIRANGA|PETROBRAS/, 'Combustível'],
  [/CARTORIO|PROTESTO|TABELI|RECONHECIMENTO DE FIRMA/, 'Cartório'],
  [/\bART\b|\bCREA\b|CONFEA|\bANM\b|LICENCA AMBIENTAL|ALVARA|IBAMA|INEMA|REGISTRO|LICENCIAMENTO/, 'Registro e licenças'],
  [/FERRAMENT|EQUIPAMENT|MAQUINA|NOTEBOOK|COMPUTADOR|CELULAR/, 'Equipamentos'],
  [/LABORAT|ANALISE|\bSGS\b|GEOSOL/, 'Laboratório'],
  [/CONTAB|CONTADOR/, 'Contabilidade'],
  [/TAGPLUS|SOFTWARE|LICENCA DE USO|\bSISTEMA\b/, 'Software'],
  [/COWORKING|ALUGUEL|ONIQUA/, 'Aluguel / Coworking'],
  [/BIG ?BAG|EMBALAG|PALLET|PALETE|\bLONA\b/, 'Materiais e embalagens'],
  [/ACORDO|PARCELAMENTO|DIVIDA|\bCOTA\b/, 'Acordos e parcelamentos'],
  [/RESTAURANTE|LANCHONETE|ALIMENTAC|IFOOD/, 'Alimentação'],
  [/\bDARF\b|\bDAS\b|SIMPLES NACIONAL|\bINSS\b/, 'Impostos federais'],
  [/SEGURO/, 'Seguros'],
  [/TARIFA|PACOTE DE SERVICOS/, 'Tarifas bancárias'],
];
const chaveCategAdm = item => {
  const quem = (item.info && (item.info.emitNome || (item.info.pagamento && item.info.pagamento.recebedor))) || '';
  const base = quem || String(item.nomeOriginal || item.nome || '').replace(/^ADM\s*-\s*/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\d\/:.-]+/g, ' ');
  return semAcento(base).replace(/[^A-Z]/g, '').slice(0, 14);
};
function categoriaAdm(item) {
  const k = chaveCategAdm(item);
  const r = k && ((S.banco && S.banco.regras) || []).find(x => x.tipo === 'catAdm' && x.valor === k);
  if (r) return r.categoria;
  const nome = semAcento(String(item.nomeOriginal || item.nome || '').replace(/^ADM\s*-\s*/i, ''));
  const quem = semAcento((item.info && (item.info.emitNome || (item.info.pagamento && item.info.pagamento.recebedor))) || '');
  const texto = semAcento(String(item.texto || '').slice(0, 800));
  for (const fonte of [nome, quem, texto]) { const hit = CATEG_ADM_REGRAS.find(([re]) => re.test(fonte)); if (hit) return hit[1]; }
  return '';
}
async function setCategoriaAdm(i, v) {
  const it = S.entrada.itens[i]; if (!it) return;
  it.categoria = v; it.categoriaManual = true;
  const k = chaveCategAdm(it);
  if (k && v && S.banco) {
    S.banco.regras = (S.banco.regras || []).filter(x => !(x.tipo === 'catAdm' && x.valor === k));
    S.banco.regras.push({ id: genId(), tipo: 'catAdm', valor: k, categoria: v, centro: 'ADM', criadoEm: new Date().toISOString() });
    (S.entrada.itens || []).forEach(x => { if (x !== it && x.processo === '__ADM' && !x.categoriaManual && chaveCategAdm(x) === k) x.categoria = v; });
    try { if (typeof ensureTabs2 === 'function') await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras); } catch (e) { console.warn('regra categoria', e); }
  }
  render();
}

// ═══════════════════════════════════════════════════════════════
// Planilha de câmbio enviada ao banco (Nº Bacen → Nº processo) = a verdade sobre qual contrato paga qual processo.
// Lida da Caixa de Entrada (xlsx/csv); guarda em REGRAS (tipo 'cambioProc') e corrige os processos.
// ═══════════════════════════════════════════════════════════════
async function planilhaParaCsv(fileId, nome) {
  const pasta = await getTesteFolder('🧪 OCR temporário');
  const cp = await driveAPI('POST', '/files/' + fileId + '/copy', { name: 'planilha - ' + (nome || fileId), mimeType: 'application/vnd.google-apps.spreadsheet', parents: [pasta] }, 'fields=id');
  try {
    const token = await getAccessToken();
    const r = await fetch(DRIVE_API + '/files/' + cp.id + '/export?mimeType=text/csv', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('planilha ' + r.status);
    return await r.text();
  } finally {
    try { await fetch(DRIVE_API + '/files/' + cp.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + (await getAccessToken()) } }); } catch (e) {}
  }
}
function linhasCsv(txt) {
  const out = []; let row = [], cel = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { cel += '"'; i++; } else if (ch === '"') q = false; else cel += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cel); cel = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cel); out.push(row); row = []; cel = ''; } else cel += ch;
  }
  if (cel || row.length) { row.push(cel); out.push(row); }
  return out;
}
function lerPlanilhaCambio(csv) {
  const L = linhasCsv(String(csv || ''));
  const h = L.findIndex(r => r.some(c => /N[UÚ]MERO\s+BACEN/i.test(c)) && r.some(c => /N[ºo°]?\s*PROCESSO/i.test(c)));
  if (h < 0) return null;
  const cab = L[h].map(c => semAcento(c));
  const col = re => cab.findIndex(c => re.test(c));
  const cRef = col(/NUMERO BACEN/), cProc = col(/PROCESSO/), cVal = col(/VALOR DO CONTRATO/);
  const mapa = [];
  L.slice(h + 1).forEach(r => {
    const ref = String(r[cRef] || '').replace(/\D/g, ''); const procs = (String(r[cProc] || '').toUpperCase().match(/FS\s?\d{6}S?/g) || []).map(x => x.replace(/\s/g, ''));
    if (ref.length >= 6 && procs.length) mapa.push({ ref, processos: procs, usd: Number(String(r[cVal] || '').replace(/,/g, '')) || 0 });
  });
  return mapa.length ? mapa : null;
}
// recalcula o câmbio do processo a partir de _cambioDocs (depois de tirar um contrato)
function recalcularCambio(p) {
  const cs = Object.values((p.docs && p.docs._cambioDocs) || {});
  if (!cs.length) { p.cambioRecebido = ''; p.cambioReais = ''; p.cambioTaxa = ''; p.cambioFechamento = ''; p.cambioRecebimento = ''; p.cambioStatus = 'Em Aberto'; return; }
  const usd = cs.reduce((a, x) => a + x.usd, 0), reais = cs.reduce((a, x) => a + x.reais, 0);
  p.cambioRecebido = Math.round(usd * 100) / 100; p.cambioReais = Math.round(reais * 100) / 100; p.cambioTaxa = usd ? Math.round(reais / usd * 10000) / 10000 : 0;
}
// a linha do extrato (OFX) foi ligada a este processo: o valor recebido em reais passa a ser o do banco
function cambioPeloBanco(p, contrato, reais, dataIso) {
  const cs = (p.docs && p.docs._cambioDocs) || {};
  const k = Object.keys(cs).find(x => String(cs[x].contrato) === String(contrato));
  if (!k) return false;
  cs[k].banco = Math.round(Number(reais) * 100) / 100; cs[k].reais = cs[k].banco;
  if (dataIso) { cs[k].dataBanco = isoToBr(dataIso); cs[k].data = cs[k].dataBanco; }
  recalcularCambio(p);
  const datas = Object.values(cs).map(x => x.data).filter(Boolean).sort((a, b) => brToIso(a).localeCompare(brToIso(b)));
  if (datas.length) { p.cambioFechamento = datas[0]; p.cambioRecebimento = datas[datas.length - 1]; }
  p.cambioStatus = 'Pago';
  return true;
}
// aplica o mapa contrato → processos: move o contrato para o processo certo e acerta lançamentos e extrato
function aplicarMapaCambio(mapa) {
  let n = 0;
  (mapa || []).forEach(({ ref, processos, pesos }) => {
    const alvo = processos.filter(id => (S.processos || []).some(p => p.id === id));
    if (!alvo.length) return;
    // onde o contrato está anexado hoje
    let modelo = null;
    (S.processos || []).forEach(p => {
      const arr = (((p.docs || {})._files || {}).comprovantes) || [];
      arr.filter(f => f.cambio && f.cambio.referencia === ref).forEach(f => { if (!modelo || !f.atalho) modelo = f; });
    });
    if (!modelo) return;
    const c = modelo.cambio;
    // divisão: igual, ou proporcional às invoices (pesos) — a tarifa do intermediário fica proporcional
    const tot = Number(c.usdTotal) || 0, somaP = pesos ? alvo.reduce((a, id) => a + (Number(pesos[id]) || 0), 0) : 0;
    let resto = tot;
    const faturas = alvo.map((id, i) => { const u = i === alvo.length - 1 ? Math.round(resto * 100) / 100 : Math.round((somaP ? tot * (Number(pesos[id]) || 0) / somaP : tot / alvo.length) * 100) / 100; resto -= u; return { processo: id, usd: u, pelaPlanilha: true }; });
    const usd = faturas[0].usd;
    const jaCerto = (c.faturas || []).length === alvo.length && faturas.every(f => (c.faturas || []).some(x => x.processo === f.processo && Math.abs((x.usd || 0) - f.usd) < 0.01)) && !c.faturas.some(x => !alvo.includes(x.processo));
    if (jaCerto) return;
    // tira dos processos errados
    (S.processos || []).forEach(p => {
      const arr = (((p.docs || {})._files || {}).comprovantes) || [];
      const tem = arr.some(f => f.cambio && f.cambio.referencia === ref);
      if (!tem) return;
      if (!alvo.includes(p.id)) {
        p.docs._files.comprovantes = arr.filter(f => !(f.cambio && f.cambio.referencia === ref));
        if (!p.docs._files.comprovantes.length) delete p.docs.comprovantes;
        if (p.docs._cambioDocs) { delete p.docs._cambioDocs[ref]; Object.keys(p.docs._cambioDocs).forEach(k => { if (p.docs._cambioDocs[k] && p.docs._cambioDocs[k].url === modelo.url && k !== ref) delete p.docs._cambioDocs[k]; }); }
        recalcularCambio(p);
        logAction('editar', 'PROCESSOS', p.id, 'Câmbio ' + ref + ' retirado (planilha do banco: ' + alvo.join(' + ') + ')');
      }
    });
    // coloca nos certos
    alvo.forEach((id, i) => {
      const p = S.processos.find(x => x.id === id);
      p.docs = p.docs || {}; p.docs._files = p.docs._files || {}; p.docs._files.comprovantes = (p.docs._files.comprovantes || []).filter(f => !(f.cambio && f.cambio.referencia === ref));
      p.docs._files.comprovantes.push(Object.assign({}, modelo, { atalho: i > 0 ? true : undefined, cambio: Object.assign({}, c, { faturas, usdFatura: faturas[i].usd }) }));
      if (p.docs._cambioDocs && p.docs._cambioDocs[ref]) delete p.docs._cambioDocs[ref].banco;   // valor em reais refeito pela parte de cada um
      if (!p.docs.comprovantes) p.docs.comprovantes = modelo.url;
      aplicarCambioNoProcesso(p, { referencia: ref, taxa: c.taxa, valorReais: c.reaisTotal, valorMoeda: c.usdTotal, data: c.data, contratoExtrato: c.contratoExtrato, faturas }, modelo.url);
      logAction('editar', 'PROCESSOS', id, 'Câmbio ' + ref + ' ligado pela planilha do banco');
    });
    // lançamentos e extrato já ligados a esse contrato
    (S.lancamentos || []).forEach(l => {
      const lr = l.docs && l.docs._cambio && (l.docs._cambio.referencia === ref || (c.contratoExtrato && String(l.docs._cambio.contrato) === String(c.contratoExtrato)));
      if (lr && alvo.length === 1 && l.vinculoId !== alvo[0]) { l.vinculoId = alvo[0]; l.vinculo = 'processo'; l.descricao = String(l.descricao || '').replace(/FS\d{6}S?/, alvo[0]); }
    });
    // contrato dividido entre processos: o lançamento de receita do câmbio vira um por processo (valor de cada parte)
    if (alvo.length > 1) {
      const doRef = (S.lancamentos || []).filter(l => l.categoria === 'Câmbio' && l.tipo === 'Receita' && l.docs && l.docs._cambio && (l.docs._cambio.referencia === ref || (c.contratoExtrato && String(l.docs._cambio.contrato) === String(c.contratoExtrato))));
      if (doRef.length) {
        const base = doRef[0];
        alvo.forEach(id => {
          const p = S.processos.find(x => x.id === id), cd = p && p.docs._cambioDocs && p.docs._cambioDocs[ref]; if (!cd) return;
          let l = doRef.find(x => x.vinculoId === id);
          if (!l) { l = JSON.parse(JSON.stringify(base)); l.id = genId(); S.lancamentos.unshift(l); doRef.push(l); }
          l.vinculo = 'processo'; l.vinculoId = id; l.valor = cd.reais; l.descricao = `Câmbio contrato ${c.contratoExtrato || ref} — ${id} (USD ${fmt(cd.usd)})`;
          l.docs = Object.assign({}, l.docs, { _cambio: Object.assign({}, l.docs._cambio, { usd: cd.usd }) });
        });
        const sobra = doRef.filter(l => !alvo.includes(l.vinculoId)); if (sobra.length) S.lancamentos = S.lancamentos.filter(l => !sobra.includes(l));
      }
    }
    if (S.banco && c.contratoExtrato) (S.banco.linhas || []).forEach(l => { if (l.lancId === 'cambio:' + c.contratoExtrato) l.centro = l.valor > 0 ? alvo.map(id => 'P:' + id).join(' ') : 'ADM'; });
    n++;
  });
  return n;
}
async function guardarMapaCambio(mapa) {
  if (!S.banco) return;
  S.banco.regras = S.banco.regras || [];
  mapa.forEach(m => {
    S.banco.regras = S.banco.regras.filter(r => !(r.tipo === 'cambioProc' && r.valor === m.ref));
    S.banco.regras.push({ id: genId(), tipo: 'cambioProc', valor: m.ref, categoria: m.processos.join('+'), centro: '', criadoEm: new Date().toISOString() });
  });
  try { if (typeof ensureTabs2 === 'function') await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras); } catch (e) { console.warn('mapa câmbio', e); }
}
// contratos que pagam mais de um processo e não dizem isso na FATURA (informado por você)
// 637051913 (USD 21.569, 29/09): Shenzhen Arts Huali mandou o FS260111 (8.100) junto com o FS260117 (13.500)
const DIVISOES_CAMBIO = [{ ref: '637051913', processos: ['FS260111', 'FS260117'], pesos: { FS260111: 8100, FS260117: 13500 } }];
function mapaCambioGuardado() {
  const m = ((S.banco && S.banco.regras) || []).filter(r => r.tipo === 'cambioProc').map(r => ({ ref: r.valor, processos: String(r.categoria || '').split('+').filter(Boolean) }));
  DIVISOES_CAMBIO.forEach(d => { const i = m.findIndex(x => x.ref === d.ref); if (i >= 0) m.splice(i, 1); m.push(d); });
  return m;
}


// ═══════════════════════════════════════════════════════════════
// Despesa paga pelo sócio (cartão de crédito / conta pessoal): a empresa deve o reembolso.
// Vira lançamento "Reembolso ao sócio" em aberto; quando a empresa paga o sócio (PIX no extrato), a conciliação baixa.
// ═══════════════════════════════════════════════════════════════
function lancarReembolsoSocio(item, p, upd) {
  const valor = Number(item.info && item.info.valor) || 0; if (!valor) return null;
  S.lancamentos = S.lancamentos || [];
  const url = upd && upd.webViewLink;
  if (S.lancamentos.some(x => x.docs && x.docs.reembolsoSocio && (x.docs.comprovante === url || (item.md5 && x.docs.md5 === item.md5)))) return null;
  // PDF e XML da mesma nota (mesmo nome, outra extensão): é o mesmo reembolso
  const tronco = n => semAcento(String(n || '').replace(/\.[a-z0-9]{2,4}$/i, '')).replace(/[^A-Z0-9]/g, '');
  const meu = tronco(upd ? upd.name : item.nome), dBr = item.info.data ? isoToBr(item.info.data) : '';
  const irmao = meu && S.lancamentos.find(x => x.docs && x.docs.reembolsoSocio && Math.abs((Number(x.valor) || 0) - valor) < 0.01 && x.data === dBr && tronco((String(x.observacao || '').split(' · ')[1] || '')) === meu);
  if (irmao) { if (url && url !== irmao.docs.comprovante) irmao.docs.outroArquivo = url; return null; }
  const quem = (item.info && item.info.emitNome) || item.nome.replace(/^ADM\s*-\s*/i, '').replace(/\.[a-z0-9]+$/i, '');
  const obj = {
    id: genId(), tipo: 'Despesa', status: 'Em Aberto', descricao: 'Reembolso ao sócio — ' + quem,
    valor, data: item.info.data ? isoToBr(item.info.data) : '', empresa: quem, categoria: item.categoria || (p ? 'Outros custos do processo' : 'Outras despesas'),
    vinculo: p ? 'processo' : 'avulso', vinculoId: p ? p.id : 'ADM',
    observacao: 'Pago com cartão / conta pessoal do sócio — a empresa deve reembolsar' + (upd ? ' · ' + upd.name : ''),
    docs: { comprovante: url || '', reembolsoSocio: true, md5: item.md5 || '', _origem: 'entrada' },
  };
  S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, 'Reembolso ao sócio R$ ' + valor.toFixed(2) + ' — ' + quem);
  return obj;
}
function reembolsosAbertos() { return (S.lancamentos || []).filter(l => l.docs && l.docs.reembolsoSocio && l.status !== 'Pago'); }
function setPagoPor(i, v) { const it = S.entrada.itens[i]; if (!it) return; it.pagoPor = v; render(); }


// Já existe lançamento da mesma despesa? (mesmo valor, mesma empresa, datas a até 10 dias) — evita contar nota + comprovante duas vezes
function lancamentoParecido(valor, dataIso, nome) {
  const base = t => semAcento(t).replace(/[^A-Z]/g, '').slice(0, 8);
  const n = base(nome), d = dataIso ? new Date(dataIso) : null;
  return (S.lancamentos || []).find(l => l.tipo === 'Despesa' && Math.abs((Number(l.valor) || 0) - valor) < 0.01
    && (!n || !base(l.empresa) || base(l.empresa) === n)
    && (!d || !l.data || Math.abs((new Date(brToIso(l.data)) - d) / 864e5) <= 10));
}
// Nota de serviço / recibo das despesas do mês pagos pela empresa: a própria nota confirma o pagamento
function lancarDespesaDaNota(item, upd) {
  const valor = Number(item.info && item.info.valor) || 0; if (!valor) return null;
  const quem = (item.info && item.info.emitNome) || item.nome.replace(/^ADM\s*-\s*/i, '').replace(/\.[a-z0-9]+$/i, '');
  const ja = lancamentoParecido(valor, item.info.data, quem);
  if (ja) { ja.docs = ja.docs || {}; if (!ja.docs.nota && upd) ja.docs.nota = upd.webViewLink; else if (upd && ja.docs.nota !== upd.webViewLink) ja.docs.outroArquivo = upd.webViewLink; return ja; }
  const obj = {
    id: genId(), tipo: 'Despesa', status: 'Pago', descricao: (item.categoria || 'Despesas administrativas') + ' — ' + quem,
    valor, data: item.info.data ? isoToBr(item.info.data) : '', empresa: quem, categoria: item.categoria || 'Outras despesas',
    vinculo: 'avulso', vinculoId: 'ADM', observacao: 'Nota: ' + (upd ? upd.name : item.nome),
    docs: { nota: upd ? upd.webViewLink : '', _origem: 'entrada' },
  };
  S.lancamentos = S.lancamentos || []; S.lancamentos.unshift(obj);
  logAction('criar', 'EXTRATO_CAIXA', obj.id, 'Despesa ' + obj.descricao + ' R$ ' + valor.toFixed(2) + ' (pela nota)');
  return obj;
}


// ── Pagamento de um ou mais processos (divide igual ou valor de cada um) ──
function procsDoItem(it) { return [it.processo, ...(it.processosExtras || [])].filter(id => id && id !== '__ADM'); }
function aplicarDivisaoItem(it, ids) {
  ids = [...new Set(ids.filter(Boolean))];
  it.processo = ids[0] || ''; it.processosExtras = ids.slice(1);
  it.divisao = ids.length > 1 ? ids.length : undefined;
  if (it.divisaoValores) Object.keys(it.divisaoValores).forEach(k => { if (!ids.includes(k)) delete it.divisaoValores[k]; });
  delete it.pastaErrada; delete it.corrigido;
  it.aviso = String(it.aviso || '').replace(/Conflito:[^.]*\.[^.]*\./, '').replace(/Pagamento de [^:]*: dividido igualmente[^.]*\.?/, '').replace(/Confira: este arquivo de custo[^.]*\.[^.]*\./, '').trim();
  it.confianca = 'manual';
}
function addProcDivisao(i, id) { const it = S.entrada.itens[i]; if (!it || !id) return; aplicarDivisaoItem(it, [...procsDoItem(it), id]); render(); }
function tirarProcDivisao(i, id) { const it = S.entrada.itens[i]; if (!it) return; aplicarDivisaoItem(it, procsDoItem(it).filter(x => x !== id)); render(); }
function setModoDivisao(i, modo) {
  const it = S.entrada.itens[i]; if (!it) return;
  if (modo === 'valores') { const ids = procsDoItem(it), parte = Math.round((Number(it.info.valor) || 0) / ids.length * 100) / 100; it.divisaoValores = Object.fromEntries(ids.map(id => [id, parte])); }
  else delete it.divisaoValores;
  render();
}
function setValorDivisao(i, id, v) { const it = S.entrada.itens[i]; if (!it) return; it.divisaoValores = it.divisaoValores || {}; it.divisaoValores[id] = numBR(String(v).replace(/[^\d.,]/g, '')) || 0; render(); }
function somaDivisaoOk(it) { if (!it.divisaoValores) return true; const soma = Object.values(it.divisaoValores).reduce((a, v) => a + (Number(v) || 0), 0); return Math.abs(soma - (Number(it.info.valor) || 0)) < 0.01; }
function blocoDivisao(it, i) {
  const ids = procsDoItem(it);
  const outros = (S.processos || []).map(p => p.id).filter(id => !ids.includes(id)).sort().reverse();
  const total = Number(it.info.valor) || 0;
  const soma = it.divisaoValores ? Object.values(it.divisaoValores).reduce((a, v) => a + (Number(v) || 0), 0) : total;
  return `<div style="margin-top:10px;padding:10px;border-radius:10px;background:var(--bg3)">
    <label class="lbl" style="display:block;margin-bottom:6px">Pagamento de</label>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${ids.map(id => `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:20px;border:1px solid var(--border2);font-size:13px;font-weight:600">${escHtml(id)}${ids.length > 1 ? `<button type="button" aria-label="Tirar ${escHtml(id)}" onclick="tirarProcDivisao(${i},'${escHtml(id)}')" style="border:none;background:none;color:var(--muted2);cursor:pointer;font-size:15px;padding:0 2px">×</button>` : ''}</span>`).join('')}
      <select aria-label="Adicionar processo" style="width:auto;min-width:150px" onchange="addProcDivisao(${i},this.value)"><option value="">+ outro processo</option>${outros.map(id => `<option>${escHtml(id)}</option>`).join('')}</select>
    </div>
    ${ids.length > 1 ? `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:13px">
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="radio" style="width:auto" name="dv-${i}" ${!it.divisaoValores ? 'checked' : ''} onchange="setModoDivisao(${i},'igual')"> Dividir igual (${brlE(total / ids.length)} cada)</label>
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="radio" style="width:auto" name="dv-${i}" ${it.divisaoValores ? 'checked' : ''} onchange="setModoDivisao(${i},'valores')"> Informar o valor de cada</label>
    </div>
    ${it.divisaoValores ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px">${ids.map(id => `<div class="ig" style="margin:0"><label class="lbl" for="dvv-${i}-${escHtml(id)}">${escHtml(id)} (R$)</label><input id="dvv-${i}-${escHtml(id)}" type="text" inputmode="decimal" value="${fmt(it.divisaoValores[id] || 0)}" onchange="setValorDivisao(${i},'${escHtml(id)}',this.value)"></div>`).join('')}</div>
      <div style="font-size:12.5px;margin-top:6px;color:${somaDivisaoOk(it) ? 'var(--green)' : 'var(--red)'}">Soma ${brlE(soma)} de ${brlE(total)}${somaDivisaoOk(it) ? ' ✓' : ' — a soma precisa bater com o valor pago'}</div>` : ''}` : ''}
  </div>`;
}
const brlE = n => 'R$ ' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Arquivo que não é documento (ex.: "Enviada do WhatsApp"): sai da Entrada para "🗑 Ignorados" (nada é apagado)
async function ignorarEntrada(i) {
  const E = S.entrada, it = E.itens[i]; if (!it) return;
  try { const pasta = await getTesteFolder('🗑 Ignorados'); await driveAPI('PATCH', '/files/' + it.fileId, {}, 'addParents=' + pasta + '&removeParents=' + E.folderId + '&fields=id'); E.itens.splice(i, 1); showToast('Movido para "🗑 Ignorados" (nada foi apagado)'); }
  catch (e) { showToast('⚠️ ' + (e.message || e)); }
  render();
}

// ═══════════════════════════════════════════════════════════════
// Processo renumerado: o número antigo aponta para o novo (ex.: FS260105 virou FS260107)
// ═══════════════════════════════════════════════════════════════
const ALIASES_PADRAO = { FS260105: 'FS260107' };
function aliasesProcesso() {
  const m = Object.assign({}, ALIASES_PADRAO);
  ((S.banco && S.banco.regras) || []).filter(r => r.tipo === 'aliasProc').forEach(r => { if (r.valor && r.categoria) m[r.valor] = r.categoria; });
  return m;
}
// junta o processo antigo no novo (arquivos, custos, câmbio, lançamentos e extrato) e anota "era o FS260105"
function juntarProcessosRenumerados() {
  let n = 0;
  Object.entries(aliasesProcesso()).forEach(([antigo, novo]) => {
    const pn = (S.processos || []).find(p => p.id === novo); if (!pn) return;
    pn.docs = pn.docs || {};
    if (pn.docs._numeroAntigo !== antigo) { pn.docs._numeroAntigo = antigo; n++; }
    const pa = (S.processos || []).find(p => p.id === antigo); if (!pa) return;
    const da = pa.docs || {}, dn = pn.docs;
    // arquivos
    dn._files = dn._files || {};
    Object.entries(da._files || {}).forEach(([t, arr]) => {
      const atual = dn._files[t] = dn._files[t] || [];
      (arr || []).forEach(f => { if (!atual.some(x => (x.url && x.url === f.url) || (x.md5 && x.md5 === f.md5))) atual.push(f); });
      if (atual.length && !dn[t]) dn[t] = atual[0].url;
    });
    // custos (notas e comprovantes)
    dn._custoDocs = dn._custoDocs || {};
    Object.entries(da._custoDocs || {}).forEach(([campo, reg]) => {
      const r = dn._custoDocs[campo] = dn._custoDocs[campo] || { fiscais: [], pagos: [] };
      ['fiscais', 'pagos'].forEach(k => (reg[k] || []).forEach(d => { if (!(r[k] || []).some(x => (x.k && x.k === d.k) || (x.url && x.url === d.url && x.valor === d.valor))) (r[k] = r[k] || []).push(d); }));
      recalcularCustos(pn, campo);
    });
    ['_costBanco'].forEach(k => { if (da[k]) dn[k] = Object.assign({}, da[k], dn[k] || {}); });
    // câmbio
    if (da._cambioDocs) { dn._cambioDocs = Object.assign({}, da._cambioDocs, dn._cambioDocs || {}); recalcularCambio(pn); if (Object.keys(dn._cambioDocs).length) pn.cambioStatus = 'Pago'; }
    // dados do processo que o novo ainda não tem
    Object.keys(pa).forEach(k => { if (k === 'id' || k === 'docs' || k === 'status' || k === 'embarque') return; const v = pa[k]; if (v !== '' && v != null && v !== 0 && (pn[k] === '' || pn[k] == null || pn[k] === 0)) pn[k] = v; });
    // lançamentos, extrato e comprovantes do mês
    (S.lancamentos || []).forEach(l => { if (l.vinculoId === antigo) l.vinculoId = novo; if (l.descricao) l.descricao = String(l.descricao).split(antigo).join(novo); });
    ((S.banco && S.banco.linhas) || []).forEach(l => { if (l.centro) l.centro = String(l.centro).split('P:' + antigo).join('P:' + novo); });
    S.processos = S.processos.filter(p => p !== pa);
    logAction('editar', 'PROCESSOS', novo, `Era o processo ${antigo}: arquivos, custos e lançamentos juntados no ${novo}`);
    n++;
  });
  return n;
}

// ═══════════════════════════════════════════════════════════════
// Custos previstos: lançados sozinhos (em aberto) e trocados pelo valor real quando chega a nota / comprovante / extrato.
// Todos em reais e podem variar: você altera o valor no processo ou o padrão.
// ═══════════════════════════════════════════════════════════════
const PREVISTOS_PADRAO = [
  { campo: 'custoServTerceiros', nome: 'Assessoria (Ademir / FFA)', valor: 1200, por: 'container' },
  { campo: 'custoDespachante', nome: 'Despachante (CGA)', valor: 500, por: 'processo', certificado: 50 },
  { campo: 'custoArmazem', nome: 'Armazém (estimado)', valor: 3200, por: 'container', soArmazem: true },
];
function regrasPrevisto() {
  const rs = ((S.banco && S.banco.regras) || []).filter(r => r.tipo === 'previsto');
  return PREVISTOS_PADRAO.map(d => {
    const r = rs.find(x => x.valor === d.campo); if (!r) return Object.assign({}, d);
    const o = Object.assign({}, d, { valor: Number(r.categoria) || 0 });
    if (d.certificado != null && r.centro !== '' && r.centro != null) o.certificado = Number(r.centro) || 0;
    return o;
  });
}
function qtdContainers(p) { return Math.max(1, (p.containers || []).filter(Boolean).length, parseInt(p.qtdContainer, 10) || 0); }
function temCertificadoOrigem(p) { const d = p.docs || {}; if (d._semCertificado) return false; if (d._semCertificado === undefined) return true; return Number(p.custoCertificado) > 0 || Object.keys(d._files || {}).some(k => /certific/i.test(k) && (d._files[k] || []).length) || !!(d._custoDocs && d._custoDocs.custoCertificado); }
function vaiProArmazem(p) { const d = p.docs || {}; if (d._armazem != null) return !!d._armazem; return !!(p.logArmazem || /ARMAZ/i.test(p.logModalidade || '')); }
function textoPrevisto(r, p) {
  const q = qtdContainers(p);
  return r.por === 'container' ? `R$ ${fmtBR2(r.valor)} × ${q} container${q > 1 ? 's' : ''}` : `R$ ${fmtBR2(r.valor)} por processo` + (r.certificado && temCertificadoOrigem(p) ? ` + R$ ${fmtBR2(r.certificado)} (certificado de origem)` : '');
}
function fmtBR2(v) { return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function aplicarPrevistos(p) {
  if (!p) return 0;
  p.docs = p.docs || {};
  const pv = p.docs._previsto = p.docs._previsto || {}, off = p.docs._previstoOff || {};
  let mud = 0;
  const tirar = campo => { if (!pv[campo]) return; if (Math.abs((Number(p[campo]) || 0) - (Number(pv[campo].valor) || 0)) < 0.01) { p[campo] = ''; p[campo + '_status'] = ''; } delete pv[campo]; mud++; };
  regrasPrevisto().forEach(r => {
    const reg = p.docs._custoDocs && p.docs._custoDocs[r.campo];
    const real = (reg && ((reg.fiscais || []).length || (reg.pagos || []).length)) || (p.docs._costBanco && p.docs._costBanco[r.campo])
      || (S.lancamentos || []).some(l => l.vinculo === 'processo' && l.vinculoId === p.id && l.categoria === PROCESS_COST_FIELDS[r.campo] && l.status !== 'Cancelado');
    if (real) { if (pv[r.campo]) { delete pv[r.campo]; mud++; } return; }   // chegou o valor real: deixa de ser previsto
    if (p.status === 'Cancelado' || off[r.campo] || r.valor <= 0 || (r.soArmazem && !vaiProArmazem(p))) { tirar(r.campo); return; }
    if (Number(p[r.campo]) > 0 && !pv[r.campo]) return;                    // valor digitado por você antes: não mexe
    if (pv[r.campo] && Math.abs((Number(p[r.campo]) || 0) - (Number(pv[r.campo].valor) || 0)) >= 0.01) {  // você alterou o valor
      if (!(Number(p[r.campo]) > 0)) { tirar(r.campo); return; }
      pv[r.campo] = { valor: Number(p[r.campo]), regra: 'alterado por você', editado: true }; mud++; return;
    }
    if (pv[r.campo] && pv[r.campo].editado) return;
    const valor = Math.round(((r.por === 'container' ? r.valor * qtdContainers(p) : r.valor) + (r.certificado && temCertificadoOrigem(p) ? r.certificado : 0)) * 100) / 100;
    const regra = textoPrevisto(r, p);
    if (!pv[r.campo] || pv[r.campo].valor !== valor || Number(p[r.campo]) !== valor) mud++;
    pv[r.campo] = { valor, regra }; p[r.campo] = valor; p[r.campo + '_status'] = 'Em Aberto';
    p.docs._costEmpresa = p.docs._costEmpresa || {}; if (!p.docs._costEmpresa[r.campo]) p.docs._costEmpresa[r.campo] = r.nome;
  });
  if (!Object.keys(pv).length) delete p.docs._previsto;
  return mud;
}
async function alterarPrevisto(id, campo) {
  const p = (S.processos || []).find(x => x.id === id); if (!p) return;
  const atual = Number(p[campo]) || 0;
  const v = await uiPrompt(`Valor previsto de ${PROCESS_COST_FIELDS[campo]} no ${id} (R$). Deixe 0 se não vai ter esse custo.`, fmtBR2(atual), 'Custo previsto');
  if (v == null) return;
  const n = numBR(String(v).replace(/[^\d.,]/g, '')) || 0;
  p.docs._previstoOff = p.docs._previstoOff || {};
  if (n <= 0) { p.docs._previstoOff[campo] = true; } else { delete p.docs._previstoOff[campo]; p[campo] = n; }
  aplicarPrevistos(p);
  try { await saveToSheets(); showToast('✅ Previsto atualizado'); } catch (e) { showToast('⚠️ ' + e.message); }
  render();
}
async function setArmazemPrevisto(id, sim) {
  const p = (S.processos || []).find(x => x.id === id); if (!p) return;
  p.docs._armazem = !!sim; if (p.docs._previstoOff) delete p.docs._previstoOff.custoArmazem;
  if (sim && p.docs._previsto && p.docs._previsto.custoArmazem) delete p.docs._previsto.custoArmazem.editado;
  aplicarPrevistos(p);
  try { await saveToSheets(); } catch (e) { showToast('⚠️ ' + e.message); }
  render();
}
async function editarPadroesPrevistos() {
  const rs = regrasPrevisto(), novas = [];
  for (const r of rs) {
    const v = await uiPrompt(`${r.nome}: valor padrão em R$ ${r.por === 'container' ? 'por container' : 'por processo'}${r.soArmazem ? ' (só quando o container vai para o armazém)' : ''}.`, fmtBR2(r.valor), 'Custos previstos');
    if (v == null) return;
    let cert = '';
    if (r.certificado != null) { const c = await uiPrompt(`${r.nome}: valor a mais quando tem certificado de origem (R$).`, fmtBR2(r.certificado), 'Custos previstos'); if (c == null) return; cert = String(numBR(String(c).replace(/[^\d.,]/g, '')) || 0); }
    novas.push({ id: genId(), tipo: 'previsto', valor: r.campo, categoria: String(numBR(String(v).replace(/[^\d.,]/g, '')) || 0), centro: cert, criadoEm: new Date().toISOString() });
  }
  S.banco.regras = (S.banco.regras || []).filter(r => r.tipo !== 'previsto').concat(novas);
  // processos com previsto automático (não alterado por você) passam a usar o novo padrão
  (S.processos || []).forEach(p => aplicarPrevistos(p));
  try { if (typeof ensureTabs2 === 'function') await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras); await saveToSheets(); showToast('✅ Padrões dos previstos salvos'); } catch (e) { showToast('⚠️ ' + e.message); }
  render();
}

// Correção: na importação, documentos da pasta FS260109S que citam "FS260109" foram anexados ao FS260109.
// Volta cada um para o processo S (registro, custo, pasta no Drive; BL: booking e containers).
async function devolverArquivosDoS() {
  let n = 0;
  for (const pS of (S.processos || []).filter(p => /^FS\d{6}S$/.test(p.id))) {
    const pB = S.processos.find(p => p.id === pS.id.slice(0, -1)); if (!pB || !pB.docs || !pB.docs._files) continue;
    for (const [tipo, arr] of Object.entries(pB.docs._files)) {
      const mover = (arr || []).filter(f => f.pastaOriginal === pS.id);
      for (const f of mover) {
        pB.docs._files[tipo] = pB.docs._files[tipo].filter(x => x !== f);
        if (!pB.docs._files[tipo].length) { delete pB.docs._files[tipo]; delete pB.docs[tipo]; } else if (pB.docs[tipo] === f.url) pB.docs[tipo] = pB.docs._files[tipo][0].url;
        pS.docs = pS.docs || {}; pS.docs._files = pS.docs._files || {};
        (pS.docs._files[tipo] = pS.docs._files[tipo] || []).push(Object.assign({}, f, { pastaOriginal: undefined, devolvido: true }));
        if (!pS.docs[tipo]) pS.docs[tipo] = f.url;
        // custos ligados a esse arquivo
        Object.entries(pB.docs._custoDocs || {}).forEach(([campo, reg]) => {
          const tira = k => { const fora = (reg[k] || []).filter(d => d.url === f.url); if (!fora.length) return; reg[k] = reg[k].filter(d => d.url !== f.url);
            const rS = (pS.docs._custoDocs = pS.docs._custoDocs || {})[campo] = (pS.docs._custoDocs || {})[campo] || { fiscais: [], pagos: [] }; rS[k] = (rS[k] || []).concat(fora); };
          tira('fiscais'); tira('pagos');
          ['_costComp'].forEach(k => { if (pB.docs[k] && pB.docs[k][campo] === f.url) delete pB.docs[k][campo]; });
          const lanc = pB.docs['_lanc_' + campo]; if (lanc) ['comprovante', 'nfe', 'fatura'].forEach(k => { if (lanc[k] === f.url) delete lanc[k]; });
          if (!(reg.fiscais || []).length && !(reg.pagos || []).length) { delete pB.docs._custoDocs[campo]; pB[campo] = ''; pB[campo + '_status'] = ''; } else recalcularCustos(pB, campo);
          if (pS.docs._custoDocs && pS.docs._custoDocs[campo]) recalcularCustos(pS, campo);
        });
        // BL: lê de novo para levar booking e containers para o S
        if (tipo === 'bl' && f.id && typeof analisarArquivo === 'function') {
          try {
            const it = await analisarArquivo({ id: f.id, name: f.name, mimeType: /\.pdf$/i.test(f.name) ? 'application/pdf' : '' });
            const conts = ((it.info || {}).containers || []).map(c => String(c).toUpperCase().replace(/[\s-]/g, ''));
            if (conts.length) { pB.containers = (pB.containers || []).filter(c => !conts.includes(String(c).toUpperCase().replace(/[\s-]/g, ''))); pB.container = pB.containers[0] || ''; pB.qtdContainer = String(Math.max(1, pB.containers.filter(Boolean).length)); }
            const b = (it.info || {}).booking; if (b && pB.booking === b) pB.booking = (pB.docs._bl && pB.docs._bl.booking !== b && pB.docs._bl.booking) || '';
            aplicarDocNoProcesso(it, pS, { webViewLink: f.url, name: f.name });
          } catch (e) { console.warn('BL S', e); }
        }
        // pasta no Drive (ambiente de testes)
        try { if (f.id && pB.docs._folderId && pS.docs._folderId) await driveAPI('PATCH', '/files/' + f.id, {}, 'addParents=' + pS.docs._folderId + '&removeParents=' + pB.docs._folderId + '&fields=id'); } catch (e) {}
        logAction('editar', 'PROCESSOS', pS.id, f.name + ': devolvido do ' + pB.id + ' para o ' + pS.id + ' (estava na pasta ' + pS.id + ')');
        n++;
      }
    }
  }
  return n;
}

// Número de processo digitado errado no documento do banco (ex.: contrato de câmbio com "FS230109" em vez de FS260109):
// se o processo não existe e só um processo tem os mesmos 4 últimos dígitos, é ele.
function numeroCorrigido(id) {
  id = processoAtual(String(id || '').toUpperCase());
  if (!/^FS\d{6}S?$/.test(id) || (S.processos || []).some(p => p.id === id)) return id;
  const anos = new Set((S.processos || []).map(p => String(p.id).slice(2, 4)));
  if (anos.has(id.slice(2, 4))) return id;   // ano que existe: pode ser um processo ainda não criado — não adivinha
  const c = (S.processos || []).filter(p => /^FS\d{6}S?$/.test(p.id) && p.id.slice(4) === id.slice(4));
  return c.length === 1 ? c[0].id : id;
}
function corrigirFaturasDigitadas() {
  let n = 0;
  const modelos = {};
  (S.processos || []).forEach(p => ((((p.docs || {})._files || {}).comprovantes) || []).forEach(f => {
    const c = f.cambio; if (!c || !Array.isArray(c.faturas)) return;
    const troca = c.faturas.filter(x => numeroCorrigido(x.processo) !== x.processo);
    if (!troca.length) return;
    troca.forEach(x => logAction('editar', 'PROCESSOS', numeroCorrigido(x.processo), `Câmbio ${c.referencia || ''}: fatura "${x.processo}" no contrato = ${numeroCorrigido(x.processo)} (erro de digitação)`));
    c.faturas = c.faturas.map(x => Object.assign({}, x, { processo: numeroCorrigido(x.processo), digitado: x.digitado || (numeroCorrigido(x.processo) !== x.processo ? x.processo : undefined) }));
    modelos[c.referencia || f.url] = { f, c };
    n++;
  }));
  // anexa o contrato (atalho) e aplica o câmbio nos processos corrigidos
  Object.values(modelos).forEach(({ f, c }) => c.faturas.forEach(x => {
    const p = (S.processos || []).find(q => q.id === x.processo); if (!p) return;
    p.docs = p.docs || {}; p.docs._files = p.docs._files || {};
    const arr = p.docs._files.comprovantes = p.docs._files.comprovantes || [];
    if (!arr.some(y => y.cambio && y.cambio.referencia === c.referencia)) { arr.push(Object.assign({}, f, { atalho: true, cambio: Object.assign({}, c, { usdFatura: x.usd }) })); if (!p.docs.comprovantes) p.docs.comprovantes = f.url; }
    aplicarCambioNoProcesso(p, { referencia: c.referencia, taxa: c.taxa, valorReais: c.reaisTotal, valorMoeda: c.usdTotal, data: c.data, contratoExtrato: c.contratoExtrato, faturas: c.faturas }, f.url);
  }));
  // todas as cópias do mesmo contrato com as faturas corrigidas
  (S.processos || []).forEach(p => ((((p.docs || {})._files || {}).comprovantes) || []).forEach(f => { const m = f.cambio && modelos[f.cambio.referencia]; if (m && f.cambio !== m.c) f.cambio.faturas = m.c.faturas; }));
  return n;
}

// Correção da importação de 11/10: contratos de câmbio antigos (sem "FATURA") copiados no dossiê de outro processo
// (FS260113 / "07 Dossiê RFB") foram divididos também com esse processo. Tira o processo do dossiê, refaz o dólar
// por processo e refaz a conciliação desses contratos com o extrato (o valor em reais volta a ser o do banco).
async function corrigirCambioDossie() {
  const contratos = {};
  (S.processos || []).forEach(p => ((((p.docs || {})._files || {}).comprovantes) || []).forEach(f => {
    const c = f.cambio; if (!c || !c.referencia || !(c.faturas || []).length || !(c.faturas || []).every(x => x.pelaPasta) || c.faturas.length < 2) return;
    (contratos[c.referencia] = contratos[c.referencia] || { c, md5: f.md5, url: f.url, recs: [] }).recs.push({ p, f });
  }));
  if (!Object.keys(contratos).length) return 0;
  // md5 dos arquivos guardados em pastas "Dossiê" de cada processo (no Drive de origem)
  const pastas = await driveListAll("name contains 'Dossi' and mimeType='application/vnd.google-apps.folder' and trashed=false", 'id,name,parents');
  const doDossie = {};   // md5 → Set(processo)
  for (const d of pastas) {
    let proc = '';
    try { let pai = (d.parents || [])[0]; for (let i = 0; i < 3 && pai && !proc; i++) { const m = await driveAPI('GET', '/files/' + pai, null, 'fields=id,name,parents'); proc = FS_DE(m.name || ''); pai = (m.parents || [])[0]; } } catch (e) {}
    if (!proc) continue;
    const fila = [d.id];
    while (fila.length) {
      const id = fila.shift();
      for (const f of await driveListAll(`'${id}' in parents and trashed=false`, 'id,mimeType,md5Checksum')) {
        if (f.mimeType === 'application/vnd.google-apps.folder') fila.push(f.id);
        else if (f.md5Checksum) (doDossie[f.md5Checksum] = doDossie[f.md5Checksum] || new Set()).add(proc);
      }
    }
  }
  let n = 0;
  for (const [ref, k] of Object.entries(contratos)) {
    const fora = (k.c.faturas || []).map(x => x.processo).filter(id => k.md5 && doDossie[k.md5] && doDossie[k.md5].has(id));
    const ficam = (k.c.faturas || []).map(x => x.processo).filter(id => !fora.includes(id));
    if (!fora.length || !ficam.length) continue;
    const usd = Math.round((Number(k.c.usdTotal) || 0) / ficam.length * 100) / 100;
    const faturas = ficam.map(id => ({ processo: id, usd, pelaPasta: true }));
    const ct = k.c.contratoExtrato;
    // processos do dossiê: sai o contrato e o câmbio dele
    fora.forEach(id => { const p = S.processos.find(x => x.id === id); if (!p) return;
      p.docs._files.comprovantes = (p.docs._files.comprovantes || []).filter(f => !(f.cambio && f.cambio.referencia === ref));
      if (!p.docs._files.comprovantes.length) { delete p.docs._files.comprovantes; delete p.docs.comprovantes; }
      if (p.docs._cambioDocs) { Object.keys(p.docs._cambioDocs).forEach(x => { if (x === ref || String(p.docs._cambioDocs[x].contrato) === String(ct)) delete p.docs._cambioDocs[x]; }); }
      recalcularCambio(p);
      logAction('editar', 'PROCESSOS', id, `Câmbio ${ref} retirado: era só uma cópia no dossiê deste processo`);
    });
    // desfaz a conciliação desse contrato (será refeita com a divisão certa)
    S.lancamentos = (S.lancamentos || []).filter(l => !(['Câmbio', 'Tarifa de câmbio'].includes(l.categoria) && ((l.docs && l.docs._cambio && String(l.docs._cambio.contrato) === String(ct)) || String(l.descricao || '').includes('contrato ' + ct) || String(l.descricao || '').includes('câmbio ' + ct))));
    ((S.banco && S.banco.linhas) || []).forEach(l => { if (l.lancId === 'cambio:' + ct) { l.status = 'pendente'; delete l.lancId; delete l.categoria; delete l.centro; } });
    // processos que ficam: dólar dividido entre eles (o real volta a vir do extrato ao conciliar)
    ficam.forEach(id => { const p = S.processos.find(x => x.id === id); if (!p) return;
      ((p.docs._files || {}).comprovantes || []).forEach(f => { if (f.cambio && f.cambio.referencia === ref) { f.cambio.faturas = faturas; f.cambio.usdFatura = usd; } });
      if (p.docs._cambioDocs && p.docs._cambioDocs[ref]) delete p.docs._cambioDocs[ref].banco;
      aplicarCambioNoProcesso(p, { referencia: ref, taxa: k.c.taxa, valorReais: k.c.reaisTotal, valorMoeda: k.c.usdTotal, data: k.c.data, contratoExtrato: ct, faturas }, k.url);
      logAction('editar', 'PROCESSOS', id, `Câmbio ${ref}: dividido entre ${ficam.join(' + ')} (USD ${usd} cada)`);
    });
    n++;
  }
  if (n) {
    try { if (typeof salvarBanco === 'function') await salvarBanco(); } catch (e) {}
    try { if (typeof autoConciliar === 'function') await autoConciliar(); } catch (e) { console.warn('reconciliar', e); }
    try { if (typeof salvarBanco === 'function') await salvarBanco(); } catch (e) {}
  }
  return n;
}

// Câmbio transferido: "FS260103 - Câmbio 616711008 - Adiantamento transferido para FS260107" (ou, na pasta do 107,
// "Adiantamento do FS260103"). Devolve { de, para } quando o nome do arquivo diz isso e a fatura do contrato é do "de".
function transferenciaCambioDoNome(nome, c) {
  const partes = String(nome || '').split(/\s+-\s+/);
  const r = lerNomeArquivo(nome);
  const fats = ((c && c.faturas) || []).map(f => f.processo);
  if (r.transferePara) { const de = fats.find(id => id !== r.transferePara) || ''; if (de && fats.length === 1) return { de, para: r.transferePara }; }
  if (r.transfereDe && fats.includes(r.transfereDe)) {
    const para = partes.map(x => FS_DE(x)).find(id => id && id !== r.transfereDe);
    if (para) return { de: r.transfereDe, para };
  }
  return null;
}
// dados já importados: aplica a transferência pelo nome original dos arquivos e leva receita, tarifa e extrato junto
function transferirCambiosPeloNome() {
  let n = 0;
  (S.processos || []).forEach(p => ((((p.docs || {})._files || {}).comprovantes) || []).slice().forEach(f => {
    const c = f.cambio; if (!c || !c.referencia) return;
    const nomes = String(f.nomeOriginal || f.name || '').split(/^((?:FS\d{6}S?)(?:\+FS\d{6}S?)*) - /).filter(Boolean);
    let tr = null; nomes.forEach(nm => { tr = tr || transferenciaCambioDoNome(nm, c); });
    if (!tr) return;
    const de = S.processos.find(x => x.id === tr.de), para = S.processos.find(x => x.id === tr.para); if (!para) return;
    const faturas = c.faturas.map(x => x.processo === tr.de ? Object.assign({}, x, { processo: tr.para, transferidoDe: tr.de }) : x);
    // arquivo e câmbio saem do processo antigo
    if (de) {
      de.docs._files.comprovantes = (de.docs._files.comprovantes || []).filter(y => !(y.cambio && y.cambio.referencia === c.referencia));
      if (!de.docs._files.comprovantes.length) { delete de.docs._files.comprovantes; delete de.docs.comprovantes; }
      const banco = de.docs._cambioDocs && de.docs._cambioDocs[c.referencia] ? de.docs._cambioDocs[c.referencia] : null;
      if (de.docs._cambioDocs) delete de.docs._cambioDocs[c.referencia];
      recalcularCambio(de);
      de.docs._cambioTransferido = Object.assign({}, de.docs._cambioTransferido || {}, { [c.referencia]: tr.para });
      logAction('editar', 'PROCESSOS', de.id, `Câmbio ${c.referencia} transferido para o ${tr.para}`);
      if (banco) { para.docs = para.docs || {}; para.docs._cambioDocs = para.docs._cambioDocs || {}; para.docs._cambioDocs[c.referencia] = banco; }
    }
    // entra no processo novo
    para.docs = para.docs || {}; para.docs._files = para.docs._files || {};
    const arr = para.docs._files.comprovantes = (para.docs._files.comprovantes || []).filter(y => !(y.cambio && y.cambio.referencia === c.referencia));
    arr.push(Object.assign({}, f, { atalho: undefined, cambio: Object.assign({}, c, { faturas }) }));
    if (!para.docs.comprovantes) para.docs.comprovantes = f.url;
    aplicarCambioNoProcesso(para, { referencia: c.referencia, taxa: c.taxa, valorReais: c.reaisTotal, valorMoeda: c.usdTotal, data: c.data, contratoExtrato: c.contratoExtrato, faturas }, f.url);
    para.docs._cambioRecebidoDe = Object.assign({}, para.docs._cambioRecebidoDe || {}, { [c.referencia]: tr.de });
    // receita, tarifa e linha do extrato
    (S.lancamentos || []).forEach(l => { if (l.vinculoId === tr.de && ['Câmbio', 'Tarifa de câmbio'].includes(l.categoria) && String(l.descricao || '').includes(String(c.contratoExtrato))) { l.vinculoId = tr.para; l.descricao = String(l.descricao).split(tr.de).join(tr.para) + ' (adiantamento do ' + tr.de + ')'; } });
    ((S.banco && S.banco.linhas) || []).forEach(l => { if (l.lancId === 'cambio:' + c.contratoExtrato && l.centro) l.centro = String(l.centro).split('P:' + tr.de).join('P:' + tr.para); });
    logAction('editar', 'PROCESSOS', tr.para, `Câmbio ${c.referencia} (USD ${c.usdTotal}) recebido do ${tr.de}: adiantamento transferido`);
    n++;
  }));
  return n;
}

// Invoice do processo que recebeu câmbio transferido: invoice própria + adiantamento recebido (ex.: FS260107 = 5.400 + 102.545)
function ajustarInvoiceTransferida() {
  let n = 0;
  (S.processos || []).forEach(p => {
    const rec = (p.docs && p.docs._cambioRecebidoDe) || {}; if (!Object.keys(rec).length) return;
    if (p.docs._invoiceBase == null) p.docs._invoiceBase = Number(p.cambioInvoice) || 0;
    // vale a invoice da Fu Song do processo de origem (ex.: FS260103 cancelado, USD 102.600); sem ela, o USD do contrato
    const extra = Object.entries(rec).reduce((a, [ref, de]) => { const c = (p.docs._cambioDocs || {})[ref]; const o = (S.processos || []).find(x => x.id === de); const vi = o && Number(o.cambioInvoice) > 0 ? Number(o.cambioInvoice) : 0; return a + (vi || (c ? Number(c.usd) || 0 : 0)); }, 0);
    const novo = Math.round((p.docs._invoiceBase + extra) * 100) / 100;
    if (Number(p.cambioInvoice) !== novo) { p.cambioInvoice = novo; n++; }
  });
  return n;
}

// Pagamentos que estavam no processo errado (o PIX citava outro número): idTransacao → processo certo
const PAGAMENTOS_OUTRO_PROCESSO = {
  E60701190202608181157DY5P7WRLALA: 'FS260108',   // Omar R$ 1.200 (NF Compra 40) — identificação dizia FS260107
  E60701190202608171253DY51LIZ5XD7: 'FS260108',   // Italiana R$ 11.500 de 17/08 — estava no FS260107
};
function processoDoPagamento(idTransacao) { return PAGAMENTOS_OUTRO_PROCESSO[String(idTransacao || '').trim()] || ''; }
function moverPagamentosMarcados() {
  let n = 0;
  (S.processos || []).forEach(de => Object.entries(((de.docs || {})._files) || {}).forEach(([tipo, arr]) => (arr || []).slice().forEach(f => {
    const para = S.processos.find(x => x.id === processoDoPagamento(f.pagamento && f.pagamento.idTransacao));
    if (!para || para === de) return;
    de.docs._files[tipo] = de.docs._files[tipo].filter(x => x !== f);
    if (!de.docs._files[tipo].length) { delete de.docs._files[tipo]; delete de.docs[tipo]; } else if (de.docs[tipo] === f.url) de.docs[tipo] = de.docs._files[tipo][0].url;
    para.docs = para.docs || {}; para.docs._files = para.docs._files || {};
    (para.docs._files[tipo] = para.docs._files[tipo] || []).push(Object.assign({}, f, { movidoDe: de.id, pastaOriginal: undefined }));
    if (!para.docs[tipo]) para.docs[tipo] = f.url;
    Object.entries(de.docs._custoDocs || {}).forEach(([campo, reg]) => {
      const fora = (reg.pagos || []).filter(d => d.url === f.url); if (!fora.length) return;
      reg.pagos = reg.pagos.filter(d => d.url !== f.url);
      ['_costComp'].forEach(k => { if (de.docs[k] && de.docs[k][campo] === f.url) delete de.docs[k][campo]; });
      const lanc = de.docs['_lanc_' + campo]; if (lanc && lanc.comprovante === f.url) delete lanc.comprovante;
      if (!(reg.fiscais || []).length && !(reg.pagos || []).length) { delete de.docs._custoDocs[campo]; de[campo] = ''; de[campo + '_status'] = ''; } else recalcularCustos(de, campo);
      para.docs._custoDocs = para.docs._custoDocs || {};
      const rP = para.docs._custoDocs[campo] = para.docs._custoDocs[campo] || { fiscais: [], pagos: [] };
      rP.pagos = (rP.pagos || []).concat(fora); recalcularCustos(para, campo);
    });
    // lançamento do extrato com o mesmo valor e data
    const v = Number(f.valor) || 0, d = f.data ? isoToBr(f.data) : '';
    (S.lancamentos || []).forEach(l => { if (l.vinculoId === de.id && l.tipo === 'Despesa' && Math.abs((Number(l.valor) || 0) - v) < 0.01 && (!d || l.data === d)) {
      l.vinculoId = para.id; ((S.banco && S.banco.linhas) || []).forEach(b => { if (b.lancId === l.id && b.centro) b.centro = String(b.centro).split('P:' + de.id).join('P:' + para.id); }); } });
    logAction('editar', 'PROCESSOS', para.id, `${f.name}: pagamento de R$ ${v} movido do ${de.id} para o ${para.id}`);
    n++;
  })));
  return n;
}

// Pagamento do extrato lançado à parte num custo que já tem nota/fatura (ou o mesmo comprovante) no processo:
// vira baixa desse custo (senão o lançamento substitui o custo da nota — ex.: PIX de R$ 1.200 no lugar da NF de R$ 3.240).
function lancamentosDeCustoViramBaixa() {
  let n = 0;
  const ficar = [];
  (S.lancamentos || []).forEach(l => {
    const campo = l.tipo === 'Despesa' && l.vinculo === 'processo' && l.status === 'Pago' && l.docs && l.docs._banco && typeof l.docs._banco === 'string' ? CAMPO_POR_CATEG[l.categoria] : '';
    const p = campo && (S.processos || []).find(x => x.id === l.vinculoId);
    const reg = p && p.docs && p.docs._custoDocs && p.docs._custoDocs[campo];
    const v = Number(l.valor) || 0, dIso = brToIso(l.data || '');
    const igual = reg && (reg.pagos || []).find(d => d.tipo !== 'banco' && Math.abs((Number(d.valor) || 0) - v) < 0.01 && (!d.data || !dIso || Math.abs((new Date(brToIso(d.data) || d.data) - new Date(dIso)) / 864e5) <= 3));
    if (!reg || (!(reg.fiscais || []).length && !igual)) { ficar.push(l); return; }
    if (!igual && !(reg.pagos || []).some(d => d.k === 'banco:' + l.docs._banco)) reg.pagos = (reg.pagos || []).concat([{ k: 'banco:' + l.docs._banco, tipo: 'banco', valor: v, data: l.data || '', nome: 'extrato: ' + (l.empresa || ''), de: l.empresa || '' }]);
    p.docs._costBanco = p.docs._costBanco || {}; if (!p.docs._costBanco[campo]) p.docs._costBanco[campo] = l.docs._banco;
    ((S.banco && S.banco.linhas) || []).forEach(b => { if (b.lancId === l.id) b.lancId = 'custo:' + p.id + '/' + campo; });
    recalcularCustos(p, campo);
    n++;
  });
  if (n) S.lancamentos = ficar;
  return n;
}

// Correção: mesma NF (chave) lançada em dois custos (ex.: XML no Produto e o PDF lido errado no Frete Marítimo, FS260118).
// Fica onde está o XML (valor exato); se não houver XML, no primeiro lançado.
function notasDuplicadasEmCustos() {
  let n = 0;
  (S.processos || []).forEach(p => {
    const cd = (p.docs && p.docs._custoDocs) || {}; const onde = {};
    Object.entries(cd).forEach(([campo, reg]) => (reg.fiscais || []).forEach(d => { if (/^\d{44}$/.test(d.k)) (onde[d.k] = onde[d.k] || []).push({ campo, d }); }));
    Object.entries(onde).filter(([, xs]) => new Set(xs.map(x => x.campo)).size > 1).forEach(([k, xs]) => {
      const fica = xs.find(x => /\.xml$/i.test(x.d.nome || '')) || xs[0];
      xs.filter(x => x.campo !== fica.campo).forEach(x => {
        const reg = cd[x.campo]; reg.fiscais = reg.fiscais.filter(d => d !== x.d);
        const lanc = p.docs['_lanc_' + x.campo]; if (lanc && lanc.nfe === x.d.url) delete lanc.nfe;
        if (!(reg.fiscais || []).length && !(reg.pagos || []).length) { delete cd[x.campo]; p[x.campo] = ''; p[x.campo + '_status'] = ''; } else recalcularCustos(p, x.campo);
        ((p.docs._files || {}).nfe || []).forEach(f => { if (f.url === x.d.url) f.campoCusto = fica.campo; });
        logAction('editar', 'PROCESSOS', p.id, `NF ${k.slice(25, 34).replace(/^0+/, '')}: estava também em ${PROCESS_COST_FIELDS[x.campo]} (R$ ${x.d.valor}) — fica só em ${PROCESS_COST_FIELDS[fica.campo]}`);
        n++;
      });
    });
  });
  return n;
}

// versão publicada (aparece na faixa laranja: assim dá para ver se o navegador já pegou a atualização)
const VERSAO_TESTE = '61';
setTimeout(() => { const f = document.getElementById('teste-faixa'); if (f && !/versão/.test(f.textContent)) f.textContent += ' · versão ' + VERSAO_TESTE; }, 500);

// Tarifas de câmbio já lançadas nos processos: passam para o Câmbio (uma por contrato, fora do custo do processo)
function tarifasCambioForaDosProcessos() {
  const tar = (S.lancamentos || []).filter(l => l.categoria === 'Tarifa de câmbio' && l.vinculo === 'processo');
  if (!tar.length) return 0;
  const porContrato = {};
  tar.forEach(l => { const m = String(l.descricao || '').match(/c[âa]mbio\s+(\d{6,})/i); const k = m ? m[1] : l.id; (porContrato[k] = porContrato[k] || []).push(l); });
  const novos = Object.entries(porContrato).map(([k, ls]) => ({
    id: ls[0].id, tipo: 'Despesa', status: 'Pago', descricao: `Tarifa de câmbio ${k} (${ls.map(l => l.vinculoId).join(' + ')})`,
    valor: Math.round(ls.reduce((a, l) => a + (Number(l.valor) || 0), 0) * 100) / 100, data: ls[0].data, empresa: 'ITAU UNIBANCO', categoria: 'Tarifa de câmbio',
    vinculo: 'avulso', vinculoId: 'ADM', observacao: ls[0].observacao, docs: { _banco: (ls[0].docs || {})._banco, _cambio: { contrato: k, processos: ls.map(l => l.vinculoId) } },
  }));
  S.lancamentos = S.lancamentos.filter(l => !tar.includes(l)).concat(novos);
  ((S.banco && S.banco.linhas) || []).forEach(b => { if (b.categoria === 'Tarifa de câmbio') b.centro = 'ADM'; });
  return tar.length;
}

// Valor do custo alterado por você (vale sobre a nota/comprovantes até você limpar)
async function alterarValorCusto(id, campo) {
  const p = (S.processos || []).find(x => x.id === id); if (!p) return;
  if (p.docs && p.docs._previsto && p.docs._previsto[campo]) return alterarPrevisto(id, campo);
  const atual = Number(p[campo]) || 0, manual = p.docs && p.docs._valorManual && p.docs._valorManual[campo] != null;
  const v = await uiPrompt(`Valor de ${PROCESS_COST_FIELDS[campo]} no ${id} (R$).` + (manual ? ' Deixe em branco para voltar ao valor dos documentos.' : ''), fmtBR2(atual), 'Alterar valor');
  if (v == null) return;
  p.docs = p.docs || {}; p.docs._valorManual = p.docs._valorManual || {};
  if (!String(v).trim()) delete p.docs._valorManual[campo];
  else p.docs._valorManual[campo] = numBR(String(v).replace(/[^\d.,]/g, '')) || 0;
  if (p.docs._custoDocs && p.docs._custoDocs[campo]) recalcularCustos(p, campo);
  else if (p.docs._valorManual[campo] != null) { p[campo] = p.docs._valorManual[campo]; p[campo + '_status'] = p[campo + '_status'] || 'Em Aberto'; }
  logAction('editar', 'PROCESSOS', id, `${PROCESS_COST_FIELDS[campo]}: valor ${p.docs._valorManual[campo] != null ? 'alterado para R$ ' + p.docs._valorManual[campo] : 'volta aos documentos'}`);
  try { await saveToSheets(); showToast('✅ Valor salvo'); } catch (e) { showToast('⚠️ ' + e.message); }
  render();
}

// Comprovante dividido entre pastas com o valor de cada uma no nome ("R$ 600,00 (parte do PIX de R$ 5.400,00 …)"):
// acerta os processos e os valores pelo nome de cada cópia no Drive de origem (correção da importação de 11/10)
async function corrigirPartesPeloNome() {
  const fs = await driveListAll("(name contains 'parte do PIX' or name contains 'rateio') and trashed=false", 'id,name,md5Checksum');
  const mapa = {};
  fs.forEach(f => { if (!f.md5Checksum || /^FS\d{6}S?\+/.test(f.name)) return; const id = processoAtual(FS_DE(f.name)); const v = lerNomeArquivo(f.name).valor; if (id && v > 0) (mapa[f.md5Checksum] = mapa[f.md5Checksum] || {})[id] = v; });
  window._partesPorMd5 = Object.assign(window._partesPorMd5 || {}, mapa);
  let n = 0;
  Object.entries(mapa).forEach(([md5, partes]) => {
    const comRec = (S.processos || []).filter(p => (((p.docs || {})._files || {}).pagamento || []).some(f => f.md5 === md5));
    if (!comRec.length) return;
    const modeloP = comRec[0], modelo = modeloP.docs._files.pagamento.find(f => f.md5 === md5);
    const campo = modelo.campoCusto || Object.keys(modeloP.docs._custoDocs || {}).find(c => (modeloP.docs._custoDocs[c].pagos || []).some(d => d.url === modelo.url));
    if (!campo) return;
    const pagoModelo = (modeloP.docs._custoDocs[campo].pagos || []).find(d => d.url === modelo.url) || {};
    const banco = (modeloP.docs._costBanco || {})[campo];
    let mudou = false;
    // tira de quem não está no nome
    comRec.filter(p => partes[p.id] == null).forEach(p => {
      p.docs._files.pagamento = p.docs._files.pagamento.filter(f => f.md5 !== md5);
      const reg = (p.docs._custoDocs || {})[campo];
      if (reg) { reg.pagos = (reg.pagos || []).filter(d => d.url !== modelo.url); if (!(reg.fiscais || []).length && !(reg.pagos || []).length) { delete p.docs._custoDocs[campo]; p[campo] = ''; p[campo + '_status'] = ''; if (p.docs._costBanco) delete p.docs._costBanco[campo]; } else recalcularCustos(p, campo); }
      logAction('editar', 'PROCESSOS', p.id, `${modelo.name}: não é deste processo (o nome do arquivo divide entre ${Object.keys(partes).join(', ')})`); mudou = true;
    });
    // põe / acerta o valor de cada processo citado
    Object.entries(partes).forEach(([id, v]) => {
      const p = (S.processos || []).find(x => x.id === id); if (!p) return;
      p.docs = p.docs || {}; p.docs._files = p.docs._files || {};
      if (!(p.docs._files.pagamento || []).some(f => f.md5 === md5)) { (p.docs._files.pagamento = p.docs._files.pagamento || []).push(Object.assign({}, modelo, { atalho: true, valor: v })); if (!p.docs.pagamento) p.docs.pagamento = modelo.url; }
      p.docs._custoDocs = p.docs._custoDocs || {};
      const reg = p.docs._custoDocs[campo] = p.docs._custoDocs[campo] || { fiscais: [], pagos: [] };
      const d = (reg.pagos || []).find(x => x.url === modelo.url);
      if (d && Math.abs((Number(d.valor) || 0) - v) < 0.01) return;
      if (d) d.valor = v; else reg.pagos = (reg.pagos || []).concat([Object.assign({}, pagoModelo, { k: modelo.url, url: modelo.url, valor: v })]);
      if (banco) { p.docs._costBanco = p.docs._costBanco || {}; if (!p.docs._costBanco[campo]) p.docs._costBanco[campo] = banco; }
      recalcularCustos(p, campo);
      logAction('editar', 'PROCESSOS', id, `${PROCESS_COST_FIELDS[campo]}: R$ ${v} (parte do comprovante, pelo nome do arquivo)`); mudou = true;
    });
    if (mudou) n++;
  });
  return n;
}

// FS260109S não foi criado na importação (a pasta do "S" era lida como FS260109): cria e leva o que é dele
async function criarProcessoSFaltando() {
  let n = 0;
  for (const pB of (S.processos || []).filter(p => /^FS\d{6}$/.test(p.id))) {
    const idS = pB.id + 'S';
    const doS = Object.values(((pB.docs || {})._files) || {}).flat().filter(f => new RegExp('^(?:FS\\d{6}S?\\+)*' + idS + '\\b').test(f.nomeOriginal || '') || new RegExp('(^|\\+)' + idS + '( |\\+)').test(f.nomeOriginal || ''));
    if (!doS.length || (S.processos || []).some(p => p.id === idS)) continue;
    const pS = JSON.parse(JSON.stringify(pB));
    pS.id = idS; pS.docs = { _apelido: (pB.docs || {})._apelido, _criadoDe: { arquivo: 'pasta ' + idS + ' (correção da importação)' } };
    Object.keys(PROCESS_COST_FIELDS).forEach(c => { pS[c] = ''; pS[c + '_status'] = ''; });
    ['cambioInvoice', 'cambioTaxa', 'cambioReais', 'cambioRecebido'].forEach(k => pS[k] = 0); pS.cambioStatus = 'Em Aberto'; pS.cambioFechamento = ''; pS.cambioRecebimento = '';
    pS.dueNumero = ''; pS.dueChave = ''; pS.invoiceNum = 'Invoice - ' + pB.id; pS.contratoNum = 'Contrato - ' + pB.id;
    const bl = doS.find(f => /BL\s*(\d{6,})/i.test(f.nomeOriginal || '')); pS.booking = bl ? (bl.nomeOriginal.match(/BL\s*(\d{6,})/i) || [])[1] : '';
    pS.containers = []; pS.container = ''; pS.qtdContainer = '1';
    S.processos.push(pS);
    doS.forEach(f => { f.pastaOriginal = idS; });   // devolverArquivosDoS leva arquivos, custos, BL (booking e container)
    // armazém pago num PIX só para os dois containers: metade para cada
    const regAz = pB.docs._custoDocs && pB.docs._custoDocs.custoArmazem;
    if (regAz && (regAz.pagos || []).length === 1 && !doS.some(f => (regAz.pagos[0].url === f.url))) {
      const d = regAz.pagos[0], metade = Math.round(Number(d.valor) / 2 * 100) / 100;
      d.valor = metade; recalcularCustos(pB, 'custoArmazem');
      pS.docs._custoDocs = pS.docs._custoDocs || {}; pS.docs._custoDocs.custoArmazem = { fiscais: [], pagos: [Object.assign({}, d, { valor: metade })] };
      if ((pB.docs._costBanco || {}).custoArmazem) pS.docs._costBanco = Object.assign({}, pS.docs._costBanco, { custoArmazem: pB.docs._costBanco.custoArmazem });
      recalcularCustos(pS, 'custoArmazem');
    }
    logAction('criar', 'PROCESSOS', idS, 'pasta ' + idS + ' (não tinha sido criado na importação)');
    try { await criarPastaProcesso(pS); } catch (e) {}
    n++;
  }
  return n;
}


// Embraport (R$ 572,24): despesa atípica do porto, não é de processo → vai para as despesas da empresa (ADM)
const FORA_DOS_PROCESSOS = [/EMBRAPORT/i];
async function despesasForaDosProcessos() {
  let n = 0;
  const fora = t => FORA_DOS_PROCESSOS.some(re => re.test(String(t || '')));
  (S.lancamentos || []).forEach(l => {
    if (l.vinculo !== 'processo' || !fora(l.empresa + ' ' + l.descricao)) return;
    const de = l.vinculoId;
    l.vinculo = 'avulso'; l.vinculoId = 'ADM'; l.categoria = 'Porto / Taxas';
    l.descricao = 'Porto / Taxas — ' + (l.empresa || '') + ' (despesa atípica do porto, fora dos processos)';
    ((S.banco && S.banco.linhas) || []).forEach(b => { if (b.lancId === l.id) { b.centro = 'ADM'; b.categoria = 'Porto / Taxas'; } });
    logAction('editar', 'EXTRATO_CAIXA', l.id, `${l.empresa} R$ ${l.valor}: saiu do ${de} — despesa atípica do porto (ADM)`);
    n++;
  });
  const docsAdm = [];
  (S.processos || []).forEach(p => Object.entries(((p.docs || {})._files) || {}).forEach(([tipo, arr]) => (arr || []).slice().forEach(f => {
    const quem = (f.emitente || '') + ' ' + ((f.pagamento || {}).recebedor || '');
    if (!fora(quem)) return;
    p.docs._files[tipo] = p.docs._files[tipo].filter(x => x !== f);
    if (!p.docs._files[tipo].length) { delete p.docs._files[tipo]; delete p.docs[tipo]; } else if (p.docs[tipo] === f.url) p.docs[tipo] = p.docs._files[tipo][0].url;
    Object.entries(p.docs._custoDocs || {}).forEach(([c, reg]) => { const antes = (reg.pagos || []).length + (reg.fiscais || []).length; reg.pagos = (reg.pagos || []).filter(d => d.url !== f.url); reg.fiscais = (reg.fiscais || []).filter(d => d.url !== f.url); if ((reg.pagos.length + reg.fiscais.length) !== antes) { if (!reg.pagos.length && !reg.fiscais.length) { delete p.docs._custoDocs[c]; p[c] = ''; p[c + '_status'] = ''; } else recalcularCustos(p, c); } });
    docsAdm.push({ id: f.id, nome: f.name, url: f.url, tipo, categoria: 'Porto / Taxas', valor: f.valor || '', data: f.data || '', centro: 'ADM', md5: f.md5, criadoEm: new Date().toISOString() });
    logAction('editar', 'PROCESSOS', p.id, `${f.name}: comprovante Embraport saiu do processo (despesa atípica do porto)`);
    n++;
  })));
  if (docsAdm.length && typeof gravarAba2 === 'function') {
    try { await ensureTabs2(); const docs = await lerAba2('DOCUMENTOS'); docsAdm.forEach(d => { if (!docs.some(x => x.url === d.url)) docs.push(d); }); await gravarAba2('DOCUMENTOS', docs); if (S.banco) S.banco.docs = docs; } catch (e) { console.warn('docs ADM', e); }
  }
  // próximos extratos: Embraport vai direto para Porto / Taxas da empresa
  if (S.banco && !(S.banco.regras || []).some(r => r.tipo === 'texto' && /EMBRAPORT/i.test(r.valor))) {
    S.banco.regras = (S.banco.regras || []).concat([{ id: genId(), tipo: 'texto', valor: 'EMBRAPORT', categoria: 'Porto / Taxas', centro: 'ADM', criadoEm: new Date().toISOString() }]);
    try { await ensureTabs2(); await gravarAba2('REGRAS', S.banco.regras); } catch (e) {}
  }
  if (n) { try { if (typeof salvarBanco === 'function') await salvarBanco(); } catch (e) {} }
  return n;
}

// Respostas do Klismann à conferência com a planilha (11/10/2026) — aplicadas uma vez
function ajustesDaConferencia() {
  let n = 0;
  const P = id => (S.processos || []).find(x => x.id === id);
  const feito = (p, k) => { p.docs = p.docs || {}; p.docs._ajustes = p.docs._ajustes || {}; if (p.docs._ajustes[k]) return true; p.docs._ajustes[k] = true; n++; return false; };
  // 2. FS260112: PIX de R$ 720,90 para a Cooperativa Mineral da Bahia = imposto COOP (não é produto)
  const p12 = P('FS260112');
  if (p12 && !feito(p12, 'impostoCoop')) {
    const l = (S.lancamentos || []).find(x => x.vinculoId === 'FS260112' && /COOPERATIVA MINERAL/i.test(x.empresa || '') && Math.abs((Number(x.valor) || 0) - 720.9) < 0.01);
    if (l) { l.categoria = 'Impostos'; l.descricao = 'Imposto COOP — ' + (l.empresa || ''); }
    const reg = (p12.docs._custoDocs || {}).custoProduto;
    const b = reg && (reg.pagos || []).find(d => d.tipo === 'banco' && Math.abs((Number(d.valor) || 0) - 720.9) < 0.01);
    if (b) {
      reg.pagos = reg.pagos.filter(d => d !== b); recalcularCustos(p12, 'custoProduto');
      p12.docs._custoDocs.custoImpostos = { fiscais: [], pagos: [Object.assign({}, b, { nome: 'Imposto COOP (extrato)' })] };
      p12.docs._costBanco = Object.assign({}, p12.docs._costBanco, { custoImpostos: b.k.replace(/^banco:/, '') });
      recalcularCustos(p12, 'custoImpostos');
    }
    logAction('editar', 'PROCESSOS', 'FS260112', 'R$ 720,90 Cooperativa Mineral da Bahia: imposto COOP (não é produto)');
  }
  // 3. FS260104: assessoria R$ 1.200 por processo, paga (o comprovante dos outros R$ 600 não é necessário)
  const p4 = P('FS260104');
  if (p4 && !feito(p4, 'assessoria1200')) {
    p4.docs._valorManual = Object.assign({}, p4.docs._valorManual, { custoServTerceiros: 1200 });
    p4.docs._statusManual = Object.assign({}, p4.docs._statusManual, { custoServTerceiros: 'Pago' });
    if (p4.docs._custoDocs && p4.docs._custoDocs.custoServTerceiros) recalcularCustos(p4, 'custoServTerceiros'); else { p4.custoServTerceiros = 1200; p4.custoServTerceiros_status = 'Pago'; }
    logAction('editar', 'PROCESSOS', 'FS260104', 'Assessoria: R$ 1.200 pago (R$ 1.200 por processo)');
  }
  // produto já pago (resposta de 11/10): FS260096 (NF 38 WL, recibo em dinheiro) e FS260118 (NF 07 e 08 da Cooperativa)
  ['FS260096', 'FS260118'].forEach(id => { const p = P(id); if (!p || feito(p, 'produtoPago')) return;
    p.docs._statusManual = Object.assign({}, p.docs._statusManual, { custoProduto: 'Pago' });
    if (p.docs._custoDocs && p.docs._custoDocs.custoProduto) recalcularCustos(p, 'custoProduto'); else p.custoProduto_status = 'Pago';
    logAction('editar', 'PROCESSOS', id, 'Produto: pago (informado por você)');
  });
  // 6. FS260107 e FS260118 não foram para o armazém
  ['FS260107', 'FS260118'].forEach(id => { const p = P(id); if (!p || feito(p, 'semArmazem')) return;
    p.docs._armazem = false; p.docs._previstoOff = Object.assign({}, p.docs._previstoOff, { custoArmazem: true });
    if (p.docs._previsto && p.docs._previsto.custoArmazem) { delete p.docs._previsto.custoArmazem; if (!(p.docs._custoDocs || {}).custoArmazem) { p.custoArmazem = ''; p.custoArmazem_status = ''; } }
    logAction('editar', 'PROCESSOS', id, 'Não foi para o armazém: sem custo de armazém');
  });
  return n;
}
// 7. decisões sobre arquivos da Caixa de Entrada (nome do arquivo → processo)
const DECISOES_ENTRADA = [[/Recibo\s+Minera[cç][aã]o\s+WL/i, 'FS260096']];

// Nome do processo como o nome da pasta: "FS260113 - 276143168 - Thomas - Ematóide - Qingdao"
function restoNomeProcesso(p) {
  const n = (p.docs && p.docs._nomePasta) || '';
  if (n && FS_DE(n.split(/\s+[-–—]\s+/)[0]) === p.id) { const resto = n.split(/\s+[-–—]\s+/).slice(1).join(' - '); if (resto) return '- ' + resto; }
  if (n && FS_DE(n) && n.split(/\s+[-–—]\s+/).length > 2) return '- ' + n.split(/\s+[-–—]\s+/).slice(1).join(' - ');
  const prod = typeof grupoProduto === 'function' ? grupoProduto(p) : (p.produto || '');
  const dest = String(p.pod || '').split(',')[0].trim();
  const cli = (p.docs && p.docs._apelido) || String(p.cliente || '').split(/\s+/).slice(0, 2).join(' ');
  return ['', p.booking, cli, prod, dest].filter((x, i) => i === 0 || x).join(' - ').replace(/^ - /, '- ');
}
function nomeProcesso(p) { return p.id + ' ' + restoNomeProcesso(p); }
// nomes das pastas no Drive (Processos Unificados): guarda o nome de cada processo
async function nomesDasPastas() {
  const fs = await driveListAll("mimeType='application/vnd.google-apps.folder' and name contains 'FS26' and trashed=false", 'id,name');
  const melhor = {};
  fs.forEach(f => {
    const nome = String(f.name || '').trim(); if (!/^FS\s?\d{6}S?\s+-\s+/.test(nome)) return;   // o padrão usa hífen; as pastas do ERP usam travessão
    const id = processoAtual(FS_DE(nome)); const partes = nome.split(/\s+-\s+/).length;
    const pontos = partes * 2 + (/\d{6,}|[A-Z]{4}\d{6,}/.test(nome.split(/\s+-\s+/)[1] || '') ? 3 : 0) - (/\+/.test(nome.split(/\s+-\s+/)[0]) ? 4 : 0);
    if (!melhor[id] || pontos > melhor[id].pontos) melhor[id] = { nome, pontos };
  });
  let n = 0;
  (S.processos || []).forEach(p => { const m = melhor[p.id]; if (m && p.docs && p.docs._nomePasta !== m.nome) { p.docs._nomePasta = m.nome; n++; } });
  return n;
}

function limparNomeCadastro(t) { return String(t || '').replace(/\s+(Munic[ií]pio|Sigla UF|C[oó]digo IBGE)\b.*$/i, '').replace(/^\d{2}\.\d{3}\.\d{3}\s+/, '').replace(/\s+/g, ' ').trim(); }
function cnpjValido(c) {
  c = String(c || '').replace(/\D/g, ''); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return c.length === 11;   // CPF passa
  const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
// Auditoria 11/10: limpa o cadastro (nomes com lixo do PDF, CNPJ inválido, duplicados pelo CNPJ, "chave", o sócio)
function limparCadastros() {
  let n = 0; const fs = S.fornecedores || []; const ficar = [];
  fs.forEach(f => {
    const nome = limparNomeCadastro(f.nome); if (nome !== f.nome) { f.nome = nome; n++; }
    if (f.cnpj && !cnpjValido(f.cnpj)) { f.cnpj = ''; n++; }
    if (/^(chave|pix)$/i.test(f.nome) || /KLISMANN/i.test(f.nome)) { n++; return; }
    const c = String(f.cnpj || '').replace(/\D/g, '');
    const igual = ficar.find(x => (c && String(x.cnpj || '').replace(/\D/g, '') === c) || normNome(x.nome) === normNome(f.nome));
    if (igual) { ['ie', 'cep', 'end', 'email', 'banco', 'agencia', 'conta', 'pix'].forEach(k => { if (!igual[k] && f[k]) igual[k] = f[k]; }); n++; return; }
    ficar.push(f);
  });
  if (n) { S.fornecedores = ficar; logAction('editar', 'FORNECEDORES', '-', `Cadastro limpo: ${fs.length - ficar.length} duplicado(s) ou inválido(s) removido(s)`); }
  return n;
}
// Auditoria 11/10: despesa da empresa lançada duas vezes (pelo comprovante e pela linha do extrato) — junta numa só
function despesasDuplicadas() {
  const datas = l => { const ds = [brToIso(l.data || '')].filter(Boolean); (String(l.observacao || '').match(/20\d{2}-\d{2}-\d{2}/g) || []).forEach(d => ds.push(d)); return ds; };
  const perto = (a, b) => datas(a).some(x => datas(b).some(y => Math.abs((new Date(x) - new Date(y)) / 864e5) <= 7));
  const comBanco = (S.lancamentos || []).filter(l => l.tipo === 'Despesa' && l.docs && l.docs._banco && l.vinculo !== 'processo');
  const fora = new Set();
  (S.lancamentos || []).filter(l => l.tipo === 'Despesa' && l.vinculo !== 'processo' && !(l.docs && l.docs._banco) && /^(Comprovante|Nota):/.test(l.observacao || '')).forEach(b => {
    const cands = comBanco.filter(a => !fora.has(a) && Math.abs((Number(a.valor) || 0) - (Number(b.valor) || 0)) < 0.01 && perto(a, b) && !(a.docs.comprovante && a.docs.comprovante !== b.docs.comprovante));
    if (cands.length !== 1) return;
    const a = cands[0]; a.docs.comprovante = a.docs.comprovante || (b.docs || {}).comprovante || (b.docs || {}).nota;
    if (a.categoria !== b.categoria && /^Comprovante/.test(b.observacao || '')) a.categoria = b.categoria;
    a.observacao = (a.observacao || '') + ' · ' + b.observacao; fora.add(b); fora.add(a);
    logAction('editar', 'EXTRATO_CAIXA', a.id, `Despesa repetida juntada: ${b.descricao} R$ ${b.valor} (comprovante) = linha do extrato`);
  });
  const tirar = [...fora].filter(l => !(l.docs && l.docs._banco));
  if (tirar.length) S.lancamentos = S.lancamentos.filter(l => !tirar.includes(l));
  // categoria pelo nome do comprovante (ex.: "Empréstimo sócio" não é despesa; "Escavadeira" não é seguro)
  let n = tirar.length;
  (S.lancamentos || []).forEach(l => {
    if (l.vinculo === 'processo') return;
    const m = String(l.observacao || '').match(/Comprovante: ([^·]+)/); if (!m) return;
    const nome = semAcento(m[1]); const hit = CATEG_ADM_REGRAS.find(([re]) => re.test(nome));
    if (!hit || hit[1] === l.categoria || !(l.categoria === 'Despesas administrativas' || l.categoria === 'Seguros' || hit[1] === 'Empréstimo ao sócio')) return;
    l.categoria = hit[1]; l.descricao = hit[1] + ' — ' + (l.empresa || ''); if (hit[1] === 'Empréstimo ao sócio') l.tipo = 'Transferência';
    n++;
  });
  return n;
}
// lançamento do extrato num custo do processo sem nota/comprovante (ex.: frete marítimo do FS260108): vira o custo do processo
function lancamentosViramCusto() {
  let n = 0; const ficar = [];
  (S.lancamentos || []).forEach(l => {
    const campo = l.tipo === 'Despesa' && l.vinculo === 'processo' && l.status === 'Pago' && l.docs && typeof l.docs._banco === 'string' ? CAMPO_POR_CATEG[l.categoria] : '';
    const p = campo && (S.processos || []).find(x => x.id === l.vinculoId);
    if (!p || (p.docs && p.docs._custoDocs && p.docs._custoDocs[campo])) { ficar.push(l); return; }
    p.docs = p.docs || {}; p.docs._custoDocs = p.docs._custoDocs || {};
    p.docs._custoDocs[campo] = { fiscais: [], pagos: [{ k: 'banco:' + l.docs._banco, tipo: 'banco', valor: Number(l.valor) || 0, data: l.data || '', nome: 'extrato: ' + (l.empresa || ''), de: l.empresa || '', url: l.docs.comprovante || '' }] };
    p.docs._costBanco = Object.assign({}, p.docs._costBanco, { [campo]: l.docs._banco });
    if (!p.docs._costEmpresa) p.docs._costEmpresa = {}; if (!p.docs._costEmpresa[campo] && l.empresa) p.docs._costEmpresa[campo] = titulo(l.empresa);
    ((S.banco && S.banco.linhas) || []).forEach(b => { if (b.lancId === l.id) b.lancId = 'custo:' + p.id + '/' + campo; });
    recalcularCustos(p, campo); n++;
  });
  if (n) S.lancamentos = ficar;
  return n;
}
// Linha do extrato ligada a um lançamento que não existe mais (virou custo do processo, foi juntado…):
// liga ao custo certo pelo _costBanco, ou ao lançamento que tem a mesma linha; se não achar, volta para "pendente".
function vinculosDoBanco() {
  const B = (S.banco && S.banco.linhas) || []; if (!B.length) return 0;
  const lids = new Set((S.lancamentos || []).map(l => l.id));
  const porBanco = {}; (S.lancamentos || []).forEach(l => { if (l.docs && typeof l.docs._banco === 'string') porBanco[l.docs._banco] = l; });
  const custoPorBanco = {}; (S.processos || []).forEach(p => Object.entries((p.docs && p.docs._costBanco) || {}).forEach(([c, k]) => { if (typeof k === 'string') (custoPorBanco[k] = custoPorBanco[k] || []).push(p.id + '/' + c); }));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let n = 0;
  B.forEach(l => {
    if (l.status !== 'conciliado' || !l.lancId) return;
    const id = String(l.lancId);
    // custo do processo que mudou de campo (ex.: imposto da COOP saiu do Produto para Impostos)
    const mc = id.match(/^custo:(FS\d{6}S?)\/(\w+)$/);
    if (mc && custoPorBanco[l.chave] && custoPorBanco[l.chave].length === 1 && custoPorBanco[l.chave][0] !== mc[1] + '/' + mc[2] && custoPorBanco[l.chave][0].startsWith(mc[1] + '/')) { l.lancId = 'custo:' + custoPorBanco[l.chave][0]; n++; return; }
    const ids = id.replace(/^reembolso:/, '').split(',');
    if (!ids.every(x => uuid.test(x)) || ids.some(x => lids.has(x))) return;
    if (porBanco[l.chave]) { l.lancId = porBanco[l.chave].id; n++; return; }
    if (custoPorBanco[l.chave] && custoPorBanco[l.chave].length === 1) { l.lancId = 'custo:' + custoPorBanco[l.chave][0]; n++; return; }
    l.obs = ('Estava ligado a ' + (l.categoria || '') + (l.centro ? ' · ' + l.centro : '') + ', que não existe mais — confira').trim();
    l.status = 'pendente'; l.lancId = ''; n++;
  });
  return n;
}
// Lançamentos repetidos: (1) dois lançamentos da mesma linha do extrato; (2) PDF e XML da mesma nota (mesmo nome) lançados duas vezes
function lancamentosRepetidos() {
  const L = S.lancamentos || []; const B = (S.banco && S.banco.linhas) || [];
  const ligados = new Set(); B.forEach(l => String(l.lancId || '').replace(/^reembolso:/, '').split(',').forEach(x => x && ligados.add(x)));
  const tirar = new Set();
  const grupos = {}; L.forEach(l => { if (l.docs && typeof l.docs._banco === 'string' && l.docs._banco) (grupos[l.docs._banco] = grupos[l.docs._banco] || []).push(l); });
  Object.values(grupos).filter(g => g.length > 1).forEach(g => {
    const fica = g.find(l => ligados.has(l.id)) || g[0];
    g.filter(l => l !== fica && !ligados.has(l.id) && Math.abs((Number(l.valor) || 0) - (Number(fica.valor) || 0)) < 0.01 && l.vinculoId === fica.vinculoId).forEach(l => tirar.add(l));
  });
  const nomeArq = l => { const m = String(l.observacao || '').match(/(?:· |Nota: |Comprovante: )([^·]+?)\.(pdf|xml|png|jpe?g)\s*(?:·|$)/i); return m ? semAcento(m[1]).replace(/[^A-Z0-9]/g, '') : ''; };
  const vistos = {};
  L.forEach(l => {
    if (tirar.has(l) || ligados.has(l.id) || (l.docs && l.docs._banco)) return;
    const n = nomeArq(l); if (!n) return;
    const k = [n, Math.abs(Number(l.valor) || 0).toFixed(2), l.data, l.vinculoId || '', l.status].join('|');
    const a = vistos[k]; if (!a) { vistos[k] = l; return; }
    a.docs = a.docs || {}; const url = (l.docs || {}).comprovante || (l.docs || {}).nota;
    if (url && url !== a.docs.comprovante && url !== a.docs.nota) a.docs.outroArquivo = url;
    tirar.add(l);
  });
  if (tirar.size) { S.lancamentos = L.filter(l => !tirar.has(l)); tirar.forEach(l => logAction('excluir', 'EXTRATO_CAIXA', l.id, 'Lançamento repetido: ' + (l.descricao || '') + ' R$ ' + l.valor)); }
  return tirar.size;
}
// ═══════════════════════════════════════════════════════════════
// Assessoria Ademir / FFA: conta fechada pelo SALDO (decisão de 11/10/2026).
// Processos já pagos: 1 container = R$ 1.200, 2 containers = R$ 2.400. Não precisa ligar cada comprovante ao seu processo:
// soma tudo o que saiu para o Ademir/FFA no extrato e compara com o que é devido. Os demais seguem em aberto (previsto).
// ═══════════════════════════════════════════════════════════════
const ASSESSORIA_PAGOS = { FS260096: 1200, FS260097: 1200, FS260098: 1200, FS260099: 1200, FS260100: 1200, FS260101: 1200, FS260102: 1200, FS260104: 1200, FS260107: 1200, FS260108: 1200, FS260109: 1200, FS260109S: 1200, FS260111: 1200, FS260106: 2400, FS260112: 2400 };
const ASSESSORIA_RE = /\bFFA\s+COMERCIO|ADEMIR\s+FURTADO/;
const ASSESSORIA_DECISAO = '2026-10-11';
// PIX da empresa para o Klismann que foi repassado ao Ademir (R$ 3.000 de 20/08): é assessoria, não empréstimo ao sócio
const ASSESSORIA_VIA_SOCIO = ['0341-8262994992|2026-08-20|-300000|PIX ENVIADO KLISMANN LAI 070.929.029-24|1'];
// custos confirmados por você (11/10/2026): FS260112 tem mais de uma carga e todos os produtos já estão pagos (COOP R$ 8.100 + Thomazini R$ 43.200)
const DECISOES_CUSTO = [['FS260112', 'custoProduto', 'Pago']];
// valor das invoices da Fu Song conferido nos PDFs (a do FS260115 não tinha entrado no processo)
const INVOICES_CONFERIDAS = { FS260115: 65880 };
// valor certo informado por você (11/10/2026): FS260117 é USD 13.500 de invoice e contrato (os PDFs de 27/09 dizem 21.600)
const INVOICES_CORRIGIDAS = { FS260117: 13500 };
function ehLinhaAssessoria(l) { return l && l.valor < 0 && (l.lancId === 'saldo:ASSESSORIA' || ASSESSORIA_RE.test(semAcento((l.favorecido || '') + ' ' + (l.memo || '')))); }
function assessoriaPeloSaldo() {
  let n = 0;
  Object.entries(ASSESSORIA_PAGOS).forEach(([id, v]) => {
    const p = (S.processos || []).find(x => x.id === id); if (!p) return;
    p.docs = p.docs || {};
    const c = 'custoServTerceiros';
    if (p.docs._assessoriaSaldo && Number(p[c]) === v && p[c + '_status'] === 'Pago') return;
    p.docs._assessoriaSaldo = true;
    p.docs._valorManual = Object.assign({}, p.docs._valorManual, { [c]: v });
    p.docs._statusManual = Object.assign({}, p.docs._statusManual, { [c]: 'Pago' });
    if (p.docs._previsto) { delete p.docs._previsto[c]; if (!Object.keys(p.docs._previsto).length) delete p.docs._previsto; }
    p.docs._costEmpresa = Object.assign({}, p.docs._costEmpresa, { [c]: 'Assessoria (Ademir / FFA)' });
    p[c] = v; p[c + '_status'] = 'Pago';
    if (p.docs._custoDocs && p.docs._custoDocs[c]) recalcularCustos(p, c);
    n++;
  });
  ((S.banco && S.banco.linhas) || []).forEach(l => {
    if (!ASSESSORIA_VIA_SOCIO.includes(l.chave) || l.lancId === 'saldo:ASSESSORIA') return;
    const velho = l.lancId; if (velho) S.lancamentos = (S.lancamentos || []).filter(x => x.id !== velho);
    l.status = 'conciliado'; l.lancId = 'saldo:ASSESSORIA'; l.categoria = 'Serviços de Terceiros'; l.centro = 'Assessoria (saldo)'; l.obs = 'Assessoria Ademir/FFA paga pelo Klismann (PIX da empresa para o sócio, repassado ao Ademir)'; n++;
  });
  Object.entries(INVOICES_CORRIGIDAS).forEach(([id, v]) => { const p = (S.processos || []).find(x => x.id === id); if (!p) return; p.docs = p.docs || {}; if (Number(p.cambioInvoice) !== v || p.docs._invoiceCorrigida !== v) { p.cambioInvoice = v; p.docs._invoiceCorrigida = v; p.docs._invoiceUsd = v; p.docs._contratoUsd = v; n++; } });
  Object.entries(INVOICES_CONFERIDAS).forEach(([id, v]) => { const p = (S.processos || []).find(x => x.id === id); if (p && !(Number(p.cambioInvoice) > 0)) { p.cambioInvoice = v; p.docs = p.docs || {}; p.docs._invoiceUsd = v; n++; } });
  DECISOES_CUSTO.forEach(([id, c, st]) => {
    const p = (S.processos || []).find(x => x.id === id); if (!p) return; p.docs = p.docs || {};
    if (p.docs._statusManual && p.docs._statusManual[c] === st && p[c + '_status'] === st) return;
    p.docs._statusManual = Object.assign({}, p.docs._statusManual, { [c]: st }); p[c + '_status'] = st;
    if (p.docs._custoDocs && p.docs._custoDocs[c]) recalcularCustos(p, c); n++;
  });
  // linhas do extrato para o Ademir/FFA até a decisão: entram na conta pelo saldo (sem precisar escolher o processo)
  ((S.banco && S.banco.linhas) || []).forEach(l => {
    if (!ehLinhaAssessoria(l) || l.data > ASSESSORIA_DECISAO || l.status !== 'pendente') return;
    l.status = 'conciliado'; l.lancId = 'saldo:ASSESSORIA'; l.categoria = 'Serviços de Terceiros'; l.centro = 'Assessoria (saldo)'; l.obs = 'Assessoria Ademir/FFA — acerto pelo saldo'; n++;
  });
  return n;
}
function contaAssessoria() {
  const linhas = ((S.banco && S.banco.linhas) || []).filter(l => ehLinhaAssessoria(l) && l.status !== 'ignorado').sort((a, b) => a.data.localeCompare(b.data));
  const pago = Math.round(linhas.reduce((a, l) => a + Math.abs(l.valor), 0) * 100) / 100;
  const devidos = [], abertos = [];
  (S.processos || []).filter(p => p.status !== 'Cancelado').forEach(p => {
    const v = Number(p.custoServTerceiros) || 0;
    const ehDele = ASSESSORIA_PAGOS[p.id] || /ADEMIR|FFA|ASSESSORIA/i.test(String(((p.docs || {})._costEmpresa || {}).custoServTerceiros || ''));
    if (!ehDele || !v) return;
    (p.custoServTerceiros_status === 'Pago' ? devidos : abertos).push({ id: p.id, valor: v, previsto: !!(p.docs && p.docs._previsto && p.docs._previsto.custoServTerceiros) });
  });
  const devido = Math.round(devidos.reduce((a, x) => a + x.valor, 0) * 100) / 100;
  const emAberto = Math.round(abertos.reduce((a, x) => a + x.valor, 0) * 100) / 100;
  return { linhas, pago, devidos, devido, abertos, emAberto, diferenca: Math.round((pago - devido) * 100) / 100 };
}
function blocoContaAssessoria() {
  const c = contaAssessoria(); if (!c.linhas.length && !c.devidos.length) return '';
  const m = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dif = c.diferenca, aberto = !!S._contaAss;
  const txtDif = Math.abs(dif) < 0.01 ? '<span style="color:var(--green)">conta fechada</span>' : dif < 0 ? `<span style="color:var(--yellow)">faltam ${m(-dif)} no extrato</span>` : `<span style="color:var(--accent)">crédito de ${m(dif)} (pago a mais)</span>`;
  return `<div style="padding:9px 12px;border-radius:10px;background:var(--bg3)">
    <div style="display:flex;justify-content:space-between;gap:10px;cursor:pointer" onclick="S._contaAss=!S._contaAss;render()"><div><div style="font-size:14px;font-weight:600">Assessoria Ademir / FFA ${aberto ? '▾' : '▸'}</div><div style="font-size:12.5px;color:var(--muted2)">pago ${m(c.pago)} · devido pelos processos pagos ${m(c.devido)} · ${txtDif}</div></div><div style="font-family:'JetBrains Mono',monospace;font-size:13.5px;white-space:nowrap">${m(c.emAberto)} a pagar</div></div>
    ${aberto ? `<div style="font-size:12.5px;padding-top:8px;display:grid;gap:4px">
      <div style="font-weight:600">Saídas no extrato para Ademir/FFA</div>${c.linhas.map(l => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${isoToBr(l.data)} · ${escHtml((l.favorecido || l.memo).slice(0, 40))}${ASSESSORIA_VIA_SOCIO.includes(l.chave) ? ' (via Klismann)' : ''}</span><span style="font-family:'JetBrains Mono',monospace">${m(Math.abs(l.valor))}</span></div>`).join('')}
      <div style="font-weight:600;padding-top:6px">Processos já pagos (${c.devidos.length})</div><div style="color:var(--muted2)">${c.devidos.map(x => escHtml(x.id.replace(/^FS260/, '')) + ' ' + m(x.valor)).join(' · ')}</div>
      <div style="font-weight:600;padding-top:6px">Em aberto (${c.abertos.length})</div><div style="color:var(--muted2)">${c.abertos.map(x => escHtml(x.id.replace(/^FS260/, '')) + ' ' + m(x.valor) + (x.previsto ? ' (previsto)' : '')).join(' · ') || '—'}</div>
      ${dif < -0.009 ? `<div style="color:var(--yellow);padding-top:6px">A diferença de ${m(-dif)} pode ter sido paga por outra conta, em dinheiro, ou ainda não foi paga.</div>` : ''}
    </div>` : ''}
  </div>`;
}
// câmbio: taxa com 4 casas
function arredondarTaxas() { let n = 0; (S.processos || []).forEach(p => { const t = Number(p.cambioTaxa); if (t && String(p.cambioTaxa).length > 6) { p.cambioTaxa = Math.round(t * 10000) / 10000; n++; } }); return n; }
