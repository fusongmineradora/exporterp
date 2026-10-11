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
const TESTE_SHEET_NAME = 'Fu Song ERP Database — TESTE 3';
let _ensureTestSheetPromise = null;

function ensureTestSheet() {
  if (SHEET_ID !== TESTE_SENTINEL) return Promise.resolve(SHEET_ID);
  if (!_ensureTestSheetPromise) {
    _ensureTestSheetPromise = _ensureTestSheet().catch(e => { _ensureTestSheetPromise = null; throw e; });
  }
  return _ensureTestSheetPromise;
}

async function _ensureTestSheet() {
  // recomeço (geração 3): o backup local da planilha antiga não pode voltar
  try { if (localStorage.getItem('teste:geracao') !== '3') { localStorage.removeItem('teste:erp-local-backup'); localStorage.setItem('teste:geracao', '3'); } } catch (e) {}
  // a) já usada neste aparelho
  let saved = null;
  try { saved = localStorage.getItem('teste:sheet-id-3'); } catch (e) {}
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
  try { localStorage.setItem('teste:sheet-id-3', SHEET_ID); } catch (e) {}
  return SHEET_ID;
}

// Carrega e garante que nenhum processo aponte para pastas da produção
async function loadFromSheets() {
  await ensureTestSheet();
  await _loadFromSheetsBase();
  let changed = 0;
  (S.processos || []).forEach(p => {
    if (p.docs && p.docs._folderId && !p.docs._testeOk) {
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
async function _gravarMarca() {
  try { await sheetsAPI('PUT', `/${SHEET_ID}/values/CONFIG!D1:E1?valueInputOption=RAW`, { values: [['ultima_gravacao', _SESSAO + '|' + new Date().toISOString()]] }); } catch (e) {}
}
const _saveToSheetsBase = saveToSheets;
let _conflitoAberto = false;
saveToSheets = async function () {
  await ensureTestSheet();
  if (_carregadoEm && !_conflitoAberto) {
    const [sid, quando] = (await _lerMarca()).split('|');
    if (sid && sid !== _SESSAO && quando > _carregadoEm) {
      _conflitoAberto = true;
      const recarregar = await uiConfirm(`Os dados foram alterados em outro aparelho ou aba às ${new Date(quando).toLocaleTimeString('pt-BR')}, depois que você abriu esta tela.\n\nSe salvar agora, o que foi feito lá pode ser perdido. Recarregar os dados antes? (a sua última alteração precisará ser refeita)`, 'Alterações em outro lugar', 'Recarregar', 'Salvar mesmo assim');
      _conflitoAberto = false;
      if (recarregar) { await loadFromSheets(); showToast('Dados recarregados'); render(); return; }
    }
  }
  // antes de gravar: junta processo renumerado e atualiza os custos previstos (containers, certificado, armazém, valor real)
  try { if (typeof juntarProcessosRenumerados === 'function') juntarProcessosRenumerados(); if (typeof aplicarPrevistos === 'function') (S.processos || []).forEach(p => aplicarPrevistos(p)); } catch (e) { console.warn('previstos', e); }
  const r = await _saveToSheetsBase.apply(this, arguments);
  await _gravarMarca();
  _carregadoEm = new Date().toISOString();
  return r;
};

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
const ENTRADA_FOLDER = '📥 Entrada';
const DUPLICADOS_FOLDER = '🔁 Duplicados';
const ENTRADA_TIPOS = [
  ['invoice', 'Invoice'], ['contrato', 'Contrato'], ['packingList', 'Packing List'], ['bl', 'BL'],
  ['due', 'DU-E'], ['nfe', 'NF-E Entrada'], ['nfeSaida', 'NF-E Saída'], ['cte', 'CT-e (frete)'],
  ['mdfe', 'MDF-e'], ['nfse', 'NFS-e (serviço)'], ['recibo', 'Recibo / RPA'], ['comprovantes', 'Comprovantes Câmbio'], ['certOrigem', 'Cert. Origem'],
  ['seguro', 'Seguro de Carga'], ['pesagem', 'Pesagem'], ['pagamento', 'Comprovante de Pagamento'],
  ['faturaFrete', 'Fatura de frete (agente)'], ['planilhaCambio', 'Planilha de câmbio (banco)'], ['boleto', 'Boleto (cobrança)'], ['outros', 'Outros Documentos'],
];
const tipoLabel = k => (ENTRADA_TIPOS.find(t => t[0] === k) || [k, k])[1];

S.entrada = S.entrada || { itens: [], carregando: false, lido: false, erro: '', progresso: '' };

async function getTesteFolder(name) {
  window._testeFolders = window._testeFolders || {};
  if (window._testeFolders[name]) return window._testeFolders[name];
  const root = await getRootFolderId();
  const id = await getOrCreateFolder(name, root);
  window._testeFolders[name] = id;
  return id;
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
    out += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
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
  return {
    origem: 'xml', tipo: 'nfse', modelo: 'NFS-e',
    numero: first('Numero', 'nNFSe', 'nDFSe'),
    emitCnpj: sub(prest, 'Cnpj', 'CNPJ'), emitNome: sub(prest, 'RazaoSocial', 'xNome', 'NomeFantasia'),
    valor: Number(String(first('ValorLiquidoNfse', 'ValorServicos', 'vLiq', 'vServ')).replace(',', '.')) || 0,
    data: first('DataEmissao', 'dhEmi', 'dhProc').slice(0, 10),
    descricao: first('Discriminacao', 'xDescServ').slice(0, 200),
    chave: (first('CodigoVerificacao') ? 'NFSE-' + sub(prest, 'Cnpj', 'CNPJ') + '-' + first('Numero', 'nNFSe') : ''),
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

// "FS260098 99 01" ou "FS2600989901" = FS260098, FS260099 e FS260101 (só os 2 últimos dígitos; se diminuir, vira a centena seguinte)
// Também a forma curta do PIX (campo de 30 caracteres): "FS 113 114" = FS260113 e FS260114; "109S"; "113x2" = 2 containers
// (o "xN" logo depois do número é a quantidade de containers daquele processo: o PIX é dividido por container)
function anoProcessos() {
  const ids = (S.processos || []).map(p => p.id).filter(id => /^FS\d{6}/.test(id)).sort();
  return ids.length ? ids[ids.length - 1].slice(2, 4) : String(new Date().getFullYear()).slice(2);
}
function processoAtual(id) { const a = (typeof aliasesProcesso === 'function' ? aliasesProcesso() : {})[id]; return a || id; }
function lerAbreviados(txt) {
  const T = String(txt || '').toUpperCase().replace(/FS(\d{6})((?:\d{2}){1,3})(?!\d)/g, (m, a, b) => 'FS' + a + ' ' + b.match(/\d{2}/g).join(' ') + ' ');
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
  if (/WAYBILL|BILLOFLADING/.test(C) && /SHIPPEDONBOARD|BOOKINGNO|PORTOFLOADING/.test(C) && !chavesDoTexto(String(texto || '')).length) {
    return { tipo: 'bl', confianca: 'alta', motivo: 'BL / waybill' };
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
    if (due.length >= 8 && compact.includes(due)) { score += 80; motivos.push('DU-E'); }
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
    E.itens = itens; E.lido = true;
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
      try { await saveToSheets(); } catch (e) {}
    }
  } catch (e) {
    E.erro = e.message || String(e);
  }
  E.carregando = false; E.progresso = ''; render();
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
  if (['nfse', 'boleto', 'recibo'].includes(item.tipo) && Number(item.info.valor) > 0 && item.info.emitNome && item.info.data && item.confianca !== 'alta') { item.confianca = 'alta'; item.motivo = (item.motivo ? item.motivo + ' · ' : '') + 'valor, data e emitente lidos'; }
  item._base = { tipo: item.tipo, confianca: item.confianca, motivo: item.motivo };
  return identificarItem(item);
}

// Decide o processo do arquivo já lido. Pode ser refeito (ex.: depois de criar os processos) sem ler o arquivo de novo.
function identificarItem(item) {
  const nome = item.nome || '';
  if (item._base) { item.tipo = item._base.tipo; item.confianca = item._base.confianca; item.motivo = item._base.motivo; }
  ['processo', 'pastaErrada', 'corrigido', 'aviso', 'processosExtras', 'divisao', 'admAuto'].forEach(k => delete item[k]);
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
    if (pesos.some(x => x > 1) && !item.divisaoValores) {
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
  item.duplicado = procurarDuplicado(item);
  return item;
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
    if (item.tipo === 'pagamento') folderId = await getOrCreateFolder('Comprovantes', folderId);
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
  if (!valor) return;
  S.lancamentos = S.lancamentos || [];
  if (S.lancamentos.some(x => x.docs && (x.docs.comprovante === upd.webViewLink || (pag.idTransacao && x.docs.idTransacao === pag.idTransacao)))) return;
  if (!p && typeof lancamentoParecido === 'function') { const ja = lancamentoParecido(valor, item.info.data, pag.recebedor || item.info.emitNome); if (ja) { ja.docs = ja.docs || {}; ja.docs.comprovante = ja.docs.comprovante || upd.webViewLink; return; } }
  const centroAdm = !p;
  const categoria = item.categoria || (centroAdm ? 'Despesas administrativas' : 'Outros custos do processo');
  const obj = {
    id: genId(), tipo: 'Despesa', status: 'Pago',
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
async function confirmarAdm(i, silencioso) {
  const E = S.entrada, item = E.itens[i];
  item.salvando = true; if (!silencioso) render();
  try {
    const mes = (item.info.data || new Date().toISOString()).slice(0, 7);
    const pasta = await getTesteFolder('Comprovantes ' + mes);
    const novoNome = `${mes}_ADM_${tipoLabel(item.tipo).replace(/[^\wÀ-ú]+/g, '-')}_${item.nome.replace(/^ADM\s*-\s*/i, '')}`;
    const upd = await driveAPI('PATCH', '/files/' + item.fileId, { name: novoNome, description: 'Nome original: ' + item.nome }, 'addParents=' + pasta + '&removeParents=' + E.folderId + '&fields=id,name,webViewLink');
    if (typeof gravarAba2 === 'function') {
      await ensureTabs2();
      const docs = await lerAba2('DOCUMENTOS');
      docs.push({ id: upd.id, nome: upd.name, url: upd.webViewLink, tipo: item.tipo, categoria: item.categoria || '', valor: item.info.valor || '', data: item.info.data || '', centro: 'ADM', md5: item.md5, criadoEm: new Date().toISOString() });
      await gravarAba2('DOCUMENTOS', docs);
      if (S.banco) S.banco.docs = docs;
    }
    logAction('anexar', 'DOCUMENTOS', upd.id, 'ADM: ' + upd.name + ' (Caixa de Entrada)');
    if (typeof cadastrarPeloDoc === 'function') { try { cadastrarPeloDoc(item); } catch (e) { console.warn('cadastro', e); } }
    if (item.pagoPor === 'socio' && typeof lancarReembolsoSocio === 'function') lancarReembolsoSocio(item, null, upd);
    else if (['nfse', 'recibo'].includes(item.tipo) && typeof lancarDespesaDaNota === 'function') lancarDespesaDaNota(item, upd);
    else lancarFinanceiroDoDoc(item, null, upd);
    E.itens.splice(i, 1);
    if (!silencioso) { showToast('✅ Guardado como despesa do mês ' + mes.slice(5) + '/' + mes.slice(0, 4)); render(); }
    return true;
  } catch (e) { item.salvando = false; item.erro = e.message || String(e); if (!silencioso) render(); return false; }
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
      if (ok1(it)) { if (await confirmarEntrada(i, true)) { ok++; achou = true; } }
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
  if (campo === 'valor') { it.info.valor = numBR(String(valor).replace(/[^\d.,]/g, '')) || 0; it.valorManual = true; if (it.info.pagamento) it.info.pagamento.valor = it.info.valor; }
  else it.info[campo] = valor;
  render();
}
function setEntrada(i, campo, valor) {
  const it = S.entrada.itens[i];
  if (!it) return;
  it[campo] = valor;
  if (campo === 'tipo' || campo === 'processo') { it.confianca = 'manual'; it.duplicado = procurarDuplicado(it); }
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
      ${['pagamento', 'recibo', 'nfse', 'nfe', 'boleto', 'outros'].includes(it.tipo) && it.processo === '__ADM' ? `
      <div class="g2" style="margin-top:10px">
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-val-${i}">Valor (R$)${!Number(it.info.valor) ? ' <span style="color:var(--red)">· não lido</span>' : ''}</label>
          <input id="ent-val-${i}" type="text" inputmode="decimal" value="${Number(it.info.valor) ? fmt(it.info.valor) : ''}" placeholder="0,00" onchange="setInfoEntrada(${i},'valor',this.value)"/></div>
        <div class="ig" style="margin-bottom:0"><label class="lbl" for="ent-dat-${i}">${it.tipo === 'boleto' ? 'Data do documento' + (it.info.vencimento ? ' · vence ' + escHtml(it.info.vencimento) : '') : 'Data do pagamento'}</label>
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
      <button class="btn btn-primary btn-sm" onclick="importarTudo()" ${E.carregando || (E.tudo && E.tudo.rodando) ? 'disabled' : ''}>🗂️ Importar tudo de uma pasta</button>
      <button class="btn btn-secondary btn-sm" onclick="importarPastaProcesso()" ${E.carregando ? 'disabled' : ''}>📂 Importar pasta de um processo</button>
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
