# Minhas Finanças

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O proprietário do projeto e outros usuários individuais que querem organizar suas próprias finanças. Cada pessoa usa sua conta, no celular ou computador.

## Product Purpose

Controlar receitas, despesas e contas do mês para acompanhar entradas, saídas e saldo. O produto deve permitir registrar e consultar informações financeiras com clareza, preservando os dados de cada usuário.

## Operating Context

Aplicativo web instalável, em português do Brasil. Funciona offline com dados locais por conta e sincroniza com o Supabase quando há conexão. O código é mantido no GitHub e publicado pelo Netlify.

## Capabilities and Constraints

- Preservar o projeto Supabase atual, os usuários existentes e seus dados financeiros.
- Manter isolamento dos dados entre contas e a sincronização com preservação de alterações locais pendentes.
- Manter funcionamento offline e interface em português.
- Preservar publicação pelo GitHub/Netlify.
- A implementação existente usa HTML, CSS e JavaScript, com Supabase Auth, persistência local, relatórios Chart.js e service worker.
- Há cadastro, login, configuração inicial, receitas, despesas, acompanhamento de contas pagas, relatórios e importação/exportação de backup.
- A recuperação de senha foi implementada com Supabase Auth; o usuário informou ter configurado Gmail SMTP com senha de app. A entrega real e o retorno do link em produção ainda precisam ser validados.

## Evidence on Hand

- `index.html`: telas e conteúdo do aplicativo.
- `app.js` e `sync.js`: funcionalidades, autenticação e sincronização por conta.
- `financial-validation.js`: validação dos dados financeiros.
- `netlify.toml` e `scripts/build.cjs`: configuração de publicação e arquivos públicos.
- `tests/security.cjs`: verificações automatizadas, incluindo recuperação de senha simulada.
- `README.md`: operação, histórico e limites de validação.

## Product Principles

1. Preservar dados financeiros e o vínculo com a conta existente.
2. Priorizar tarefas individuais de controle financeiro mensal.
3. Permitir continuidade de uso offline e sincronização segura ao reconectar.
4. Comunicar ações e estados em português claro.

## Open Decisions

Não foram definidos modelo comercial, diferencial competitivo exclusivo ou recursos de finanças compartilhadas. Não assumir essas características em futuras alterações.
