import sys
import re,sys
src,dst=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    n=s.count(old); assert n==count,(n,old[:90]); s=s.replace(old,new)
# 1. Chaves de armazenamento do navegador isoladas da produção (mesmo domínio!)
n=0
for k in ['erp-user','erp-gtoken','drive-consented','erp-local-backup','erp-theme','fab-pos']:
    s,c=re.subn(r"(Storage\.(?:getItem|setItem|removeItem)\(')"+re.escape(k)+"'", r"\1teste:"+k+"'", s); n+=c
print('storage keys renamed',n)
assert "Storage.getItem('erp-" not in s and "Storage.setItem('erp-" not in s
# 2. Planilha: nunca a de produção
rep("const SHEET_ID = '1-Or9ewLhLkunUHP8GgOw9rZWd2k2bhMS8_93Ie1znXY';",
"""// AMBIENTE DE TESTES: a planilha de produção só é LIDA uma vez, para fazer a cópia de testes.
const PROD_SHEET_ID = '1-Or9ewLhLkunUHP8GgOw9rZWd2k2bhMS8_93Ie1znXY';
const TESTE_SENTINEL = '__PLANILHA_TESTE__';
let SHEET_ID = TESTE_SENTINEL;  // definido por ensureTestSheet() (teste/entrada.js)""")
rep("""async function sheetsAPI(method, endpoint, body=null, _retry=false) {
  const token = await getAccessToken();""","""async function sheetsAPI(method, endpoint, body=null, _retry=false) {
  if (SHEET_ID === TESTE_SENTINEL || String(endpoint).includes(TESTE_SENTINEL)) {
    await ensureTestSheet();
    endpoint = String(endpoint).split(TESTE_SENTINEL).join(SHEET_ID);
  }
  if (String(endpoint).includes(PROD_SHEET_ID)) throw new Error('Bloqueado: o ambiente de testes não grava na planilha de produção.');
  if (window.ERP_ENV && ERP_ENV.nome === 'teste' && method !== 'GET' && String(endpoint).includes('1JYKfcws3T9839njEjlYAT9v3NKpHNG0G9psK5uF-qf4')) throw new Error('Bloqueado: o ambiente de testes não grava na planilha oficial.');
  const token = await getAccessToken();""")
rep("""async function saveConfig(key, value) {
  try {
    const token = await getAccessToken();""","""async function saveConfig(key, value) {
  try {
    await ensureTestSheet();
    const token = await getAccessToken();""")
rep("async function loadFromSheets() {","async function _loadFromSheetsBase() {")
# 3. Drive: pasta raiz separada
rep("const ROOT_FOLDER_NAME = 'Fu Song ERP';","const ROOT_FOLDER_NAME = (window.ERP_ENV && ERP_ENV.rootFolderName) || 'Fu Song ERP — TESTE 3';")
rep("""      p.docs._folderId = folderId;
      p.docs._folderUrl = folderUrl;""","""      p.docs._folderId = folderId;
      p.docs._folderUrl = folderUrl;
      p.docs[(window.ERP_ENV && ERP_ENV.flagPasta) || '_testeOk'] = true;""")
# 4. Título, CSP (worker do leitor de PDF) e faixa de aviso
rep("<title>Gestão de Exportação · Fu Song</title>","<meta name=\"robots\" content=\"noindex,nofollow\">\n<title>TESTE · Gestão de Exportação · Fu Song</title>")
rep("worker-src blob:;","worker-src blob: https://cdnjs.cloudflare.com;")
rep('#main{flex:1;padding:28px 24px;overflow-y:auto;max-width:100%;}','#main{flex:1;padding:28px 24px 64px;overflow-y:auto;max-width:100%;}')
rep('#main{padding:64px 10px 16px;margin-left:56px;}','#main{padding:64px 10px 64px;margin-left:56px;}')
rep('#main{padding:60px 8px 12px;margin-left:52px;}','#main{padding:60px 8px 64px;margin-left:52px;}')
rep('<div id="main" style="display:none"></div>','<div id="teste-faixa" style="position:fixed;left:0;right:0;bottom:0;z-index:9000;background:#B45309;color:#fff;font:600 12px Inter,sans-serif;text-align:center;padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px))">AMBIENTE DE TESTES · planilha e pastas próprias · a produção não é alterada</div>\n<div id="main" style="display:none"></div>')
# 5. Menu: Caixa de Entrada
rep("""  <button class="nav-btn" onclick="nav('rastreamento')" id="nav-rastreamento">""","""  <button class="nav-btn" onclick="nav('entrada')" id="nav-entrada"><span class="nav-icon">📥</span><span>Caixa de Entrada</span></button>
  <button class="nav-btn" onclick="nav('rastreamento')" id="nav-rastreamento">""")
rep("relatorios:renderRelatorios};","relatorios:renderRelatorios,entrada:()=>renderEntrada(),conciliacao:()=>renderConciliacao(),resultados:()=>renderResultados(),inicio:()=>renderInicio()};  // módulos 2.0 carregam depois\n  pages.processos=()=>(S.sub&&!S.editMode&&!S.createMode&&!S._detalheAntigo&&typeof renderProcesso2==='function')?renderProcesso2():renderProcessos();\n  pages.rastreamento=()=>typeof renderRastreio2==='function'?renderRastreio2():renderRastreamento();")
rep("""  <button class="nav-btn" onclick="nav('custos')" id="nav-custos">""","""  <button class="nav-btn" onclick="nav('conciliacao')" id="nav-conciliacao"><span class="nav-icon">🏦</span><span>Conciliação</span></button>
  <button class="nav-btn" onclick="nav('resultados')" id="nav-resultados"><span class="nav-icon">🤝</span><span>Clientes & Resultado</span></button>
  <button class="nav-btn" onclick="nav('custos')" id="nav-custos">""")
# 6. Documentos do processo: vários arquivos por botão, CT-e, MDF-e, comprovantes de pagamento
rep("['pesagem','⚖️ Pesagem'],['outros','📁 Outros Documentos']];","['pesagem','⚖️ Pesagem'],['cte','🚛 CT-e (frete)'],['mdfe','🗺️ MDF-e'],['nfse','🧾 NFS-e (serviço)'],['recibo','✍️ Recibo / RPA'],['faturaFrete','🚢 Fatura de frete (agente)'],['pagamento','💳 Comprovantes de Pagamento'],['outros','📁 Outros Documentos']];")
rep("""          <div class="doc-chip ${p.docs&&p.docs[k]?'has-doc':''}" onclick="abrirUploadDoc('${p.id}','${k}','${l}')">
            ${p.docs&&p.docs[k]?'✅':'📎'} ${l}
          </div>""","""          <div class="doc-chip ${p.docs&&p.docs[k]?'has-doc':''}" onclick="abrirUploadDoc('${p.id}','${k}','${l}')">
            ${p.docs&&p.docs[k]?'✅':'📎'} ${l}${docCount(p,k)>1?` <span style="font-weight:700">(${docCount(p,k)})</span>`:''}
          </div>""")
rep("""          placeholder="https://drive.google.com/file/d/..."/>
      </div>

      ${currentUrl ? `<div style="margin-top:8px">""","""          placeholder="https://drive.google.com/file/d/..."/>
      </div>

      ${docFilesHtml(p, docKey)}
      ${currentUrl ? `<div style="margin-top:8px">""")
# 7. Script do módulo de testes
# Teste começa vazio: planilha sem linhas = sistema sem processos (sem dados de exemplo)
rep("    if (proc.length > 0) S.processos = proc;\n    if (cli.length > 0) S.clientes = cli;\n    if (forn.length > 0) S.fornecedores = forn;\n    if (lanc.length > 0) S.lancamentos = lanc;\n    if (fixos.length > 0) S.custosMensais = fixos;",
    "    S.processos = proc; S.clientes = cli; S.fornecedores = forn; S.lancamentos = lanc; S.custosMensais = fixos;")
rep("<head>","<head>\n<script>window.ERP_ENV={nome:'teste',sheetId:'1b9jBP8PUceHUYymYCIbKXTl9GRBEJAfAZgUTTwsor_I',sheetName:'Fu Song ERP Database — TESTE 4',geracao:'4',flagPasta:'_pastaTeste4',rootFolderName:'Fu Song ERP — TESTE 4'};</script>\n<meta http-equiv=\"Cache-Control\" content=\"no-cache, no-store, must-revalidate\">\n<meta http-equiv=\"Pragma\" content=\"no-cache\">\n<meta http-equiv=\"Expires\" content=\"0\">")
# Lista de processos: nome igual ao da pasta (FS - Booking - Cliente - Produto - Destino)
rep("""<div class="proc-id">${p.id} <span style="color:var(--muted);font-weight:400;font-size:11px">· ${p.produto} · Embarque ${p.embarque}</span></div>""",
    """<div class="proc-id">${p.id} <span style="color:var(--muted2);font-weight:500;font-size:12px">${escHtml(typeof restoNomeProcesso==='function'?restoNomeProcesso(p):'· '+p.produto)}</span></div>""")
# Câmbio e Dashboard: processo cancelado fora da lista; nome do processo como o da pasta
rep("""  const ps  = S.processos;\n""","""  const ps  = S.processos.filter(p=>p.status!=='Cancelado');\n""")
rep("""<div class="kpi-val" style="color:var(--accent)">${ps.length}</div>""","""<div class="kpi-val" style="color:var(--accent)">${ps.filter(p=>p.status!=='Cancelado').length}</div>""")
rep("""<div class="card-title-left">💱 ${escHtml(p.id)} — <span style="font-weight:400;color:var(--muted2)">${escHtml(nomeCliente)}</span></div>""",
    """<div class="card-title-left">💱 ${escHtml(p.id)} <span style="font-weight:400;color:var(--muted2)">${escHtml(typeof restoNomeProcesso==='function'?restoNomeProcesso(p):'— '+nomeCliente)}</span></div>""")
# Telas novas: Início no lugar do Dashboard; dólar do Banco Central (PTAX)
rep("""<button class="nav-btn active" onclick="nav('dashboard')" id="nav-dashboard"><span class="nav-icon">📊</span><span>Dashboard</span></button>""","""<button class="nav-btn active" onclick="nav('inicio')" id="nav-inicio"><span class="nav-icon">🏠</span><span>Início</span></button>""")
rep('onclick="nav(\'dashboard\')" style="cursor:pointer"','onclick="nav(\'inicio\')" style="cursor:pointer"')
rep("https://drive.googleapis.com https://www.googleapis.com/upload","https://drive.googleapis.com https://www.googleapis.com/upload https://olinda.bcb.gov.br")
# Gravar: limpa só as linhas que sobram (antes limpava a aba inteira e, se a escrita falhasse, a planilha ficava vazia)
rep("const clearRanges = data.map(({sheet}) => `${sheet}!A1:ZZ10000`);","const clearRanges = data.map(({sheet, items}) => `${sheet}!A${(items||[]).length + 2}:ZZ10000`);")
# Taxa de câmbio sempre com 4 casas (antes a carga recalculava com 15 casas e a planilha era regravada a cada abertura)
rep("""  if (rec <= 0) return 0;
  return r / rec;
};""","""  if (rec <= 0) return 0;
  return Math.round(r / rec * 10000) / 10000;
};""")
# Processo novo pelo formulário: custos começam zerados (antes copiava os custos do último processo como "Em Aberto"); os previstos entram sozinhos
rep("const dc = (k) => isEdit ? (p?.[k]||0) : (lastP[k]||0);","const dc = (k) => isEdit ? (p?.[k]||0) : 0;")
# gravação diz se deu certo (o backup local do navegador só vale enquanto a planilha não tiver sido gravada depois dele)
rep("""    showToast('✅ Dados salvos no Google Sheets');
  } catch(e) {
    hideSyncIndicator();
    showToast('⚠️ Erro ao salvar: ' + e.message);
  }
}""","""    showToast('✅ Dados salvos no Google Sheets');
    return true;
  } catch(e) {
    hideSyncIndicator();
    showToast('⚠️ Erro ao salvar: ' + e.message);
    return false;
  }
}""")

# Cadastro: tipo "Despesas gerais (ADM)" (despesas mensais da empresa, fora dos processos) — 12/10/2026
rep("const tipos = ['clientes','fornecedores','transportadoras','despachantes','agentes','armazens','servicos'];","const tipos = ['clientes','fornecedores','transportadoras','despachantes','agentes','armazens','servicos','adm'];")
rep("    'servicos':'🔧 Serviços de Terceiros'\n","    'servicos':'🔧 Serviços de Terceiros',\n    'adm':'🏢 Despesas gerais (ADM)'\n")
rep("    'servicos':'Serviço de Terceiros'\n","    'servicos':'Serviço de Terceiros',\n    'adm':'Despesas gerais (ADM)'\n")
rep("armazens:'Armazém',servicos:'Serviço de Terceiros'};","armazens:'Armazém',servicos:'Serviço de Terceiros',adm:'Despesas gerais (ADM)'};")
rep("'Armazém':'🏭','Serviço de Terceiros':'🔧'}[tipo]","'Armazém':'🏭','Serviço de Terceiros':'🔧','Despesas gerais (ADM)':'🏢'}[tipo]")
import hashlib as _h, os as _os
_dir=_os.path.dirname(_os.path.abspath(sys.argv[2]))
def _v(f):
    return _h.md5(open(_os.path.join(_dir,f),'rb').read()).hexdigest()[:10]
rep("</body>","".join(f'<script src="{f}?v={_v(f)}"></script>\n' for f in ['entrada.js','ofx.js','financeiro2.js','acervo.js','telas.js','melhorias.js','docvenda.js'])+"</body>")
open(dst,'w',encoding='utf-8').write(s); print('ok')
