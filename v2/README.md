# Fu Song ERP 2.0 — módulos

Estrutura nova, construída em paralelo ao `index.html` em produção.

| Arquivo | O que faz |
| --- | --- |
| `ofx.js` | Leitor de extrato OFX: detecta codificação, descarta linhas de saldo, valida pelos saldos diários, chave única por movimento, agrupa câmbio por contrato, classifica por regras |
| `conciliador.html` | Protótipo da tela de importação/revisão usando `ofx.js` (exemplo fictício embutido) |

Regras de fornecedores e sócios **não** ficam no código (repositório público): ficam na aba REGRAS da planilha.
Extratos reais **nunca** são versionados aqui.
