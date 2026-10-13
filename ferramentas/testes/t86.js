// v86: dois aparelhos/abas abertos ao mesmo tempo — nada do que um faz pode sumir quando o outro grava
// + venda dividida: BL do "S" que cita a DU-E do principal não é pendência (só observação na tela)
// usa dados/store_oficial.json e dados/fixtures/t86_dados.json (números reais ficam fora do GitHub)
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store_oficial.json','utf8'));
{ const P=store.PROCESSOS, h=P[0], c=h.indexOf('docs'); P.slice(1).forEach(r=>{ if(!r||!r[0]) return; try{ const d=JSON.parse(r[c]||'{}'); d._relido78=d._relido82=d._relido83=d._relido84=d._relido85=true; r[c]=JSON.stringify(d); }catch(e){} }); }
const H=mk(store);
const X=JSON.parse(fs.readFileSync(__dirname+'/dados/fixtures/t86_dados.json','utf8'));
const planilha=()=>{ const P=store.PROCESSOS, h=P[0], o={}; P.slice(1).forEach(r=>{ if(r&&r[0]){ const x={}; h.forEach((k,i)=>x[k]=r[i]); try{ x.docs=JSON.parse(x.docs||'{}'); }catch(e){} o[r[0]]=x; } }); return o; };
const lanc=()=>{ const L=store.EXTRATO_CAIXA||[], h=L[0]||[]; return L.slice(1).filter(r=>r&&r[0]).map(r=>r[h.indexOf('id')]); };
const dlg=pg=>pg.evaluate(()=>{ window.__dlg=0; window.uiConfirm=async()=>{ window.__dlg++; return false; }; });   // "Salvar mesmo assim" (o caminho perigoso de antes)
(async()=>{
 const R={};
 const A=await H.open({wait:20000}); const B=await H.open({wait:20000});
 await dlg(A.pg); await dlg(B.pg);
 // 1) A anexa uma DU-E no FS260109 e muda o FS260112; grava
 await A.pg.evaluate(async(X)=>{ const p=S.processos.find(x=>x.id==='FS260109'); p.docs._files=p.docs._files||{}; p.docs._files.due=(p.docs._files.due||[]).concat([{id:'arqA109',name:'FS260109_DU-E.pdf',url:'https://drive.google.com/file/d/arqA109/view'}]);
   p.docs._dues=Object.assign({},p.docs._dues,{[X.due109]:X.reg109});
   S.processos.find(x=>x.id==='FS260112').pod='Porto A'; return await saveToSheets(); },X);
 // 2) B (com os dados de antes) muda o FS260117, anexa outro arquivo no FS260109 e grava
 R.b1=await B.pg.evaluate(async()=>{ S.processos.find(x=>x.id==='FS260117').booking='BK-B'; const q=S.processos.find(x=>x.id==='FS260109'); q.docs._notaB='b'; q.docs._files=q.docs._files||{}; q.docs._files.due=(q.docs._files.due||[]).concat([{id:'arqB109',name:'outro.pdf',url:'https://drive.google.com/file/d/arqB109/view'}]); await saveToSheets(); return window.__dlg; });
 let P=planilha();
 R.depoisB={dlg:R.b1, due109:(P.FS260109.docs._files.due||[]).map(f=>f.id), dues109:Object.keys(P.FS260109.docs._dues||{}), notaB:P.FS260109.docs._notaB, pod112:P.FS260112.pod, bk117:P.FS260117.booking};
 // 3) A cria um lançamento e muda o FS260113; grava (B gravou no meio)
 R.a2=await A.pg.evaluate(async()=>{ S.lancamentos.push({id:'lancA',data:'2026-10-13',tipo:'saida',descricao:'teste A',valor:10,empresa:'',vinculo:'',vinculoId:'',categoria:'',status:'',observacao:'',docs:{}}); S.processos.find(x=>x.id==='FS260113').pod='Porto A2'; await saveToSheets(); const p=S.processos.find(x=>x.id==='FS260117'); return {dlg:window.__dlg, bk117naMemoria:p.booking}; });
 P=planilha();
 R.depoisA2={due109:(P.FS260109.docs._files.due||[]).map(f=>f.id), bk117:P.FS260117.booking, pod113:P.FS260113.pod, pod112:P.FS260112.pod, lancA:lanc().includes('lancA')};
 // 4) A tira o arquivo arqB109; B (com dados de antes) muda outra coisa e grava: o arquivo não pode voltar; o lançamento de A tem que ficar
 await A.pg.evaluate(async()=>{ const p=S.processos.find(x=>x.id==='FS260109'); p.docs._files.due=p.docs._files.due.filter(f=>f.id!=='arqB109'); await saveToSheets(); });
 R.b2=await B.pg.evaluate(async()=>{ S.processos.find(x=>x.id==='FS260118').pod='Porto B2'; await saveToSheets(); return window.__dlg; });
 P=planilha();
 R.depoisB2={due109:(P.FS260109.docs._files.due||[]).map(f=>f.id), pod118:P.FS260118.pod, pod113:P.FS260113.pod, lancA:lanc().includes('lancA'), nProc:Object.keys(P).length};
 // 5) B apaga o lançamento de A (repetido); A grava outra coisa: o lançamento não pode voltar
 await B.pg.evaluate(async()=>{ const i=S.lancamentos.findIndex(l=>l.id==='lancA'); if(i>=0) S.lancamentos.splice(i,1); await saveToSheets(); });
 await A.pg.evaluate(async()=>{ S.processos.find(x=>x.id==='FS260116').pod='Porto A3'; await saveToSheets(); });
 R.depoisA3={lancA:lanc().includes('lancA'), pod116:planilha().FS260116.pod};
 // 6) venda dividida: BL do 109S cita a DU-E do 109
 R.par=await A.pg.evaluate((X)=>{ const s=S.processos.find(x=>x.id==='FS260109S'); s.docs._bl=Object.assign({},s.docs._bl,{due:X.due109}); s.docs._dues={[X.due109S]:X.reg109S};
   const div=divergenciasDocs(s); S.sub=s; const h=renderProcesso2(); S.sub=null; const t=h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
   const outro=S.processos.find(x=>x.id==='FS260114'); const d0=Object.assign({},outro.docs._bl); outro.docs._bl=Object.assign({},d0,{due:'DU-E-INEXISTENTE'}); outro.docs._dues=Object.assign({[X.due114]:{}},outro.docs._dues); const div114=divergenciasDocs(outro).filter(x=>/O BL cita/.test(x)); outro.docs._bl=d0;
   return {div, nota:(t.match(/O BL cita a DU-E.{0,90}/)||[''])[0], div114}; },X);
 R.writesProd=H.writes; R.errs=[...A.errs,...B.errs].filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8);
 fs.writeFileSync(__dirname+'/r86.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify(R,null,1));
 await A.b.close(); await B.b.close(); process.exit(0); })();
