setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},200000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
H.add({id:'1JYKfcws3T9839njEjlYAT9v3NKpHNG0G9psK5uF-qf4',name:'Fu Song ERP Database',mimeType:'application/vnd.google-apps.spreadsheet',parents:[]});
H.add({id:'1Vang8C4wfTpWMJu2TPamhOBZilraniIf',name:'Processos Unificados',mimeType:'application/vnd.google-apps.folder',parents:[]});
(async()=>{
 let {b,pg,errs}=await H.open({oficial:true,wait:30000});
 const r=await pg.evaluate(()=>({faixa:!!document.querySelector('#teste-faixa'), btnAtual:/Atualizar teste/.test(renderInicio()), ferr:/Conferir documentos/.test(renderInicio()), ver:(document.getElementById('versao-oficial')||{}).textContent}));
 console.log(JSON.stringify(r), H.log.filter(x=>/COPY|Cópias/.test(x)), errs.filter(e=>!/404|ERR_FAILED|X-Frame|frame-ancestors/.test(e)), H.writes);
 await b.close(); process.exit(0);
})();
