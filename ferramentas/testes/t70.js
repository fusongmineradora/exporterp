setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},240000);
const fs=require('fs'); const {mk}=require('./h.js'); const {execSync}=require('child_process');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8'));
const H=mk(store);
const PASTA='1coJTZiqU85d6gV3zU_buFg2sC_jdx74i';
H.fld(PASTA,'Modelos invoice e contrato');
const M=__dirname+'/dados/modelos/';
const tpl={ 'Modelo - Invoice - Buyer.pdf':'f_invb.pdf','Modelo - Invoice - Consignee e Notify.pdf':'f_invn.pdf','Modelo - Sales Contract - Consignee e Notify.pdf':'f_ctn.pdf','Modelo - Sales Contract - Buyer.pdf':'n_a.pdf'};
for(const [n,f] of Object.entries(tpl)) H.add({name:n,parents:[PASTA],mimeType:'application/pdf',bodyBuf:fs.readFileSync(M+f)});
(async()=>{
 let {b,pg,errs}=await H.open();
 const lib=fs.readFileSync('/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js');
 await pg.route('**/NAO-USAR/**', r=>r.fulfill({status:200,contentType:'text/javascript',body:lib}));
 await pg.route('**/upload/drive/v3/files**', r=>{
   const buf=r.request().postDataBuffer(); const s=buf.toString('latin1');
   const meta=JSON.parse(s.match(/\{"name"[\s\S]*?\}(?=\r?\n)/)[0]);
   const i=s.indexOf('%PDF'), j=s.lastIndexOf('%%EOF'); const body=buf.slice(i, j+5);
   const f=H.add({name:meta.name,parents:meta.parents,mimeType:'application/pdf',bodyBuf:body,description:meta.description,md5Checksum:'m'+Math.random().toString(36).slice(2,8)});
   H.log.push('UPLOAD '+meta.name+' '+body.length);
   r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:f.id,name:f.name,webViewLink:f.webViewLink,md5Checksum:f.md5Checksum})});
 });
 const r1=await pg.evaluate(async()=>{
  const o={};
  const p=S.processos.find(x=>x.id==='FS260116'); delete p.docs._gerado;
  S.sub=p; o.botao=/Gerar invoice e contrato/.test(renderProcesso2());
  gerarDocVendaUI('FS260116');
  await new Promise(r=>setTimeout(r,500));
  const f=_dvForm; o.padrao={comprador:f.comprador,notifyOn:f.notifyOn,cons:f.consignatario,notify:f.notify,kg:f.kg,preco:f.preco,ncm:f.ncm,fonte:f.ncmFonte,pol:f.pol,pod:f.pod,n:f.containers,produto:f.produto};
  o.modelos=document.getElementById('dv-modelos').textContent.slice(0,90);
  o.prob=dvProblemas(f);
  // muda containers e confere peso automático
  const ic=document.querySelector('[data-dv="containers"]'); ic.value='3'; ic.dispatchEvent(new Event('input'));
  o.kg3=[f.kg, document.querySelector('[data-dv="kg"]').value, document.getElementById('dv-total').textContent];
  ic.value='2'; ic.dispatchEvent(new Event('input'));
  f.data='2026-09-27';
  await dvExecutar(true);
  o.depois={g:p.docs._gerado, inv:p.docs._files.invoice.slice(-1)[0], ct:p.docs._files.contrato.slice(-1)[0], cambio:p.cambioInvoice, peso:p.peso, ncm:p.ncm, comp:p.docs._comprador, cons:p.docs._consignatario, invoice:p.docs._invoice, contrato:p.docs._contrato, cont:p.docs._contratoCont};
  o.div=divergenciasDocs(p);
  o.tela=(renderProcesso2().match(/Gerados pelo ERP:[^<]*/)||[''])[0];
  // NF do fornecedor com NCM diferente
  aplicarDocNoProcesso({tipo:'nfe',nome:'nf47.pdf',info:{ncm:'25299000',numero:'47',emitNome:'AWM MINERACAO LTDA',emitCnpj:'47170772000135',data:'2026-09-20'}},p,{webViewLink:'https://drive/nf'});
  o.ncmNF=p.docs._ncmNF; o.aviso=dvAvisoNcm(p);
  o.telaAviso=(renderProcesso2().match(/A NF 47[\s\S]{0,260}/)||[''])[0].replace(/<[^>]+>/g,'').replace(/\s+/g,' ');
  // o formulário de nova versão já vem com o NCM da NF
  gerarDocVendaUI('FS260116','25299000'); o.novaVersaoNcm=[_dvForm.ncm,_dvForm.ncmFonte]; _uiCloseModal();
  dvManterNcm('FS260116'); o.avisoDepoisManter=dvAvisoNcm(p);
  // sugestão para outro processo com o mesmo produto
  const q=S.processos.find(x=>x.id==='FS260117'); q.produto=p.produto; o.sug117=dvNcmSugerido(q);
  // FS260117: Buyer, 0,50
  delete q.docs._gerado; gerarDocVendaUI('FS260117'); await new Promise(r=>setTimeout(r,300));
  const g=_dvForm; o.p117={comprador:g.comprador,notifyOn:g.notifyOn,kg:g.kg,preco:g.preco};
  g.preco='0,50'; g.data='2026-09-27'; g.produto='lithium oxide above 4%'; g.ncm='25291000';
  await dvExecutar(true);
  gerarDocVendaUI('FS260117'); await new Promise(r=>setTimeout(r,300)); o.v2form=[_dvForm.preco,_dvForm.notifyOn, document.querySelector('.modal').textContent.match(/Já existe a versão \d/)?.[0]];
  await dvExecutar(true);
  o.q={g:q.docs._gerado.versao, nomes:q.docs._files.invoice.map(x=>[x.name,x.substituido||'']), cambio:q.cambioInvoice, url:q.docs.invoice};
  o.tipo=[dvTipoDoModelo('FU SONG Invoice N° inside sales Shipper Buyer:'),dvTipoDoModelo('SALES CONTRACT N° FU SONG Notify: Consignee:'),dvTipoDoModelo('FU SONG Invoice N° FS260116 Buyer:'),dvTipoDoModelo('qualquer coisa')];
  return o;
 });
 console.log(JSON.stringify(r1,null,1));
 // PDFs enviados
 const ups=Object.values(H.D).filter(f=>/^FS2601\d\d_(Invoice|Sales-Contract)/.test(f.name));
 ups.forEach(f=>{fs.writeFileSync(''+__dirname+'/dados/saida/up_'+f.name,f.bodyBuf);});
 console.log(ups.map(f=>f.name+' '+f.bodyBuf.length+' pasta '+f.parents));
 // ida e volta: o leitor de invoice do ERP entende o PDF gerado?
 const dir=''+__dirname+'/dados/saida/';
 const txt=execSync(`pdftotext -raw ${dir}up_FS260116_Invoice.pdf -`).toString(), txc=execSync(`pdftotext -raw ${dir}up_FS260116_Sales-Contract.pdf -`).toString();
 const r2=await pg.evaluate(([a,c])=>{ const x=lerDocVenda(a), y=lerDocVenda(c); return {inv:[x.numero,x.totalUsd,x.qtdKg,x.ncm,x.pol,x.pod,x.comprador,x.consignatario,JSON.stringify(x.contaBanco)], ct:[y.numero,y.totalUsd,y.qtdContainer,y.comprador,y.consignatario]}; },[txt,txc]);
 console.log(JSON.stringify(r2));
 console.log(H.writes); console.log(errs.filter(e=>!/404|ERR_FAILED|X-Frame|frame-ancestors/.test(e)));
 await b.close(); process.exit(0);
})();
