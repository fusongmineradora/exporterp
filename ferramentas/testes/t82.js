// v82: cruzamentos da DU-E — número (BL), RUC (BL), nota de saída da Fu Song, par 109/109S, conferência (peso, valor, porto, BL × DU-E)
// usa dados/store_oficial.json (planilha oficial, só leitura), dados/fixtures/dues_lote.json (20 extratos reais) e bl_textos.json
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store_oficial.json','utf8')); const H=mk(store);
const DU=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/dues_lote.json','utf8'));
const BL=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/bl_textos.json','utf8'));
const rep=(t,pairs)=>pairs.reduce((s,[a,b])=>s.split(a).join(b),t);
const X=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/t82_dados.json','utf8'));   // números reais ficam fora do GitHub
const ESPERADO=X.esperado;
const P=store.PROCESSOS, h=P[0]; const blId={};
P.slice(1).forEach(r=>{ if(r&&r[0]){ try{ const d=JSON.parse(r[h.indexOf('docs')]||'{}'); (d._files&&d._files.bl||[]).forEach(f=>{ (blId[r[0]]=blId[r[0]]||[]).push(f.id); }); }catch(e){} } });
const add=(id,name,body)=>H.add({id,name,parents:['x'],mimeType:'application/pdf',body});
const bl109=rep(BL.bl113,X.bl109);
const bl109S=rep(BL.bl113,X.bl109S);
(blId.FS260109||[]).forEach(id=>add(id,'FS260109_BL.pdf',bl109)); (blId.FS260109S||[]).forEach(id=>add(id,'FS260109_BL.pdf',bl109S));
add(X.blIds.bl112,'FS260112_BL.pdf',BL.bl112); add(X.blIds.bk112,'FS260112_BL.pdf',BL.bk112);
add(X.blIds.bl114,'FS260114_BL.pdf',BL.bl114); add(X.blIds.bl113,'FS260113_BL.pdf',BL.bl113);
(async()=>{
 const R={}; const {b,pg,errs}=await H.open({wait:45000});   // a releitura (BLs, RUC) roda sozinha ~25 s depois de abrir
 R.ruc=await pg.evaluate(()=>['FS260109','FS260109S','FS260113'].map(id=>{const p=S.processos.find(x=>x.id===id); return id+' '+((p.docs._bl||{}).ruc||'-')+' due '+p.dueNumero;}));
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 Object.entries(DU).forEach(([n,t])=>H.pdf(n,ent,t));
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:120000}).catch(()=>{});
 R.itens=await pg.evaluate(()=>S.entrada.itens.map(i=>({due:(i.info||{}).dueNumero,tipo:i.tipo,proc:i.processo,conf:i.confianca,mot:((i.candidatos||[]).find(c=>c.id===i.processo)||{motivos:[]}).motivos.join(' / ')})));
 R.certos=R.itens.filter(x=>ESPERADO[x.due]===x.proc&&x.conf==='alta').length; R.errados=R.itens.filter(x=>!(ESPERADO[x.due]===x.proc&&x.conf==='alta'));
 R.anexou=await pg.evaluate(async()=>await confirmarTodosEntrada(false,true));
 await pg.waitForTimeout(2000);
 R.depois=await pg.evaluate(()=>['FS260109','FS260109S','FS260113','FS260114','FS260115','FS260116','FS260118'].map(id=>{const p=S.processos.find(x=>x.id===id); return id+' due:'+p.dueNumero+' arquivos:'+(p.docs._files.due||[]).length+' | '+divergenciasDocs(p).join(' ; ');}));
 R.pend=await pg.evaluate(()=>{const o=[]; S.processos.forEach(p=>pendenciasProcesso(p).forEach(x=>{ if(/DU-E/.test(x.texto)) o.push(p.id+': '+x.texto); })); return o;});
 fs.writeFileSync(__dirname+'/r82.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify({ruc:R.ruc,certos:R.certos,errados:R.errados,anexou:R.anexou},null,1)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8));
 await b.close(); process.exit(0); })();
