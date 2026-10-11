// ═══════════════════════════════════════════════════════════════
// ERP 2.0 · AMBIENTE DE TESTES — Telas novas
// · Início: a pagar / a receber, o que falta, onde estão as cargas, resultado (com dólar do dia)
// · Tela do processo: linha do tempo, documentos (checklist CFR), custos com nota/comprovante/banco,
//   fotos, receita e resultado (custo de produto x custo de envio por tonelada)
// · Rastreio: cargas embarcadas (ATD → ETA) com link para o rastreio do armador
// Só lê os dados que os documentos e o extrato já gravaram.
// ═══════════════════════════════════════════════════════════════

const FASES = ['Coleta', 'Armazém', 'Porto', 'Embarcado', 'Destino'];
const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const brParaDate = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
const diasDesde = s => { const d = brParaDate(s); return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null; };
const usd = n => 'USD ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const m2 = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = n => 'R$ ' + m2(n);

function arquivos(p, tipo) { const f = (p.docs && p.docs._files && p.docs._files[tipo]) || []; return f.length ? f : (p.docs && p.docs[tipo] ? [{ url: p.docs[tipo], name: tipo }] : []); }
function temDoc(p, ...tipos) { return tipos.some(t => arquivos(p, t).length > 0); }

// Fase atual: vem das datas (as mesmas que o ERP usa para o status)
function faseProcesso(p) {
  if (p.status === 'Cancelado') return -1;
  const hoje = new Date();
  const passou = s => { const d = brParaDate(s); return d && d <= hoje; };
  const eta = p.docs && p.docs._viagem && p.docs._viagem.eta;
  if (p.status === 'No Destino' || p.status === 'Concluído' || (passou(p.saida) && eta && passou(eta))) return 4;
  if (passou(p.saida)) return 3;
  if (passou(p.logPorto) || temDoc(p, 'due')) return 2;
  if (passou(p.logChegada)) return 1;
  if (passou(p.logEmbarque) || temDoc(p, 'cte', 'mdfe')) return 0;
  return -1;
}

// Checklist CFR por fase (combinado em 10/10)
const CHECKLIST = [
  { fase: -1, tipos: ['invoice'], nome: 'Invoice' },
  { fase: -1, tipos: ['contrato'], nome: 'Sales Contract' },
  { fase: 0, tipos: ['nfe'], nome: 'NF-e de entrada' },
  { fase: 0, tipos: ['cte', 'mdfe'], nome: 'CT-e / MDF-e' },
  { fase: 2, tipos: ['nfeSaida'], nome: 'NF-e de saída' },
  { fase: 2, tipos: ['due'], nome: 'DU-E' },
  { fase: 3, tipos: ['bl'], nome: 'BL' },
  { fase: 3, tipos: ['comprovantes'], nome: 'Contrato de câmbio' },
];
const OPCIONAIS = [['certOrigem', 'Certificado de origem'], ['pesagem', 'Pesagem / laudo'], ['packingList', 'Packing list'], ['fotos', 'Fotos']];
const CUSTOS_OBRIGATORIOS = [{ fase: 0, campo: 'custoProduto' }, { fase: 0, campo: 'custoFrete' }, { fase: 2, campo: 'custoDespachante' }, { fase: 3, campo: 'custoMaritimo' }];

// marítimo, armazém e serviços de terceiros: basta o comprovante do PIX + a saída no extrato (a fatura é opcional)
const CUSTO_SO_COMPROVANTE = ['custoMaritimo', 'custoArmazem', 'custoServTerceiros', 'custoDespachante'];
// diferença pequena entre a invoice e o câmbio recebido = taxa do banco intermediador (ex.: USD 30), não é pendência
const TAXA_INTERMEDIARIO_USD = 60;
function estadoCusto(p, campo) {
  const reg = (p.docs && p.docs._custoDocs && p.docs._custoDocs[campo]) || { fiscais: [], pagos: [] };
  const valor = Number(p[campo]) || 0;
  const temReg = !!(p.docs && p.docs._custoDocs && p.docs._custoDocs[campo]);
  const pago = temReg || !(p.docs && p.docs._previsto && p.docs._previsto[campo]) ? Math.min(valor, Number(p.docs && p.docs._costPago && p.docs._costPago[campo]) || 0) : 0;
  const banco = !!(p.docs && p.docs._costBanco && p.docs._costBanco[campo]);
  const status = p[campo + '_status'] || (valor ? 'Em Aberto' : '');
  const lanc = (p.docs && p.docs['_lanc_' + campo]) || {};
  const nota = (reg.fiscais || []).length > 0 || !!lanc.nfe || !!lanc.fatura;
  const soRecibo = !nota && (reg.pagos || []).some(d => d.tipo === 'recibo');
  const compArquivo = (reg.pagos || []).length > 0 || !!lanc.comprovante;
  const comp = compArquivo || banco;
  const aberto = status === 'Pago' ? 0 : Math.max(0, valor - pago);
  const fiscal = (reg.fiscais || [])[0];
  const previsto = (p.docs && p.docs._previsto && p.docs._previsto[campo]) || null;
  return { valor, status, banco, nota, comp, compArquivo, soRecibo, aberto, previsto, empresa: (p.docs && p.docs._costEmpresa && p.docs._costEmpresa[campo]) || '', dataNota: fiscal ? fiscal.data : '' };
}

function pendenciasProcesso(p) {
  if (p.status === 'Cancelado') return [];
  const f = faseProcesso(p), out = [];
  // processo "S" (FS260109S): invoice, contrato, notas, DU-E, câmbio, produto e frete rodoviário ficam no principal
  const ehS = /^FS\d{6}S$/.test(p.id) && (S.processos || []).some(q => q.id === p.id.slice(0, -1));
  CHECKLIST.forEach(c => { if (ehS && !c.tipos.includes('bl')) return; if (f >= c.fase && !temDoc(p, ...c.tipos)) out.push({ tipo: 'doc', texto: (f >= 3 && c.fase <= 3 ? 'embarcado sem ' : 'sem ') + c.nome }); });
  CUSTOS_OBRIGATORIOS.forEach(c => { if (ehS && c.campo !== 'custoMaritimo') return; if (f >= c.fase && !(Number(p[c.campo]) > 0)) out.push({ tipo: 'custo', texto: 'sem custo de ' + PROCESS_COST_FIELDS[c.campo].toLowerCase() + (c.campo === 'custoMaritimo' ? ' (CFR)' : '') }); });
  Object.keys(PROCESS_COST_FIELDS).forEach(c => {
    const e = estadoCusto(p, c);
    // marítimo e armazém: a fatura costuma chegar depois — com comprovante e saída no extrato, conta como pago e não cobra a nota
    const faturaDepois = CUSTO_SO_COMPROVANTE.includes(c);   // não precisam de nota/fatura
    if (e.valor > 0 && e.status === 'Pago' && !e.nota && !e.soRecibo && !faturaDepois && c !== 'custoImpostos' && !(c === 'custoFrete' && out.some(x => /CT-e/.test(x.texto)))) out.push({ tipo: 'nota', texto: PROCESS_COST_FIELDS[c] + ' pago sem nota/fatura' });
    if (e.valor > 0 && e.status === 'Pago' && !e.comp) out.push({ tipo: 'comprovante', texto: PROCESS_COST_FIELDS[c] + ' sem comprovante' });
  });
  Object.entries((p.docs && p.docs._costAdiant) || {}).forEach(([c, v]) => out.push({ tipo: 'nota', texto: `${PROCESS_COST_FIELDS[c]}: adiantamento de ${brl(v)} — aguardando a nota e o saldo` }));
  const inv = Number(p.cambioInvoice) || 0, rec = Number(p.cambioRecebido) || 0;
  if (f >= 3 && inv > 0 && rec + TAXA_INTERMEDIARIO_USD < inv) out.push({ tipo: 'cambio', texto: rec ? `câmbio parcial: falta ${usd(inv - rec)}` : 'câmbio não recebido' });
  return out;
}
function custosAbertos(p) { return Object.keys(PROCESS_COST_FIELDS).map(c => ({ campo: c, ...estadoCusto(p, c) })).filter(e => e.aberto > 0.009); }
function processoFechado(p) { return faseProcesso(p) >= 3 && !pendenciasProcesso(p).length && !custosAbertos(p).length; }

function toneladas(p) { const kg = Number(String(p.peso || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0; return kg > 0 ? kg / 1000 : 0; }
function grupoProduto(p) { const t = String(p.produto || '').toUpperCase(); return /L[IÍ]TIO|LITHIUM|SPOD|ESPOD|AMBLIG|ZABUY/.test(t) ? 'Lítio' : /QUART/.test(t) ? 'Quartzo' : /AVENTUR/.test(t) ? 'Aventurina' : (p.produto || 'Outros'); }
function custosProcesso(p) {
  const t = procTotals(p); const prod = Number(p.custoProduto) || 0; const ton = toneladas(p);
  return { ...t, produto: prod, envio: Math.max(0, t.custo - prod), ton, produtoT: ton ? prod / ton : 0, envioT: ton ? (t.custo - prod) / ton : 0 };
}

// ── Dólar do dia (PTAX, Banco Central) ──────────────────────
async function carregarPtax() {
  if (S._ptax && S._ptax.em > Date.now() - 6 * 3600e3) return S._ptax;
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.now() - i * 864e5);
    const ds = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
    try {
      const r = await fetch(`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${ds}'&$format=json`);
      const j = await r.json();
      const v = (j.value || [])[0];
      if (v) { S._ptax = { venda: v.cotacaoVenda, compra: v.cotacaoCompra, data: d.toLocaleDateString('pt-BR'), em: Date.now() }; render(); return S._ptax; }
    } catch (e) { break; }
  }
  S._ptax = { erro: true, em: Date.now() }; return S._ptax;
}

function abrirProcesso2(id) { const p = (S.processos || []).find(x => x.id === id); if (p) { S._detalheAntigo = false; nav('processos', p); } }

const card = (conteudo, extra) => `<section style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px;display:flex;flex-direction:column;gap:12px;${extra || ''}">${conteudo}</section>`;
const titulo2 = (t, direita) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 style="margin:0;font-family:'Outfit',sans-serif;font-size:17px">${t}</h2>${direita || ''}</div>`;
const linkProc = id => `<a href="#" onclick="abrirProcesso2('${escHtml(id)}');return false" style="font-weight:700;color:var(--accent);text-decoration:none">${escHtml(id)}</a>`;
const barraFases = idx => `<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px">${FASES.map((_, i) => `<span style="height:6px;border-radius:3px;background:${i <= idx ? 'var(--accent)' : 'var(--border2)'}"></span>`).join('')}</div>`;

// ── INÍCIO ──────────────────────────────────────────────────
function renderInicio() {
  if (!S._ptax) setTimeout(carregarPtax, 50);
  if (S.banco && !S.banco.carregado && !S.banco.carregando && window._sheetsToken && typeof carregarBanco === 'function') setTimeout(() => carregarBanco(), 80);
  const ativos = (S.processos || []).filter(p => p.status !== 'Cancelado');
  const pagar = [];
  const previstos = [];
  ativos.forEach(p => custosAbertos(p).forEach(e => (e.previsto ? previstos : pagar).push({ p, ...e, dias: diasDesde(e.dataNota) })));
  const totalPrevisto = previstos.reduce((a, x) => a + x.aberto, 0);
  pagar.sort((a, b) => (b.dias || 0) - (a.dias || 0));
  const totalPagar = pagar.reduce((a, x) => a + x.aberto, 0);
  const receber = ativos.map(p => ({ p, falta: (Number(p.cambioInvoice) || 0) - (Number(p.cambioRecebido) || 0) })).filter(x => x.falta > TAXA_INTERMEDIARIO_USD || (x.falta > 0.009 && !(Number(x.p.cambioRecebido) > 0)));
  const totalReceberUsd = receber.reduce((a, x) => a + x.falta, 0);
  const pend = []; ativos.forEach(p => pendenciasProcesso(p).forEach(x => pend.push({ p, ...x })));
  const nDocs = pend.filter(x => x.tipo === 'doc' || x.tipo === 'custo').length, nComp = pend.filter(x => x.tipo === 'comprovante' || x.tipo === 'nota').length;
  const extratoPend = S.banco && S.banco.carregado ? S.banco.linhas.filter(l => l.status === 'pendente').length : null;
  const entradaN = S.entrada && S.entrada.lido ? S.entrada.itens.length : null;
  const px = S._ptax && S._ptax.venda;
  const mes = hojeISO().slice(0, 7);
  const pagoMes = (S.lancamentos || []).filter(l => l.tipo === 'Despesa' && l.status === 'Pago' && (brToIso2 ? brToIso2(l.data) : '').slice(0, 7) === mes).reduce((a, l) => a + (Number(l.valor) || 0), 0)
    + ativos.reduce((a, p) => a + Object.keys(PROCESS_COST_FIELDS).filter(c => p[c + '_status'] === 'Pago' && String((p.docs && p.docs._costData && p.docs._costData[c]) || '').slice(3) === mes.slice(5) + '/' + mes.slice(0, 4)).reduce((b, c) => b + (Number(p[c]) || 0), 0), 0);

  const cargas = ativos.map(p => ({ p, f: faseProcesso(p), fech: processoFechado(p) })).filter(x => !(x.f >= 4 && x.fech)).sort((a, b) => b.f - a.f || String(b.p.id).localeCompare(a.p.id));
  const resultados = ativos.map(p => ({ p, c: custosProcesso(p), prov: !processoFechado(p) })).filter(x => x.c.receita || x.c.custo).sort((a, b) => String(b.p.id).localeCompare(a.p.id));
  const clientes = typeof contaClientes === 'function' ? contaClientes().filter(c => c.recebidoUsd || c.embarcadoUsd) : [];

  const blocoPagar = card(`
    ${titulo2('A pagar', `<span style="font-family:'JetBrains Mono',monospace;font-size:18px;color:var(--red)">${brl(totalPagar)}</span>`)}
    ${pagar.length ? `<div style="display:flex;flex-direction:column">${pagar.slice(0, 8).map(x => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="min-width:0"><div style="font-size:14px">${linkProc(x.p.id)} · ${escHtml(PROCESS_COST_FIELDS[x.campo])}</div>
        <div style="font-size:12.5px;color:var(--muted2)">${escHtml(x.empresa || 'fornecedor não identificado')}${x.dataNota ? ' · nota de ' + escHtml(x.dataNota) : ''}${x.dias != null && x.dias > 30 ? ` · <span style="color:var(--yellow);font-weight:600">em aberto há ${x.dias} dias</span>` : ''}${x.aberto < x.valor ? ` · pago ${m2(x.valor - x.aberto)} de ${m2(x.valor)}` : ''}</div></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:13.5px;white-space:nowrap">${m2(x.aberto)}</div>
      </div>`).join('')}${pagar.length > 8 ? `<div style="font-size:12.5px;color:var(--muted2);padding-top:8px">+ ${pagar.length - 8} outros</div>` : ''}</div>` : `<div style="font-size:13.5px;color:var(--muted2)">Nenhum custo em aberto.</div>`}
    ${previstos.length ? `<div style="padding:9px 12px;border-radius:10px;background:var(--bg3)"><div style="display:flex;justify-content:space-between;gap:10px"><span style="font-size:14px;font-weight:600">Custos previstos (estimados)</span><span style="font-family:'JetBrains Mono',monospace;font-size:13.5px">${m2(totalPrevisto)}</span></div><div style="font-size:12.5px;color:var(--muted2);padding-top:4px">${[...new Set(previstos.map(x => PROCESS_COST_FIELDS[x.campo]))].map(n => escHtml(n) + ' (' + previstos.filter(x => PROCESS_COST_FIELDS[x.campo] === n).length + ')').join(' · ')} — viram valor real quando chegam a nota, o comprovante ou o extrato.</div></div>` : ''}
    ${(() => { const ad = []; (S.processos || []).forEach(q => Object.entries((q.docs && q.docs._costAdiant) || {}).forEach(([c, v]) => ad.push({ q, c, v, emp: (q.docs._costEmpresa || {})[c] || '' }))); return ad.length ? `<div style="padding:9px 12px;border-radius:10px;background:var(--bg3)"><div style="font-size:14px;font-weight:600">Adiantamentos aguardando nota</div>${ad.map(x => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding-top:6px"><span>${linkProc(x.q.id)} · ${escHtml(PROCESS_COST_FIELDS[x.c])}${x.emp ? ' · ' + escHtml(x.emp) : ''}</span><span style="font-family:'JetBrains Mono',monospace">${m2(x.v)} adiantado</span></div>`).join('')}<div style="font-size:11.5px;color:var(--muted2);padding-top:6px">Quando a nota chegar, o saldo a pagar aparece aqui em "A pagar".</div></div>` : ''; })()}
    ${typeof reembolsosAbertos === 'function' && reembolsosAbertos().length ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;background:var(--bg3)"><div><div style="font-size:14px;font-weight:600">Reembolso ao sócio</div><div style="font-size:12.5px;color:var(--muted2)">${reembolsosAbertos().length} despesa(s) pagas no cartão / conta pessoal</div></div><div style="font-family:'JetBrains Mono',monospace;font-size:13.5px;white-space:nowrap">${m2(reembolsosAbertos().reduce((a, l) => a + (Number(l.valor) || 0), 0))}</div></div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      <div style="background:var(--bg3);border-radius:10px;padding:10px 12px"><div style="font-size:12px;color:var(--green)">A receber (câmbio)</div><div style="font-family:'JetBrains Mono',monospace;font-size:15px;color:var(--green)">${usd(totalReceberUsd)}</div><div style="font-size:11.5px;color:var(--muted2)">${px ? '≈ ' + brl(totalReceberUsd * px) + ' no dólar de hoje' : receber.map(x => x.p.id).slice(0, 3).join(' · ') || '—'}</div></div>
      <div style="background:var(--bg3);border-radius:10px;padding:10px 12px"><div style="font-size:12px;color:var(--muted2)">Pago neste mês</div><div style="font-family:'JetBrains Mono',monospace;font-size:15px">${brl(pagoMes)}</div><div style="font-size:11.5px;color:var(--muted2)">custos e despesas</div></div>
      <div style="background:var(--bg3);border-radius:10px;padding:10px 12px"><div style="font-size:12px;color:var(--muted2)">Dólar (PTAX venda)</div><div style="font-family:'JetBrains Mono',monospace;font-size:15px">${px ? 'R$ ' + px.toLocaleString('pt-BR', { minimumFractionDigits: 4 }) : (S._ptax && S._ptax.erro ? 'indisponível' : '…')}</div><div style="font-size:11.5px;color:var(--muted2)">${px ? 'Banco Central · ' + S._ptax.data : 'Banco Central'}</div></div>
    </div>`);

  const chip = (n, txt, cor, acao) => `<button type="button" onclick="${acao}" style="text-align:left;border:none;cursor:pointer;background:var(--bg3);border-radius:10px;padding:10px;color:${cor};min-height:44px"><div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:700">${n == null ? '…' : n}</div><div style="font-size:12px">${txt}</div></button>`;
  const blocoFalta = card(`
    ${titulo2('O que falta')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px">
      ${chip(nDocs, 'documentos e custos', 'var(--orange)', "document.getElementById('falta-lista').scrollIntoView({behavior:'smooth'})")}
      ${chip(nComp, 'nota ou comprovante', 'var(--orange)', "document.getElementById('falta-lista').scrollIntoView({behavior:'smooth'})")}
      ${chip(extratoPend, 'linhas do extrato', 'var(--accent)', "nav('conciliacao')")}
      ${chip(entradaN, 'na Caixa de Entrada', 'var(--accent)', "nav('entrada')")}
    </div>
    <div id="falta-lista" style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">
      ${pend.length ? pend.slice(0, S._todasPend ? pend.length : 12).map(x => `<div style="display:flex;gap:10px;align-items:flex-start"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:${x.tipo === 'cambio' ? 'var(--green)' : 'var(--orange)'};margin-top:6px"></span><div>${linkProc(x.p.id)} ${escHtml(x.texto)}</div></div>`).join('') + (pend.length > 12 ? `<button class="btn btn-secondary btn-sm" style="align-self:flex-start;min-height:40px" onclick="S._todasPend=!S._todasPend;render()">${S._todasPend ? 'Mostrar menos' : `Ver todas as pendências (+ ${pend.length - 12})`}</button>` : '') : '<div style="color:var(--muted2)">Nada faltando nos processos.</div>'}
    </div>`);

  const blocoCargas = card(`
    ${titulo2('Onde estão as cargas', `<a href="#" onclick="nav('rastreamento');return false" style="font-size:13px;text-decoration:none">Rastreio →</a>`)}
    ${cargas.length ? cargas.slice(0, 8).map(x => {
      const p = x.p, v = (p.docs && p.docs._viagem) || {}, dl = brParaDate(p.deadlineCarga), dlDias = dl ? Math.ceil((dl - new Date()) / 864e5) : null;
      const info = x.f >= 3 ? [(p.containers || []).filter(Boolean).join(', '), v.navio, 'saiu ' + p.saida, v.eta ? 'chega ' + v.eta : '', p.pod].filter(Boolean).join(' · ')
        : [p.logTransportadora, p.logCidade, (p.containers || []).filter(Boolean).join(', ')].filter(Boolean).join(' · ') || (p.produto || '');
      return `<div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between;gap:8px"><span>${linkProc(p.id)} <span style="font-size:12.5px;color:var(--muted2)">${escHtml(p.cliente || '')}</span></span><span style="font-size:12.5px;font-weight:600;color:${x.f >= 3 ? 'var(--accent)' : x.f >= 0 ? 'var(--yellow)' : 'var(--muted2)'}">${x.f >= 0 ? FASES[x.f] : 'A coletar'}</span></div>
        ${barraFases(x.f)}
        <div style="font-size:12.5px;color:var(--muted2)">${escHtml(info)}${dlDias != null && dlDias >= 0 && dlDias <= 5 && x.f < 3 ? ` · <span style="color:var(--yellow);font-weight:600">dead line de carga em ${dlDias} dia(s)</span>` : ''}</div>
      </div>`;
    }).join('') : '<div style="font-size:13.5px;color:var(--muted2)">Nenhuma carga ativa.</div>'}
    <div style="font-size:11.5px;color:var(--muted2)">${FASES.join(' · ')}</div>`);

  const porProduto = {};
  resultados.forEach(x => { if (!x.c.ton) return; const g = grupoProduto(x.p); const o = porProduto[g] = porProduto[g] || { ton: 0, prod: 0, env: 0, n: 0 }; o.ton += x.c.ton; o.prod += x.c.produto; o.env += x.c.envio; o.n++; });
  const blocoResultado = card(`
    ${titulo2('Resultado')}
    <div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">
      ${resultados.slice(0, 10).map(x => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${linkProc(x.p.id)} ${x.prov ? '<span style="color:var(--yellow);font-size:12px">provisório</span>' : '<span style="color:var(--green);font-size:12px">fechado</span>'}</span><span style="font-family:'JetBrains Mono',monospace;color:${x.c.lucro >= 0 ? 'var(--green)' : 'var(--red)'}">${x.c.lucro >= 0 ? '+ ' : '− '}${m2(Math.abs(x.c.lucro))}</span></div>`).join('') || '<div style="color:var(--muted2)">Sem resultado ainda.</div>'}
    </div>
    ${Object.keys(porProduto).length ? `<div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:12px;color:var(--muted2)">Custo médio por tonelada</div>
      ${Object.entries(porProduto).map(([g, o]) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px;flex-wrap:wrap"><span>${escHtml(g)} <span style="color:var(--muted2);font-size:12px">${o.n} proc. · ${m2(o.ton)} t</span></span><span style="font-family:'JetBrains Mono',monospace">produto ${m2(o.prod / o.ton)} · envio ${m2(o.env / o.ton)}</span></div>`).join('')}
    </div>` : ''}
    ${clientes.length ? `<div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:12px;color:var(--muted2)">Saldo dos clientes</div>
      ${clientes.map(c => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px;flex-wrap:wrap"><span>${escHtml(c.nome)}</span><span style="font-family:'JetBrains Mono',monospace;color:${c.saldoUsd >= 0 ? 'var(--green)' : 'var(--red)'}">${usd(Math.abs(c.saldoUsd))} ${c.saldoUsd >= 0 ? 'a favor' : 'a receber'}</span></div>`).join('')}
    </div>` : ''}`);

  return `
  <div style="max-width:760px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;gap:10px;flex-wrap:wrap">
      <div><div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:26px">Início</div><div style="font-size:13px;color:var(--muted2)">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <div style="font-size:13px;font-weight:600;color:var(--accent);background:var(--bg4);padding:6px 12px;border-radius:999px">${ativos.filter(p => !processoFechado(p)).length} processos em andamento</div>
    </div>
    ${blocoPagar}${blocoFalta}${blocoCargas}${blocoResultado}
  </div>`;
}

// ── TELA DO PROCESSO ────────────────────────────────────────
function renderProcesso2() {
  const p = S.sub; if (!p) return renderProcessos();
  const f = faseProcesso(p), pend = pendenciasProcesso(p), fech = processoFechado(p), c = custosProcesso(p), v = (p.docs && p.docs._viagem) || {};
  const datas = [p.logEmbarque, p.logChegada, p.logPorto || (temDoc(p, 'due') ? 'DU-E' : ''), p.saida, v.eta ? (f >= 4 ? v.eta : 'prev. ' + v.eta) : ''];
  const check = (ok, nome, onde, falta) => `<div style="display:flex;gap:8px;align-items:center;background:${ok ? 'rgba(34,197,94,.10)' : falta ? 'rgba(251,146,60,.14)' : 'var(--bg3)'};border-radius:8px;padding:8px 10px;font-size:13.5px;${falta ? 'font-weight:600;color:var(--orange)' : ''}">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${ok ? '<path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" fill="none" style="color:var(--green)"/>' : falta ? '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2"/>' : '<circle cx="8" cy="8" r="3" fill="currentColor" opacity=".35"/>'}</svg>
      ${onde ? `<a href="${sanitizeUrl(onde)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${escHtml(nome)}</a>` : escHtml(nome) + (falta ? ' — falta' : '')}</div>`;
  const docsOk = CHECKLIST.filter(x => temDoc(p, ...x.tipos)).length;
  const linhasCusto = Object.keys(PROCESS_COST_FIELDS).map(k => ({ k, e: estadoCusto(p, k) })).filter(x => x.e.valor > 0);
  const faltaCusto = CUSTOS_OBRIGATORIOS.filter(x => f >= x.fase && !(Number(p[x.campo]) > 0));
  const manuais = (S.lancamentos || []).filter(l => l.vinculo === 'processo' && l.vinculoId === p.id && l.tipo === 'Despesa' && l.status !== 'Cancelado' && l.categoria !== 'Tarifa de câmbio');
  const cambios = (S.lancamentos || []).filter(l => l.vinculo === 'processo' && l.vinculoId === p.id && l.categoria === 'Câmbio');
  const cambDocs = Object.values((p.docs && p.docs._cambioDocs) || {});
  const nfSaida = arquivos(p, 'nfeSaida').reduce((m, x) => Math.max(m, Number(x.valor) || 0), 0);
  const fotos = arquivos(p, 'fotos');
  const sel = (ok, t) => `<span style="color:${ok ? 'var(--green)' : 'var(--orange)'}">${t} ${ok ? '✓' : '✗'}</span>`;
  return `
  <div style="max-width:760px;margin:0 auto">
    <button class="btn btn-secondary btn-sm" onclick="goBack()" style="margin-bottom:12px">← Voltar</button>
    <section style="background:#0F2A5C;color:#FFFFFF;border-radius:14px;padding:18px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column"><div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:26px">${escHtml(p.id)}</div>${typeof restoNomeProcesso === 'function' ? `<span style="font-size:14px;color:#E0E7FF;font-weight:600">${escHtml(restoNomeProcesso(p).replace(/^- /, ''))}</span>` : ''}${p.docs && p.docs._numeroAntigo ? `<span style="font-size:12.5px;color:#E0E7FF">Era o processo ${escHtml(p.docs._numeroAntigo)} (virou ${escHtml(p.id)})</span>` : ''}</div>
        <span style="background:${fech ? '#BBF7D0' : '#FDE68A'};color:${fech ? '#14532D' : '#78350F'};font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px">${fech ? 'Fechado' : `Provisório · ${pend.length + custosAbertos(p).length} pendência(s)`}</span>
      </div>
      <div style="font-size:13.5px;color:#E0E7FF">${escHtml([p.cliente, p.produto, c.ton ? m2(c.ton) + ' t' : ''].filter(Boolean).join(' · '))}</div>
      <div style="font-size:13.5px;color:#E0E7FF">${escHtml([p.incoterm, [p.pol, p.pod].filter(Boolean).join(' → '), p.cambioInvoice ? usd(p.cambioInvoice) : ''].filter(Boolean).join(' · '))}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-secondary btn-xs" onclick="S.editMode=true;render()">Editar dados</button>
        <button class="btn btn-secondary btn-xs" onclick="S._detalheAntigo=true;render()">Ver detalhe completo</button>
      </div>
    </section>

    ${card(`${titulo2('Linha do tempo')}
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;text-align:center">
        ${FASES.map((n, i) => `<div style="display:flex;flex-direction:column;gap:6px;align-items:center"><span style="width:14px;height:14px;border-radius:50%;background:${i <= f ? 'var(--accent)' : 'var(--border2)'}"></span><span style="font-size:12px;font-weight:600;${i > f ? 'color:var(--muted2)' : ''}">${n}</span><span style="font-size:11.5px;color:var(--muted2)">${escHtml(datas[i] || '—')}</span></div>`).join('')}
      </div>
      <div style="font-size:12.5px;color:var(--muted2)">${escHtml([p.logTransportadora, p.logCidade && p.logArmazem ? p.logCidade + ' → ' + p.logArmazem : p.logCidade, p.companhia, (p.containers || []).filter(Boolean).join(', '), p.booking ? 'booking ' + p.booking : '', v.navio].filter(Boolean).join(' · ') || 'Os documentos preenchem transportadora, containers, booking e navio.')}</div>`)}

    ${card(`${titulo2('Documentos', `<span style="font-size:12.5px;color:var(--muted2)">${docsOk} de ${CHECKLIST.length}</span>`)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        ${CHECKLIST.map(x => { const a = x.tipos.map(t => arquivos(p, t)[0]).find(Boolean); return check(!!a, x.nome, a && a.url, !a && f >= x.fase); }).join('')}
      </div>
      <div style="font-size:12px;color:var(--muted2)">Opcionais: ${OPCIONAIS.map(([t, n]) => n + (arquivos(p, t).length ? ' ✓' : '')).join(' · ')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" style="min-height:44px" onclick="S._verArquivos=S._verArquivos==='${escHtml(p.id)}'?null:'${escHtml(p.id)}';render()">📎 Ver arquivos anexados (${totalArquivos(p)})</button>
        ${p.docs && p.docs._folderUrl ? `<a class="btn btn-secondary btn-sm" style="min-height:44px;text-decoration:none;display:inline-flex;align-items:center" href="${sanitizeUrl(p.docs._folderUrl)}" target="_blank" rel="noopener noreferrer">📂 Pasta no Drive</a>` : ''}
        <button class="btn btn-primary btn-sm" style="min-height:44px" onclick="nav('entrada')">Anexar documento</button>
      </div>
      ${S._verArquivos === p.id ? listaArquivos(p) : ''}`)}

    ${card(`${titulo2('Custos', `<span style="font-family:'JetBrains Mono',monospace;font-size:15px">${brl(c.custo)}</span>`)}
      ${linhasCusto.map(({ k, e }) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0"><b style="font-size:14px">${escHtml(PROCESS_COST_FIELDS[k])}</b><span style="font-size:12.5px;color:var(--muted2)">${escHtml(e.empresa || '—')}</span>
          ${e.previsto ? `<span style="font-size:12px;color:var(--yellow)">previsto · ${escHtml(e.previsto.regra || '')}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-secondary btn-xs" onclick="alterarPrevisto('${escHtml(p.id)}','${k}')">Alterar valor</button>${k === 'custoArmazem' ? `<button class="btn btn-secondary btn-xs" onclick="setArmazemPrevisto('${escHtml(p.id)}',false)">Não vai para o armazém</button>` : ''}</span>` : `<span style="font-size:12px">${e.soRecibo ? '<span style="color:var(--yellow)">recibo sem nota (não dedutível)</span>' : CUSTO_SO_COMPROVANTE.includes(k) && !e.nota ? '<span style="color:var(--muted2)">' + (k === 'custoMaritimo' ? 'fatura' : 'nota') + ' opcional</span>' : sel(e.nota, k === 'custoMaritimo' ? 'fatura' : 'nota')} · ${sel(e.comp, 'comprovante')}${e.banco ? ' · <span style="color:var(--green)">banco ✓</span>' : ''}${p.docs && p.docs._valorManual && p.docs._valorManual[k] != null ? ' · <span style="color:var(--yellow)">valor alterado por você</span>' : ''}${p.docs && p.docs._aguardandoComp && p.docs._aguardandoComp[k] ? ' · <span style="color:var(--yellow)">pago · aguardando comprovante</span>' : ''}</span>
          <span><button class="btn btn-secondary btn-xs" onclick="alterarValorCusto('${escHtml(p.id)}','${k}')">Alterar valor</button></span>`}</div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:3px"><span style="font-family:'JetBrains Mono',monospace;font-size:13.5px">${m2(e.valor)}</span><span style="font-size:12px;font-weight:600;color:${e.status === 'Pago' ? 'var(--green)' : 'var(--yellow)'}">${e.previsto ? 'Previsto' : e.status === 'Pago' ? 'Pago' : e.aberto < e.valor ? 'falta ' + m2(e.aberto) : 'Em aberto'}</span></div>
      </div>`).join('')}
      ${manuais.map(l => `<div style="display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)"><div style="display:flex;flex-direction:column;gap:3px;min-width:0"><b style="font-size:14px">${escHtml(l.categoria || 'Outro custo')}</b><span style="font-size:12.5px;color:var(--muted2)">${escHtml(l.empresa || l.descricao || '')} · ${escHtml(l.data || '')}</span><span style="font-size:12px">${l.docs && l.docs._banco ? '<span style="color:var(--green)">banco ✓</span>' : ''}${l.docs && l.docs.comprovante ? ' <span style="color:var(--green)">comprovante ✓</span>' : ''}</span></div><div style="text-align:right;display:flex;flex-direction:column;gap:3px"><span style="font-family:'JetBrains Mono',monospace;font-size:13.5px">${m2(l.valor)}</span><span style="font-size:12px;font-weight:600;color:${l.status === 'Pago' ? 'var(--green)' : 'var(--yellow)'}">${escHtml(l.status)}</span></div></div>`).join('')}
      ${faltaCusto.map(x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:10px;background:rgba(251,146,60,.14);border-radius:8px"><div><b style="font-size:14px;color:var(--orange)">${escHtml(PROCESS_COST_FIELDS[x.campo])}</b><div style="font-size:12.5px;color:var(--orange)">${x.campo === 'custoMaritimo' ? 'CFR: falta a fatura do agente e o comprovante' : 'falta nota e comprovante'}</div></div><span style="font-size:12px;color:var(--orange);font-weight:600">Falta</span></div>`).join('')}
      ${!linhasCusto.length && !manuais.length && !faltaCusto.length ? '<div style="font-size:13.5px;color:var(--muted2)">Nenhum custo ainda. Notas e comprovantes anexados entram aqui sozinhos.</div>' : ''}
      ${c.ton ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        <div style="background:var(--bg3);border-radius:10px;padding:10px 12px"><div style="font-size:12px;color:var(--muted2)">Custo do produto</div><div style="font-family:'JetBrains Mono',monospace;font-size:14px">${brl(c.produto)}</div><div style="font-size:11.5px;color:var(--muted2)">${brl(c.produtoT)} por t</div></div>
        <div style="background:var(--bg3);border-radius:10px;padding:10px 12px"><div style="font-size:12px;color:var(--muted2)">Custo de envio</div><div style="font-family:'JetBrains Mono',monospace;font-size:14px">${brl(c.envio)}</div><div style="font-size:11.5px;color:var(--muted2)">${brl(c.envioT)} por t</div></div>
      </div>` : ''}
      ${typeof vaiProArmazem === 'function' && !vaiProArmazem(p) && !(Number(p.custoArmazem) > 0) && p.status !== 'Cancelado' ? `<div style="font-size:12.5px;color:var(--muted2)">Container vai para o armazém? <button class="btn btn-secondary btn-xs" onclick="setArmazemPrevisto('${escHtml(p.id)}',true)">Sim, prever armazém</button></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" style="min-height:44px" onclick="S.editMode=true;render()">Lançar ou corrigir custo</button>
      <button class="btn btn-secondary btn-sm" style="min-height:44px" onclick="editarPadroesPrevistos()">Padrões dos previstos</button></div>`)}

    ${card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:2px"><h2 style="margin:0;font-family:'Outfit',sans-serif;font-size:17px">Fotos</h2>${fotos.length ? `<a href="${sanitizeUrl((p.docs && p.docs._fotosUrl) || fotos[0].url)}" target="_blank" rel="noopener noreferrer" style="font-size:13px;text-decoration:none">Ver as ${fotos.length} foto(s)</a>` : '<span style="font-size:13px;color:var(--muted2)">Nenhuma foto</span>'}</div>
        <label class="btn btn-primary btn-sm" style="min-height:44px;display:inline-flex;align-items:center;cursor:pointer" for="fotos-${escHtml(p.id)}">${S._enviandoFotos ? 'Enviando...' : 'Adicionar fotos'}</label>
        <input id="fotos-${escHtml(p.id)}" type="file" accept="image/*" multiple hidden onchange="adicionarFotos('${escHtml(p.id)}', this.files); this.value=''">
      </div>`, 'padding:14px 16px')}

    ${card(`${titulo2('Receita')}
      ${cambDocs.length ? cambDocs.map(x => `<div style="display:flex;justify-content:space-between;font-size:13.5px;gap:8px"><span>Câmbio ${escHtml(x.data || '')}</span><span style="font-family:'JetBrains Mono',monospace">${m2(x.reais)}</span></div><div style="font-size:12.5px;color:var(--muted2)">${usd(x.usd)} × ${(Number(x.taxa) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}${cambios.some(l => l.docs && l.docs._banco) ? ' · conciliado no extrato ✓' : ''}</div>`).join('') : (Number(p.cambioReais) ? `<div style="display:flex;justify-content:space-between;font-size:13.5px"><span>Câmbio</span><span style="font-family:'JetBrains Mono',monospace">${m2(p.cambioReais)}</span></div>` : '<div style="font-size:13.5px;color:var(--muted2)">Câmbio ainda não recebido.</div>')}
      ${Number(p.cambioInvoice) && Number(p.cambioRecebido) > 0 && (Number(p.cambioRecebido) || 0) + 0.01 < Number(p.cambioInvoice) && Number(p.cambioInvoice) - Number(p.cambioRecebido) <= TAXA_INTERMEDIARIO_USD ? `<div style="font-size:12.5px;color:var(--muted2)">Taxa do banco intermediador: ${usd(p.cambioInvoice - p.cambioRecebido)}</div>` : Number(p.cambioInvoice) && (Number(p.cambioRecebido) || 0) + 0.01 < Number(p.cambioInvoice) ? `<div style="font-size:12.5px;color:var(--yellow)">Invoice ${usd(p.cambioInvoice)} · falta ${usd(p.cambioInvoice - (p.cambioRecebido || 0))}${S._ptax && S._ptax.venda ? ' (≈ ' + brl((p.cambioInvoice - (p.cambioRecebido || 0)) * S._ptax.venda) + ' hoje)' : ''}</div>` : ''}
      ${nfSaida ? `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding-top:8px;border-top:1px solid var(--border)"><span>NF-e de saída</span><span style="font-family:'JetBrains Mono',monospace">${m2(nfSaida)}</span></div>` : ''}`)}

    <section style="background:#0F2A5C;color:#FFFFFF;border-radius:14px;padding:16px;margin-bottom:24px;display:flex;flex-direction:column;gap:8px">
      <h2 style="margin:0;font-family:'Outfit',sans-serif;font-size:17px">Resultado</h2>
      <div style="display:flex;justify-content:space-between;font-size:13.5px;color:#E0E7FF"><span>Receita</span><span style="font-family:'JetBrains Mono',monospace">${m2(c.receita)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13.5px;color:#E0E7FF"><span>Custos</span><span style="font-family:'JetBrains Mono',monospace">− ${m2(c.custo)}</span></div>
      <div style="display:flex;justify-content:space-between;font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;padding-top:8px;border-top:1px solid #334E87"><span>${c.lucro >= 0 ? 'Lucro' : 'Prejuízo'}</span><span style="color:${c.lucro >= 0 ? '#86EFAC' : '#FCA5A5'}">${brl(Math.abs(c.lucro))}</span></div>
      ${fech ? '<div style="font-size:12.5px;color:#BBF7D0">Fechado: todos os documentos e comprovantes.</div>' : `<div style="font-size:12.5px;color:#FDE68A">Provisório: ${escHtml([...pend.map(x => x.texto), ...custosAbertos(p).map(x => PROCESS_COST_FIELDS[x.campo] + ' em aberto')].slice(0, 4).join('; ') || 'aguardando embarque')}</div>`}
    </section>
  </div>`;
}

// ── Fotos: envia para a subpasta "Fotos" do processo ────────
async function adicionarFotos(id, files) {
  const p = (S.processos || []).find(x => x.id === id); if (!p || !files || !files.length) return;
  S._enviandoFotos = true; render();
  try {
    let pasta = p.docs && p.docs._folderId;
    if (!pasta) { const r = await criarPastaProcesso(p); pasta = r && r.folderId; }
    if (!pasta) throw new Error('pasta do processo não encontrada');
    const fotosId = await getOrCreateFolder('Fotos', pasta);
    p.docs._fotosUrl = 'https://drive.google.com/drive/folders/' + fotosId;
    const token = await getAccessToken();
    p.docs._files = p.docs._files || {}; p.docs._files.fotos = p.docs._files.fotos || [];
    for (const file of files) {
      const meta = { name: `${p.id}_foto_${new Date(file.lastModified || Date.now()).toISOString().slice(0, 10)}_${file.name}`, parents: [fotosId] };
      const fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      fd.append('file', file);
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
      if (!r.ok) throw new Error('envio da foto falhou (' + r.status + ')');
      const j = await r.json();
      p.docs._files.fotos.push({ id: j.id, name: j.name, url: j.webViewLink, data: new Date(file.lastModified || Date.now()).toLocaleDateString('pt-BR'), origem: 'foto' });
    }
    logAction('anexar', 'PROCESSOS', p.id, `${files.length} foto(s)`);
    await saveToSheets();
    showToast(`✅ ${files.length} foto(s) adicionada(s)`);
  } catch (e) { showToast('⚠️ ' + (e.message || e)); }
  S._enviandoFotos = false; render();
}

// ── RASTREIO ────────────────────────────────────────────────
function linkArmador(p) {
  const c = (p.containers || []).filter(Boolean)[0] || p.container || '', b = p.booking || '';
  const arm = String(p.companhia || '').toUpperCase(), ref = encodeURIComponent(c || b);
  if (!ref) return '';
  if (/MAERSK/.test(arm)) return 'https://www.maersk.com/tracking/' + ref;
  if (/MSC/.test(arm)) return 'https://www.msc.com/en/track-a-shipment?agencyPath=msc&trackingNumber=' + ref;
  if (/COSCO/.test(arm)) return 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=' + encodeURIComponent(c);
  if (/CMA/.test(arm)) return 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=' + encodeURIComponent(c);
  if (/HAPAG/.test(arm)) return 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=' + encodeURIComponent(c);
  if (/EVERGREEN/.test(arm)) return 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do';
  if (/YANG\s*MING|YML/.test(arm)) return 'https://www.yangming.com/en/esolution/cargo_tracking';
  return '';
}
function renderRastreio2() {
  const lista = (S.processos || []).filter(p => p.status !== 'Cancelado').map(p => ({ p, f: faseProcesso(p) }));
  const emb = lista.filter(x => x.f >= 3).sort((a, b) => (brParaDate(b.p.saida) || 0) - (brParaDate(a.p.saida) || 0));
  const antes = lista.filter(x => x.f < 3).sort((a, b) => b.f - a.f);
  const viagem = p => {
    const v = (p.docs && p.docs._viagem) || {}, atd = brParaDate(p.saida); let eta = brParaDate(v.eta), est = false;
    if (atd && !eta) { eta = new Date(atd.getTime() + 40 * 864e5); est = true; }   // China: ~40 dias quando a ETA não veio no documento
    const pct = atd && eta ? Math.max(0, Math.min(100, Math.round((Date.now() - atd) / (eta - atd) * 100))) : 0;
    return { v, atd, eta, est, pct, faltam: eta ? Math.ceil((eta - Date.now()) / 864e5) : null };
  };
  return `
  <div style="max-width:760px;margin:0 auto">
    <div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:26px;margin-bottom:4px">Rastreio</div>
    <div style="font-size:13px;color:var(--muted2);margin-bottom:14px">Cargas embarcadas: saída (ATD) e chegada prevista (ETA) vêm do BL e da fatura do agente. O botão abre o rastreio do armador com o container.</div>
    ${emb.length ? emb.map(({ p }) => { const g = viagem(p), link = linkArmador(p); return card(`
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${linkProc(p.id)} <span style="font-size:12.5px;color:var(--muted2)">${escHtml(p.cliente || '')}</span></span><span style="font-size:12.5px;font-weight:600;color:${g.pct >= 100 ? 'var(--green)' : 'var(--accent)'}">${g.pct >= 100 ? 'No destino / chegando' : 'Em viagem'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;gap:8px"><span>${escHtml(p.pol || 'Origem')}<br><span style="color:var(--muted2);font-size:12px">saiu ${escHtml(p.saida || '—')}</span></span><span style="text-align:right">${escHtml(p.pod || 'Destino')}<br><span style="color:var(--muted2);font-size:12px">${g.eta ? (g.est ? 'estimada ' : 'ETA ') + g.eta.toLocaleDateString('pt-BR') : '—'}</span></span></div>
      <div style="height:8px;border-radius:4px;background:var(--border2);overflow:hidden"><div style="height:100%;width:${g.pct}%;background:var(--accent)"></div></div>
      <div style="font-size:12.5px;color:var(--muted2)">${escHtml([g.v.navio, p.companhia, (p.containers || []).filter(Boolean).join(', '), p.booking ? 'booking ' + p.booking : ''].filter(Boolean).join(' · '))}${g.faltam != null && g.faltam > 0 ? ` · faltam ${g.faltam} dias` : ''}</div>
      ${link ? `<a class="btn btn-secondary btn-sm" style="min-height:44px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none" href="${sanitizeUrl(link)}" target="_blank" rel="noopener noreferrer">Rastrear no site do armador</a>` : '<div style="font-size:12px;color:var(--muted2)">Sem container/armador para rastrear.</div>'}`); }).join('') : card('<div style="font-size:13.5px;color:var(--muted2)">Nenhuma carga embarcada.</div>')}
    ${antes.length ? card(`${titulo2('Antes do embarque')}${antes.map(({ p, f }) => `<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;gap:8px"><span>${linkProc(p.id)}</span><span style="font-size:12.5px;font-weight:600;color:var(--muted2)">${f >= 0 ? FASES[f] : 'A coletar'}</span></div>${barraFases(f)}<div style="font-size:12.5px;color:var(--muted2)">${escHtml([p.logTransportadora, p.logCidade, p.deadlineCarga ? 'dead line ' + p.deadlineCarga : ''].filter(Boolean).join(' · ') || p.produto || '')}</div></div>`).join('')}`) : ''}
  </div>`;
}

// Abre no Início
if (S.page === 'dashboard') S.page = 'inicio';

// ── Despesas fixas: só as que você marcar (na conciliação ou à mão) ──
// REGRAS tipo 'fixo': valor = chave (CNPJ/CPF ou nome), categoria = nome, centro = JSON {valor, dia, periodo, mes}
const nomeChave = s => String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '').slice(0, 10);
const MESES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function despesasFixas() {
  const B = S.banco; if (!B || !B.carregado) return null;
  const hoje = hojeISO(), mes = hoje.slice(0, 7), ano = hoje.slice(0, 4), mesNum = +hoje.slice(5, 7);
  const ultimoExtrato = B.linhas.reduce((m, l) => l.data > m ? l.data : m, '');
  return (B.regras || []).filter(r => r.tipo === 'fixo').map(r => {
    let x = {}; try { x = JSON.parse(r.centro || '{}'); } catch (e) {}
    const periodo = x.periodo === 'anual' ? 'anual' : 'mensal', dia = Number(x.dia) || 1, mesAnual = Number(x.mes) || 1;
    const casa = l => l.valor < 0 && (/^\d{11,14}$/.test(r.valor) ? l.documento === r.valor : nomeChave(l.favorecido || l.memo) === nomeChave(r.categoria) || nomeChave(l.favorecido || l.memo) === r.valor.replace(/^manual:/, ''));
    const doPeriodo = B.linhas.filter(l => casa(l) && (periodo === 'mensal' ? l.data.slice(0, 7) === mes : l.data.slice(0, 4) === ano));
    const pago = doPeriodo[doPeriodo.length - 1];
    const vence = periodo === 'mensal' ? `${mes}-${String(Math.min(dia, 28)).padStart(2, '0')}` : `${ano}-${String(mesAnual).padStart(2, '0')}-${String(Math.min(dia, 28)).padStart(2, '0')}`;
    const atrasado = !pago && ultimoExtrato > vence && diasEntre(vence, ultimoExtrato) >= 4 && (periodo === 'mensal' || diasEntre(vence, hoje) <= 45);
    const relevante = periodo === 'mensal' || mesNum === mesAnual || !!pago || atrasado;
    return { id: r.id, chave: r.valor, nome: r.categoria, valor: Number(x.valor) || 0, dia, periodo, mesAnual, pago, atrasado, relevante, ultimoExtrato };
  }).sort((a, b) => a.dia - b.dia);
}
async function gravarFixo(chave, nome, valor, dia, periodo, mes) {
  S.banco.regras = (S.banco.regras || []).filter(r => !(r.tipo === 'fixo' && r.valor === chave));
  S.banco.regras.push({ id: genId(), tipo: 'fixo', valor: chave, categoria: nome, centro: JSON.stringify({ valor, dia, periodo, mes }), criadoEm: new Date().toISOString() });
  await gravarAba2('REGRAS', S.banco.regras);
}
// chamada pela conciliação quando você marca "despesa fixa"
async function marcarComoFixa(l) {
  const chave = l.documento || nomeChave(l.favorecido || l.memo);
  try { await gravarFixo(chave, (l.favorecido || l.memo || '').trim(), Math.abs(l.valor), +l.data.slice(8, 10), 'mensal', +l.data.slice(5, 7)); showToast('✅ Marcada como despesa fixa mensal (ajuste no Início se for anual)'); } catch (e) { showToast('⚠️ ' + e.message); }
}
async function salvarFixo(chave) {
  const g = id => (document.getElementById(id) || {}).value || '';
  const nome = g('fx-nome').trim(), valor = numBR(g('fx-valor')) || 0, dia = Math.max(1, Math.min(31, parseInt(g('fx-dia'), 10) || 1));
  const periodo = g('fx-per') === 'anual' ? 'anual' : 'mensal', mes = Math.max(1, Math.min(12, parseInt(g('fx-mes'), 10) || 1));
  if (!nome) { showToast('Informe o nome'); return; }
  try { await gravarFixo(chave || ('manual:' + nomeChave(nome)), nome, valor, dia, periodo, mes); showToast('✅ Despesa fixa salva'); } catch (e) { showToast('⚠️ ' + e.message); }
  S._editFixo = null; render();
}
async function removerFixo(chave) {
  if (!await uiConfirm('Tirar esta despesa da lista de despesas fixas?', 'Remover despesa fixa', 'Remover', 'Cancelar')) return;
  S.banco.regras = (S.banco.regras || []).filter(r => !(r.tipo === 'fixo' && r.valor === chave));
  try { await gravarAba2('REGRAS', S.banco.regras); } catch (e) { showToast('⚠️ ' + e.message); }
  S._editFixo = null; render();
}
function formFixo(x) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;padding:10px;background:var(--bg3);border-radius:10px">
    <div class="ig" style="margin:0"><label class="lbl" for="fx-nome">Nome</label><input id="fx-nome" type="text" value="${escHtml(x ? x.nome : '')}" placeholder="Ex.: Contador"></div>
    <div class="ig" style="margin:0"><label class="lbl" for="fx-valor">Valor (R$)</label><input id="fx-valor" type="text" inputmode="decimal" value="${x && x.valor ? m2(x.valor) : ''}" placeholder="0,00"></div>
    <div class="ig" style="margin:0"><label class="lbl" for="fx-per">Repete</label><select id="fx-per"><option value="mensal"${!x || x.periodo === 'mensal' ? ' selected' : ''}>Todo mês</option><option value="anual"${x && x.periodo === 'anual' ? ' selected' : ''}>Uma vez por ano</option></select></div>
    <div class="ig" style="margin:0"><label class="lbl" for="fx-dia">Dia</label><input id="fx-dia" type="number" min="1" max="31" value="${x ? x.dia : ''}" placeholder="10"></div>
    <div class="ig" style="margin:0"><label class="lbl" for="fx-mes">Mês (se anual)</label><select id="fx-mes">${MESES_NOME.map((m, i) => `<option value="${i + 1}"${x && x.mesAnual === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
    <div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-primary btn-sm" style="min-height:40px" onclick="salvarFixo('${x ? escHtml(x.chave) : ''}')">Salvar</button><button type="button" class="btn btn-secondary btn-sm" style="min-height:40px" onclick="S._editFixo=null;render()">Cancelar</button>${x ? `<button type="button" class="btn btn-secondary btn-sm" style="min-height:40px" onclick="removerFixo('${escHtml(x.chave)}')">Remover</button>` : ''}</div>
  </div>`;
}
function blocoFixos() {
  const fx = despesasFixas();
  const novo = S._editFixo === '__novo' ? formFixo(null) : `<button type="button" class="btn btn-secondary btn-sm" style="min-height:40px" onclick="S._editFixo='__novo';render()">+ Adicionar despesa fixa</button>`;
  if (fx === null) return card(`${titulo2('Despesas fixas')}<div style="font-size:13.5px;color:var(--muted2)">Carregando…</div>`);
  if (!fx.length) return card(`${titulo2('Despesas fixas')}<div style="font-size:13.5px;color:var(--muted2)">Nenhuma ainda. Ao lançar um pagamento na Conciliação, marque "despesa fixa", ou adicione aqui.</div>${novo}`);
  const doMes = fx.filter(x => x.relevante), outras = fx.filter(x => !x.relevante);
  const total = doMes.reduce((a, x) => a + x.valor, 0);
  const linha = x => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);align-items:center">
        <div style="min-width:0"><div style="font-size:14px;font-weight:600">${escHtml(x.nome)}</div>
          <div style="font-size:12.5px;color:var(--muted2)">${brl(x.valor)} · ${x.periodo === 'anual' ? 'anual, ' + x.dia + '/' + MESES_NOME[x.mesAnual - 1] : 'todo dia ' + x.dia}</div>
          <div style="font-size:12px;font-weight:600;color:${x.pago ? 'var(--green)' : x.atrasado ? 'var(--orange)' : 'var(--muted2)'}">${x.pago ? 'pago em ' + isoToBr(x.pago.data) + ' · ' + brl(-x.pago.valor) : x.atrasado ? 'não apareceu no extrato' : x.relevante ? 'esperado até o dia ' + x.dia : 'próximo em ' + MESES_NOME[x.mesAnual - 1]}</div></div>
        <button type="button" class="btn btn-secondary btn-xs" style="min-height:36px" onclick="S._editFixo='${escHtml(x.chave)}';render()">Editar</button>
      </div>${S._editFixo === x.chave ? formFixo(x) : ''}`;
  return card(`${titulo2('Despesas fixas', `<span style="font-family:'JetBrains Mono',monospace;font-size:15px">${brl(total)} neste mês</span>`)}
    <div style="display:flex;flex-direction:column">${doMes.map(linha).join('')}${outras.length ? `<div style="font-size:12px;color:var(--muted2);padding-top:10px">Anuais em outros meses</div>${outras.map(linha).join('')}` : ''}</div>
    ${novo}`);
}


// Lista de todos os arquivos anexados ao processo, agrupados por tipo, com link para abrir
function totalArquivos(p) { return Object.entries(((p.docs || {})._files) || {}).reduce((a, [, arr]) => a + (arr || []).length, 0); }
function listaArquivos(p) {
  const grupos = Object.entries(((p.docs || {})._files) || {}).filter(([, arr]) => (arr || []).length);
  if (!grupos.length) return '<div style="font-size:13px;color:var(--muted2)">Nenhum arquivo anexado ainda.</div>';
  const nomeTipo = t => (typeof tipoLabel === 'function' ? tipoLabel(t) : t);
  return `<div style="display:flex;flex-direction:column;gap:10px">${grupos.map(([t, arr]) => `
    <div><div style="font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted2);margin-bottom:4px">${escHtml(nomeTipo(t))} (${arr.length})</div>
    ${arr.map(f => `<a href="${sanitizeUrl(f.url)}" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:5px;color:var(--text);text-decoration:none;min-height:44px;align-items:center">
      <span style="min-width:0"><span style="display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(f.nomeOriginal || f.name || 'arquivo')}</span>
      <span style="font-size:11.5px;color:var(--muted2)">${[f.emitente, f.valor ? brl(f.valor) : '', f.data ? (String(f.data).includes('-') ? isoToBr(f.data) : f.data) : '', f.atalho ? 'atalho (arquivo em outro processo)' : ''].filter(Boolean).map(escHtml).join(' · ')}</span></span>
      <span style="color:var(--accent);white-space:nowrap;font-size:13px">Abrir ↗</span></a>`).join('')}</div>`).join('')}</div>`;
}
