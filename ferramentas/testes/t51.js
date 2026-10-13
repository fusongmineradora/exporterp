setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},300000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const PU='1Vang8C4wfTpWMJu2TPamhOBZilraniIf'; H.fld(PU,'Processos Unificados'); H.fld('1WPKXkM8NXdJKNF1zk_R76hkqs8B6Do86','00 Entrada - Novos Documentos',PU);
['096','097','098','099','100','101','102','103','104','106','107','108','109','111','112','113','114','115','116','117','118','109S'].forEach(n=>H.fld('P'+n,'FS260'+n+' - x',PU));
(async()=>{ let {b,pg}=await H.open({oficial:true,trace:true}); const s1=await pg.evaluate(()=>window._saves.length); await b.close();
 ({b,pg}=await H.open({oficial:true,trace:true})); console.log('saves load1',s1,'load2',await pg.evaluate(()=>window._saves)); await b.close(); process.exit(0); })();
