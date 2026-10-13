setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},200000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
const PASTA='1coJTZiqU85d6gV3zU_buFg2sC_jdx74i'; H.fld(PASTA,'Modelos invoice e contrato');
H.add({name:'Modelo - Invoice - Buyer.pdf',parents:[PASTA],mimeType:'application/pdf',body:'velho'});
(async()=>{
 let {b,pg,errs}=await H.open();
 await pg.route('**/upload/drive/v3/files**', r=>{ const s=r.request().postDataBuffer().toString('utf8'); const meta=JSON.parse(s.match(/\{"name"[\s\S]*?\}(?=\r?\n)/)[0]); const f=H.add({name:meta.name,parents:meta.parents,mimeType:'application/pdf',description:meta.description}); r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:f.id,name:f.name,webViewLink:f.webViewLink})}); });
 const r=await pg.evaluate(async()=>{
   const fs=[new File(['FU SONG inside sales Invoice N° Shipper Buyer:'],'canva1.pdf'), new File(['FU SONG SALES CONTRACT N° Notify: Consignee:'],'canva2.pdf'), new File(['FU SONG Invoice N° FS260117 Buyer: 13.500,00 USD'],'preenchida.pdf'), new File(['outra coisa'],'x.pdf')];
   return await dvEnviarModelos(fs);
 });
 console.log(JSON.stringify(r));
 console.log(Object.values(H.D).filter(f=>f.parents.includes(PASTA)).map(f=>f.name+' | '+(f.description||'').slice(0,70)));
 console.log(errs.filter(e=>!/404|ERR_FAILED|X-Frame|frame-ancestors/.test(e)));
 await b.close(); process.exit(0);
})();
