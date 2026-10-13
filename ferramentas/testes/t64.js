setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},200000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
const inv=fs.readFileSync(__dirname+'/dados/dv/inv116.txt','utf8'), ct=fs.readFileSync(__dirname+'/dados/dv/ct116.txt','utf8');
(async()=>{
 let {b,pg,errs}=await H.open();
 const r=await pg.evaluate(([inv,ct])=>{
  const o={};
  const p=S.processos.find(x=>x.id==='FS260116');
  o.antes=[p.qtdContainer,JSON.stringify(p.containers),p.pol,p.pod,p.peso];
  // processo limpo: simula começar com 1 container
  p.qtdContainer='1'; p.containers=['']; delete p.docs._invoice; delete p.docs._contrato; delete p.docs._contratoCont;
  aplicarDocNoProcesso({tipo:'invoice',texto:inv,nome:'FS260116 - Invoice.pdf',info:{}},p,{webViewLink:'https://drive/x1'});
  o.depoisInv=[p.qtdContainer,JSON.stringify(p.containers),p.docs._comprador,p.docs._consignatario,JSON.stringify(p.docs._invoice)];
  aplicarDocNoProcesso({tipo:'contrato',texto:ct,nome:'FS260116 - Sales Contract.pdf',info:{}},p,{webViewLink:'https://drive/x2'});
  o.depoisCt=[p.qtdContainer,p.docs._contratoCont,JSON.stringify(p.docs._contrato)];
  o.div0=divergenciasDocs(p);
  // erros simulados
  p.docs._invoice.linhas[0].total=28000; p.docs._invoice.total=28000; p.docs._contrato.pod='Qingdao, China'; p.docs._invoice.conta={agencia:'1234',conta:'555'}; p.docs._contrato.kg=81000; p.docs._contrato.linhas[0].kg=81000;
  o.div1=divergenciasDocs(p);
  S.sub=p; const h=renderProcesso2(); o.tela=(h.match(/Comprador:[^<]*/)||[''])[0];
  // FS260109 (tem 109S): não mexe nos containers
  const q=S.processos.find(x=>x.id==='FS260109'); const qa=q.qtdContainer; q.docs._invoice={kg:54000,total:1}; o.s109=[ajustarContainersPelosDocs(q),qa,q.qtdContainer, divergenciasVenda(q)];
  return o;
 },[inv,ct]);
 console.log(JSON.stringify(r,null,1));
 console.log(errs.filter(e=>!/404|ERR_FAILED|X-Frame|frame-ancestors/.test(e)));
 await b.close(); process.exit(0);
})();
