// harness comum: planilha em memória (store) + Drive em memória (D) + pdf.js falso
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs=require('fs'), crypto=require('crypto');
const PROD='1-Or9ewLhLkunUHP8GgOw9rZWd2k2bhMS8_93Ie1znXY';
const FOLDER='application/vnd.google-apps.folder';
const H_ids=new Set();
function mk(store){
  const writes=[], log=[]; let seq=0; const D={};
  const add=(o)=>{const id=o.id||('d'+(++seq)); D[id]={id,parents:[],mimeType:'application/octet-stream',trashed:false,md5Checksum:o.body?('md5_'+crypto.createHash('md5').update(String(o.body)).digest('hex').slice(0,10)):('x'+(++seq)),webViewLink:'https://drive/'+id,...o,id}; return D[id];};
  const fld=(id,name,parent)=>add({id,name,mimeType:FOLDER,parents:parent?[parent]:[]});
  const pdf=(name,parent,body)=>add({name,mimeType:'application/pdf',parents:[parent],body});
  const png=(name,parent,ocr,md5)=>add({name,mimeType:'image/png',parents:[parent],size:'300000',md5Checksum:md5||('png_'+(++seq)),ocr});
  const setRange=(range,values)=>{const m=range.match(/^'?([^'!]+)'?!?([A-Z]+)?(\d+)?/); const t=m[1]; const r0=(m[3]?+m[3]:1)-1; const c0=m[2]?[...m[2]].reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0)-1:0; store[t]=store[t]||[]; values.forEach((v,i)=>{ if(!c0){ store[t][r0+i]=v; return; } const row=(store[t][r0+i]||[]).slice(); v.forEach((x,j)=>row[c0+j]=x); for(let k=0;k<c0;k++) if(row[k]===undefined) row[k]=''; store[t][r0+i]=row; });};
  const clearRange=(range)=>{const m=range.match(/^'?([^'!]+)'?(?:!([A-Z]+)(\d+))?/); const t=m[1]; if(!store[t]) return; const r0=m[3]?+m[3]-1:0; store[t]=store[t].slice(0,r0);};
  const listQ=(q)=>{ let r=Object.values(D).filter(f=>!f.trashed);
    const pm=q.match(/'([^']+)' in parents/); if(pm) r=r.filter(f=>f.parents.includes(pm[1]));
    const nm=q.match(/name\s*=\s*'((?:\\'|[^'])+)'/); if(nm) r=r.filter(f=>f.name===nm[1].replace(/\\'/g,"'"));
    const nc=q.match(/name contains '((?:\\'|[^'])+)'/); if(nc) r=r.filter(f=>f.name.toLowerCase().includes(nc[1].replace(/\\'/g,"'").toLowerCase()));
    if(q.includes("mimeType='application/vnd.google-apps.folder'")||q.includes("mimeType = 'application/vnd.google-apps.folder'")) r=r.filter(f=>f.mimeType===FOLDER);
    if(q.includes("mimeType!='application/vnd.google-apps.folder'")||q.includes("mimeType != 'application/vnd.google-apps.folder'")) r=r.filter(f=>f.mimeType!==FOLDER);
    return r.map(f=>({id:f.id,name:f.name,mimeType:f.mimeType,md5Checksum:f.md5Checksum,size:f.size||String((f.body||'').length),webViewLink:f.webViewLink,parents:f.parents,createdTime:'2026-10-06T00:00:00Z',modifiedTime:'2026-10-06T00:00:00Z'}));};
  async function open(opts={}){
    const b=await chromium.launch(); const pg=await (await b.newContext({viewport:opts.vp||{width:1300,height:1000}})).newPage();
    const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error'||(process.env.WARN&&m.type()==='warning'))errs.push('console: '+m.text().slice(0,300));});
    await pg.route('**/*',async r=>{const u=r.request().url(), m=r.request().method(); const dec=decodeURIComponent(u);
      if(u.startsWith('file://')) return r.continue();
      if(u.includes('fonts.')||u.includes('accounts.google.com')||u.includes('cdnjs')) return r.abort();
      if(u.includes('olinda.bcb.gov.br')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({value:[{cotacaoCompra:5.4321,cotacaoVenda:5.4327}]})});
      const json=o=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
      if(u.includes(PROD)) writes.push('!!!PROD '+m+' '+dec.slice(0,120));
      if(u.includes('sheets.googleapis.com')){ const sid=(dec.match(/spreadsheets\/([^/?:]+)/)||[])[1]; if(sid) H_ids.add(sid);
        const body=r.request().postData()?JSON.parse(r.request().postData()):null;
        if(m!=='GET') log.push(m+' '+dec.replace(/.*spreadsheets\/[^/]+/,'').slice(0,90));
        if(m==='GET'&&u.includes('fields=sheets.properties')) return json({sheets:Object.keys(store).map((t,i)=>({properties:{title:t,sheetId:i}}))});
        if(m==='GET'&&u.includes('batchGet')){const rs=new URL(u).searchParams.getAll('ranges'); return json({valueRanges:rs.map(t=>({values:store[t.split('!')[0]]||[]}))});}
        if(m==='GET'&&dec.includes('/values/CONFIG!E1')){return json({values:[[((store.CONFIG||[])[0]||[])[4]||'']]});}
        if(m==='GET'&&dec.includes('/values/')){const t=dec.split('/values/')[1].split('?')[0].split('!')[0]; return json({values:store[t]||[]});}
        if(m==='POST'&&u.includes(':batchUpdate')&&!u.includes('values')){(body.requests||[]).forEach(q=>{if(q.addSheet) store[q.addSheet.properties.title]=[];}); return json({});}
        if(m==='POST'&&u.includes('values:batchUpdate')){body.data.forEach(d=>setRange(d.range,d.values)); return json({});}
        if(m==='POST'&&u.includes('values:batchClear')){body.ranges.forEach(clearRange); return json({});}
        if(m==='POST'&&u.includes(':append')){const t=dec.split('/values/')[1].split('!')[0].split(':')[0]; store[t]=(store[t]||[]).concat(body.values); return json({});}
        if(m==='PUT'&&dec.includes('/values/')){const rg=dec.split('/values/')[1].split('?')[0]; setRange(rg,body.values); return json({});}
        return json({});
      }
      if(u.includes('/drive/v3/files')||u.includes('/upload/drive/v3/files')){
        const url=new URL(u); const q=url.searchParams.get('q')||''; let body=null; try{body=r.request().postData()?JSON.parse(r.request().postData()):null}catch(e){}
        const path=url.pathname.split('/files')[1]||'';
        if(m!=='GET') log.push('DRIVE '+m+' '+path+' '+(body&&body.name||''));
        if(m==='GET'&&!path){ const fl=listQ(q); log.push('LIST '+q.slice(0,110)+' → '+fl.length); return json({files:fl}); }
        const id=path.split('/')[1];
        if(m==='POST'&&!path){ if(u.includes('/upload/')){const f=add({name:'upload',parents:[]}); return json({id:f.id,webViewLink:f.webViewLink});} const f=add({name:body.name,mimeType:body.mimeType,parents:body.parents||[]}); return json({id:f.id,name:f.name,webViewLink:f.webViewLink}); }
        if(m==='POST'&&path.endsWith('/copy')){ const src=D[id]; if(!src) return r.fulfill({status:404,body:'{}'});
          const isDoc=/^application\/vnd\.google-apps\./.test(body.mimeType||'');
          log.push('COPY '+id+' → '+JSON.stringify(body.parents)); const f=add({name:body.name||src.name,mimeType:isDoc?body.mimeType:src.mimeType,parents:body.parents||[],body:src.body,bodyBuf:src.bodyBuf,ocr:src.ocr,md5Checksum:isDoc?undefined:src.md5Checksum,size:src.size,description:body.description,ocrDe:isDoc?id:undefined});
          return json({id:f.id,name:f.name,webViewLink:f.webViewLink,md5Checksum:f.md5Checksum}); }
        if(m==='PATCH'){ const f=D[id]; if(!f) return json({}); const ap=url.searchParams.get('addParents'), rp=url.searchParams.get('removeParents');
          if(rp) f.parents=f.parents.filter(x=>!rp.split(',').includes(x)); if(ap) f.parents.push(...ap.split(',')); if(body&&body.name) f.name=body.name; if(body&&body.trashed) f.trashed=true; return json({id:f.id,name:f.name,webViewLink:f.webViewLink}); }
        if(m==='DELETE'){ if(D[id]&&!D[id].ocrDe) writes.push('!!!DELETE real file '+id+' '+(D[id]||{}).name); delete D[id]; return r.fulfill({status:204,body:''}); }
        if(m==='GET'&&path.endsWith('/export')){ return r.fulfill({status:200,contentType:'text/plain',body:(D[id]&&D[id].ocr)||''}); }
        if(m==='GET'&&url.searchParams.get('alt')==='media'){ const f=D[id]; if(!f) return r.fulfill({status:404,body:''}); return r.fulfill({status:200,body:f.bodyBuf||Buffer.from(String(f.body||''))}); }
        if(m==='GET'){ const f=D[id]; return json(f?{id,trashed:false,name:f.name,parents:f.parents,mimeType:f.mimeType,md5Checksum:f.md5Checksum,webViewLink:f.webViewLink}:{id,trashed:false,name:'x'}); }
      }
      return r.fulfill({status:404,body:''});
    });
    const PFX=opts.oficial?'oficial:':'teste:';
    await pg.addInitScript((PFX)=>{sessionStorage.setItem(PFX+'erp-user',JSON.stringify({email:'lai@fusongmineradora.com',name:'Klismann Lai',picture:'',expires:Date.now()+3600e3}));sessionStorage.setItem(PFX+'erp-gtoken',JSON.stringify({token:'tok',expiry:Date.now()+3600e3}));localStorage.setItem(PFX+'sheet-id-4','TEST4');localStorage.setItem(PFX+'geracao','4');
      window.pdfjsLib={__pronto:true,GlobalWorkerOptions:{},getDocument:({data})=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:(window.__PDFRAW?[new TextDecoder().decode(data)]:new TextDecoder().decode(data).split(/(?<=\S[-\/])(?=[A-Za-zÀ-ú*])/)).map(str=>({str}))})})})})};},PFX);
    if(opts.trace) await pg.addInitScript(()=>{ window._saves=[]; const t=setInterval(()=>{ if(typeof window.renderProcesso2==='function' && typeof window.saveToSheets==='function' && !window.saveToSheets._tr){ const o=window.saveToSheets; const w=function(){ window._saves.push((new Error().stack||'').split('\n').slice(2,7).map(x=>x.trim().replace(/file:.*\//,'')).join(' < ')); return o.apply(this,arguments); }; w._tr=1; window.saveToSheets=w; clearInterval(t);} },20); });
    await pg.goto(opts.oficial?'file://'+require('path').resolve(__dirname,'../../index.html'):'file://'+require('path').resolve(__dirname,'../../teste/index.html'));
    await pg.waitForTimeout(opts.wait||16000);
    await pg.evaluate(()=>{ window.uiPrompt=async(m,def)=>def; window.uiConfirm=async()=>true; window.uiAlert=async()=>{}; });
    return {b,pg,errs};
  }
  return {open,add,fld,pdf,png,D,writes,log,store,ids:H_ids};
}
module.exports={mk,FOLDER};
