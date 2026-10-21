---
name: Minhas Finanças
description: Espaço claro para acompanhar o dinheiro e os compromissos do mês.
colors:
  primary: "#215cca"
  primary-hover: "#194ba7"
  background: "#f3f5f7"
  surface: "#ffffff"
  surface-soft: "#f6f8fa"
  surface-deep: "#edf1f4"
  ink: "#20272c"
  muted: "#606b73"
  divider: "#e7ebee"
  control-border: "#bac3ca"
  balance-surface: "#e3edfc"
  balance-ink: "#183f7e"
  income-surface: "#e9f2ed"
  positive: "#286749"
  expense-surface: "#f7eee4"
  expense-ink: "#705133"
  negative: "#a53632"
  warning: "#87551a"
  allocation-fixed: "#648cc7"
  allocation-variable: "#c5a176"
  allocation-free: "#75a48b"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 2.5vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  metadata:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.75rem"
  amount-input:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 550
rounded:
  field: "9px"
  button: "10px"
  compact: "12px"
  summary: "16px"
  panel: "20px"
  dialog: "24px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  dialog: "28px"
  generous: "36px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "11px 17px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "11px 17px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 13px"
    height: "46px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Minhas Finanças

## Overview

**Creative North Star: "Mesa financeira clara"**

Uma área de trabalho pessoal, calma e legível. O sistema organiza o mês com superfícies claras, uma única família tipográfica e contrastes entre informação principal e detalhes. O nome descreve o resultado implementado; não representa uma preferência verbal adicional confirmada pelo usuário.

A aparência genérica anterior foi rejeitada. A identidade atual vem da hierarquia do dinheiro, das áreas pastéis e da distribuição horizontal dos compromissos, sem depender de fotografias ou ornamentos.

**Key Characteristics:**

- Superfícies claras e cores sólidas.
- Manrope local e números alinháveis.
- Azul para ações; pastéis para resumo financeiro.
- Navegação lateral no computador e inferior no celular.

## Colors

### Dark theme

`theme.css` extends the same geometry and semantic roles through `html[data-theme="dark"]`. The dark canvas is `#11171e`, panels `#1a232e`, raised surfaces `#202c39`, primary text `#e8edf3`, muted text `#b0bdca`, borders `#344352` and control outlines `#617387`. The primary action uses pale blue `#a7c8ff` with dark ink `#142c4c`. Balance surfaces use `#233852`; income uses `#223c32` with `#b6e0c4`; ordinary spending uses `#3b3027` with `#edcba2`. Errors and overdue bills use `#ffb2aa`. Chart colors are CSS tokens shared with Chart.js, updated immediately on theme changes.

The header sun/moon button switches light/dark on every screen, including entry. Before the first explicit choice the theme follows the OS; a manual choice is stored per browser as `orgfinan-theme`, independent of account data, and synchronized across tabs. `theme.js` runs before the stylesheets to apply stored preference before first paint. Inputs use native `color-scheme`; toggles have explicit next-action labels and pressed state. Light tokens remain the base palette of the generated sidecar; dark overrides are authoritative in `theme.css`.

A paleta combina neutros frios com azul de ação e cores financeiras suaves. Os valores normativos estão no frontmatter.

### Primary

Azul de ação identifica botões principais, links, foco e navegação. O azul mais profundo aparece no hover. O resumo de saldo usa uma superfície azul clara com tinta azul própria.

### Secondary

Verde identifica receita e estados positivos. Caramelo identifica despesas comuns; ele não comunica erro. A distribuição reutiliza azul suave para compromissos fixos, caramelo para variáveis e verde para saldo disponível.

### Neutral

O fundo cinza frio sustenta painéis brancos. Tinta escura apresenta conteúdo principal; tinta secundária apresenta datas, explicações e metadados. Divisórias são mais leves que os contornos de campos.

**The Financial Meaning Rule.** Despesas normais usam tinta ou caramelo. Vermelho indica déficit, atraso, erro ou ação destrutiva; não colore automaticamente toda saída de dinheiro.

## Typography

**Display Font:** Manrope local, com system-ui e sans-serif como alternativas.
**Body Font:** A mesma família, sem segunda fonte decorativa.

### Hierarchy

- **Display:** saldo principal; o valor cresce dentro do limite do frontmatter e usa números tabulares.
- **Headline:** título principal do mês; títulos de autenticação adaptam a mesma linguagem em escala maior.
- **Title:** cabeçalhos de painéis, compactos e firmes.
- **Body:** texto geral; listas usam escalas menores e peso maior para descrições.
- **Label:** rótulos de campos; metadados e textos auxiliares têm piso de 0.75rem (12px).

Valores monetários usam números tabulares e formatação brasileira. Textos e valores extensos podem quebrar para preservar o contêiner. No celular, campos de autenticação, busca e registro usam 16px para evitar ampliação automática; o campo principal de valor mantém 2.4rem e entrelinha 1.2.

## Layout

A composição desktop tem navegação lateral fixa, resumo no topo e duas colunas de trabalho: distribuição e contas à esquerda; movimentações à direita. O conteúdo do dashboard tem largura máxima de 1600px. A lateral mede 218px, passa a 190px entre 801px e 1100px e a 240px a partir de 1600px.

A grade principal usa proporções 1:1.12 e intervalos de 24px. Entre 801px e 1100px ela vira uma coluna, com distribuição e contas lado a lado. Até 800px surge a navegação inferior flutuante; o conteúdo reserva 120px na base. Até 580px o resumo e os painéis passam a uma coluna, preservando receitas e despesas lado a lado.

O ritmo usa principalmente os passos de espaçamento do frontmatter. Na tela estreita, painéis têm 22px de espaço vertical e 20px horizontal. Formulários e relatórios também reduzem suas colunas. O registro de movimentação vira uma folha inferior que acompanha o visual viewport e o teclado.

No relatório de pagamentos, os dois cartões de status permanecem em duas colunas: intervalo de 16px e margem inferior de 20px; até 580px, o intervalo passa a 12px. Os painéis de contas pendentes e pagas usam duas colunas, intervalo e margem inferior de 24px; até 580px, viram uma coluna com intervalo e margem de 20px.

## Elevation & Depth

Painéis do conteúdo são planos e se separam por tom, espaço e divisórias. A navegação inferior usa sombra ambiente discreta: `0 8px 28px rgba(35,58,85,.12)`. Diálogos aparecem sobre véu `rgba(24,35,48,.38)`. Não há gradientes no sistema atual.

**The Quiet Surface Rule.** Painéis de dados ficam planos; a elevação distingue navegação flutuante e sobreposição.

## Shapes

Cantos suaves distinguem camadas: campos e botões são compactos; painéis são mais arredondados; diálogos têm o maior raio. Divisórias de listas têm 1px. Ícones são SVG de traço, com tamanho padrão de 20px e tamanhos menores nas listas. Indicadores financeiros são pequenos quadrados arredondados; estados de sincronização usam pontos.

Os ícones de instalação PWA reproduzem a marca azul do aplicativo, mantendo continuidade com a navegação.

## Components

### Buttons

Botões firmes, de texto curto, com altura mínima de 44px. O primário usa azul e branco; o secundário usa branco e contorno de controle. Hover altera fundo; foco visível usa contorno azul de 2px com afastamento de 4px. Desabilitados reduzem opacidade para 0.55.

### Chips

Filtros de movimentações formam um grupo segmentado sobre fundo neutro. O item selecionado usa superfície branca e texto azul. O seletor receita/despesa usa verde ou caramelo no item marcado.

### Cards / Containers

Painéis brancos têm raio de painel e espaçamento interno amplo. O saldo usa azul pastel; receitas usam verde pastel; despesas usam caramelo pastel. Listas internas usam divisórias em vez de um cartão para cada linha.

No relatório de pagamentos, o cartão de pendências usa a superfície de despesa e o de pagamentos usa a superfície de receita. Ambos têm raio de 16px e padding de 20px; até 580px, padding de 18px 16px e valor principal de 1.25rem.

### Inputs / Fields

Campos brancos têm borda de controle, raio de campo e altura mínima de 46px. Foco altera borda para azul e conserva indicação visível de teclado. Busca acrescenta ícone SVG à esquerda. Erros de autenticação combinam tinta negativa com fundo claro e texto explicativo.

### Navigation

No desktop, a lateral branca contém marca, destinos e ação principal. O destino ativo usa fundo azul claro. Até 800px a navegação vira uma barra inferior com três destinos e rótulos; elementos auxiliares da lateral são ocultados.

### Distribuição do mês

Barra horizontal de 22px com três segmentos e legenda com valores reais. As larguras dividem fixos, variáveis e saldo não negativo pelo maior valor entre renda e despesas totais. Em déficit, a legenda mostra o valor negativo e muda para “Acima da renda”; a barra não inventa um segmento negativo. Sem totais, os segmentos ficam com largura zero. A descrição acessível inclui os valores.

### Contas e movimentações

Contas apresentam nome e vencimento à esquerda, valor e ação à direita. Atraso tem texto negativo; vencimento hoje usa aviso; pagamento confirmado usa positivo. Movimentações usam ícone discreto, descrição, metadados e valor. No celular, as ações e o valor ocupam uma segunda linha.

## Do's and Don'ts

### Do:

- **Do** preservar os significados financeiros das cores.
- **Do** usar números tabulares e valores reais nos resumos e na distribuição.
- **Do** manter foco visível, texto explicativo e rótulos em português.
- **Do** adaptar colunas e navegação aos pontos de quebra implementados.

### Don't:

- **Don't** usar vermelho para toda despesa.
- **Don't** aplicar gradientes ou sombras em todos os painéis.
- **Don't** adicionar fontes decorativas ou imagens sem função no controle financeiro.
- **Don't** substituir a distribuição real por percentuais ilustrativos.

