// v91: guia de imposto (DCTFWeb) / boleto + comprovante do banco = UMA linha no extrato de caixa, com os dois anexos
// 1) as 5 guias reais são "Guia de imposto" (antes: comprovante) e cada comprovante acha a sua guia (código de barras / valor)
// 2) anexar: 4 linhas pagas na data do pagamento (guia + comprovante) e 1 conta a pagar (setembro, sem comprovante)
// 3) o comprovante de setembro chega depois: a mesma linha fica paga; guia de um pagamento já lançado pelo banco vai para essa linha
// 4) boleto + comprovante (linha digitável); "Anexar guia" pela linha do extrato; o extrato do banco liga na mesma linha
// usa dados/store.json, dados/fixtures/guias_reais.json, boleto_art.txt e boleto_cota.txt (fora do GitHub)
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const G=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/guias_reais.json','utf8'));
const BOL=fs.readFileSync(__dirname+'/dados/fixtures/boleto_art.txt','utf8'), CBOL=fs.readFileSync(__dirname+'/dados/fixtures/boleto_cota.txt','utf8');
const nomes=Object.keys(G);
const dados=t=>{ const U=t.replace(/\s+/g,' '); const cb=U.match(/\b(8\d{10}) (\d) (\d{11}) (\d) (\d{11}) (\d) (\d{11}) (\d)\b/);
  return { barras:cb.slice(1,9).join(' '), valor:U.match(/Valor Total do Documento ([\d.]+,\d{2})/)[1], venc:U.match(/Data de Vencimento[\s\S]{0,90}?(\d{2}\/\d{2}\/\d{4})/)[1], per:U.match(/\b([a-zç]+\/\d{4})\b/)[1] }; };
const I=nomes.map(n=>dados(G[n]));   // maio, junho, julho, agosto, setembro
const comp={
  A:`comprovante de pagamento\n10 out de 2026\n\ndados do pagador\nnome EMPRESA TESTE LTDA\n\ndados do pagamento\ntipo de pagamento Tributos com código de barras\ncódigo de barras ${I[0].barras}\nvalor do pagamento R$ ${I[0].valor}\ndata do pagamento 10/10/2026\n\nautenticação no comprovante ABC123DEF\n`,
  B:`Comprovante de pagamento\n\nPagamento de tributos - Receita Federal (DARF)\nValor: R$ ${I[1].valor}\nPago em 10/10/2026\n`,
  C:`comprovante de pagamento\nDARF\nvalor do documento\nvencimento\ndata do pagamento\nR$ ${I[2].valor}\n${I[2].venc}\n10/10/2026\n`,
  D:`Comprovante de pagamento\n${I[3].barras.replace(/ /g,'')}\n10 out. 2026, 14:32:10, via SISPAG\nautenticação no comprovante XYZ789\n`,
  E:`comprovante de pagamento\ncódigo de barras ${I[4].barras}\nvalor do pagamento R$ ${I[4].valor}\ndata do pagamento 14/10/2026\n`,
};
// guia de mentira (a partir do layout real, com outros números) para o pagamento que já está no extrato do banco
const falsa=(t,valor,per)=>{ const d=dados(t); let s=t.split(d.valor).join(valor).replace(d.per,per);
  d.barras.split(' ').filter(b=>b.length===11).forEach(b=>{ s=s.split(b).join('8'+[...b.slice(1)].map(x=>String((+x+3)%10)).join('')); }); return s; };
const GD=falsa(G[nomes[0]],'777,77','abril/2026'), GF=falsa(G[nomes[1]],'333,33','março/2026');
// boleto + comprovante do boleto (a mesma linha digitável)
const linhaBol=BOL.match(/\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}/)[0], valorBol=BOL.match(/R\$ ([\d.]+,\d{2})/)[1];
const CB=CBOL.replace(/\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}/, linhaBol).replace(/R\$ [\d.]+,\d{2}/g,'R$ '+valorBol).replace(/data do pagamento\n[^\n]+/,'data do pagamento\n10 outubro 2026').replace(/data do vencimento\n[^\n]+/,'data do vencimento\n10 outubro 2026').replace(/ID da transação\n\d+/,'ID da transação\nETESTE91TESTE91TESTE91XY');
(async()=>{
 const R={}; const {b,pg,errs}=await H.open({wait:20000});
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 nomes.forEach(n=>H.pdf(n,ent,G[n]));
 H.png('Comprovante receita federal.png',ent,comp.A); H.png('Comprovante receita federal 4.png',ent,comp.A); H.png('Comprovante receita federal 2.png',ent,comp.B);
 H.png('Comprovante receita federal 3.png',ent,comp.C); H.png('Imagem PNG.png',ent,comp.D);
 H.pdf('DCTFWEBGUIAPAGAMENTO-ABRIL.pdf',ent,GD);
 H.pdf('ADM - Boleto ART.pdf',ent,BOL); H.png('ADM - Comprovante boleto ART.png',ent,CB);
 // pagamento da guia de abril já lançado pela linha do banco (sem guia)
 await pg.evaluate(()=>{ S.lancamentos.unshift({id:'bancoX',data:'12/10/2026',tipo:'Despesa',descricao:'Impostos federais — DA REC FED DARF',valor:777.77,empresa:'',vinculo:'avulso',vinculoId:'ADM',categoria:'Impostos federais',status:'Pago',observacao:'Extrato: DA REC FED DARF',docs:{_banco:'k-bancoX'}}); });
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:120000}).catch(()=>{});
 R.itens=await pg.evaluate(()=>S.entrada.itens.map(i=>({nome:i.nome.slice(0,32),tipo:i.tipo,proc:i.processo,conf:i.confianca,cat:i.categoria,valor:i.info.valor,data:i.info.data,vence:i.info.vencimento,desc:i.info.guia&&i.info.guia.descricao,par:i._par91&&(i._par91.nome.slice(0,32)+' / '+i._par91.por),aviso:(i.aviso||'').replace(/Não cita nenhum processo:[^.]*\.[^.]*\./,'').trim().slice(0,140)})));
 R.cartoes=await pg.evaluate(()=>{ const t=renderEntrada().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); return (t.match(/(🔗|🟡)[^.]*\.[^.]*\./g)||[]).map(x=>x.slice(0,150)); });
 const n0=await pg.evaluate(()=>S.lancamentos.length);
 R.anexou=await pg.evaluate(async()=>await confirmarTodosEntrada(false,true));
 R.sobrou=await pg.evaluate(()=>S.entrada.itens.map(i=>i.nome+' ['+i.confianca+']'));
 R.linhas=await pg.evaluate(()=>S.lancamentos.filter(l=>l.docs&&l.docs._guia).map(l=>({id:l.id==='bancoX'?'bancoX':'novo',desc:l.descricao,valor:l.valor,data:l.data,status:l.status,cat:l.categoria,guia:!!l.docs.fatura,comp:!!l.docs.comprovante,banco:!!l.docs._banco,obs:l.observacao.replace(/\d{4}-\d{2}_ADM_[^ ]+/g,'<arquivo>').slice(0,160)})));
 R.novas=await pg.evaluate(n0=>S.lancamentos.length-n0,n0);
 R.inicio=await pg.evaluate(()=>{ S._iniAberto={pagar:true}; const t=renderInicio().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); return (t.match(/Guias e boletos do mês.{0,160}/)||[''])[0]; });
 R.card=await pg.evaluate(()=>{ const l=S.lancamentos.find(x=>x.docs&&x.docs._guia&&x.docs.comprovante); const h=renderLancCard(l); return {guia:/✅ 📋 Guia/.test(h), comp:/✅ 🧾 Comprov/.test(h)}; });
 await pg.waitForTimeout(3500);
 const EC=store.EXTRATO_CAIXA, hh=EC[0]; R.planilha=EC.slice(1).filter(r=>r&&/"_guia"/.test(r[hh.indexOf('docs')]||'')).length;
 R.documentos=(store.DOCUMENTOS||[]).slice(1).map(r=>r[3]).reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{});
 R.pastaMes=Object.values(H.D).filter(f=>/^2026-10_ADM_/.test(f.name||'')).length;
 // ── rodada 2: comprovante de setembro chega depois; "Anexar guia" pela linha do extrato ──
 H.png('Comprovante setembro.png',ent,comp.E); H.pdf('DCTFWEBGUIAPAGAMENTO-MARCO.pdf',ent,GF);
 await pg.evaluate(()=>{ S.lancamentos.unshift({id:'manualY',data:'12/10/2026',tipo:'Despesa',descricao:'Despesas administrativas — pagamento sem guia',valor:340,empresa:'',vinculo:'avulso',vinculoId:'ADM',categoria:'Despesas administrativas',status:'Pago',observacao:'',docs:{}}); });
 await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
 R.cartoes2=await pg.evaluate(()=>{ const t=renderEntrada().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); return (t.match(/(🔗|🟡)[^.]*\.[^.]*\./g)||[]).map(x=>x.slice(0,150)); });
 R.chip=await pg.evaluate(()=>/abrirGuiaLanc91\('manualY'\)/.test(renderLancCard(S.lancamentos.find(x=>x.id==='manualY'))));
 R.escolher=await pg.evaluate(async()=>{ await abrirGuiaLanc91('manualY'); const m=document.getElementById('guia91-modal'); const t=m?m.textContent.replace(/\s+/g,' '):''; const it=S.entrada.itens.find(x=>x.tipo==='guia'); await anexarGuiaNaLinha91('manualY',it.fileId); const l=S.lancamentos.find(x=>x.id==='manualY');
   return {lista:(t.match(/Anexar nesta linha/g)||[]).length, desc:l.descricao, guia:!!l.docs.fatura, tipo:l.docs._guia&&l.docs._guia.tipo, rotulo:/📋 Guia/.test(renderLancCard(l)), naEntrada:S.entrada.itens.length}; });
 R.setembro=await pg.evaluate(async()=>{ const i=S.entrada.itens.findIndex(x=>/setembro/.test(x.nome)); const n=S.lancamentos.length; await confirmarEntrada(i); const l=S.lancamentos.find(x=>x.docs&&x.docs._guia&&/setembro/.test(x.descricao)); return {mais:S.lancamentos.length-n, status:l.status, data:l.data, comp:!!l.docs.comprovante, obs:l.observacao.replace(/\d{4}-\d{2}_ADM_[^ ]+/g,'<arquivo>')}; });
 R.inicio2=await pg.evaluate(()=>{ S._iniAberto={pagar:true}; return /Guias e boletos do mês/.test(renderInicio()); });
 // ── rodada 3: extrato do banco ──
 R.banco=await pg.evaluate(()=>{
   S.lancamentos.unshift({id:'abertaZ',data:'30/10/2026',tipo:'Despesa',descricao:'Impostos federais — DARF teste',valor:444.44,empresa:'RECEITA FEDERAL',vinculo:'avulso',vinculoId:'ADM',categoria:'Impostos federais',status:'Em Aberto',observacao:'Guia: x.pdf · vence 30/10/2026',docs:{fatura:'https://drive/x',_guia:{tipo:'guia',emissao:'2026-10-08',vencimento:'30/10/2026',blocos:[]}}});
   const s1=sugestaoLinha({valor:-Number(String(S.lancamentos.find(x=>x.docs&&x.docs._guia&&/maio/.test(x.descricao)).valor)),data:'2026-10-10',memo:'DA REC FED DARF',favorecido:'',chave:'b1'});
   const s2=sugestaoLinha({valor:-444.44,data:'2026-10-12',memo:'DA REC FED DARF',favorecido:'',chave:'b2'});
   // linha da guia (paga, sem banco) + linha do banco criada antes: juntam numa só, com a guia
   S.lancamentos.unshift({id:'g555',data:'11/10/2026',tipo:'Despesa',descricao:'Impostos federais — INSS teste',valor:555.55,empresa:'RECEITA FEDERAL',vinculo:'avulso',vinculoId:'ADM',categoria:'Impostos federais',status:'Pago',observacao:'Guia: g.pdf · Comprovante: c.png',docs:{fatura:'https://drive/g',comprovante:'https://drive/c',_guia:{tipo:'guia'}}});
   S.lancamentos.unshift({id:'b555',data:'11/10/2026',tipo:'Despesa',descricao:'Impostos federais — DA',valor:555.55,empresa:'',vinculo:'avulso',vinculoId:'ADM',categoria:'Impostos federais',status:'Pago',observacao:'Extrato: DA',docs:{_banco:'k555'}});
   despesasDuplicadas(); const b=S.lancamentos.find(x=>x.id==='b555');
   return {s1:s1&&(s1.acao+' '+s1.texto), s2:s2&&(s2.acao+' '+s2.texto), junta:{guiaJuntou:!S.lancamentos.some(x=>x.id==='g555'), guia:b.docs.fatura, comp:b.docs.comprovante, desc:b.descricao}}; });
 // ── rodada 4: comprovante sem data → pede a data antes de anexar ──
 const GN=falsa(G[nomes[2]],'222,22','fevereiro/2026'); H.pdf('DCTFWEBGUIAPAGAMENTO-FEV.pdf',ent,GN);
 H.png('Comprovante sem data.png',ent,'Comprovante de pagamento\ncódigo de barras '+dados(GN).barras+'\nautenticação no comprovante QWE\n');
 await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
 R.semData=await pg.evaluate(async()=>{ const c=S.entrada.itens.find(x=>/sem data/.test(x.nome)), g=S.entrada.itens.find(x=>/FEV/.test(x.nome)); const a={conf:c.confianca, gconf:g.confianca, aviso:/preencha a data/.test(c.aviso||''), par:!!c._par91};
   setInfoEntrada(S.entrada.itens.indexOf(c),'data','2026-10-13'); a.depois={conf:c.confianca, gconf:g.confianca, aviso:/preencha a data/.test(c.aviso||'')};
   const n=S.lancamentos.length; await confirmarEntrada(S.entrada.itens.indexOf(g)); const l=S.lancamentos.find(x=>/fevereiro/.test(x.descricao)); a.linha={mais:S.lancamentos.length-n, data:l&&l.data, status:l&&l.status, comp:!!(l&&l.docs.comprovante)}; a.naEntrada=S.entrada.itens.map(x=>x.nome); return a; });
 // ── rodada 5: editar a linha pelo ✏️ não pode apagar a ligação com o banco nem a guia ──
 R.editar=await pg.evaluate(async()=>{ const l=S.lancamentos.find(x=>x.id==='bancoX'); abrirModalLancamento('bancoX'); document.getElementById('lf_observacao').value='editado'; await salvarLancamento('bancoX'); const d=S.lancamentos.find(x=>x.id==='bancoX'); return {banco:d.docs._banco, guia:!!d.docs.fatura, dadosGuia:!!d.docs._guia, obs:d.observacao, rotulo:/📋 Guia/.test(renderLancCard(d))}; });
 R.writesProd=H.writes; R.errs=errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8);
 fs.writeFileSync(__dirname+'/r91.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify(R,null,1));
 await b.close(); process.exit(0); })();
