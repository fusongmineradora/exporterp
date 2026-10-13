#!/usr/bin/env python3
"""Monta dados/store.json (planilha em memória do simulador) a partir das abas lidas da planilha.

Uso: python3 montar_store.py PASTA_COM_ABAS [saida.json]
  PASTA_COM_ABAS tem um arquivo por aba, com o nome da aba: PROCESSOS.json, EXTRATO_CAIXA.json, ...
  Cada arquivo pode ser a resposta do conector do Google Sheets ({"range": ..., "values": [[...], ...]})
  ou só a lista de linhas ([[cabeçalho...], [linha...], ...]). Linha 1 = cabeçalho.
Abas usadas pelo sistema: PROCESSOS, EXTRATO_CAIXA, EXTRATO_BANCO, CLIENTES, FORNECEDORES, CUSTOS_FIXOS, CONFIG, REGRAS, DOCUMENTOS, LOG.
Leia SEMPRE só para leitura (de preferência a planilha de testes "Fu Song ERP Database — TESTE 4").
Os dados são da empresa: dados/ está no .gitignore e nunca vai para o GitHub (repositório público).
"""
import json, os, sys
pasta = sys.argv[1]
saida = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dados', 'store.json')
store = {}
for nome in sorted(os.listdir(pasta)):
    if not nome.endswith('.json'): continue
    d = json.load(open(os.path.join(pasta, nome), encoding='utf-8'))
    linhas = d.get('values', []) if isinstance(d, dict) else d
    # o Sheets corta células vazias no fim da linha: completa até o tamanho do cabeçalho
    if linhas:
        n = len(linhas[0]); linhas = [l + [''] * (n - len(l)) if len(l) < n else l for l in linhas]
    store[nome[:-5]] = linhas
    print(f'{nome[:-5]}: {max(len(linhas) - 1, 0)} linhas')
os.makedirs(os.path.dirname(saida), exist_ok=True)
json.dump(store, open(saida, 'w', encoding='utf-8'), ensure_ascii=False)
print('gravado', saida)
