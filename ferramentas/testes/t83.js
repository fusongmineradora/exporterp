// v83: DU-E confirma o embarque (bloqueio → No Porto) e valor exportado (antecipação vira crédito do cliente)
// usa dados/store_oficial.json, dados/fixtures/dues_lote.json, bl_textos.json e t82_dados.json (fora do GitHub)
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},560000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store_oficial.json','utf8')); const H=mk(store);
const DU=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/dues_lote.json','utf8'));
const BL=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/bl_textos.json','utf8'));
const X=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/t82_dados.json','utf8'));
const rep=(t,pairs)=>pairs.reduce((s,[a,b])=>s.split(a).join(b),t);
const P=store.PROCESSOS, h=P[0]; const ids={};
P.slice(1).forEach(r=>{ if(r&&r[0]){ try{ const d=JSON.parse(r[h.indexOf('docs')]||'{}'); ['bl','due'].forEach(t=>(d._files&&d._files[t]||[]).forEach(f=>{ (ids[r[0]+':'+t]=ids[r[0]+':'+t]||[]).push(f.id); })); }catch(e){} } });
const add=(id,name,body)=>H.add({id,name,parents:['x'],mimeType:'application/pdf',body});
(ids['FS260109:bl']||[]).forEach(id=>add(id,'FS260109_BL.pdf',rep(BL.bl113,X.bl109))); (ids['FS260109S:bl']||[]).forEach(id=>add(id,'FS260109_BL.pdf',rep(BL.bl113,X.bl109S)));
add(X.blIds.bl112,'FS260112_BL.pdf',BL.bl112); add(X.blIds.bk112,'FS260112_BL.pdf',BL.bk112); add(X.blIds.bl114,'FS260114_BL.pdf',BL.bl114); add(X.blIds.bl113,'FS260113_BL.pdf',BL.bl113);
const due107=DU[X.arqDue107];
(ids['FS260107:due']||[]).forEach(id=>add(id,'FS260107_DU-E.pdf',due107));
const est=async pg=>pg.evaluate(()=>{ const g=id=>S.processos.find(x=>x.id===id); const o={};
  ['FS260107','FS260112','FS260113','FS260114'].forEach(id=>{ const p=g(id); const r=resultadoProcesso(p), t=procTotals(p); o[id]={status:p.status,fase:faseProcesso(p),exp:valorExportado(p),fonte:p.docs._valorExportadoFonte||'',inv:p.cambioInvoice,antUsd:r.antecipacaoUsd||0,antR:r.antecipacaoReais||0,antT:t.antecipacao||0,div:divergenciasDocs(p)}; });
  o.saldo=contaClientes().map(c=>c.nome.slice(0,22)+' '+Math.round(c.saldoUsd)); return o; });
(async()=>{
 const R={}; let {b,pg,errs}=await H.open({wait:45000});
 R.inicio=await est(pg);
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 Object.entries(DU).forEach(([n,t])=>H.pdf(n,ent,t));
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:120000}).catch(()=>{});
 R.avisoEntrada=await pg.evaluate(()=>S.entrada.itens.filter(i=>i.aviso).map(i=>i.processo+': '+i.aviso));
 R.anexou=await pg.evaluate(async()=>{ const n=await confirmarTodosEntrada(false,true); autoUpdateStatus(); await saveToSheets(); return n; });
 R.depois=await est(pg);
 R.tela=await pg.evaluate(()=>{ const o={}; ['FS260107','FS260112','FS260114'].forEach(id=>{ S.sub=S.processos.find(x=>x.id===id); const h=renderProcesso2(); o[id]=((h.match(/Valor exportado:[^<]*<b>[^<]*<\/b>[^<]*|A DU-E diz <b>[^<]*<\/b> e a invoice <b>[^<]*<\/b>/)||[''])[0]); }); S.sub=null; return o; });
 R.escolha=await pg.evaluate(async()=>{ await usarValorExportado('FS260114','invoice'); const p=S.processos.find(x=>x.id==='FS260114'); return divergenciasDocs(p); });
 // chega a DU-E retificada do FS260114 (peso 27.000 kg e USD 5.400)
 const k114=X.arqDue114; H.pdf('Extrato-DUE RETIFICADA FS260114.pdf',ent,DU[k114].replace('Peso líquido (KG) 5.400,00000','Peso líquido (KG) 27.000,00000').split('27.000,00\n\nVMCV').join('5.400,00\n\nVMCV').replace('VMCV (Valor da Mercadoria na Condição de Venda) 27.000,00','VMCV (Valor da Mercadoria na Condição de Venda) 5.400,00'));
 await pg.evaluate(()=>{ S.entrada.lido=false; lerEntrada(); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:60000}).catch(()=>{});
 R.retif=await pg.evaluate(async()=>{ const it=S.entrada.itens.map(i=>[i.nome,i.processo,i.confianca,i.aviso||'']); await confirmarTodosEntrada(false,true); const p=S.processos.find(x=>x.id==='FS260114'); return {it, div:divergenciasDocs(p), dues:p.docs._dues, log:(S.log||[]).slice(-3)}; });
 R.cargas=await pg.evaluate(()=>{ S.page='inicio'; const t=renderInicio().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); return (t.match(/FS260113[^F]{0,120}/)||[''])[0]; });
 await b.close();
 const snap=JSON.stringify(store); H.log.length=0;
 ({b,pg,errs}=await H.open({wait:45000}));
 R.reload=await est(pg); R.gravou2=H.log.filter(x=>!x.startsWith('LIST')).slice(0,10); R.mudou2=JSON.stringify(store)!==snap;
 fs.writeFileSync(__dirname+'/r83.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify({anexou:R.anexou,mudou2:R.mudou2,gravou2:R.gravou2},null,1)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8));
 await b.close(); process.exit(0); })();
