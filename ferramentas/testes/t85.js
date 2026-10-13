// v85: o pdf.js do navegador quebra o texto depois de "-" e "/" ("DU- E", "NF- e 001/...") — o h.js imita isso.
// 1) releitura das DU-Es já anexadas: notas de saída, situação e "exportada" têm que vir preenchidas
// 2) Caixa de Entrada: os 4 extratos reais que ficaram "falta o processo" no oficial têm que achar o processo
// usa dados/store_oficial.json, dados/fixtures/dues_lote.json, t82_dados.json e dues_reais4.json (fora do GitHub)
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store_oficial.json','utf8'));
// como no oficial de hoje: a v84 já releu tudo (_relido84) — a v85 só relê as DU-Es
{ const P=store.PROCESSOS, h=P[0], c=h.indexOf('docs'); P.slice(1).forEach(r=>{ if(!r||!r[0]) return; try{ const d=JSON.parse(r[c]||'{}'); d._relido78=d._relido82=d._relido83=d._relido84=true; r[c]=JSON.stringify(d); }catch(e){} }); }
const H=mk(store);
const DU=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/dues_lote.json','utf8'));
const REAIS=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/dues_reais4.json','utf8'));
const X=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/t82_dados.json','utf8'));
const P=store.PROCESSOS, h=P[0];
// corpo dos arquivos de DU-E já anexados (o texto da DU-E certa de cada processo)
P.slice(1).forEach(r=>{ if(!r||!r[0]) return; let d={}; try{ d=JSON.parse(r[h.indexOf('docs')]||'{}'); }catch(e){}
  const due=Object.keys(X.esperado).find(k=>X.esperado[k]===r[0]); const nome=due&&Object.keys(DU).find(n=>DU[n].includes(due));
  ((d._files||{}).due||[]).forEach(f=>{ if(nome) H.add({id:f.id,name:f.name,parents:['x'],mimeType:'application/pdf',body:DU[nome]}); }); });
(async()=>{
 const R={}; const {b,pg,errs}=await H.open({wait:45000});   // a releitura roda sozinha ~25 s depois de abrir
 R.releitura=await pg.evaluate(()=>S.processos.filter(p=>p.docs&&p.docs._dues&&Object.keys(p.docs._dues).length).map(p=>p.id+' '+Object.entries(p.docs._dues).map(([k,x])=>k+' nfs:'+(x.nfs||[]).join('/')+' sit:'+(x.situacao||'-')+' exp:'+x.exportada+(x.bloqueio?' bloq:'+x.bloqueio:'')).join(' | ')));
 R.semNf=R.releitura.filter(x=>/nfs: /.test(x)||/sit:-/.test(x));
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 Object.entries(REAIS).forEach(([n,t])=>H.pdf(n,ent,t));
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:120000}).catch(()=>{});
 R.entrada=await pg.evaluate(()=>S.entrada.itens.map(i=>[(i.info||{}).dueNumero,i.tipo,i.motivo,i.processo,i.confianca,((i.candidatos||[]).find(c=>c.id===i.processo)||{motivos:[]}).motivos.join(' / '),(i.info||{}).dueSituacao,((i.info||{}).nfsSaida||[]).join('/')]));
 R.certos=R.entrada.filter(x=>X.esperado[x[0]]===x[3]&&x[4]==='alta').length;
 fs.writeFileSync(__dirname+'/r85.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify({semNf:R.semNf,entrada:R.entrada,certos:R.certos},null,1)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8));
 await b.close(); process.exit(0); })();
