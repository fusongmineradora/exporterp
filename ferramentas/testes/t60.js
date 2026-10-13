setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},280000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
const due=fs.readFileSync(__dirname+'/dados/fixtures/due102.txt','utf8');
(async()=>{
 const R={}; H.add({id:'1b9jBP8PUceHUYymYCIbKXTl9GRBEJAfAZgUTTwsor_I',name:'Fu Song ERP Database — TESTE 4',mimeType:'application/vnd.google-apps.spreadsheet',parents:[]});
 let {b,pg,errs}=await H.open();
 const reqs=[]; pg.on('request',r=>{const u=decodeURIComponent(r.url()); if(u.includes('1JYKfcws')) reqs.push(r.method()+' '+u.slice(0,140));});
 R.fn=await pg.evaluate(()=>['atualizarTesteComOficial','copiaDeSeguranca','dividirCambioUI','divergenciasDocs','conferirDocumentos','pacoteContador','textoCobranca'].map(f=>f+':'+typeof window[f]).join(' '));
 R.due=await pg.evaluate((t)=>{const it={tipo:'due',texto:t,info:{}}; enriquecerInfo(it); return it.info;},due);
 // divergências
 R.div=await pg.evaluate(()=>{const p=S.processos.find(x=>x.id==='FS260102')||S.processos[3]; const d0=divergenciasDocs(p); p.docs._contratoCont=2; p.docs._bl={containers:['ABCU1234567']}; p.docs._dues={'26BR1':{vmle:999999,peso:1000}}; const d1=divergenciasDocs(p); const pend=pendenciasProcesso(p).map(x=>x.texto); delete p.docs._contratoCont; delete p.docs._dues; return {id:p.id,peso:p.peso,inc:p.incoterm,d0,d1,pend:pend.slice(-4)};});
 // telas
 R.telas=await pg.evaluate(()=>{const o={}; S.page='inicio'; o.inicio=/Conferir documentos/.test(renderInicio())&&/Atualizar teste/.test(renderInicio()); const p=S.processos.find(x=>x.id==='FS260117'); S.sub=p; const h=renderProcesso2(); o.proc=/Dividir câmbio/.test(h); S.banco.carregado=true; o.conc=/Pacote do contador/.test(renderConciliacao()); S.resTab='clientes'; const r=renderResultados(); o.res=/Cobrança de câmbio/.test(r); o.faixa=!!document.querySelector('#teste-faixa button'); o.abertos=abertosPorCliente().map(c=>c.nome+' '+c.total); return o;});
 R.cob=await pg.evaluate(()=>{const p=S.processos.find(x=>x.id==='FS260115')||S.processos[0]; p.status='Embarcado'; p.saida=p.saida||'05/10/2026'; p.cambioRecebido=0; S.resTab='clientes'; window.__res=/Cobrança de câmbio/.test(renderResultados()); const c=abertosPorCliente()[0]; return c?textoCobranca(c.nome):'(nenhum)';});
 // dividir câmbio
 R.res2=await pg.evaluate(()=>window.__res);
 R.div1=await pg.evaluate(async()=>{const g=id=>{const p=S.processos.find(x=>x.id===id);return [p.cambioRecebido,p.cambioReais];}; const a={111:g('FS260111'),117:g('FS260117')}; await salvarDivisaoCambio('637051913',{FS260111:8000,FS260117:13600}); const b={111:g('FS260111'),117:g('FS260117')}; const rg=S.banco.regras.filter(r=>r.tipo==='cambioProc'&&r.valor==='637051913'); const m=mapaCambioGuardado().filter(x=>x.ref==='637051913'); await salvarDivisaoCambio('637051913',{FS260111:8100,FS260117:13500}); const c={111:g('FS260111'),117:g('FS260117')}; return {a,b,c,rg:rg.map(r=>r.categoria+' '+r.centro),m};});
 // pacote contador
 H.log.length=0;
 R.pac=await pg.evaluate(async()=>{await pacoteContador('2026-09'); return S._pacote;});
 R.pacLog=H.log.filter(x=>/DRIVE POST/.test(x)).length+' posts; '+H.log.filter(x=>/upload|Resumo/.test(x)).slice(0,3).join(' | ');
 R.pac2=await pg.evaluate(async()=>{await pacoteContador('2026-09'); return S._pacote;});
 // cópia
 H.log.length=0;
 R.copia=await pg.evaluate(async()=>{const r=await copiaDeSeguranca(true); const r2=await copiaDeSeguranca(false); return [!!r.nova, !!r2.ja];});
 R.copiaLog=H.log.filter(x=>/COPY/.test(x));
 // atualizar teste
 await pg.evaluate(()=>{ window.__reload=0; });
 R.atual=await pg.evaluate(async()=>{ try{ await atualizarTesteComOficial(); return 'ok'; }catch(e){return e.message;} });
 await pg.waitForTimeout(500);
 R.reqOficial=[...new Set(reqs.map(x=>x.split(' ')[0]))];
 R.errs=errs.filter(e=>!/404|ERR_FAILED|X-Frame|frame-ancestors/.test(e));
 R.writes=H.writes;
 await b.close();
 fs.writeFileSync('r60.json',JSON.stringify(R,null,1)); console.log(JSON.stringify(R,null,1).slice(0,6000));
 process.exit(0);
})();
