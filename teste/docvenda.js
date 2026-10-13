/* ═══════════════════════════════════════════════════════════
 * Fu Song ERP — Gerador de Invoice e Sales Contract
 * Escreve os dados do processo por cima dos modelos em branco do Canva
 * (logo, faixa, rótulos, carimbo e assinatura vêm do modelo; nada é redesenhado).
 * Posições medidas nos PDFs originais (FS260116 / FS260117). Fontes: Open Sans e Arimo
 * (as mesmas do Canva), embutidas como TrueType com codificação WinAnsi.
 * Precisa de PDFLib (pdf-lib 1.17) carregado antes.
 * ═══════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const COR = [0.1608, 0.0784, 0.1451];   // texto do modelo (Open Sans)
  const PRETO = [0, 0, 0];
  const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ── texto → WinAnsi (o que não existe vira equivalente) ──
  const TROCA = { '：': ':', '、': ', ', '，': ', ', '（': '(', '）': ')', ' ': ' ', '‐': '-', '‑': '-', '‒': '-', '–': '–' };
  function cp1252(str) {
    const out = [];
    for (const ch of String(str || '')) {
      const c = TROCA[ch] !== undefined ? TROCA[ch] : ch;
      for (const x of c) {
        const u = x.codePointAt(0);
        const map = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
        if (u >= 32 && u < 127) out.push(u); else if (u >= 160 && u <= 255) out.push(u); else if (map[u]) out.push(map[u]); else out.push(63);
      }
    }
    return out;
  }
  const largura = (m, str, size) => cp1252(str).reduce((a, c) => a + (m.widths[c - 32] || 0), 0) * size / 1000;
  function quebrar(m, str, size, max) {
    const linhas = []; let atual = '';
    String(str || '').split(/\s+/).filter(Boolean).forEach(p => {
      const t = atual ? atual + ' ' + p : p;
      if (largura(m, t, size) <= max || !atual) atual = t; else { linhas.push(atual); atual = p; }
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  // ── formatos ──
  const n2 = (v, min, max) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const kgTxt = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const usdTxt = v => n2(v, 2, 2) + ' USD';
  const precoTxt = v => n2(v, 2, 4) + ' USD';
  function dataTxt(iso) { const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return ''; return `${MESES[+m[2] - 1]} ${+m[3]}, ${m[1]}`; }
  // bloco de empresa: nome, USCI ou registro, endereço, telefone, e-mail
  function linhasEmpresa(e0) {
    if (!e0 || !e0.nome) return [];
    const limpo = t => String(t || '').replace(/[、，]/g, ',').replace(/\s+,/g, ',').replace(/,(?=\S)/g, (m, i, t) => /\d/.test(t[i - 1]) && /\d/.test(t[i + 1]) ? ',' : ', ').replace(/\s{2,}/g, ' ').trim();
    const e = Object.assign({}, e0, { end: limpo(e0.end) });
    const L = [];
    const usci = String(e.usci || '').trim();
    if (/^[0-9A-Z]{18}$/.test(usci)) L.push({ t: '(USCI): ' + usci });
    if (e.end) L.push({ t: 'ADD: ' + e.end, quebra: true });
    if (e.tel) L.push({ t: 'TEL: ' + e.tel });
    if (e.email) L.push({ t: 'E-MAIL: ' + e.email });
    if (usci && !/^[0-9A-Z]{18}$/.test(usci)) L.push({ t: 'Company Registration Certificate No.: ' + usci });
    return L;
  }

  // posições: linha de base de cada texto, medida a partir do topo da página (pontos), tirada dos rótulos do
  // modelo em branco e dos PDFs originais (FS260116 / FS260117). x = início do texto (ou centro, nas colunas).
  const LAYOUT = {
    invoice: {
      numero: { after: [319.77, 'Invoice N° '], base: 47.8, size: 24, font: 'OpenSans-Bold', cor: COR },
      data: { x: 452.2, base: 149.61, size: 12, font: 'OpenSans-Bold', cor: COR },
      esq: { x: 16.9, base: 296.45, larg: 272, maxBase: 440, nome: 'Arimo-Bold', det: 'Arimo-Regular', cor: PRETO },
      dir: { x: 307.1, base: 198.5, larg: 267, maxBase: 314, nome: 'OpenSans-Bold', det: 'OpenSans-Regular', cor: COR },
      tabela: { base: 494.6, totalBase: 556.41, size: 11, font: 'OpenSans-Regular', cor: PRETO, col: { n: 36.2, desc: [56, 214], ncm: 261.8, kg: 331.7, preco: 403.5, total: 501.9 }, totalCentro: 503.6 },
      rodape: [ // [campo, x do fim do rótulo, linha de base]
        ['ncm', 112.4, 612.59], ['produto', 89.7, 629.1], ['pol', 44.2, 645.6], ['pod', 46.3, 662.11], ['peso', 62.6, 761.15],
      ],
      report: { x: 16.9, base: 777.65 },
    },
    contrato: {
      numero: { x: 402.2, base: 65.99, size: 24, font: 'OpenSans-Bold', cor: COR },
      data: { x: 449.5, base: 141.36, size: 12, font: 'OpenSans-Bold', cor: COR },
      esq: { x: 20.0, base: 292.5, larg: 280, maxBase: 418, nome: 'OpenSans-Bold', det: 'OpenSans-Regular', cor: COR },
      dir: { x: 308.2, base: 190.1, larg: 266, maxBase: 306, nome: 'Arimo-Bold', det: 'Arimo-Regular', cor: PRETO },
      tabela: { base: 499.4, totalBase: 565.32, size: 11, font: 'OpenSans-Regular', cor: PRETO, col: { n: 40.3, desc: [60, 222], ncm: 267.2, kg: 343.0, preco: 407.2, total: 511.6 }, totalCentro: 511.6 },
      clausulas: { x: 20.0, base: 612.2, passo: 16.5, size: 12 },
      assinatura: { centro: 416.9, base: 810.6, larg: 250, font: 'Arimo-Bold' },
    },
  };

  async function gerar(opts) {
    const { PDFDocument, PDFName, PDFNumber, PDFHexString, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize, moveText, showText, setFillingRgbColor, setTextRenderingMode, TextRenderingMode } = root.PDFLib;
    const { modelo, fontes, metricas, tipo, d } = opts;   // tipo: 'invoice' | 'contrato'
    const L = LAYOUT[tipo];
    const pdf = await PDFDocument.load(modelo);
    while (pdf.getPageCount() > 1) pdf.removePage(pdf.getPageCount() - 1);   // o Canva exportou uma página em branco a mais
    const page = pdf.getPage(0), mb = page.getMediaBox(), H = mb.y + mb.height, ctx = pdf.context;   // topo real (o Canva começa a MediaBox abaixo de zero)
    pdf.setTitle(`${tipo === 'invoice' ? 'Invoice' : 'Sales Contract'} ${d.numero}`);
    pdf.setAuthor('Fu Song Inside Sales Ltda'); pdf.setCreator('Fu Song ERP'); pdf.setProducer('Fu Song ERP');
    // fontes TrueType embutidas (WinAnsi)
    const chaves = {};
    Object.keys(fontes).forEach((nome, i) => {
      const bytes = fontes[nome], m = metricas[nome];
      const arq = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }));
      const desc = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: PDFName.of(nome), Flags: m.bold ? 262176 : 32, FontBBox: m.bbox, ItalicAngle: 0, Ascent: m.ascent, Descent: m.descent, CapHeight: m.capHeight, StemV: m.bold ? 140 : 80, FontFile2: arq }));
      const fonte = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: PDFName.of(nome), FirstChar: 32, LastChar: 255, Widths: m.widths, Encoding: PDFName.of('WinAnsiEncoding'), FontDescriptor: desc }));
      chaves[nome] = page.node.newFontDictionary('FS' + i, fonte);
    });
    const escrever = (txt, x, linha, size, fonte, cor) => {
      if (!txt) return;
      const base = H - linha;   // linha de base medida a partir do topo da página
      const hex = cp1252(txt).map(c => c.toString(16).padStart(2, '0')).join('');
      page.pushOperators(pushGraphicsState(), setFillingRgbColor(cor[0], cor[1], cor[2]), beginText(), setFontAndSize(chaves[fonte], size), moveText(x, base), showText(PDFHexString.of(hex)), endText(), popGraphicsState());
    };
    const centro = (txt, cx, linha, size, fonte, cor) => escrever(txt, cx - largura(metricas[fonte], txt, size) / 2, linha, size, fonte, cor);
    // bloco de empresa: se não couber no espaço do modelo, a letra diminui um pouco (até 10 pt)
    const bloco = (e, B) => {
      if (!e || !e.nome) return;
      const montar = sz => {
        const L = quebrar(metricas[B.nome], e.nome, sz, B.larg).map(t => [t, B.nome]);
        linhasEmpresa(e).forEach(item => (item.quebra ? quebrar(metricas[B.det], item.t, sz, B.larg) : [item.t]).forEach(t => L.push([t, B.det])));
        return L;
      };
      let sz = 12, L = montar(sz);
      while (sz > 10 && B.base + (L.length - 1) * sz * 1.375 > B.maxBase) { sz -= 0.5; L = montar(sz); }
      const passo = sz * 1.375;
      L.forEach(([t, f], i) => { const linha = B.base + i * passo; if (linha <= B.maxBase + 0.5) escrever(t, B.x, linha, sz, f, B.cor); });
    };

    // número e data
    if (L.numero.after) escrever(d.numero, L.numero.after[0] + largura(metricas[L.numero.font], L.numero.after[1], L.numero.size), L.numero.base, L.numero.size, L.numero.font, L.numero.cor);
    else escrever(d.numero, L.numero.x, L.numero.base, L.numero.size, L.numero.font, L.numero.cor);
    escrever(dataTxt(d.data), L.data.x, L.data.base, L.data.size, L.data.font, L.data.cor);
    // empresas: variante "Buyer" = comprador à esquerda; variante "Consignee + Notify" = consignatário à esquerda e notificado à direita
    const comNotify = !!(d.notify && d.notify.nome);
    bloco(comNotify ? d.consignatario : d.comprador, L.esq);
    if (comNotify) bloco(d.notify, L.dir);
    // tabela (uma linha de produto; a soma vai no total)
    const T = L.tabela, it = (d.itens || [])[0] || {};
    const totalLinha = Math.round((Number(it.kg) || 0) * (Number(it.preco) || 0) * 100) / 100;
    const total = (d.itens || []).reduce((a, x) => a + Math.round((Number(x.kg) || 0) * (Number(x.preco) || 0) * 100) / 100, 0);
    centro('1', T.col.n, T.base, T.size, T.font, T.cor);
    const larguraDesc = T.col.desc[1] - T.col.desc[0];
    let sizeDesc = T.size; while (sizeDesc > 8 && largura(metricas[T.font], it.desc, sizeDesc) > larguraDesc) sizeDesc -= 0.5;
    centro(it.desc, (T.col.desc[0] + T.col.desc[1]) / 2, T.base, sizeDesc, T.font, T.cor);
    centro(String(it.ncm || '').replace(/\D/g, ''), T.col.ncm, T.base, T.size, T.font, T.cor);
    centro(kgTxt(it.kg), T.col.kg, T.base, T.size, T.font, T.cor);
    centro(precoTxt(it.preco), T.col.preco, T.base, T.size, T.font, T.cor);
    centro(usdTxt(totalLinha), T.col.total, T.base, T.size, T.font, T.cor);
    centro(usdTxt(total), T.totalCentro, T.totalBase, T.size, T.font, T.cor);

    if (tipo === 'invoice') {
      const kgTotal = (d.itens || []).reduce((a, x) => a + (Number(x.kg) || 0), 0);
      const ncmFmt = String(it.ncm || '').replace(/\D/g, '');
      const val = { ncm: ncmFmt, produto: it.desc, pol: d.pol, pod: d.pod, peso: kgTxt(kgTotal) + ' KG (Gross and Net)' };
      const esp = largura(metricas['OpenSans-Regular'], ' ', 12);
      L.rodape.forEach(([k, xFim, linha]) => escrever(val[k], xFim + esp, linha, 12, 'OpenSans-Regular', COR));
      if (d.sgs) { escrever('Report:', L.report.x, L.report.base, 12, 'OpenSans-Bold', COR); escrever('SGS', L.report.x + largura(metricas['OpenSans-Bold'], 'Report:', 12) + esp, L.report.base, 12, 'OpenSans-Regular', COR); }
    } else {
      const C = L.clausulas;
      const cidade = String(d.pod || '').split(',')[0].trim();
      const pais = (String(d.pod || '').split(',')[1] || 'China').trim().toUpperCase();
      const cl = ['1) Merchandise warehousing', `2) Total of container: ${String(d.containers || 1).padStart(2, '0')} CONTAINERS ${d.tamanho || "20'"}`, `3) Arrives Port: ${cidade}, ${pais}`, '4) Terms of price: T/T', '5) 100% ADVANCED PAYMENT'];
      if (d.sgs) cl.push('6) SGS Report');
      cl.forEach((t, i) => escrever(t, C.x, C.base + i * C.passo, C.size, 'OpenSans-Regular', COR));
      // assinatura: sempre o comprador (Buyer)
      const quem = d.comprador || d.notify;
      const A = L.assinatura;
      quebrar(metricas[A.font], quem && quem.nome, 12, A.larg).slice(0, 2).forEach((l, i) => centro(l, A.centro, A.base + i * 16.5, 12, A.font, PRETO));
    }
    // marca invisível com os dados (o ERP relê o próprio documento sem depender da ordem do texto do PDF)
    if (opts.marca) {
      const txt = 'FUSONG-ERP-DOC ' + opts.marca + ' FIM-ERP-DOC', hex = cp1252(txt).map(c => c.toString(16).padStart(2, '0')).join('');
      const sz = Math.min(1, 580 / Math.max(1, largura(metricas['OpenSans-Regular'], txt, 1)));   // cabe na largura da página
      page.pushOperators(pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible), setFontAndSize(chaves['OpenSans-Regular'], sz), moveText(2, H - 838), showText(PDFHexString.of(hex)), endText(), popGraphicsState());
    }
    return pdf.save();
  }

  const api = { gerar, dataTxt, linhasEmpresa, cp1252, LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DocVenda = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);

/* ═══════════════════════════════════════════════════════════
 * ERP: gerar invoice e sales contract pela página do processo
 * Modelos em branco do Canva ficam no Drive (Sistema ERP › Modelos invoice e contrato), nunca no site.
 * ═══════════════════════════════════════════════════════════ */
const DV_PASTA_MODELOS = '1coJTZiqU85d6gV3zU_buFg2sC_jdx74i';
const DV_MODELOS = {
  invoiceBuyer: 'Modelo - Invoice - Buyer.pdf', invoiceNotify: 'Modelo - Invoice - Consignee e Notify.pdf',
  contratoBuyer: 'Modelo - Sales Contract - Buyer.pdf', contratoNotify: 'Modelo - Sales Contract - Consignee e Notify.pdf',
};
const DV_ROTULO = { invoiceBuyer: 'Invoice · Buyer', invoiceNotify: 'Invoice · Consignee + Notify', contratoBuyer: 'Sales Contract · Buyer', contratoNotify: 'Sales Contract · Consignee + Notify' };
const DV_PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const DV_CONTA = { agencia: '8262', conta: '00994992' };
const dvNcm = n => { const d = String(n || '').replace(/\D/g, ''); return d.length === 8 ? d : ''; };
const dvNcmFmt = n => { const d = dvNcm(n); return d ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : String(n || ''); };
const dvProd = t => semAcento(t).replace(/[^A-Z0-9]/g, '');
const dvR2 = v => Math.round((Number(v) || 0) * 100) / 100;
let _dvFontes = null, _dvPasta = null, _dvCacheModelo = {};

function dvScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar ' + src.split('/').pop().split('?')[0] + ' (verifique a internet)')); document.head.appendChild(s); });
}
async function dvPreparar() {
  if (!window.PDFLib) { try { await dvScript('pdf-lib.min.js?v=1.17.1'); } catch (e) { await dvScript(DV_PDFLIB); } }   // cópia no próprio site; o CDN só se ela faltar
  if (!window.DOCVENDA_FONTES) await dvScript('docvenda-fontes.js?v=' + (typeof VERSAO_TESTE !== 'undefined' ? VERSAO_TESTE : '1'));
  if (!_dvFontes) {
    const F = window.DOCVENDA_FONTES, fontes = {};
    Object.entries(F.fontes).forEach(([n, b]) => { fontes[n] = Uint8Array.from(atob(b), c => c.charCodeAt(0)); });
    _dvFontes = { fontes, metricas: F.metricas };
  }
  return _dvFontes;
}

// ── modelos no Drive ──
async function dvPastaModelos() {
  if (_dvPasta) return _dvPasta;
  try { const f = await driveAPI('GET', '/files/' + DV_PASTA_MODELOS, null, 'fields=id,trashed'); if (f && f.id && !f.trashed) return (_dvPasta = f.id); } catch (e) {}
  const sis = await getOrCreateFolder('Sistema ERP');
  return (_dvPasta = await getOrCreateFolder('Modelos invoice e contrato', sis));
}
async function dvListarModelos() {
  const pasta = await dvPastaModelos();
  const q = `'${pasta}' in parents and trashed=false and mimeType='application/pdf'`;
  const r = await driveAPI('GET', '/files', null, `q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`);
  const out = {};
  Object.entries(DV_MODELOS).forEach(([k, nome]) => { const f = (r.files || []).find(x => x.name === nome); if (f) out[k] = f; });
  return out;
}
async function dvBaixarModelo(f) {
  const k = f.id + '|' + f.modifiedTime;
  if (!_dvCacheModelo[k]) _dvCacheModelo[k] = new Uint8Array(await driveDownload(f.id));
  return _dvCacheModelo[k];
}
async function dvSubir(nome, bytes, pasta, descricao) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: nome, parents: [pasta], mimeType: 'application/pdf', description: descricao || '' })], { type: 'application/json' }));
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }));
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,md5Checksum', { method: 'POST', headers: { Authorization: 'Bearer ' + await getAccessToken() }, body: fd });
  if (!r.ok) throw new Error('envio para o Drive falhou (' + r.status + ')');
  return r.json();
}
// qual modelo é: invoice ou contrato · Buyer ou Consignee + Notify (lido no próprio PDF); recusa PDF já preenchido
function dvTipoDoModelo(texto) {
  const T = String(texto || '').replace(/\s+/g, ' ');
  if (!/FU\s*SONG/i.test(T) || !/(INVOICE|SALES\s+CONTRACT)/i.test(T)) return { erro: 'não parece um modelo de invoice ou contrato da Fu Song' };
  if (/FS\s?\d{6}/.test(T) || /\d,\d{2}\s*USD/.test(T)) return { erro: 'já está preenchido — envie o modelo em branco' };
  return { chave: (/SALES\s+CONTRACT/i.test(T) ? 'contrato' : 'invoice') + (/NOTIFY/i.test(T) ? 'Notify' : 'Buyer') };
}
async function dvEnviarModelos(files) {
  const pasta = await dvPastaModelos(), atuais = await dvListarModelos(), ok = [], erros = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const t = dvTipoDoModelo(await pdfTexto(bytes.slice().buffer));
      if (t.erro) { erros.push(file.name + ': ' + t.erro); continue; }
      const ant = atuais[t.chave];
      if (ant) { try { await driveAPI('PATCH', '/files/' + ant.id, { name: 'Antigo ' + new Date().toISOString().slice(0, 10) + ' - ' + DV_MODELOS[t.chave] }); } catch (e) {} }
      await dvSubir(DV_MODELOS[t.chave], bytes, pasta, 'Modelo em branco (Canva) enviado em ' + new Date().toLocaleString('pt-BR') + ' · arquivo original: ' + file.name);
      ok.push(DV_ROTULO[t.chave] + (ant ? ' (substituído)' : ''));
    } catch (e) { erros.push(file.name + ': ' + (e.message || e)); }
  }
  logAction('modelos', 'CONFIG', 'docvenda', 'Modelos de invoice/contrato enviados: ' + ok.join(', '));
  return { ok, erros };
}

// ── dados do processo ──
function dvCliente(nome) { if (!nome) return null; const k = chaveNome(nome); return (S.clientes || []).find(c => chaveNome(c.nome) === k) || null; }
const dvEmpresa = c => c ? { nome: c.nome, usci: c.usci || '', end: c.end || c.endereco || '', tel: c.tel || '', email: c.email || '' } : null;
// NCM: a NF do fornecedor deste processo; senão a última NF do mesmo produto; senão o que o processo já tem
function dvNcmSugerido(p) {
  const nf = p.docs && p.docs._ncmNF;
  if (nf && dvNcm(nf.ncm)) return { ncm: dvNcm(nf.ncm), fonte: `NF ${nf.numero || ''} de ${nf.emitente || 'fornecedor'} (este processo)` };
  const prod = dvProd(p.produto);
  const outros = (S.processos || []).filter(q => q !== p && q.docs && q.docs._ncmNF && dvNcm(q.docs._ncmNF.ncm) && prod && dvProd(q.produto) === prod)
    .sort((a, b) => String(b.docs._ncmNF.data || b.id).localeCompare(String(a.docs._ncmNF.data || a.id)));
  if (outros[0]) { const x = outros[0].docs._ncmNF; return { ncm: dvNcm(x.ncm), fonte: `última NF desse produto: NF ${x.numero || ''} de ${x.emitente || 'fornecedor'} (${outros[0].id})` }; }
  if (dvNcm(p.ncm)) return { ncm: dvNcm(p.ncm), fonte: 'o que já está no processo (ainda sem NF do fornecedor)' };
  const ant = (S.processos || []).filter(q => q !== p && dvNcm(q.ncm) && prod && dvProd(q.produto) === prod).sort((a, b) => b.id.localeCompare(a.id))[0];
  if (ant) return { ncm: dvNcm(ant.ncm), fonte: `processo ${ant.id} (mesmo produto, ainda sem NF do fornecedor)` };
  return { ncm: '', fonte: '' };
}
// NF do fornecedor com NCM diferente do que está na invoice / contrato
function dvAvisoNcm(p) {
  const nf = p && p.docs && p.docs._ncmNF; if (!nf || !dvNcm(nf.ncm)) return null;
  const g = p.docs._gerado, doc = dvNcm(g ? g.ncm : p.ncm);
  if (!doc || doc === dvNcm(nf.ncm) || p.docs._ncmOk === dvNcm(nf.ncm) + '|' + doc) return null;
  return { nf: dvNcm(nf.ncm), doc, numero: nf.numero || '', emitente: nf.emitente || 'fornecedor', gerado: !!g };
}
function dvPadrao(p) {
  const d = p.docs || {}, g = d._gerado || {}, inv = d._invoice || {};
  const comp = dvCliente(g.comprador || d._comprador || p.cliente);
  const cons = dvCliente(g.consignatario || d._consignatario);
  const n = Number(g.containers) || Number(p.qtdContainer) || Number(d._contratoCont) || 1;
  const kg = Number(g.kg) || Number(inv.kg) || n * KG_POR_CONTAINER;
  const linha = (inv.linhas || [])[0];
  const preco = Number(g.preco) || (linha && linha.preco) || (Number(p.cambioInvoice) && kg ? Math.round(Number(p.cambioInvoice) / kg * 10000) / 10000 : 0);
  const ncm = dvNcmSugerido(p);
  const notifyOn = g.versao ? !!g.notify : !!(comp && cons && chaveNome(comp.nome) !== chaveNome(cons.nome));
  return {
    data: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    comprador: comp ? comp.nome : '', notifyOn, consignatario: cons ? cons.nome : '', notify: g.notify || (comp ? comp.nome : ''),
    produto: g.produto || p.produto || inv.produto || '', ncm: ncm.ncm, ncmFonte: ncm.fonte,
    containers: n, kg, kgManual: !!(kg && kg !== n * KG_POR_CONTAINER), preco: preco ? preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false }) : '',
    pol: g.pol || p.pol || inv.pol || '', pod: g.pod || p.pod || inv.pod || '', sgs: g.sgs !== undefined ? g.sgs : true,
    invoice: true, contrato: true,
  };
}
function dvDadosDoForm(p, f) {
  const comp = dvCliente(f.comprador), cons = f.notifyOn ? dvCliente(f.consignatario) : null, noti = f.notifyOn ? dvCliente(f.notify) : null;
  return {
    numero: p.id, data: f.data, comprador: dvEmpresa(comp), consignatario: dvEmpresa(cons), notify: dvEmpresa(noti),
    itens: [{ desc: f.produto, ncm: f.ncm, kg: Number(f.kg) || 0, preco: numBR(String(f.preco)) || 0 }],
    pol: f.pol, pod: f.pod, containers: Number(f.containers) || 1, sgs: !!f.sgs,
  };
}
function dvProblemas(f) {
  const out = [], comp = dvCliente(f.comprador);
  if (!comp) out.push('Escolha o comprador');
  if (f.notifyOn && !dvCliente(f.consignatario)) out.push('Escolha o consignee');
  if (f.notifyOn && !dvCliente(f.notify)) out.push('Escolha o notify');
  if (!f.produto) out.push('Falta a descrição do produto');
  if (!dvNcm(f.ncm)) out.push('NCM precisa ter 8 dígitos');
  if (!(Number(f.kg) > 0)) out.push('Falta o peso');
  if (!(numBR(String(f.preco)) > 0)) out.push('Falta o preço por kg');
  if (!f.pol || !f.pod) out.push('Falta o porto de embarque ou de destino');
  if (!f.invoice && !f.contrato) out.push('Marque invoice e/ou sales contract');
  [comp, f.notifyOn && dvCliente(f.consignatario), f.notifyOn && dvCliente(f.notify)].filter(Boolean).forEach(c => { if (!c.end) out.push(`${c.nome}: cadastro sem endereço (complete em Cadastros › Clientes)`); });
  return out;
}

// dados que vão escondidos no PDF (ASCII): o leitor de invoice do ERP usa isso quando o arquivo volta pela Caixa de Entrada
function dvMarca(p, f, d, tipo) {
  const it = d.itens[0], e = c => c ? { n: c.nome, u: c.usci, a: c.end, t: c.tel, m: c.email } : null;
  return encodeURIComponent(JSON.stringify({ t: tipo, num: d.numero, dt: d.data, b: e(d.comprador), c: e(d.consignatario), y: e(d.notify), kg: it.kg, pr: it.preco, tot: dvR2(it.kg * it.preco), ncm: dvNcm(it.ncm), pd: it.desc, pol: d.pol, pod: d.pod, n: d.containers, sgs: d.sgs ? 1 : 0 }));
}
function dvDocVendaDaMarca(j) {
  const quem = j.c || j.b || {}, dt = String(j.dt || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  const dec = Math.max(2, (String(j.pr).split('.')[1] || '').length);
  return {
    numero: j.num || '', contrato: j.t === 'contrato', cliente: quem.n || '', usci: quem.u || '', tel: quem.t || '', email: quem.m || '', end: quem.a || '',
    ncm: j.ncm || '', produto: j.pd || '', pol: j.pol || '', pod: j.pod || '', origem: 'Brazil', destino: 'China', moeda: 'USD', incoterm: 'CFR', pagamento: '100% In advance',
    peso: String(j.kg || ''), totalUsd: Number(j.tot) || 0, emitida: dt ? `${dt[3]}/${dt[2]}/${dt[1]}` : '', qtdContainer: String(j.n || ''), tamanhoContainer: '20',
    comprador: (j.b && j.b.n) || '', consignatario: (j.c && j.c.n) || (j.b && j.b.n) || '',
    linhas: [{ kg: Number(j.kg) || 0, preco: Number(j.pr) || 0, dec, total: Number(j.tot) || 0 }], qtdKg: Number(j.kg) || 0, contaBanco: DV_CONTA, geradoPeloErp: true,
  };
}
async function dvGerarPdfs(p, f) {
  const { fontes, metricas } = await dvPreparar();
  const modelos = await dvListarModelos(), d = dvDadosDoForm(p, f), v = f.notifyOn ? 'Notify' : 'Buyer', out = {};
  for (const tipo of ['invoice', 'contrato'].filter(t => f[t])) {
    const k = tipo + v, m = modelos[k];
    if (!m) throw new Error('Falta o modelo "' + DV_ROTULO[k] + '". Envie os modelos em branco do Canva neste formulário.');
    out[tipo] = await DocVenda.gerar({ modelo: await dvBaixarModelo(m), fontes, metricas, tipo, d, marca: dvMarca(p, f, d, tipo) });
  }
  return out;
}
async function dvSalvar(p, f, pdfs) {
  p.docs = p.docs || {};
  let pasta = p.docs._folderId;
  if (!pasta) { const r = await criarPastaProcesso(p); pasta = r && r.folderId; }
  if (!pasta) throw new Error('Não foi possível criar a pasta do processo');
  if (window.ERP_ENV && ERP_ENV.subpastas) pasta = await getOrCreateFolder('01 Comercial', pasta);
  const d = dvDadosDoForm(p, f), it = d.itens[0], total = dvR2(it.kg * it.preco);
  const versao = (Number(p.docs._gerado && p.docs._gerado.versao) || 0) + 1, suf = versao > 1 ? '_v' + versao : '';
  p.docs._files = p.docs._files || {};
  for (const [tipo, bytes] of Object.entries(pdfs)) {
    const up = await dvSubir(`${p.id}_${tipo === 'invoice' ? 'Invoice' : 'Sales-Contract'}${suf}.pdf`, bytes, pasta, `Gerado pelo ERP (versão ${versao}) em ${new Date().toLocaleString('pt-BR')}`);
    const lista = p.docs._files[tipo] = p.docs._files[tipo] || [];
    lista.forEach(x => { if (!x.substituido) x.substituido = versao; });
    lista.push({ id: up.id, name: up.name, url: up.webViewLink, md5: up.md5Checksum, formato: 'pdf', numero: p.id, valor: total, data: f.data, origem: 'gerado', versao, em: new Date().toISOString() });
    p.docs[tipo] = up.webViewLink;
  }
  // o que a invoice / o contrato dizem passa a valer no processo (conferências usam isso)
  const dec = Math.max(2, (String(f.preco).split(',')[1] || '').length);
  const dados = { qtdKg: it.kg, totalUsd: total, produto: it.desc, pol: d.pol, pod: d.pod, qtdContainer: d.containers, linhas: [{ kg: it.kg, preco: it.preco, dec, total }], contaBanco: DV_CONTA, comprador: d.comprador.nome, consignatario: (d.consignatario || d.comprador).nome };
  if (pdfs.invoice) { guardarDadosVenda(p, dados); p.docs._invoiceUsd = total; }
  if (pdfs.contrato) { guardarDadosVenda(p, Object.assign({ contrato: true }, dados)); p.docs._contratoUsd = total; p.docs._contratoCont = d.containers; }
  const mud = [];
  const set = (k, v) => { if (v !== undefined && v !== '' && String(p[k] || '') !== String(v)) { p[k] = v; mud.push(k); } };
  set('cambioInvoice', total); set('peso', String(it.kg)); set('qtdContainer', String(d.containers)); set('produto', it.desc); set('ncm', dvNcm(it.ncm)); set('pol', d.pol); set('pod', d.pod);
  if (!p.cliente) set('cliente', d.comprador.nome);
  if (!Array.isArray(p.containers)) p.containers = [];
  while (p.containers.length < d.containers) p.containers.push('');
  p.docs._gerado = { versao, data: f.data, comprador: d.comprador.nome, consignatario: d.consignatario ? d.consignatario.nome : '', notify: d.notify ? d.notify.nome : '', produto: it.desc, ncm: dvNcm(it.ncm), containers: d.containers, kg: it.kg, preco: it.preco, total, pol: d.pol, pod: d.pod, sgs: !!f.sgs, tipos: Object.keys(pdfs), em: new Date().toISOString(), por: (typeof nomeUsuario === 'function' && nomeUsuario()) || '' };
  delete p.docs._ncmOk;
  if (typeof aplicarPrevistos === 'function') { try { aplicarPrevistos(p); } catch (e) { console.warn('previstos', e); } }
  logAction('gerar', 'PROCESSOS', p.id, `${Object.keys(pdfs).map(t => t === 'invoice' ? 'Invoice' : 'Sales Contract').join(' e ')} versão ${versao} gerados pelo ERP · ${fmtKg(it.kg)} kg × USD ${String(f.preco)} = USD ${fmt(total)} · NCM ${dvNcmFmt(it.ncm)}${mud.length ? ' · processo atualizado: ' + mud.join(', ') : ''}`);
  await saveToSheets();
  return { versao, total };
}
const fmtKg = v => Math.round(Number(v) || 0).toLocaleString('pt-BR');

// ── nome interno do processo (só para controle; não vai para invoice nem contrato) ──
// "FS260113 - 276143168 - Thomas - Ematóide - Qingdao" = número · booking · intermediador · produto interno · destino
function dvPartesDoNome(nome) {
  const ps = String(nome || '').split(/\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
  if (ps.length < 4 || !FS_DE(ps[0])) return {};
  return { inter: ps[2] || '', prod: ps.length >= 5 ? ps.slice(3, -1).join(' - ') : '' };
}
function dvInterno(p) {
  const d = (p && p.docs) || {}, x = dvPartesDoNome(d._nomePasta);
  return { inter: d._intermediador != null ? d._intermediador : (x.inter || ''), prod: d._produtoInterno != null ? d._produtoInterno : (x.prod || '') };
}
const dvGerenciado = p => !!(p && p.docs && (p.docs._intermediador != null || p.docs._produtoInterno != null));
function dvNomeInterno(p) {
  const i = dvInterno(p), dest = String(p.pod || '').split(',')[0].replace(/\s*port\b/i, '').trim();
  const bk = p.status === 'Cancelado' ? 'Cancelado' : (String(p.booking || '').trim() || 'Booking pendente');
  return [p.id, bk, i.inter, i.prod, dest].map(x => String(x || '').replace(/[\/\\:*?"<>|]/g, ' ').trim()).filter(Boolean).join(' - ').slice(0, 150);
}
function dvListaInterna(k) {
  const vistos = {}, out = [];
  (S.processos || []).slice().sort((a, b) => b.id.localeCompare(a.id)).forEach(p => { const v = dvInterno(p)[k]; const c = semAcento(v); if (v && !/^(BOOKING|CANCELADO)/.test(c) && !vistos[c]) { vistos[c] = 1; out.push(v); } });
  return out;
}
const dvChaveComprador = p => chaveNome((p.docs && p.docs._comprador) || p.cliente || '');
// sugestões: intermediador da última venda para o comprador; produto interno do último com a mesma descrição da invoice
function dvSugerirInterno(compradorNome, produtoInvoice) {
  const ps = (S.processos || []).filter(p => p.status !== 'Cancelado').sort((a, b) => b.id.localeCompare(a.id));
  const kc = chaveNome(compradorNome || ''), kp = dvProd(produtoInvoice || '');
  const a = kc && ps.find(p => dvChaveComprador(p) === kc && dvInterno(p).inter);
  const b = kp && ps.find(p => dvProd(p.produto) === kp && dvInterno(p).prod);
  return { inter: a ? dvInterno(a).inter : '', prod: b ? dvInterno(b).prod : '' };
}
// pasta no Drive com o mesmo nome do processo (só processos com nome interno definido pelo ERP)
let _dvRenomeando = false;
async function dvRenomearPastas(lista) {
  if (_dvRenomeando) return 0; _dvRenomeando = true; let n = 0;
  try {
    for (const p of (lista || S.processos || []).filter(dvGerenciado)) {
      const nome = dvNomeInterno(p);
      if (!p.docs._folderId || p.docs._nomePasta === nome) continue;
      try { await driveAPI('PATCH', '/files/' + p.docs._folderId, { name: nome }); logAction('renomear', 'PROCESSOS', p.id, 'Pasta: ' + (p.docs._nomePasta || '') + ' → ' + nome); p.docs._nomePasta = nome; n++; }
      catch (e) { console.warn('renomear pasta', p.id, e); }
    }
  } finally { _dvRenomeando = false; }
  if (n && typeof scheduleAutoSave === 'function') scheduleAutoSave();
  return n;
}
// lista para escolher (com "Outro…" para digitar um nome novo)
function dvSelecao(attr, valor, lista) {
  const opts = lista.slice(); if (valor && !opts.some(x => semAcento(x) === semAcento(valor))) opts.unshift(valor);
  return `<select ${attr} style="width:100%"><option value="">— escolha —</option>${opts.map(t => `<option ${semAcento(t) === semAcento(valor) ? 'selected' : ''}>${escHtml(t)}</option>`).join('')}<option value="__outro">➕ Outro (digitar)…</option></select>
    <input ${attr.replace(/data-(\w+)=/, 'data-$1-outro=')} placeholder="Digite o novo nome" style="width:100%;margin-top:6px;display:none">`;
}
// liga o "Outro…": mostra a caixa de texto e devolve o valor escolhido/digitado
function dvLigarSelecao(sel, inp, aoMudar) {
  sel.addEventListener('change', () => { if (sel.value === '__outro') { inp.style.display = ''; inp.focus(); aoMudar(inp.value.trim()); } else { inp.style.display = 'none'; aoMudar(sel.value); } });
  inp.addEventListener('input', () => aoMudar(inp.value.trim()));
}
function editarNomeInternoUI(procId) {
  const p = (S.processos || []).find(x => x.id === procId); if (!p) return;
  const i = dvInterno(p);
  _uiCloseModal();
  const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal" style="max-width:460px;width:94%">
    <div class="modal-title">Nome interno · ${escHtml(p.id)}</div>
    <div style="font-size:12.5px;color:var(--muted2);margin-bottom:6px">Só para os seus registros e para achar o processo. Não aparece na invoice nem no contrato.</div>
    <label style="display:block;font-size:12px;color:var(--muted2);margin:8px 0 4px">Intermediador</label>${dvSelecao('data-ni="inter"', i.inter, dvListaInterna('inter'))}
    <label style="display:block;font-size:12px;color:var(--muted2);margin:8px 0 4px">Produto (nome interno)</label>${dvSelecao('data-ni="prod"', i.prod, dvListaInterna('prod'))}
    <div id="ni-prev" style="font-size:12.5px;margin-top:10px;font-family:'JetBrains Mono',monospace"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-secondary" id="ni-c">Cancelar</button><button class="btn btn-primary" id="ni-ok">Salvar</button></div></div>`;
  document.body.appendChild(modal);
  const v = { inter: i.inter, prod: i.prod };
  const prev = () => { const t = Object.assign({}, p, { docs: Object.assign({}, p.docs, { _intermediador: v.inter, _produtoInterno: v.prod }) }); modal.querySelector('#ni-prev').textContent = dvNomeInterno(t); };
  ['inter', 'prod'].forEach(k => dvLigarSelecao(modal.querySelector(`select[data-ni="${k}"]`), modal.querySelector(`input[data-ni-outro="${k}"]`), x => { v[k] = x; prev(); }));
  prev();
  modal.querySelector('#ni-c').onclick = () => _uiCloseModal();
  modal.querySelector('#ni-ok').onclick = async () => {
    p.docs = p.docs || {}; p.docs._intermediador = v.inter; p.docs._produtoInterno = v.prod;
    logAction('editar', 'PROCESSOS', p.id, 'Nome interno: ' + dvNomeInterno(p));
    _uiCloseModal(); await dvRenomearPastas([p]); await saveToSheets(); render(); showToast('✅ ' + dvNomeInterno(p));
  };
}

// ── formulário ──
let _dvForm = null;
const dvProc = f => f && (f.novo || (S.processos || []).find(x => x.id === f.procId));
// novo processo: próximo número e próximo embarque da sequência
function dvRascunho() {
  const nums = (S.processos || []).map(x => parseInt(String(x.id || '').replace(/^FS/i, ''), 10)).filter(n => !isNaN(n) && n > 0);
  const embs = (S.processos || []).map(x => parseInt(x.embarque, 10)).filter(n => !isNaN(n) && n > 0);
  const id = 'FS' + (nums.length ? Math.max(...nums) + 1 : 260096);
  return {
    id, embarque: String((embs.length ? Math.max(...embs) : 8) + 1).padStart(2, '0'), status: 'A Coletar',
    invoiceNum: 'Invoice - ' + id, contratoNum: 'Contrato - ' + id,
    cliente: '', usci: '', clienteTel: '', clienteEmail: '', clienteAdd: '', produto: '', ncm: '', moeda: 'USD',
    pol: 'Santos Port, Brazil', pod: '', origem: 'Brazil', destino: 'China', incoterm: 'CFR', pagamento: '100% In advance',
    peso: '', qtdContainer: '1', containers: [''], container: '', cambioInvoice: 0, cambioBanco: 'Itaú', cambioStatus: 'Em Aberto', docs: {},
  };
}
function novoProcessoDocVendaUI() {
  const p = dvRascunho();
  _dvForm = Object.assign(dvPadrao(p), { procId: p.id, novo: p });
  _uiCloseModal();
  const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay';
  document.body.appendChild(modal);
  dvDesenhar(); dvChecarModelos();
}
// destino da última venda para esse comprador
function dvUltimoDestino(nome) {
  const k = chaveNome(nome);
  const q = (S.processos || []).filter(x => x.pod && x.status !== 'Cancelado' && [x.docs && x.docs._comprador, x.cliente].some(n => n && chaveNome(n) === k)).sort((a, b) => b.id.localeCompare(a.id))[0];
  return q ? q.pod : '';
}
function gerarDocVendaUI(procId, ncmNovo) {
  const p = (S.processos || []).find(x => x.id === procId); if (!p) return;
  const f = _dvForm = Object.assign(dvPadrao(p), { procId });
  if (ncmNovo) { f.ncm = dvNcm(ncmNovo); f.ncmFonte = 'NF do fornecedor deste processo'; }
  _uiCloseModal();
  const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay';
  document.body.appendChild(modal);
  dvDesenhar();
  dvChecarModelos();
}
function dvOpcoes(sel) {
  const cs = (S.clientes || []).filter(c => c.nome).slice().sort((a, b) => a.nome.localeCompare(b.nome));
  return `<option value="">— escolha —</option>` + cs.map(c => `<option ${chaveNome(c.nome) === chaveNome(sel) ? 'selected' : ''}>${escHtml(c.nome)}</option>`).join('');
}
function dvDesenhar() {
  const f = _dvForm, modal = document.getElementById('ui-modal'); if (!f || !modal) return;
  const p = dvProc(f), g = !f.novo && p.docs && p.docs._gerado;
  const lab = (t, h) => `<label style="display:block;font-size:12px;color:var(--muted2);margin:10px 0 4px">${t}${h ? ` <span style="opacity:.75">· ${h}</span>` : ''}</label>`;
  const inp = (k, extra) => `<input data-dv="${k}" value="${escHtml(f[k])}" ${extra || ''} style="width:100%">`;
  modal.innerHTML = `<div class="modal" style="max-width:620px;width:96%;max-height:92vh;overflow:auto">
    <div class="modal-title">${f.novo ? `Novo processo · ${escHtml(p.id)} · embarque ${escHtml(p.embarque)}` : 'Gerar invoice e sales contract · ' + escHtml(p.id)}</div>
    <div style="font-size:12.5px;color:var(--muted2)">${f.novo ? `Ao salvar, o processo <b>${escHtml(p.id)}</b> é criado com estes dados (status A Coletar, câmbio em aberto, custos previstos) e a invoice e o contrato vão para a pasta dele. ` : ''}Os dados vão por cima dos seus modelos do Canva (logo, carimbo e assinatura ficam como estão). ${g ? `<b>Já existe a versão ${g.versao}</b> (${escHtml(isoToBr(String(g.em).slice(0, 10)))}); esta será a versão ${g.versao + 1} e a anterior continua guardada na pasta.` : ''}</div>
    <div id="dv-modelos" style="font-size:12.5px;margin-top:8px;color:var(--muted2)">Verificando modelos…</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
      <div>${lab('Data (Issued)')}${inp('data', 'type="date"')}</div>
      <div>${lab('Comprador (Buyer)', 'paga e assina o contrato')}<select data-dv="comprador" style="width:100%">${dvOpcoes(f.comprador)}</select></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" style="width:auto;flex:none;margin:0" data-dv="notifyOn" ${f.notifyOn ? 'checked' : ''}> Embarque em nome de outra empresa (Consignee + Notify)</label>
    ${f.notifyOn ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
      <div>${lab('Consignee', 'recebe a carga')}<select data-dv="consignatario" style="width:100%">${dvOpcoes(f.consignatario)}</select></div>
      <div>${lab('Notify')}<select data-dv="notify" style="width:100%">${dvOpcoes(f.notify)}</select></div></div>` : ''}
    ${f.novo ? `<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg3)">
      <div style="font-size:12px;font-weight:700">Nome interno do processo <span style="font-weight:400;color:var(--muted2)">· só para os seus registros, não sai na invoice nem no contrato</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
        <div>${lab('Intermediador')}${dvSelecao('data-dvsel="inter"', f.inter, dvListaInterna('inter'))}</div>
        <div>${lab('Produto (nome interno)')}${dvSelecao('data-dvsel="prodInterno"', f.prodInterno, dvListaInterna('prod'))}</div>
      </div>
      <div id="dv-nome" style="font-size:12px;margin-top:8px;font-family:'JetBrains Mono',monospace;color:var(--muted2)"></div>
    </div>` : ''}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:0 12px">
      <div>${lab('Produto (descrição)')}${inp('produto', 'list="dv-produtos"')}</div>
      <div>${lab('NCM / HS Code')}${inp('ncm', 'inputmode="numeric"')}</div>
    </div>
    ${f.ncmFonte ? `<div style="font-size:11.5px;color:var(--muted2);margin-top:4px">NCM sugerido: ${escHtml(f.ncmFonte)}</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0 12px">
      <div>${lab('Containers 20\'')}${inp('containers', 'type="number" min="1" step="1"')}</div>
      <div>${lab('Peso (kg)', '27.000 por container')}${inp('kg', 'inputmode="numeric"')}</div>
      <div>${lab('Preço por kg (USD)')}${inp('preco', 'inputmode="decimal"')}</div>
      <div>${lab('Total (USD)')}<div id="dv-total" class="num" style="padding:9px 0;font-weight:800"></div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
      <div>${lab('Porto de embarque (POL)')}${inp('pol')}</div>
      <div>${lab('Porto de destino (POD)')}${inp('pod', 'list="dv-destinos"')}</div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:13px">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto;flex:none;margin:0" data-dv="sgs" ${f.sgs ? 'checked' : ''}> Report SGS</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto;flex:none;margin:0" data-dv="invoice" ${f.invoice ? 'checked' : ''}> Invoice</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto;flex:none;margin:0" data-dv="contrato" ${f.contrato ? 'checked' : ''}> Sales Contract</label>
    </div>
    <datalist id="dv-produtos">${[...new Set((S.processos || []).map(x => x.produto).filter(Boolean))].map(t => `<option value="${escHtml(t)}">`).join('')}</datalist>
    <datalist id="dv-destinos">${[...new Set((S.processos || []).map(x => x.pod).filter(Boolean))].map(t => `<option value="${escHtml(t)}">`).join('')}</datalist>
    <div id="dv-prob" style="font-size:12.5px;color:var(--orange);margin-top:10px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-secondary" id="dv-cancelar">Cancelar</button>
      <button class="btn btn-secondary" id="dv-ver">Pré-visualizar</button>
      <button class="btn btn-primary" id="dv-ok">Gerar e salvar no processo</button>
    </div></div>`;
  const atualizar = () => {
    const kg = Number(String(f.kg).replace(/\D/g, '')) || 0, pr = numBR(String(f.preco)) || 0;
    modal.querySelector('#dv-total').textContent = kg && pr ? fmt(dvR2(kg * pr)) : '—';
    const nm = modal.querySelector('#dv-nome'); if (nm && f.novo) nm.textContent = 'Fica assim: ' + dvNomeInterno(Object.assign({}, f.novo, { pod: f.pod, docs: { _intermediador: f.inter || '', _produtoInterno: f.prodInterno || '' } }));
    const pb = dvProblemas(f); modal.querySelector('#dv-prob').innerHTML = pb.map(t => '⚠️ ' + escHtml(t)).join('<br>');
  };
  modal.querySelectorAll('[data-dv]').forEach(el => {
    const k = el.getAttribute('data-dv');
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (el.type === 'checkbox') f[k] = el.checked; else f[k] = el.value;
      if (k === 'kg') { f.kg = String(el.value).replace(/\D/g, ''); f.kgManual = true; }
      if (k === 'containers') { const n = Math.max(1, parseInt(el.value, 10) || 1); f.containers = n; if (!f.kgManual) { f.kg = n * KG_POR_CONTAINER; const k2 = modal.querySelector('[data-dv="kg"]'); if (k2) k2.value = f.kg; } }
      if (k === 'comprador' && f.notifyOn && !f.notify) f.notify = el.value;
      if (k === 'ncm') f.ncmManual = true;
      if (k === 'inter') f.interManual = true;
      if (k === 'prodInterno') f.prodIntManual = true;
      if (f.novo && (k === 'comprador' || k === 'produto')) {
        const sg = dvSugerirInterno(f.comprador, f.produto);
        const marcar = (k, val) => { const e = modal.querySelector(`select[data-dvsel="${k}"]`); if (e) { if (![...e.options].some(o => o.value === val)) e.insertAdjacentHTML('afterbegin', `<option>${escHtml(val)}</option>`); e.value = val; } };
        if (!f.interManual && sg.inter) { f.inter = sg.inter; marcar('inter', sg.inter); }
        if (!f.prodIntManual && sg.prod) { f.prodInterno = sg.prod; marcar('prodInterno', sg.prod); }
      }
      if (k === 'pod') f.podManual = true;
      if (k === 'comprador' && f.novo && !f.podManual) { const d = dvUltimoDestino(el.value); if (d) { f.pod = d; const e2 = modal.querySelector('[data-dv="pod"]'); if (e2) e2.value = d; } }
      if (k === 'produto' && !f.ncmManual) {   // NCM sugerido pela última NF desse produto
        const p0 = dvProc(f), antes = p0.produto; p0.produto = el.value; const sg = dvNcmSugerido(p0); if (!f.novo) p0.produto = antes;
        if (sg.ncm) { f.ncm = sg.ncm; f.ncmFonte = sg.fonte; const e3 = modal.querySelector('[data-dv="ncm"]'); if (e3) e3.value = sg.ncm; }
      }
      if (k === 'notifyOn') { if (f.notifyOn && !f.notify) f.notify = f.comprador; dvDesenhar(); dvChecarModelos(); return; }
      atualizar();
    });
  });
  ['inter', 'prodInterno'].forEach(k => { const sel = modal.querySelector(`select[data-dvsel="${k}"]`); if (sel) dvLigarSelecao(sel, modal.querySelector(`input[data-dvsel-outro="${k}"]`), x => { f[k] = x; if (k === 'inter') f.interManual = true; else f.prodIntManual = true; atualizar(); }); });
  modal.querySelector('#dv-cancelar').onclick = () => { _dvForm = null; _uiCloseModal(); };
  modal.querySelector('#dv-ver').onclick = () => dvExecutar(false);
  modal.querySelector('#dv-ok').onclick = () => dvExecutar(true);
  atualizar();
}
async function dvChecarModelos() {
  const el = () => document.getElementById('dv-modelos');
  try {
    const m = await dvListarModelos(), f = _dvForm; if (!el() || !f) return;
    const v = f.notifyOn ? 'Notify' : 'Buyer', falta = ['invoice', 'contrato'].map(t => t + v).filter(k => !m[k]);
    const todosFaltam = Object.keys(DV_MODELOS).filter(k => !m[k]);
    el().innerHTML = (falta.length ? `<span style="color:var(--orange)">⚠️ Falta o modelo em branco: ${falta.map(k => escHtml(DV_ROTULO[k])).join(', ')}.</span> ` : `✅ Modelos do Canva prontos (${escHtml(v === 'Notify' ? 'Consignee + Notify' : 'Buyer')}). `)
      + `<label class="btn btn-secondary btn-xs" style="cursor:pointer">${todosFaltam.length ? 'Enviar modelos (PDF em branco do Canva)' : 'Trocar modelos'}<input type="file" accept="application/pdf" multiple style="display:none" id="dv-arquivos"></label>`
      + (todosFaltam.filter(k => !falta.includes(k)).length && todosFaltam.length < 4 ? `<div style="font-size:11.5px;margin-top:4px">Ainda sem: ${todosFaltam.filter(k => !falta.includes(k)).map(k => escHtml(DV_ROTULO[k])).join(', ')}</div>` : '')
      + (todosFaltam.length === 4 ? `<div style="font-size:11.5px;margin-top:4px">Pode enviar os 4 de uma vez; o sistema reconhece qual é qual. Eles ficam no seu Drive, em Sistema ERP › Modelos invoice e contrato.</div>` : '');
    const inp = document.getElementById('dv-arquivos');
    if (inp) inp.onchange = async () => {
      const files = [...inp.files]; if (!files.length) return;
      el().textContent = 'Enviando modelos…';
      const r = await dvEnviarModelos(files);
      if (r.erros.length) await uiAlert((r.ok.length ? 'Recebidos: ' + r.ok.join(', ') + '\n\n' : '') + 'Não aceitos:\n• ' + r.erros.join('\n• '), 'Modelos');
      else showToast('✅ Modelos recebidos: ' + r.ok.join(', '));
      if (!document.getElementById('dv-modelos')) { const modal = document.createElement('div'); modal.id = 'ui-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); dvDesenhar(); }
      dvChecarModelos();
    };
  } catch (e) { if (el()) el().innerHTML = `<span style="color:var(--orange)">⚠️ Não consegui ver os modelos no Drive: ${escHtml(e.message || e)}</span>`; }
}
async function dvExecutar(salvar) {
  const f = _dvForm; if (!f) return;
  const pb = dvProblemas(f); if (pb.length) { showToast(pb[0]); return; }
  if (f.novo) {   // outro processo pode ter sido criado enquanto o formulário estava aberto
    const r = dvRascunho(); if (r.id !== f.novo.id || r.embarque !== f.novo.embarque) { Object.assign(f.novo, { id: r.id, embarque: r.embarque, invoiceNum: r.invoiceNum, contratoNum: r.contratoNum }); f.procId = r.id; }
  }
  const p = dvProc(f); if (!p) return;
  const btn = document.getElementById(salvar ? 'dv-ok' : 'dv-ver'); const txt = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = salvar ? 'Gerando…' : 'Montando…'; }
  try {
    const pdfs = await dvGerarPdfs(p, f);
    if (!salvar) { Object.entries(pdfs).forEach(([t, b]) => window.open(URL.createObjectURL(new Blob([b], { type: 'application/pdf' })), '_blank')); return; }
    if (f.novo) dvCriarProcesso(p, f);
    const r = await dvSalvar(p, f, pdfs);
    if (f.novo) { await dvRenomearPastas([p]); await saveToSheets(); }
    _dvForm = null; _uiCloseModal();
    if (f.novo) { S.page = 'processos'; S.sub = p; S.editMode = false; S.createMode = false; }
    render();
    showToast(`✅ ${f.novo ? 'Processo ' + p.id + ' criado · ' : ''}${Object.keys(pdfs).map(t => t === 'invoice' ? 'Invoice' : 'Sales Contract').join(' e ')} ${p.id} salvos (versão ${r.versao}) · USD ${fmt(r.total)}`);
  } catch (e) { uiAlert(e.message || String(e), 'Não foi possível gerar'); }
  finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = txt; } }
}
// cria o processo novo (antes de salvar os PDFs, para a pasta ser criada com o nome certo)
function dvCriarProcesso(p, f) {
  if ((S.processos || []).some(x => x.id === p.id)) throw new Error('O processo ' + p.id + ' já existe');
  const d = dvDadosDoForm(p, f), quem = d.consignatario || d.comprador, c = dvCliente(quem.nome) || {};
  Object.assign(p, { cliente: quem.nome, usci: c.usci || '', clienteTel: c.tel || '', clienteEmail: c.email || '', clienteAdd: c.end || '' });
  p.docs = p.docs || {}; p.docs._intermediador = String(f.inter || '').trim(); p.docs._produtoInterno = String(f.prodInterno || '').trim();
  if (typeof ehSalvador === 'function' && !ehSalvador(p)) p.docs._armazem = true;   // por Santos o container passa pelo armazém: já entra o armazém estimado
  S.processos.push(p);
  logAction('criar', 'PROCESSOS', p.id, `${dvNomeInterno(p)} · ${quem.nome} · ${d.itens[0].desc} · embarque ${p.embarque} (pelo Novo processo com invoice e contrato)`);
}
function dvManterNcm(procId) {
  const p = (S.processos || []).find(x => x.id === procId), a = dvAvisoNcm(p); if (!a) return;
  p.docs._ncmOk = a.nf + '|' + a.doc;
  logAction('conferir', 'PROCESSOS', p.id, `NCM ${dvNcmFmt(a.doc)} mantido (NF ${a.numero} diz ${dvNcmFmt(a.nf)})`);
  saveToSheets(); render();
}

// invoice / contrato gerados pelo ERP: lidos pela marca escondida (não pela posição do texto)
if (typeof lerDocVenda === 'function' && !lerDocVenda._dv) {
  const base = lerDocVenda;
  lerDocVenda = function (texto) {
    const m = String(texto || '').match(/FUSONG-ERP-DOC\s+([\s\S]+?)\s*FIM-ERP-DOC/);
    if (m) { try { return dvDocVendaDaMarca(JSON.parse(decodeURIComponent(m[1].replace(/\s+/g, '')))); } catch (e) { console.warn('marca do documento', e); } }
    return base.apply(this, arguments);
  };
  lerDocVenda._dv = true;
}
// NF do fornecedor anexada: guarda o NCM dela no processo (sugestão e aviso)
if (typeof aplicarDocNoProcesso === 'function' && !aplicarDocNoProcesso._dv) {
  const base = aplicarDocNoProcesso;
  aplicarDocNoProcesso = function (item, p) {
    const r = base.apply(this, arguments);
    try {
      const info = item && item.info;
      if (p && item.tipo === 'nfe' && info && dvNcm(info.ncm)) {
        p.docs = p.docs || {};
        const emit = typeof nomeCanonico === 'function' ? nomeCanonico(info.emitNome, info.emitCnpj) : info.emitNome;
        p.docs._ncmNF = { ncm: dvNcm(info.ncm), numero: info.numero || '', emitente: emit || '', data: info.data || '' };
      }
    } catch (e) { console.warn('ncm da NF', e); }
    return r;
  };
  aplicarDocNoProcesso._dv = true;
}
// página do processo: botão e aviso de NCM
if (typeof renderProcesso2 === 'function' && !renderProcesso2._dv) {
  const base = renderProcesso2;
  renderProcesso2 = function () {
    let h = base.apply(this, arguments); const p = S.sub;
    if (!p || !p.id || (typeof ehProcessoS === 'function' && ehProcessoS(p))) return h;
    const g = p.docs && p.docs._gerado;
    const btn = `<button class="btn btn-secondary btn-xs" onclick="gerarDocVendaUI('${escHtml(p.id)}')">📄 ${g ? 'Nova versão da invoice e do contrato' : 'Gerar invoice e contrato'}</button>`;
    const a = dvAvisoNcm(p);
    const aviso = a ? `<div style="font-size:12.5px;color:var(--orange);background:rgba(251,146,60,.14);border-radius:8px;padding:8px 10px;margin-top:6px">⚠️ A NF ${escHtml(a.numero)} de ${escHtml(a.emitente)} diz NCM <b>${escHtml(dvNcmFmt(a.nf))}</b>, mas ${a.gerado ? 'a invoice e o contrato gerados dizem' : 'o processo diz'} <b>${escHtml(dvNcmFmt(a.doc))}</b>.
      <span style="display:inline-flex;gap:6px;flex-wrap:wrap;margin-top:4px"><button class="btn btn-secondary btn-xs" onclick="gerarDocVendaUI('${escHtml(p.id)}','${a.nf}')">Gerar nova versão com ${escHtml(dvNcmFmt(a.nf))}</button><button class="btn btn-secondary btn-xs" onclick="dvManterNcm('${escHtml(p.id)}')">Manter ${escHtml(dvNcmFmt(a.doc))}</button></span></div>` : '';
    const info = g ? `<div style="font-size:11.5px;color:var(--muted2);margin-top:4px">Gerados pelo ERP: versão ${g.versao} · ${escHtml(g.comprador)}${g.notify ? ' (consignee ' + escHtml(g.consignatario) + ')' : ''} · ${fmtKg(g.kg)} kg × USD ${Number(g.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} = USD ${fmt(g.total)} · NCM ${escHtml(dvNcmFmt(g.ncm))}</div>` : '';
    const ni = dvInterno(p);
    const linhaNome = `<div style="font-size:12.5px;color:#E0E7FF;margin-top:2px">Interno: ${escHtml(ni.inter || '—')} · ${escHtml(ni.prod || '—')} <a href="#" onclick="editarNomeInternoUI('${escHtml(p.id)}');return false" style="color:#BFDBFE;font-size:12px">editar</a></div>`;
    h = h.replace(`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">`, linhaNome + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">`);
    const re = /(font-size:17px">Documentos<\/h2><span style="font-size:12\.5px;color:var\(--muted2\)">\d+ de \d+<\/span><\/div>)/;
    if (re.test(h)) h = h.replace(re, m => m + `<div style="margin:2px 0 8px">${btn}${info}${aviso}</div>`);
    return h;
  };
  renderProcesso2._dv = true;
}

// Início: Novo processo (cria o processo junto com a invoice e o contrato)
if (typeof renderInicio === 'function' && !renderInicio._dv) {
  const base = renderInicio;
  renderInicio = function () {
    const h = base.apply(this, arguments);
    const btn = `<button class="btn btn-primary btn-sm" style="min-height:40px" onclick="novoProcessoDocVendaUI()">📄 Novo processo (invoice + contrato)</button>`;
    // no topo, ao lado de "N processos em andamento"
    const re = /(<div style="font-size:13px;font-weight:600;color:var\(--accent\);background:var\(--bg4\)[^>]*>\d+ processos? em andamento<\/div>)/;
    return re.test(h) ? h.replace(re, `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${btn}$1</div>`) : h;
  };
  renderInicio._dv = true;
}

// nome do processo na lista: processos com nome interno do ERP usam os campos (não dependem do nome da pasta)
if (typeof restoNomeProcesso === 'function' && !restoNomeProcesso._dv) {
  const base = restoNomeProcesso;
  restoNomeProcesso = function (p) { if (dvGerenciado(p)) return '- ' + dvNomeInterno(p).split(' - ').slice(1).join(' - '); return base.apply(this, arguments); };
  restoNomeProcesso._dv = true;
}
// depois de cada gravação: se o booking, o destino ou o status mudou, a pasta acompanha
if (typeof saveToSheets === 'function' && !saveToSheets._dv) {
  const base = saveToSheets; let t = null;
  saveToSheets = async function () {
    const r = await base.apply(this, arguments);
    clearTimeout(t); t = setTimeout(() => { if ((S.processos || []).some(p => dvGerenciado(p) && p.docs._folderId && p.docs._nomePasta !== dvNomeInterno(p))) dvRenomearPastas(); }, 1500);
    return r;
  };
  saveToSheets._dv = true;
}
