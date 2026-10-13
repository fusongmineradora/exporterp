# Gera a versão OFICIAL (raiz do site) a partir da versão de teste já gerada (teste/index.html + teste/*.js)
import sys, os, re, hashlib
repo = sys.argv[1]
T = os.path.join(repo, 'teste'); R = repo
OFICIAL = "window.ERP_ENV={nome:'oficial',sheetId:'1JYKfcws3T9839njEjlYAT9v3NKpHNG0G9psK5uF-qf4',rootFolderId:'1Vang8C4wfTpWMJu2TPamhOBZilraniIf',rootFolderName:'Processos Unificados',entradaId:'1WPKXkM8NXdJKNF1zk_R76hkqs8B6Do86',entradaNome:'00 Entrada - Novos Documentos',sistemaNome:'ERP — pastas do sistema',subpastas:true,geracao:'oficial',flagPasta:'_pastaOficial'};"
mods = ['entrada.js', 'ofx.js', 'financeiro2.js', 'acervo.js', 'telas.js', 'melhorias.js', 'docvenda.js', 'docvenda-fontes.js', 'pdf-lib.min.js']
def conv(s):
    s = s.replace("'teste:", "'oficial:")          # chaves do navegador separadas do teste
    s = s.replace('Entrada de teste', 'Entrada')
    return s
for m in mods:
    s = conv(open(os.path.join(T, m), encoding='utf-8').read())
    assert "'teste:" not in s, m
    open(os.path.join(R, m), 'w', encoding='utf-8').write(s)
h = open(os.path.join(T, 'index.html'), encoding='utf-8').read()
def rep(a, b):
    global h
    assert h.count(a) == 1, (h.count(a), a[:80]); h = h.replace(a, b)
h = re.sub(r"window\.ERP_ENV=\{[^}]*\};", OFICIAL, h, count=1)
assert "nome:'oficial'" in h
h = conv(h)
rep('<meta name="robots" content="noindex,nofollow">\n<title>TESTE · Gestão de Exportação · Fu Song</title>', '<title>Gestão de Exportação · Fu Song</title>')
h = re.sub(r'<div id="teste-faixa"[^>]*>[^<]*</div>', '<div id="versao-oficial" style="position:fixed;right:10px;bottom:6px;z-index:9000;font:500 10px Inter,sans-serif;color:var(--muted);opacity:.7;pointer-events:none"></div>', h, count=1)
assert 'teste-faixa' not in h
# scripts apontam para os arquivos da raiz (com o carimbo do conteúdo)
def v(f): return hashlib.md5(open(os.path.join(R, f), 'rb').read()).hexdigest()[:10]
h = re.sub(r'<script src="(entrada|ofx|financeiro2|acervo|telas|melhorias|docvenda)\.js\?v=[0-9a-f]+"></script>', lambda m: f'<script src="{m.group(1)}.js?v={v(m.group(1)+".js")}"></script>', h)
assert "'teste:" not in h
open(os.path.join(R, 'index.html'), 'w', encoding='utf-8').write(h)
print('oficial ok')
