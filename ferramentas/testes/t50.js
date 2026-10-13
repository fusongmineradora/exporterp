setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const tx=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/textos.json','utf8'));
const PU='1Vang8C4wfTpWMJu2TPamhOBZilraniIf', ENT='1WPKXkM8NXdJKNF1zk_R76hkqs8B6Do86';
H.fld(PU,'Processos Unificados'); H.fld(ENT,'00 Entrada - Novos Documentos',PU); H.fld('CANC','99 Cancelados',PU);
const ids=['096','097','098','099','100','101','102','104','106','107','108','109','111','112','113','114','115','116','117','118'];
ids.forEach(n=>H.fld('P'+n,'FS260'+n+' - booking - Cliente - Produto',PU)); H.fld('P109S','FS260109S - 277122994 - Lee',PU); H.fld('P103','FS260103 - cancelado','CANC');
H.fld('P110','FS260110 - 276991145 - Lee - Xiamen',PU);
// arquivo novo na 00 Entrada: comprovante do marítimo do FS260113
H.png('FS260113 - Frete marítimo Access.png',ENT,tx.pagamento.replace('R$ 5.787,88','R$ 6.100,00').replace('FS260109S','FS260113').replace('28/09/2026','05/10/2026').replace('E60701190202609281615DY5FNLO9CFV','E60701190202610051000AAAA0000099'));
(async()=>{
 const R={}; const {b,pg,errs}=await H.open({oficial:true});
 R.env=await pg.evaluate(()=>({nome:ERP_ENV.nome,sheet:SHEET_ID,n:S.processos.length,tem110:S.processos.some(p=>p.id==='FS260110'),faixa:!!document.getElementById('teste-faixa'),versao:(document.getElementById('versao-oficial')||{}).textContent,title:document.title}));
 await pg.waitForTimeout(3000);
 R.pastas=await pg.evaluate(()=>S.processos.map(p=>p.id+':'+(p.docs._folderId||'-')+(p.docs._pastaOficial?'✓':'')).join(' '));
 await pg.evaluate(()=>{ nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:60000}).catch(()=>{});
 R.entrada=await pg.evaluate(()=>({folder:S.entrada.folderId,itens:S.entrada.itens.map(i=>[i.nome,i.tipo,i.processo,i.confianca]),botoesImport:/Importar tudo/.test(document.getElementById('main').innerHTML)}));
 const i=await pg.evaluate(()=>S.entrada.itens.findIndex(x=>x.processo==='FS260113'));
 if(i>=0){ await pg.evaluate(async i=>{ await confirmarEntrada(i,true); },i); await pg.waitForTimeout(1500); }
 R.depois=await pg.evaluate(()=>{const p=S.processos.find(x=>x.id==='FS260113'); return [p.custoMaritimo,p.custoMaritimo_status,(p.docs._files.pagamento||[]).map(f=>f.name).slice(-2)];});
 R.arquivo=Object.values(H.D).filter(f=>/FS260113_Comprovante/.test(f.name)).map(f=>[f.name,f.parents.map(x=>(H.D[x]||{}).name+'<'+((H.D[(H.D[x]||{}).parents&&H.D[x].parents[0]]||{}).name||''))]);
 R.sistema=Object.values(H.D).filter(f=>f.mimeType==='application/vnd.google-apps.folder'&&!/^FS26|Processos|00 Entrada|99 Canc|^0\d /.test(f.name)).map(f=>f.name+'<'+((H.D[f.parents[0]]||{}).name||''));
 R.gravouEm=[...new Set(H.log.filter(x=>/values|batch/.test(x)).map(x=>x.slice(0,30)))].slice(0,5);
 fs.writeFileSync('r50.json',JSON.stringify(R,null,1)); console.log('PROD',H.writes,'errs',errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8));
 await b.close(); process.exit(0); })();
