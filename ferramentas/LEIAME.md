# Ferramentas do Fu Song ERP

Tudo o que é preciso para montar, testar e publicar o sistema. Fica só na branch `fase1-totais-unificados` (não vai para o site).
O guia completo do projeto (decisões, regras de negócio, histórico) está no projeto "ERP" do Claude: `claude/guia-do-projeto.md` e `claude/estado-do-erp.md`.

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `base_producao.html` | Base da página (o index.html original do sistema). Nunca editar o `teste/index.html` à mão: ele é gerado a partir daqui. |
| `patch_teste.py` | Gera `teste/index.html` a partir da base: isola o teste (planilha TESTE 4, chaves `teste:` no navegador, bloqueio de gravação na planilha oficial), adiciona a faixa laranja e carrega os módulos. |
| `patch_oficial.py` | Gera a versão oficial na raiz do site a partir do teste já gerado (copia `teste/*.js` para a raiz trocando `teste:` por `oficial:`, põe o `ERP_ENV` oficial, tira a faixa, carimba as versões dos scripts). |
| `testes/h.js` | Simulador: abre o sistema no Chromium (Playwright) com planilha e Drive falsos em memória e um pdf.js falso. Registra tudo o que seria gravado. Acusa qualquer tentativa de mexer na planilha de produção antiga. |
| `testes/t*.js` | Testes (ver abaixo). |
| `testes/dados/` | Dados locais para os testes (**não vão para o GitHub**: o repositório é público). |

## Montar
```bash
# na raiz do repositório
python3 ferramentas/patch_teste.py ferramentas/base_producao.html teste/index.html   # gera o /teste
python3 ferramentas/patch_oficial.py .                                               # gera o oficial (raiz) — só quando aprovado
```
- Toda mudança de código é feita em `teste/*.js` (módulos: entrada, ofx, financeiro2, acervo, telas, melhorias, docvenda; + docvenda-fontes.js e pdf-lib.min.js).
- A cada versão: subir `VERSAO_TESTE` em `teste/acervo.js` (aparece na faixa / no canto).
- Módulo novo: incluir na lista de scripts do `patch_teste.py` e na lista `mods` + regex do `patch_oficial.py`.

## Testar
Precisa de `testes/dados/store.json` = conteúdo das abas da planilha de testes, no formato `{"PROCESSOS": [[cabeçalho...], [linha...]], "EXTRATO_CAIXA": [...], ...}` (abas: PROCESSOS, EXTRATO_CAIXA, EXTRATO_BANCO, CLIENTES, FORNECEDORES, CUSTOS_FIXOS, CONFIG, REGRAS, DOCUMENTOS, LOG). Para montar: ler cada aba da planilha "Fu Song ERP Database — TESTE 4" (só leitura) pelo conector do Google Sheets, salvar cada resposta como `PASTA/<ABA>.json` e rodar `python3 testes/montar_store.py PASTA` (gera `testes/dados/store.json`).
Para os testes de invoice/contrato: `testes/dados/modelos/` com os 4 modelos em branco (baixar da pasta do Drive "Sistema ERP › Modelos invoice e contrato") com os nomes `f_invb.pdf` (Invoice Buyer), `f_invn.pdf` (Invoice Consignee+Notify), `f_ctn.pdf` (Contrato Consignee+Notify), `n_a.pdf` (Contrato Buyer); e `testes/dados/dv/inv116.txt` / `ct116.txt` (texto da invoice e do contrato do FS260116).
Para `t50`/`t60`: `testes/dados/fixtures/` com textos extraídos de documentos reais (`textos.json`, `due102.txt` etc.; ficam só na máquina, nunca no GitHub).

```bash
cd ferramentas/testes
node t41.js   # estabilidade: abrir e recarregar não pode mudar nada (r41.json → "dif2": {})
node t60.js   # recursos da v67 (cópia de segurança, dividir câmbio, cobrança...)
node t64.js   # leitura de invoice/contrato e conferências
node t70.js   # gerar invoice e contrato, NCM pela NF, versões, releitura do PDF gerado
node t72.js   # envio dos modelos (reconhece qual é qual, recusa preenchido)
node t73.js   # Novo processo + nome interno + pasta renomeada + recarregar
node t79.js   # Caixa de Entrada: 4 CT-es + 4 MDF-es juntos → todos identificados (MDF-e segue o CT-e citado)
node t82.js   # 20 extratos de DU-E reais → todos no processo certo (número, RUC do BL, nota de saída, par 109/109S) + conferências
node t83.js   # DU-E bloqueada → No Porto; fechamento pela nota de saída e saldo do cliente em reais (gerou/usou); aviso de DU-E errada e retificada
node t50.js; node t51.js; node t62.js   # versão OFICIAL (t51: 2ª abertura sem gravações)
```
Resultados esperados (base de 12/10/2026, versão 77):
- `t41`: `r41.json` com `"dif2": {}` e `PROD []` (nada gravado na planilha antiga).
- `t51`: `load2 []` (a segunda abertura não grava nada; a primeira pode gravar as correções de cadastro).
- `t60`/`t62`: `"writes": []` / `"ver":"versão 77"`, sem erros; `t60` com `"cob"` = texto de cobrança (não pode vir "(nenhum)").
- `t70`: invoice FS260116 = USD 28.620, 54.000 kg, NCM 25291000; contrato relido com 2 containers; aviso de NCM 2529.90.00; FS260117 com versões `_v2`.
- `t72`: 2 modelos aceitos, 1 recusado por estar preenchido, 1 recusado por não ser da Fu Song.
- `t82`: `certos: 20`, `anexou: 20`; FS260109S com a segunda DU-E da venda e aviso "O BL cita a DU-E …"; FS260114 com aviso de peso/VMLE trocados (precisa de `dados/store_oficial.json`, `dados/fixtures/dues_lote.json` e `bl_textos.json`).
- `t83`: `anexou: 20`, `mudou2: false`; FS260113 "No Porto" (fase 2) com aviso de embarque bloqueado; FS260107 com valor exportado pela DU-E e antecipação; FS260114 com aviso na Caixa de Entrada e sem aviso depois da DU-E retificada.
- `t79`: os 8 documentos com processo e "alta"; `anexou: 8`; FS260100/104/108/111 com 1 CT-e e 1 MDF-e cada (precisa de `dados/fixtures/cte_mdfe_lote.json`).
- `t73`: FS260119 / embarque 32; armazém 3.200, marítimo 6.500, assessoria 1.200, despachante 550; pasta renomeada com o booking; recarregar mantém tudo.
Versão 78: além dos acima, abrir duas vezes esperando 45 s (para a releitura dos BLs/NFs rodar) — a 2ª abertura não pode gravar nada. Rodar com `WARN=1 node tNN.js` mostra avisos do console (um `ReferenceError` dentro da manutenção não aparece de outro jeito: a rotina para no meio sem quebrar a tela).
Observações do simulador: o pdf.js é falso (devolve os bytes do arquivo como texto — para testar leitura de PDF use arquivos de texto); o CDN (cdnjs) é bloqueado, então o sistema usa o `pdf-lib.min.js` do próprio site; os testes de PDF trocam a rota de upload para guardar os bytes.

Chromium já instalado no ambiente (`PLAYWRIGHT_BROWSERS_PATH`); Playwright e pdf-lib em `/opt/npm-tools/node_modules`.

## Publicar
Sempre por PR a partir da `origin/main` (o site é a `main`, GitHub Pages):
```bash
git checkout -B deploy-teste-NN origin/main
git checkout fase1-totais-unificados -- teste/          # só o teste
# oficial: também index.html acervo.js entrada.js melhorias.js telas.js ofx.js financeiro2.js docvenda.js docvenda-fontes.js pdf-lib.min.js
git commit -m "Deploy teste vNN" && git push -f origin deploy-teste-NN
gh api repos/fusongmineradora/exporterp/pulls --input pr.json      # {"title","head","base":"main","body"}
gh api -X PUT repos/fusongmineradora/exporterp/pulls/N/merge -f merge_method=squash
```
Antes de publicar o oficial: cópia da planilha oficial ("Fu Song ERP Database — backup AAAA-MM-DD (antes da versão NN)").
