// v92: nota fiscal (PDF + XML) vai para o pagamento que já está no extrato de caixa — PDF no botão NF-e, XML no botão XML
// 1) PDF + XML da mesma nota juntos; acham o pagamento já lançado (empresa do pagamento citada na nota) — não cria linha
// 2) parecido só no valor e data (outra empresa) = "confira"; nota sem pagamento vira despesa do mês; o PDF que chega depois
//    acha a linha pela chave; o comprovante que chega depois liga na mesma linha
// 3) botão XML em todas as linhas: "+ XML" escolhe da Caixa de Entrada; custo de processo abre o XML do processo;
//    o botão NF-e mostra as notas antigas (docs.nota)
// 4) leitura do PDF da NFS-e nacional (DANFSe v2) — usa dados/fixtures/nfse_danfse_v2.txt (fora do GitHub)
// Todos os nomes, CNPJs e valores deste arquivo são inventados.
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)},400000);
const fs=require('fs'); const {mk}=require('./h.js');
const store=JSON.parse(fs.readFileSync(__dirname+'/dados/store.json','utf8')); const H=mk(store);
const REAL=fs.existsSync(__dirname+'/dados/fixtures/nfse_danfse_v2.txt')?fs.readFileSync(__dirname+'/dados/fixtures/nfse_danfse_v2.txt','utf8'):'';
// CNPJ inventado com dígitos verificadores certos
const cnpj=b=>{ const dv=(s,p)=>{ const t=[...s].reduce((a,x,i)=>a+(+x)*p[i],0)%11; return t<2?0:11-t; };
  const p1=[5,4,3,2,9,8,7,6,5,4,3,2], p2=[6,5,4,3,2,9,8,7,6,5,4,3,2]; const d1=dv(b,p1); return b+d1+dv(b+d1,p2); };
const fmtC=c=>c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
const brl=v=>v.toFixed(2).replace('.',',');
// chave de 50 dígitos da NFS-e nacional: município(7) + amb(1) + tipo(1) + CNPJ(14) + número(13) + AAMM(4) + código(9) + DV(1)
const chave50=(c,n)=>'4205407'+'2'+'2'+c+String(n).padStart(13,'0')+'2610'+'987654321'+'7';
const nota=(o)=>({ ...o, cnpj:cnpj(o.base), chave:chave50(cnpj(o.base),o.num) });
const A=nota({base:'112223330001',num:1234,nome:'SOFT TESTE TECNOLOGIA E SISTEMAS LTDA',email:'contato@testeplus.com.br',desc:'TestePlus Plano Basico - Mensalidade do sistema',valor:99.9}),
      B=nota({base:'114447770001',num:58,nome:'OUTRA EMPRESA SERVICOS LTDA',email:'fin@outraemp.com.br',desc:'Manutencao de equipamentos',valor:250}),
      C=nota({base:'223334440001',num:901,nome:'TERCEIRA CONSULTORIA LTDA',email:'nf@terceiracons.com.br',desc:'Consultoria tributaria mensal',valor:500}),
      D=nota({base:'335556660001',num:77,nome:'QUARTA LIMPEZA LTDA',email:'adm@quartalimp.com.br',desc:'Limpeza de escritorio',valor:77});
const xml=n=>`<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infNFSe Id="NFS${n.chave}"><xLocEmi>CIDADE TESTE</xLocEmi><nNFSe>${n.num}</nNFSe><dhProc>2026-10-16T09:54:57-03:00</dhProc>`+
  `<emit><CNPJ>${n.cnpj}</CNPJ><xNome>${n.nome}</xNome><enderNac><xLgr>RUA TESTE</xLgr><nro>100</nro></enderNac><email>${n.email}</email></emit><valores><vLiq>${n.valor.toFixed(2)}</vLiq></valores>`+
  `<DPS><infDPS><dhEmi>2026-10-16T09:54:51-03:00</dhEmi><prest><CNPJ>${n.cnpj}</CNPJ></prest><toma><CNPJ>${cnpj('998887770001')}</CNPJ><xNome>EMPRESA TOMADORA TESTE LTDA</xNome></toma>`+
  `<serv><cServ><xDescServ>${n.desc}</xDescServ></cServ></serv><valores><vServPrest><vServ>${n.valor.toFixed(2)}</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`;
const danfse=n=>`CHAVE DE ACESSO DA NFS-E ${n.chave} NÚMERO DA NFS-E COMPETÊNCIA DA NFS-E DATA E HORA DA EMISSÃO DA NFS-E ${n.num} 16/10/2026 16/10/2026 09:54:57 NÚMERO DA DPS SÉRIE DA DPS DATA E HORA DA EMISSÃO DA DPS 000000000000111 3 16/10/2026 09:54:51 EMITENTE DA NFS-E SITUAÇÃO DA NFS-E FINALIDADE Prestador NFS-e Gerada NFS-e regular\n\n`+
  `PRESTADOR / FORNECEDOR CNPJ / CPF / NIF INDICADOR MUNICIPAL (INSCRIÇÃO) TELEFONE ${fmtC(n.cnpj)} 000000000 (00) 90000-0000 NOME / NOME EMPRESARIAL MUNICÍPIO / SIGLA UF CÓDIGO IBGE / CEP ${n.nome} CIDADE TESTE / SC 4205407 / 88000-000 ENDEREÇO E-MAIL RUA TESTE, 100, CENTRO ${n.email} SIMPLES NACIONAL NA DATA DE COMPETÊNCIA REGIME DE APURAÇÃO TRIBUTÁRIA PELO SN Não Optante -\n\n`+
  `TOMADOR / ADQUIRENTE CNPJ / CPF / NIF INDICADOR MUNICIPAL (INSCRIÇÃO) TELEFONE ${fmtC(cnpj('998887770001'))} Não Informado 0000000000 NOME / NOME EMPRESARIAL MUNICÍPIO / SIGLA UF CÓDIGO IBGE / CEP EMPRESA TOMADORA TESTE LTDA CIDADE TESTE / SC 4205407 / 88000-000 ENDEREÇO E-MAIL RUA TESTE, 200, CENTRO tomador@teste.com.br\n\n`+
  `SERVIÇO PRESTADO CÓDIGO DE TRIBUTAÇÃO NACIONAL / MUNICIPAL CÓDIGO DA NBS LOCAL DA PRESTAÇÃO / SIGLA UF / PAÍS 000000 / 0000 000000000 CIDADE TESTE / SC / BRASIL Serviço. DESCRIÇÃO DO SERVIÇO ${n.desc}\n\n`+
  `VALOR TOTAL DA NFS-E VALOR DA OPERAÇÃO / SERVIÇO DESCONTO INCONDICIONADO DESCONTO CONDICIONADO R$ ${brl(n.valor)} R$ 0,00 R$ - TOTAL DAS RETENÇÕES (ISSQN / FEDERAIS) VALOR LÍQUIDO DA NFS-E TOTAL DO IBS / CBS R$ 0,00 R$ ${brl(n.valor)} R$ 0,00 VALOR LÍQUIDO DA NFS-E + IBS/CBS R$ ${brl(n.valor)}\n\n`+
  `${n.num} / ${n.chave}\n\nDANFSe v2.0 Documento Auxiliar da NFS-e\n`;
const linha=(o)=>Object.assign({tipo:'Despesa',vinculo:'avulso',vinculoId:'ADM',status:'Pago',observacao:'',docs:{}},o);
(async()=>{
 const R={}; const {b,pg,errs}=await H.open({wait:20000});
 const ent=await pg.evaluate(async()=>await getTesteFolder(ENTRADA_FOLDER));
 await pg.evaluate(()=>{ window.__PDFRAW=true; window.__abertos=[]; window.open=(u)=>{ window.__abertos.push(u); return null; }; });
 // ── rodada 1: pagamento já lançado (pelo comprovante do banco) + PDF e XML da nota ──
 await pg.evaluate(([l1,l2])=>{ S.lancamentos.unshift(l1,l2);
   S.fornecedores=(S.fornecedores||[]).concat([{id:'fTP',nome:'Testeplus',tipo:'Despesas gerais (ADM)',cnpj:''}]); },
   [linha({id:'pagA',data:'16/10/2026',descricao:'Software — TESTEPLUS',valor:99.9,empresa:'TESTEPLUS',categoria:'Software',observacao:'Comprovante: c.png',docs:{comprovante:'https://drive/cA'}}),
    linha({id:'pagB',data:'15/10/2026',descricao:'Combustível — POSTO TESTE',valor:250,empresa:'POSTO TESTE',categoria:'Combustível',docs:{_banco:'kB'}})]);
 H.pdf('NFSe'+A.num+'.pdf',ent,danfse(A)); H.add({name:'NFSe'+A.num+'.xml',mimeType:'text/xml',parents:[ent],body:xml(A)});
 H.pdf('NFSe'+B.num+'.pdf',ent,danfse(B));
 H.add({name:'NFSe'+C.num+'.xml',mimeType:'text/xml',parents:[ent],body:xml(C)});
 await pg.evaluate(()=>{ S.entrada.lido=false; nav('entrada'); });
 await pg.waitForFunction(()=>S.entrada.lido&&!S.entrada.carregando,{timeout:120000}).catch(()=>{});
 const ver=()=>pg.evaluate(()=>S.entrada.itens.map(i=>({nome:i.nome,formato:i.formato,tipo:i.tipo,proc:i.processo,conf:i.confianca,cat:i.categoria,valor:i.info.valor,data:i.info.data,num:i.info.numero,cnpj:i.info.emitCnpj,emit:i.info.emitNome,chave:i.info.chaveNfse||i.info.chave,par:i._parXml92?(S.entrada.itens.find(y=>y.fileId===i._parXml92)||{}).nome:'',linha:i._linha92&&(i._linha92.id+' '+(i._linha92.forte?'forte':'fraca')+' / '+i._linha92.por)})));
 R.itens=await ver();
 R.esperado={A:{cnpj:A.cnpj,chave:A.chave},B:{cnpj:B.cnpj,chave:B.chave},C:{cnpj:C.cnpj,chave:C.chave}};
 R.cartoes=await pg.evaluate(()=>{ const t=renderEntrada().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); return (t.match(/(🔗|🟡)[^.]*\.[^.]*\./g)||[]).map(x=>x.slice(0,170)); });
 const n0=await pg.evaluate(()=>S.lancamentos.length);
 R.anexou=await pg.evaluate(async()=>await confirmarTodosEntrada(false,true));
 R.sobrou=await pg.evaluate(()=>S.entrada.itens.map(i=>i.nome+' ['+i.confianca+']'));
 R.novas=await pg.evaluate(n0=>S.lancamentos.length-n0,n0);
 R.linhaA=await pg.evaluate(()=>{ const l=S.lancamentos.find(x=>x.id==='pagA'); const h=renderLancCard(l); return {nfe:!!l.docs.nfe, xml:!!l.docs.xml, comp:!!l.docs.comprovante, chave:l.docs._nota&&l.docs._nota.chave, cnpj:l.docs._nota&&l.docs._nota.cnpj, obs:l.observacao.replace(/\d{4}-\d{2}_ADM_[^ ]+/g,'<arquivo>'), desc:l.descricao, cat:l.categoria, chipNfe:/✅ 📄 NF-e/.test(h), chipXml:/✅ 📑 XML/.test(h), ordem:h.indexOf('📄 NF-e')<h.indexOf('📑 XML')&&h.indexOf('📑 XML')<h.indexOf('📎 Outros')}; });
 R.cadastro=await pg.evaluate(c=>{ const f=S.fornecedores.find(x=>x.id==='fTP'); const outros=S.fornecedores.filter(x=>x.id!=='fTP'&&String(x.cnpj||'').replace(/\D/g,'')===c).map(x=>x.nome); return {cnpj:f.cnpj, repetido:outros}; },A.cnpj);
 R.regra=await pg.evaluate(()=>(S.banco.regras||[]).filter(r=>r.tipo==='catAdm').map(r=>r.valor+' → '+r.categoria).slice(-3));
 // nota B: parecida só no valor e data (outra empresa) → "confira"; "Não é esse pagamento" → linha nova, a do posto fica sem nota
 R.fraca=await pg.evaluate(async c=>{ const it=S.entrada.itens.find(x=>(x.info.chaveNfse||'')===c); if(!it) return 'não achou o item'; const t0=it.processo; setEntrada(S.entrada.itens.indexOf(it),'processo','__ADM');
   const txt=()=>renderEntrada().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); const a=(txt().match(/🟡 Parece o pagamento[^.]*\.[^.]*\.[^.]*\./)||[''])[0];
   semLinhaNota92(it.fileId); const b=/Você marcou que a nota não é do pagamento parecido/.test(txt()); const n=S.lancamentos.length;
   await confirmarEntrada(S.entrada.itens.indexOf(it)); const pb=S.lancamentos.find(x=>x.id==='pagB'); const nova=S.lancamentos.find(x=>x.docs&&x.docs._nota&&x.docs._nota.chave===c);
   return {procAntes:t0, aviso:a.slice(0,200), marcou:b, mais:S.lancamentos.length-n, posto:{nfe:!!pb.docs.nfe, nota:!!pb.docs._nota}, nova:nova?{desc:nova.descricao, nfe:!!nova.docs.nfe, xml:!!nova.docs.xml}:null}; },B.chave);
 // nota C sem pagamento lançado: escolher "Administrativo" → vira despesa do mês (XML no botão XML, não no NF-e)
 R.semPagamento=await pg.evaluate(async c=>{ const i=S.entrada.itens.findIndex(x=>x.formato==='xml'&&(x.info.chaveNfse||'')===c); if(i<0) return 'não achou o item'; const ant={proc:S.entrada.itens[i].processo}; setEntrada(i,'processo','__ADM'); const t=renderEntrada().replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); const n=S.lancamentos.length; await confirmarEntrada(S.entrada.itens.findIndex(x=>(x.info.chaveNfse||'')===c&&x.formato==='xml')); const l=S.lancamentos.find(x=>x.docs&&x.docs._nota&&x.docs._nota.chave===c); return {antes:ant, aviso:/Nenhum pagamento de R\$ 500,00/.test(t), mais:S.lancamentos.length-n, linha:l?{desc:l.descricao, data:l.data, status:l.status, nfe:!!l.docs.nfe, nota:!!l.docs.nota, xml:!!l.docs.xml}:null}; },C.chave);
 // ── rodada 2: o PDF da nota C chega depois (acha a linha pela chave); depois o comprovante de C ──
 H.pdf('NFSe'+C.num+'.pdf',ent,danfse(C));
 await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
 R.itens2=await ver();
 R.pdfDepois=await pg.evaluate(async c=>{ const n=S.lancamentos.length; const i=S.entrada.itens.findIndex(x=>(x.info.chaveNfse||'')===c); if(i<0) return 'não achou o item'; await confirmarEntrada(i); const l=S.lancamentos.find(x=>x.docs&&x.docs._nota&&x.docs._nota.chave===c); return {mais:S.lancamentos.length-n, nfe:!!l.docs.nfe, xml:!!l.docs.xml}; },C.chave);
 H.png('ADM - Comprovante terceira.png',ent,`Comprovante de pagamento\nPix\n\nvalor\nR$ ${brl(C.valor)}\n\ndata do pagamento\n16/10/2026\n\nrecebedor\nnome\n${C.nome}\nCNPJ\n${fmtC(C.cnpj)}\n\npagador\nnome\nEMPRESA TOMADORA TESTE LTDA\n\nID da transação\nE000TESTE92TESTE92TESTE92\n`);
 await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
 R.itens3=await ver();
 R.compDepois=await pg.evaluate(async c=>{ const n=S.lancamentos.length; const i=S.entrada.itens.findIndex(x=>/terceira/i.test(x.nome)); if(i<0) return 'não achou o item'; await confirmarEntrada(i); const l=S.lancamentos.find(x=>x.docs&&x.docs._nota&&x.docs._nota.chave===c); return {mais:S.lancamentos.length-n, comp:!!l.docs.comprovante, status:l.status, obs:l.observacao.replace(/\d{4}-\d{2}_ADM_[^ ]+/g,'<arquivo>')}; },C.chave);
 // ── rodada 3: "+ XML" pela linha do extrato (escolhe da Caixa de Entrada; o PDF da mesma nota vai junto) ──
 await pg.evaluate(l=>{ S.lancamentos.unshift(l); }, linha({id:'manualX',data:'14/10/2026',descricao:'Despesas administrativas — pagamento sem nota',valor:77,empresa:'',categoria:'Despesas administrativas',observacao:''}));
 H.pdf('NFSe'+D.num+'.pdf',ent,danfse(D)); H.add({name:'NFSe'+D.num+'.xml',mimeType:'text/xml',parents:[ent],body:xml(D)});
 await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
 R.chipVazio=await pg.evaluate(()=>{ const h=renderLancCard(S.lancamentos.find(x=>x.id==='manualX')); return /\+ 📑 XML/.test(h)&&/abrirXmlLanc92\('manualX'\)/.test(h); });
 R.escolherXml=await pg.evaluate(async()=>{ await abrirXmlLanc92('manualX'); const m=document.getElementById('xml92-modal'); const t=m?m.textContent.replace(/\s+/g,' '):'';
   const it=S.entrada.itens.find(x=>x.formato==='xml'&&Math.abs(x.info.valor-77)<0.01); const n=S.lancamentos.length; await anexarXmlNaLinha92('manualX',it.fileId); const l=S.lancamentos.find(x=>x.id==='manualX'); const h=renderLancCard(l);
   return {lista:(t.match(/Anexar nesta linha/g)||[]).length, mesmoValor:/mesmo valor/.test(t), mais:S.lancamentos.length-n, xml:!!l.docs.xml, nfe:!!l.docs.nfe, chave:!!(l.docs._nota&&l.docs._nota.chave), chips:/✅ 📑 XML/.test(h)&&/✅ 📄 NF-e/.test(h), naEntrada:S.entrada.itens.map(x=>x.nome), modalFechou:!document.getElementById('xml92-modal')}; });
 R.abrirXml=await pg.evaluate(async()=>{ window.__abertos=[]; await abrirXmlLanc92('manualX'); return window.__abertos.length===1; });
 // ── rodada 4: nota antiga em docs.nota (botão NF-e) e XML do custo do processo ──
 R.notaAntiga=await pg.evaluate(()=>{ const l={id:'antigaN',data:'01/10/2026',tipo:'Despesa',descricao:'Contabilidade — escritorio teste',valor:10,vinculo:'avulso',vinculoId:'ADM',categoria:'Contabilidade',status:'Pago',observacao:'',docs:{nota:'https://drive/notaAntiga'}}; S.lancamentos.unshift(l);
   const h=renderLancCard(l); window.__abertos=[]; abrirNotaLanc92('antigaN'); return {chip:/✅ 📄 NF-e/.test(h), onclick:/abrirNotaLanc92\('antigaN'\)/.test(h), abriu:window.__abertos[0]==='https://drive/notaAntiga'}; });
 R.processo=await pg.evaluate(()=>{
   const e=buildAllEntries().find(x=>x._computed&&x._sourceProcessoId&&x._sourceField&&x._sourceField!=='cambioReais'); if(!e) return 'sem custo de processo';
   const p=S.processos.find(x=>x.id===e._sourceProcessoId); p.docs=p.docs||{}; p.docs._files=p.docs._files||{};
   const antes=/\+ 📑 XML/.test(renderLancCard(e));
   (p.docs._files.nfe=p.docs._files.nfe||[]).push({id:'xTeste',name:'nota teste.xml',url:'https://drive/xmlProcTeste',formato:'xml',chave:'',campoCusto:e._sourceField});
   const e2=buildAllEntries().find(x=>x.id===e.id); const h=renderLancCard(e2); window.__abertos=[]; abrirXmlLanc92(e2.id);
   p.docs._files.nfe=p.docs._files.nfe.filter(f=>f.id!=='xTeste'); if(!p.docs._files.nfe.length) delete p.docs._files.nfe;
   return {antes, chip:/✅ 📑 XML/.test(h), abriu:window.__abertos[0]==='https://drive/xmlProcTeste'}; });
 R.fixo=await pg.evaluate(()=>{ const e=buildAllEntries().find(x=>x._computed&&!x._sourceProcessoId); return e?/\+ 📑 XML/.test(renderLancCard(e)):'sem custo fixo'; });
 // ── rodada 5: PDF real da NFS-e nacional (DANFSe v2) ──
 if(REAL){
   H.pdf('NFSe real.pdf',ent,REAL);
   await pg.evaluate(()=>{ S.entrada.lido=false; return lerEntrada(); });
   const ch=(REAL.match(/CHAVE DE ACESSO DA NFS-E (\d{50})/)||[])[1];
   R.real=await pg.evaluate(ch=>{ const it=S.entrada.itens.find(x=>x.nome==='NFSe real.pdf'); if(!it) return 'não leu'; const i=it.info;
     // o pagamento da mesma empresa lançado pelo comprovante (nome do pagamento = o do e-mail da nota, como no extrato real)
     const emp=String(i.emitEmail||'').split('@')[1].split('.')[0].toUpperCase();
     S.lancamentos.unshift({id:'pagReal',data:i.data.split('-').reverse().join('/'),tipo:'Despesa',descricao:'Software — '+emp,valor:i.valor,empresa:emp,vinculo:'avulso',vinculoId:'ADM',categoria:'Software',status:'Pago',observacao:'Comprovante: x.png',docs:{comprovante:'https://drive/x'}});
     juntarTudo92(S.entrada.itens);
     return {tipo:it.tipo, chave:i.chaveNfse===ch, cnpj:String(i.emitCnpj||'').replace(/\D/g,'')===ch.slice(9,23), numero:String(Number(i.numero))===String(Number(ch.slice(23,36))), nomeEmpresa:/LTDA$/.test(i.emitNome||'')&&!/MUNIC/.test(i.emitNome||''), email:/@/.test(i.emitEmail||''), valor:Number(i.valor)>0, data:i.data, descricao:!!i.descricao, achaPagamento:!!(it._linha92&&it._linha92.id==='pagReal'&&it._linha92.forte), proc:it.processo}; },ch);
 } else R.real='sem o arquivo dados/fixtures/nfse_danfse_v2.txt';
 await pg.waitForTimeout(3500);
 const EC=store.EXTRATO_CAIXA, hh=EC[0]; R.planilha=EC.slice(1).filter(r=>r&&/"xml"/.test(r[hh.indexOf('docs')]||'')).length;
 R.writesProd=H.writes; R.errs=errs.filter(e=>!/X-Frame|frame-ancestors|ERR_FAILED|404/.test(e)).slice(0,8);
 fs.writeFileSync(__dirname+'/r92.json',JSON.stringify(R,null,1));
 console.log(JSON.stringify(R,null,1));
 await b.close(); process.exit(0); })();
