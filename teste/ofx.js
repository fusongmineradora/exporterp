/* ═══════════════════════════════════════════════════════════
 * Fu Song ERP 2.0 — Leitor de extrato OFX
 * ───────────────────────────────────────────────────────────
 * Módulo independente (navegador e Node). Não acessa rede nem
 * Google; recebe os bytes do arquivo e devolve um resultado
 * validado, pronto para a tela de revisão.
 *
 * Lições do extrato Itaú (mai–set/2026) tratadas aqui:
 *  1. Linhas "SALDO ..." vêm como CREDIT → nunca viram lançamento;
 *     servem de prova de integridade (checkpoints).
 *  2. Cabeçalho diz CHARSET 1252, arquivo é UTF-8 → detectar.
 *  3. "SALDO ANTERIOR" não é confiável (aplicação automática).
 *  4. Transações idênticas no mesmo dia são reais → nunca
 *     deduplicar por conteúdo; chave composta com nº da ocorrência.
 *  5. FITID = data + posição no dia → pode mudar entre exportações;
 *     é guardado, mas não é a chave.
 *  6. Descrições cortadas / em dois formatos → CNPJ/CPF é a chave
 *     do favorecido.
 *  7. Câmbio liquida em várias entradas por contrato, com o nº em
 *     dois formatos → normalizar e agrupar.
 *  8. Rendimentos de centavos → tipo próprio, agrupável por mês.
 *  9. Fuso rotulado errado → data = 8 primeiros dígitos, sem Date().
 * 10. LEDGERBAL pode ser posterior a DTEND → não usar para validar.
 * ═══════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // ── 1. Decodificação ────────────────────────────────────────
  function decode(bytes) {
    if (typeof bytes === 'string') return { text: bytes, encoding: 'string' };
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'windows-1252' };
    }
  }

  // ── 2. Utilidades ───────────────────────────────────────────
  const tag = (block, name) => {
    const m = block.match(new RegExp('<' + name + '>([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  };
  // Data OFX → 'AAAA-MM-DD' (só os 8 primeiros dígitos; sem fuso)
  const ofxDate = s => {
    const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  };
  // Valor: aceita "1234.56", "-1234,56", "1.234,56"
  const ofxAmount = s => {
    let v = String(s || '').trim().replace(/\s/g, '');
    if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const cents = n => Math.round(n * 100);
  const normMemo = s => String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();

  const RE_CNPJ = /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/;
  const RE_CPF = /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/;
  const onlyDigits = s => String(s || '').replace(/\D/g, '');

  // Favorecido: tira prefixos do banco e o documento
  function favorecido(memo) {
    let s = normMemo(memo)
      .replace(RE_CNPJ, '').replace(RE_CPF, '')
      .replace(/^(PIX ENVIADO\s+)+/, '')
      .replace(/^(PIX RECEBIDO|BOLETO PAGO|PAGAMENTOS|RECEBIMENTOS)\s+/, '')
      .trim();
    return s;
  }

  // Câmbio: "LIQ EXPORT 3026633302" | "302LIQ EXPORT 6683835" → "3026633302"
  function contratoCambio(memo) {
    const m1 = normMemo(memo).match(/^(\d{3})LIQ EXPORT\s+(\d+)/);
    if (m1) return m1[1] + m1[2];
    const m2 = normMemo(memo).match(/LIQ EXPORT\s+(\d+)/);
    return m2 ? m2[1] : '';
  }

  const isSaldo = memo => /^SALDO\b/.test(normMemo(memo));
  const isCheckpoint = memo => /^SALDO\b/.test(normMemo(memo)) && !/ANTERIOR/.test(normMemo(memo));

  // ── 3. Regras de classificação ──────────────────────────────
  // Regras genéricas de banco. Regras de fornecedores/sócios ficam
  // na aba REGRAS da planilha (dados privados não vão para o código).
  const REGRAS_PADRAO = [
    { id: 'rend',    re: /^RENDIMENTOS/,                      tipoMov: 'rendimento', categoria: 'Rendimentos financeiros', centro: 'ADM' },
    { id: 'cambio',  re: /LIQ EXPORT/,                        tipoMov: 'cambio',     categoria: 'Câmbio (liquidação)' },
    { id: 'tarcamb', re: /^TAR CAMB/,                         tipoMov: 'tarifa',     categoria: 'Tarifa de câmbio' },
    { id: 'tarifa',  re: /^TAR /,                             tipoMov: 'tarifa',     categoria: 'Tarifas bancárias', centro: 'ADM' },
    { id: 'iof',     re: /\bIOF\b/,                           tipoMov: 'tarifa',     categoria: 'IOF' },
    { id: 'darf',    re: /RECEITA FEDERAL|\bDARF\b/,          categoria: 'Impostos federais' },
    { id: 'munic',   re: /MUNICIPIO|PREFEITURA/,              categoria: 'Taxas e impostos municipais' },
    { id: 'orgaos',  re: /IBAMA|AGENCIA NACIONAL DE MINERACAO|\bANM\b|\bCREA\b|CONS REGIONAL DE ENG/, categoria: 'Taxas de órgãos' },
    { id: 'seguro',  re: /SEG\b|SEGURO/,                      categoria: 'Seguros', centro: 'ADM' },
  ];

  // O banco corta descrições longas ("PIX ENVIADO PIX ENVIADO OMAR MINERAC").
  // Casa se o texto da regra aparece inteiro, ou se a descrição termina
  // no meio dele (corte), com pelo menos 5 letras em comum.
  function textoCasa(memo, texto) {
    if (memo.includes(texto)) return true;
    for (let k = texto.length - 1; k >= 5; k--) {
      if (memo.endsWith(texto.slice(0, k))) return true;
    }
    return false;
  }

  // regrasUsuario: [{ doc?:'46003223000103', texto?: 'ITALIANA', categoria, centro?, processo? }]
  function classificar(t, regrasUsuario) {
    const memo = normMemo(t.memo);
    // 1) Documento (CNPJ/CPF) — mais forte
    if (t.documento) {
      const r = (regrasUsuario || []).find(r => r.doc && onlyDigits(r.doc) === t.documento);
      if (r) return { ...r, confianca: 'alta', motivo: 'CNPJ/CPF ' + t.documento };
    }
    // 2) Texto definido pelo usuário
    const ru = (regrasUsuario || []).find(r => r.texto && textoCasa(memo, normMemo(r.texto)));
    if (ru) return { ...ru, confianca: 'media', motivo: 'texto "' + ru.texto + '"' };
    // 3) Regras genéricas
    const rp = REGRAS_PADRAO.find(r => r.re.test(memo));
    if (rp) return { categoria: rp.categoria, centro: rp.centro || '', tipoMov: rp.tipoMov, confianca: 'alta', motivo: 'regra ' + rp.id };
    return { categoria: '', centro: '', confianca: 'nenhuma', motivo: 'sem regra' };
  }

  // ── 4. Leitura ──────────────────────────────────────────────
  function parse(input, opts) {
    opts = opts || {};
    const { text, encoding } = decode(input);
    const avisos = [];
    if (!/<OFX>/i.test(text)) throw new Error('Arquivo não parece ser um OFX (tag <OFX> ausente).');

    const conta = {
      banco: tag(text, 'BANKID'),
      conta: tag(text, 'ACCTID'),
      tipo: tag(text, 'ACCTTYPE'),
      moeda: tag(text, 'CURDEF') || 'BRL',
      inicio: ofxDate(tag(text, 'DTSTART')),
      fim: ofxDate(tag(text, 'DTEND')),
      saldoFinal: ofxAmount(tag(text.split(/<LEDGERBAL>/i)[1] || '', 'BALAMT')),
      saldoFinalData: ofxDate(tag(text.split(/<LEDGERBAL>/i)[1] || '', 'DTASOF')),
    };
    const declared = (text.match(/CHARSET:\s*(\S+)/i) || [])[1];
    if (declared && encoding === 'utf-8' && /1252/.test(declared)) {
      avisos.push('Cabeçalho declara Windows-1252, mas o arquivo é UTF-8; lido como UTF-8.');
    }
    if (conta.saldoFinalData && conta.fim && conta.saldoFinalData > conta.fim) {
      avisos.push(`Saldo final do arquivo é de ${conta.saldoFinalData}, posterior ao fim das transações (${conta.fim}); não usado na validação.`);
    }

    const blocos = text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
    const brutas = blocos.map((b, i) => ({
      ordemArquivo: i,
      fitid: tag(b, 'FITID'),
      tipoOFX: tag(b, 'TRNTYPE'),
      data: ofxDate(tag(b, 'DTPOSTED')),
      valor: ofxAmount(tag(b, 'TRNAMT')),
      memo: (tag(b, 'MEMO') || tag(b, 'NAME')).replace(/\s+/g, ' ').trim(),
    }));
    brutas.forEach(t => {
      if (!t.data) avisos.push(`Linha ${t.ordemArquivo + 1}: data inválida.`);
      if (!Number.isFinite(t.valor)) avisos.push(`Linha ${t.ordemArquivo + 1}: valor inválido.`);
    });

    // Separa saldos (checkpoints) de movimentos
    const checkpoints = [];
    const movimentos = [];
    brutas.forEach(t => {
      if (isSaldo(t.memo)) {
        if (isCheckpoint(t.memo)) checkpoints.push({ data: t.data, valor: t.valor, ordemArquivo: t.ordemArquivo });
      } else {
        movimentos.push(t);
      }
    });

    // Chave composta: data | valor | memo normalizado | nº da ocorrência
    const contagem = {};
    movimentos.forEach(t => {
      const base = `${t.data}|${cents(t.valor)}|${normMemo(t.memo)}`;
      contagem[base] = (contagem[base] || 0) + 1;
      t.ocorrencia = contagem[base];
      t.chave = `${conta.banco}-${conta.conta}|${base}|${t.ocorrencia}`;
      const cnpj = t.memo.match(RE_CNPJ), cpf = t.memo.match(RE_CPF);
      t.documento = onlyDigits(cnpj ? cnpj[1] : cpf ? cpf[1] : '');
      t.tipoDocumento = cnpj ? 'CNPJ' : cpf ? 'CPF' : '';
      t.favorecido = favorecido(t.memo);
      t.sentido = t.valor >= 0 ? 'entrada' : 'saida';
      t.contrato = contratoCambio(t.memo);
      t.classificacao = classificar(t, opts.regras);
      t.tipoMov = t.contrato ? 'cambio' : (t.classificacao.tipoMov || (t.valor >= 0 ? 'entrada' : 'pagamento'));
    });

    // Validação por saldo diário: saldo(dia) = saldo(checkpoint anterior) + movimentos entre eles
    const validacao = validarSaldos(movimentos, checkpoints);
    if (!validacao.ok) avisos.push(`${validacao.divergencias.length} dia(s) com saldo divergente — importação deve ser bloqueada.`);

    // Agrupamentos úteis para a revisão
    const cambio = agruparCambio(movimentos);
    const rendimentosMes = agruparRendimentos(movimentos);

    // Dia corrente/futuro: avisar (FITID e sequência podem mudar)
    const hoje = opts.hoje || null;
    if (hoje) {
      const parciais = movimentos.filter(t => t.data >= hoje);
      if (parciais.length) avisos.push(`${parciais.length} movimento(s) do dia ${hoje} ou posteriores; importe só até ontem.`);
    }

    return {
      encoding, conta, avisos, validacao,
      movimentos, checkpoints, cambio, rendimentosMes,
      resumo: {
        linhasArquivo: brutas.length,
        linhasSaldo: brutas.length - movimentos.length,
        movimentos: movimentos.length,
        entradas: round2(movimentos.filter(t => t.valor > 0).reduce((a, t) => a + t.valor, 0)),
        saidas: round2(movimentos.filter(t => t.valor < 0).reduce((a, t) => a + t.valor, 0)),
        classificados: movimentos.filter(t => t.classificacao.confianca !== 'nenhuma').length,
        comDocumento: movimentos.filter(t => t.documento).length,
      },
    };
  }

  const round2 = n => Math.round(n * 100) / 100;

  function validarSaldos(movimentos, checkpoints) {
    const divergencias = [];
    if (checkpoints.length < 2) {
      return { ok: true, verificados: 0, divergencias, aviso: 'Arquivo sem saldos diários suficientes para validar.' };
    }
    // Saldo por dia (último checkpoint do dia)
    const cpDia = {};
    checkpoints.forEach(c => { cpDia[c.data] = c.valor; });
    const dias = Object.keys(cpDia).sort();
    const movDia = {};
    movimentos.forEach(t => { movDia[t.data] = (movDia[t.data] || 0) + cents(t.valor); });
    for (let i = 1; i < dias.length; i++) {
      const ant = dias[i - 1], dia = dias[i];
      let soma = 0;
      Object.keys(movDia).forEach(d => { if (d > ant && d <= dia) soma += movDia[d]; });
      const esperado = cents(cpDia[ant]) + soma;
      const diff = cents(cpDia[dia]) - esperado;
      if (diff !== 0) divergencias.push({ dia, saldoBanco: cpDia[dia], saldoCalculado: esperado / 100, diferenca: diff / 100 });
    }
    return { ok: divergencias.length === 0, verificados: dias.length - 1, divergencias, primeiroDia: dias[0], ultimoDia: dias.at(-1) };
  }

  function agruparCambio(movimentos) {
    const g = {};
    movimentos.filter(t => t.contrato && t.valor > 0).forEach(t => {
      const k = t.data + '|' + t.contrato;
      (g[k] = g[k] || { data: t.data, contrato: t.contrato, entradas: [], total: 0, tarifas: [] }).entradas.push(t.chave);
      g[k].total = round2(g[k].total + t.valor);
    });
    // Tarifa de câmbio do mesmo dia vai junto
    movimentos.filter(t => /^TAR CAMB/.test(normMemo(t.memo))).forEach(t => {
      const grupo = Object.values(g).find(x => x.data === t.data);
      if (grupo) grupo.tarifas.push({ chave: t.chave, valor: t.valor });
    });
    return Object.values(g).sort((a, b) => a.data.localeCompare(b.data));
  }

  function agruparRendimentos(movimentos) {
    const m = {};
    movimentos.filter(t => t.tipoMov === 'rendimento').forEach(t => {
      const k = t.data.slice(0, 7);
      (m[k] = m[k] || { mes: k, total: 0, linhas: 0 });
      m[k].total = round2(m[k].total + t.valor); m[k].linhas++;
    });
    return Object.values(m).sort((a, b) => a.mes.localeCompare(b.mes));
  }

  // Compara com chaves já importadas → só o que é novo
  function novos(resultado, chavesExistentes) {
    const set = new Set(chavesExistentes || []);
    return resultado.movimentos.filter(t => !set.has(t.chave));
  }

  const api = { decode, parse, classificar, validarSaldos, novos, contratoCambio, favorecido, normMemo, REGRAS_PADRAO, _ofxDate: ofxDate, _ofxAmount: ofxAmount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FusongOFX = api;
})(typeof self !== 'undefined' ? self : this);
