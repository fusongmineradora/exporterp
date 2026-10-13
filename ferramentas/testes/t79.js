// v79: MDF-e e CT-e chegando juntos na Caixa de Entrada — o MDF-e segue o CT-e que ele cita (chave de acesso)
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},300000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const L=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/cte_mdfe_lote.json','utf8'));   // textos de 4 DACTEs + 4 DAMDFEs reais
(async()=>{
 const R={}; const {b,pg,errs}=await H.open();
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 Object.entries(L).forEach(([n,t])=>H.pdf(n,ent,t));
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:90000}).catch(()=>{});
 R.itens=await pg.evaluate(()=>S.entrada.itens.map(i=>[i.nome.slice(0,18),i.tipo,i.processo,i.confianca]));
 R.manual=await pg.evaluate(()=>{ const E=S.entrada; const i=E.itens.findIndex(x=>/^Dacte 905/.test(x.nome)); setEntrada(i,'processo','FS260101'); const m=E.itens.find(x=>/^MDF 633/.test(x.nome)); const r1=m.processo; setEntrada(i,'processo','FS260100'); E.itens[i].confianca='alta'; return [r1,m.processo]; });
 R.anexou=await pg.evaluate(async()=>await confirmarTodosEntrada(false,true));
 R.proc=await pg.evaluate(()=>['FS260100','FS260104','FS260108','FS260111'].map(id=>{const p=S.processos.find(x=>x.id===id); return id+' cte:'+(p.docs._files.cte||[]).length+' mdfe:'+(p.docs._files.mdfe||[]).length;}));
 fs.writeFileSync(__dirname+'/r79.json',JSON.stringify(R,null,1)); console.log(JSON.stringify(R)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8));
 await b.close(); process.exit(0); })();
