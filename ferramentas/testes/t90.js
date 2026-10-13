// v90: apagar a versão errada (substituída) da invoice e do contrato gerados; a que vale não pode ser apagada;
// a lista de documentos abre a versão que vale
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},300000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const arq=(id,name)=>H.add({id,name,parents:['pasta117'],mimeType:'application/pdf',body:'pdf '+name});
['i1','c1','i2','c2','i3','c3'].forEach(id=>arq(id,id+'.pdf'));
(async()=>{
 const {b,pg,errs}=await H.open({wait:20000});
 const r=await pg.evaluate(async()=>{
   window.uiConfirm=async()=>true;
   const p=S.processos.find(x=>x.id==='FS260117'); p.docs=p.docs||{}; p.docs._files=p.docs._files||{};
   const f=(id,tipo,v,sub)=>({id,name:`FS260117_${tipo==='invoice'?'Invoice':'Sales-Contract'}${v>1?'_v'+v:''}.pdf`,url:'https://drive.google.com/file/d/'+id+'/view',origem:'gerado',versao:v,...(sub?{substituido:sub}:{})});
   p.docs._files.invoice=[f('i1','invoice',1,2),f('i2','invoice',2,3),f('i3','invoice',3)]; p.docs._files.contrato=[f('c1','contrato',1,2),f('c2','contrato',2,3),f('c3','contrato',3)];
   p.docs.invoice=p.docs._files.invoice[2].url; p.docs.contrato=p.docs._files.contrato[2].url;
   p.docs._gerado={versao:3,comprador:'X',kg:27000,preco:0.5,total:13500,ncm:'25291000'};
   const o={};
   S.sub=p; let h=renderProcesso2(); o.botoes=(h.match(/Apagar esta versão/g)||[]).length; o.linkChecklist=arquivoAtual(p,'invoice').id+'/'+arquivoAtual(p,'contrato').id;
   await dvApagarVersao('FS260117',1);
   o.depois1={inv:p.docs._files.invoice.map(x=>x.id), ct:p.docs._files.contrato.map(x=>x.id)};
   await dvApagarVersao('FS260117',3);   // a que vale: não apaga
   o.depois3={inv:p.docs._files.invoice.map(x=>x.id), ct:p.docs._files.contrato.map(x=>x.id)};
   h=renderProcesso2(); o.botoes2=(h.match(/Apagar esta versão/g)||[]).length; o.texto=(h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').match(/Versão 2 \(substituída\)[^🗑]*/)||[''])[0];
   await dvApagarVersao('FS260117',2);
   o.depois2={inv:p.docs._files.invoice.map(x=>x.id), ct:p.docs._files.contrato.map(x=>x.id), url:p.docs.invoice.includes('/i3/')};
   h=renderProcesso2(); o.botoes3=(h.match(/Apagar esta versão/g)||[]).length; S.sub=null;
   return o;
 });
 await pg.waitForTimeout(4000);
 r.lixeira=['i1','c1','i2','c2','i3','c3'].filter(id=>H.D[id]&&H.D[id].trashed);
 const P=store.PROCESSOS, hh=P[0], row=P.find(x=>x&&x[0]==='FS260117'); const d=JSON.parse(row[hh.indexOf('docs')]);
 r.planilha=(d._files.invoice||[]).map(x=>x.id).concat((d._files.contrato||[]).map(x=>x.id));
 r.log=(store.LOG||[]).filter(x=>x&&/apagados \(lixeira/.test(x[5]||'')).map(x=>x[5]);
 fs.writeFileSync(__dirname+'/r90.json',JSON.stringify(r,null,1));
 console.log(JSON.stringify(r,null,1)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,5));
 await b.close(); process.exit(0); })();
