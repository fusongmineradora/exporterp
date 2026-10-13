setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},280000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
(async()=>{
 const R={};
 // carga 1 (manutenção roda e grava)
 let {b,pg,errs}=await H.open(); R.log1=H.log.length; R.errs1=errs.slice();
 await b.close();
 const snap=JSON.stringify(store); H.log.length=0;
 // carga 2: não deveria gravar nada (ou só o carimbo)
 ({b,pg,errs}=await H.open());
 R.log2=H.log.slice(0,30);
 const dif={}; const s0=JSON.parse(snap); for(const t of Object.keys(store)){ const a=s0[t]||[], c=store[t]||[]; const n=Math.max(a.length,c.length); const rows=[]; for(let i=0;i<n;i++){ if(JSON.stringify(a[i])!==JSON.stringify(c[i])) rows.push(i); } if(rows.length) dif[t]=rows.slice(0,10).map(i=>{ const h=c[0]||a[0]; const x=a[i]||[], y=c[i]||[]; const cols=h.map((k,j)=>x[j]!==y[j]?k+':'+String(x[j]).slice(0,80)+' → '+String(y[j]).slice(0,80):'').filter(Boolean); return i+' '+(y[0]||x[0])+' '+cols.join(' | ').slice(0,600); }); }
 R.dif2=dif;
 // invariantes
 R.inv=await pg.evaluate(()=>{
  const out=[]; const P=S.processos, L=S.lancamentos||[], B=(S.banco&&S.banco.linhas)||[];
  const ids=new Set(P.map(p=>p.id)), lids=new Set(L.map(l=>l.id));
  const camp=Object.keys(PROCESS_COST_FIELDS);
  P.forEach(p=>{
    camp.forEach(c=>{ const v=Number(p[c])||0, st=p[c+'_status']||''; if(v>0&&!st) out.push(p.id+' '+c+' valor '+v+' sem status'); if(v===0&&st==='Pago') out.push(p.id+' '+c+' Pago com valor 0');
      const cd=p.docs&&p.docs._custoDocs&&p.docs._custoDocs[c]; const pago=cd?(cd.pagos||[]).reduce((s,x)=>s+(Number(x.valor)||0),0):0; const fisc=cd?(cd.fiscais||[]).reduce((s,x)=>s+(Number(x.valor)||0),0):0;
      if(st==='Pago'&&v>0&&cd&&pago>0&&pago+0.01<v&&!(p.docs._valorManual||{})[c]&&!(p.docs._statusManual||{})[c]) out.push(p.id+' '+c+' Pago '+v+' mas comprovantes somam '+pago.toFixed(2));
      if(cd&&fisc>0&&v+0.01<fisc&&!(p.docs._valorManual||{})[c]) out.push(p.id+' '+c+' valor '+v+' menor que notas '+fisc.toFixed(2));
    });
    const inv=Number(p.cambioInvoice)||0, rec=Number(p.cambioRecebido)||0;
    if(rec>inv+1&&inv) out.push(p.id+' câmbio recebido USD '+rec+' > invoice '+inv);
    if(p.cambioReais&&rec&&p.cambioTaxa&&Math.abs(rec*p.cambioTaxa-p.cambioReais)>Math.max(5,p.cambioReais*0.002)) out.push(p.id+' reais '+p.cambioReais+' ≠ USD×taxa '+(rec*p.cambioTaxa).toFixed(2));
    if(!p.cliente) out.push(p.id+' sem cliente'); if(!inv&&p.status!=='Cancelado') out.push(p.id+' sem valor de invoice');
    try{ const t=procTotals(p); if(!isFinite(t.custo)||!isFinite(t.receita)) out.push(p.id+' totais NaN'); }catch(e){ out.push(p.id+' procTotals erro '+e.message); }
  });
  // mesmo arquivo em processos diferentes
  const porMd5={}; P.forEach(p=>Object.values((p.docs&&p.docs._files)||{}).forEach(a=>(a||[]).forEach(f=>{ if(f.md5){ (porMd5[f.md5]=porMd5[f.md5]||new Set()).add(p.id); porMd5[f.md5].nome=f.name; } })));
  Object.entries(porMd5).forEach(([k,s])=>{ if(s.size>1) out.push('arquivo em '+[...s].join('+')+': '+s.nome); });
  // lançamentos
  L.forEach(l=>{ if(l.vinculo==='Processo'&&l.vinculoId&&!ids.has(l.vinculoId)&&!/,/.test(l.vinculoId)) out.push('lanc '+l.id+' aponta processo inexistente '+l.vinculoId); if(!isFinite(Number(l.valor))) out.push('lanc '+l.id+' valor inválido'); });
  const chave=l=>[l.data,Math.abs(Number(l.valor)).toFixed(2),l.tipo,l.vinculoId||''].join('|'); const vis={}; L.forEach(l=>{ const k=chave(l); (vis[k]=vis[k]||[]).push(l.id+':'+(l.descricao||'').slice(0,30)); }); Object.values(vis).filter(v=>v.length>1).forEach(v=>out.push('lanc parecidos: '+v.join(' / ')));
  // banco
  const usados={}; B.forEach(l=>{ if(l.lancId){ String(l.lancId).split(',').forEach(id=>{ if(!lids.has(id)) out.push('banco '+l.data+' '+l.valor+' aponta lanc inexistente '+id); (usados[id]=usados[id]||[]).push(l.data+' '+l.valor); }); } if(l.status==='conciliado'&&!l.lancId&&!l.categoria) out.push('banco conciliado sem vínculo '+l.data+' '+l.valor); });
  Object.entries(usados).filter(([k,v])=>v.length>1).forEach(([k,v])=>out.push('lanc '+k+' ligado a '+v.length+' linhas: '+v.join(' / ')));
  const st={}; B.forEach(l=>st[l.status||'?']=(st[l.status||'?']||0)+1);
  return {problemas:out, statusBanco:st, nLanc:L.length, nBanco:B.length};
 });
 R.errs2=errs;
 fs.writeFileSync('r41.json',JSON.stringify(R,null,1)); console.log('PROD',H.writes);
 await b.close(); process.exit(0);
})();
