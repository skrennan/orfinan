# Minhas Finanças — V7.0.0

Aplicação estática em HTML, CSS e JavaScript, com uma interface clara para organização financeira individual. O Netlify executa `node scripts/build.cjs` e publica somente a pasta `dist/` gerada com os arquivos públicos do app.

## Segurança — versão 6.7

A revisão e seus limites estão em [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Foram corrigidos o cache de respostas da API, isolamento de operações assíncronas entre contas, logout, validação de dados importados e tentativas ilimitadas de sincronização. Bibliotecas passaram a ser locais, com versões fixas e integridade; os cabeçalhos de segurança são definidos em `netlify.toml`.

```powershell
node tests/security.cjs
node tests/mobile-modal.cjs --real-charts --real-supabase
node scripts/build.cjs
```

O código foi validado localmente. A configuração efetiva do banco ainda requer executar `supabase_security_audit.sql`, revisar `supabase_security_hardening.sql` e testar com duas contas usando `supabase_security_test.sql`. Esses SQLs não foram executados remotamente nesta sessão. O antigo `supabase_setup_v4.sql` foi mantido como referência; o hardening é a migração de segurança atual.

## Análise do projeto

- `index.html`: autenticação, configuração inicial, painel, relatórios e modais.
- `style.css`: tokens, componentes e composição da interface clara. `refinements.css`: adaptações para desktop, tablet e celular, teclado virtual e acessibilidade. A versão 7 substitui as antigas camadas Fluent.
- `app.js`: receitas, despesas, contas pagas, relatórios Chart.js, backups, instalação PWA e autenticação Supabase. O localStorage separa os dados por conta; a sincronização agrupa alterações por 3 segundos, evita envios repetidos por assinaturas e reconcilia dados locais e remotos na entrada. Essas rotinas não foram alteradas.
- `service-worker.js`, `manifest.json` e `icons/`: instalação e cache offline. A versão do cache foi atualizada; a estratégia de cache permanece igual.
- `supabase_setup_v4.sql`: dados financeiros e políticas por usuário. Pressupõe que a tabela `profiles` já exista.
- `netlify.toml`: publicação estática e cabeçalhos HTTP.

## Correção do modal mobile

A regra mobile `display:flex !important` sobrescrevia `.hidden`, mantendo o modal visível após fechar. Agora o flex aplica-se somente ao modal aberto.

O modal acompanha a altura e o deslocamento vertical do visualViewport, incluindo teclado aberto e deslocamento da tela pelo navegador. Os campos rolam em uma área própria, com Cancelar e Salvar fora da rolagem. O layout também atende celulares na horizontal e respeita as áreas seguras.

Abrir em mobile foca o botão de fechar sem abrir o teclado. Fechar remove o foco do campo, restaura o overflow anterior e devolve o foco ao botão de abertura. O foco automático de desktop é cancelado se o modal fechar antes do temporizador.

Cores, superfícies acrílicas, tipografia e animações foram preservadas. O envio do formulário, persistência local, autenticação e sincronização continuam com a mesma lógica.

## Refinamentos da versão 6.6

- Navegação entre meses por setas, retorno ao mês atual e seletor de referência também nos relatórios.
- Restauração da posição de rolagem ao alternar Início e Análise.
- Ícones vetoriais consistentes e estado da sincronização no cabeçalho, sem alterar o mecanismo de sincronização.
- Contas com vencimento, categoria e progresso de pagamento; contexto explícito do mês das contas nos relatórios.
- Filtros ativos visíveis e ação para limpar busca e tipo de movimentação.
- Gráficos com paleta consistente, dimensões responsivas e descrições acessíveis com os valores reais.
- Correção da ordem das camadas: cabeçalho abaixo dos modais. Ambos os modais bloqueiam o fundo, contêm o foco, fecham por Escape e restauram foco e rolagem.
- Configurações com cabeçalho fixo e área de exclusão de dados separada dos formulários.
- Botão para mostrar/ocultar senha, melhor contraste nos botões principais e erro de validação para descrição vazia.
- Layout verificado com valores grandes e nomes sem espaços em telas de 320px.

### Validação adicional

```powershell
node tests/mobile-modal.cjs --screenshots --real-charts
```

O modo `--real-charts` utiliza a versão local 4.4.7 do Chart.js. `--real-supabase` também utiliza o SDK local verdadeiro, com sessão inicialmente vazia e sem acesso a contas reais. O teste aplica a CSP de produção; o service worker permanece isolado neste teste de interface e é exercitado separadamente em `tests/security.cjs`. Capturas são gravadas na pasta temporária do sistema.

Verificações passaram em 320×568, 390×844, 580×700, 768×1024, 844×390, 1280×800 e 1536×960. Também cobrem troca de dezembro para janeiro, limpeza de filtros, senha, configurações, validação de descrição e ausência de erros JavaScript não tratados no navegador. As rotinas centrais de sincronização foram comparadas antes e depois e permaneceram idênticas.

## Validação da versão 6.5

A versão 6.5 refina o visual Fluent/Metro com a camada `refinements.css`: tipografia Segoe, tela de entrada responsiva, resumo financeiro mais claro e foco visível. Adiciona um indicador de comprometimento da renda, resumo das contas pendentes e busca por descrição ou categoria com filtros de receitas e despesas. Os filtros não alteram os dados armazenados.

A estrutura HTML do painel e dos relatórios foi corrigida, e a navegação fica oculta antes da entrada. O modal mantém o foco ao navegar por Tab. A preferência por movimento reduzido desativa animações visuais e contagens animadas. O cache PWA inclui o novo CSS na versão 6.5.0; a lógica de sincronização não foi alterada.

```powershell
node --check app.js
node --check service-worker.js
node tests/mobile-modal.cjs
node tests/mobile-modal.cjs --screenshots
```

O teste usa Microsoft Edge headless no Windows, sem dependências npm, servindo os arquivos locais e substituindo apenas o cliente Supabase no ambiente de teste. Não acessa contas reais.

Verifica abertura e fechamento em 320×568, 390×844, 580×700, 844×390 e 1280×800. Simula visualViewport de 300px de altura e deslocamento de 85px; verifica botões visíveis, rolagem até Data, ausência de transbordamento horizontal, restauração do foco, fechamento por Escape e salvamento local com sincronização marcada como pendente.

A simulação não substitui validação do teclado em aparelhos Android e Safari/iOS. A sincronização real com Supabase não é exercitada pelo teste.

O teste também verifica filtros sem alteração dos dados, navegação para os relatórios, movimento reduzido e navegação por Tab dentro do modal. Capturas opcionais de login e painel são gravadas na pasta temporária do sistema. Chart.js é substituído apenas na verificação de navegação; a renderização real dos gráficos não é exercitada.





### Visual 6.8

Direção inspirada na referência Unreal Engine: superfícies em grafite (#101113, #1b1d20, #222429), texto branco suave (#efeeeb), contornos cinza (#34373c) e azul frio pontual (#b3cbe1). Tipografia Bahnschrift com alternativas locais, valores alinhados e destaque concentrado no saldo. Login, painel, relatórios, navegação, modais e ícones do app usam a mesma identidade. Sem fontes remotas ou dependências novas.

A mudança preserva a navegação e a lógica financeira, de autenticação e sincronização. Cache atualizado para 6.8.0. Verificação: testes de segurança, testes de navegador com Chart.js/Supabase locais em sete tamanhos de tela e build de publicação.


## Revisao funcional 6.9

- Sincronizacao extraida para sync.js; revisao do servidor persistida por conta.
- Atualizacoes condicionadas ao updated_at, sem depender do relogio do aparelho. Conflito preserva o cache local e bloqueia tentativas automaticas.
- Primeira gravacao usa INSERT; colisao com registro existente exige resolver o conflito. Escolher manter dados locais tambem verifica se a nuvem mudou novamente.
- CSS: 56 declaracoes sobrepostas removidas de refinements.css sem mudar o visual aprovado.
- Testes: dois aparelhos concorrentes, conflito repetido, primeira gravacao, conta sem revisao conhecida, offline e edicoes durante envio; suite anterior e sete tamanhos de tela.

Publicacao: executar `node scripts/build.cjs` e publicar dist. Nao requer nova migracao se o hardening ja foi aplicado (trigger orgfinan_updated_at e UNIQUE(user_id)). Validar dois aparelhos reais apos publicar: abrir a mesma conta em ambos, gravar no primeiro e depois no segundo; o segundo deve oferecer resolucao de conflito. Atualizar todos os aparelhos para substituir clientes antigos. Nenhum deploy ou SQL de producao foi executado nesta rodada.

## Desempenho - versao 6.9.1

- Arquivos publicos usam o cache da versao instalada antes de consultar a rede. A atualizacao do service worker substitui o cache; APIs e dados autenticados continuam excluidos.
- Formatacao de moeda reutiliza um formatador. Relatorios agrupam lancamentos por mes em uma passagem; contas fixas carregam o mapa de pagamentos uma vez por calculo.
- Animacoes de valores cancelam execucoes anteriores; listas agrupam callbacks e ignoram paineis ocultos. Marcar uma conta como paga deixa de gerar graficos ocultos.
- Manutencao do perfil acontece em paralelo ao carregamento financeiro, com isolamento por conta preservado.

Validacao: testes de seguranca e sincronizacao, cache com rede sem resposta, navegador com Chart.js/Supabase reais em sete tamanhos de tela e build estatico. Publicar dist/ para aplicar as correcoes ao site hospedado. Nenhum deploy foi executado.
## Recuperação de senha

O botão Esqueci minha senha envia o link pelo Supabase Auth com o SMTP configurado. Credenciais SMTP ficam no Supabase. O formulário confirma a nova senha e encerra a sessão local após salvar. A recuperação não inicia a sincronização financeira.

Em Authentication > URL Configuration, configure Site URL com o endereço publicado e adicione a Redirect URLs o endereço completo `https://SEU-SITE.netlify.app/?recovery=1`, substituindo pelo endereço real e mantendo o caminho do app se houver. No template Reset Password, mantenha `{{ .ConfirmationURL }}`.

Após publicar, solicite o link para uma conta existente, confira inbox/spam, altere a senha e entre novamente verificando seus dados. Os testes locais simulam Auth e não comprovam entrega pelo Gmail ou configuração remota.

## Uso diário — versão 6.10

- Contas pendentes aparecem antes das pagas, em ordem de vencimento. O resumo destaca contas vencidas; datas com dia 31 respeitam o último dia de cada mês.
- Um pagamento pode ser desfeito na própria linha, sem excluir a conta.
- Meses vazios oferecem adicionar o primeiro lançamento; buscas sem resultado oferecem limpar os filtros.
- Um novo lançamento em mês histórico começa no primeiro dia desse mês. No mês atual, usa hoje quando a data anterior pertence a outro período.
- Painel mais compacto e contas antes do bloco de lançamento no celular; o botão Novo lançamento permanece na navegação inferior.
- Recuperação e cadastro com títulos específicos, feedback legível e controles de toque maiores.

Validação: node tests/security.cjs e node tests/mobile-modal.cjs --screenshots --real-charts --real-supabase. O teste visual usa dados simulados e verifica pagamento/desfazer, mês histórico, recuperação, filtros, teclado e sete tamanhos de tela. A inicialização do Edge tolera bloqueio temporário do arquivo DevToolsActivePort. Não há migração de banco nesta versão. O envio real de e-mail depende de teste em produção.

## Design — versão 7.0

A interface foi reconstruída com a direção pastel-consumer do Taste: fundo claro, superfícies planas, Manrope variável local e cores financeiras discretas. O desktop usa navegação lateral; tablet e celular usam navegação inferior. O painel reúne resumo mensal, distribuição da renda, contas por vencimento e histórico. O novo gráfico de alocação deriva dos valores reais de compromissos fixos, despesas variáveis e saldo; déficits são identificados sem segmentos negativos.

Entrada, recuperação, configuração inicial, relatórios, configurações e lançamento compartilham os componentes do novo sistema. DESIGN.md e .impeccable/design.json documentam os tokens implementados. A fonte e sua licença ficam em fonts/ e entram no build público; a fonte também está disponível offline. Manifesto e ícones usam a nova identidade. O cache PWA foi atualizado para v7.0.0.

Verificações: sintaxe JS, testes de segurança, fonte local sob CSP, alocação em saldo positivo/negativo/zero, navegação lateral e restauração de foco, gráficos Chart.js, pagamento/desfazer e testes de interface em sete tamanhos. Os dados das capturas são de demonstração; os testes não acessam contas reais nem comprovam a entrega SMTP. O Supabase atual e a sincronização por conta foram preservados; esta versão não exige migração de banco.

## Prévia local — versão 7.0.1

Em localhost, 127.0.0.1 e IPv6 loopback, o app não registra service worker e remove somente registros que apontam para seu próprio service-worker.js. Se uma versão anterior ainda controlar a página, o app recarrega após removê-la. O worker também deixa requisições locais seguirem diretamente para o servidor. Isso permite usar Go Live/Live Server sem misturar CSS novo com arquivos de um build PWA antigo; localStorage e dados financeiros não são apagados. Em produção, o funcionamento offline continua ativo. Ao abrir uma aba antiga, use Ctrl+Shift+R para carregar a atualização.

## Modo escuro — versão 7.1

O botão de lua/sol no cabeçalho alterna os temas em todas as telas. Sem escolha salva, o app acompanha a preferência do sistema. A escolha manual permanece neste navegador com a chave orgfinan-theme e sincroniza entre abas; não muda os dados nem as contas do Supabase. theme.js aplica a preferência antes dos estilos para evitar um clarão inicial. theme.css define superfícies, textos, controles, estados e tokens compartilhados com os gráficos. Os dois novos arquivos fazem parte do build público e do cache offline v7.1.0.

Validação: node tests/theme.cjs; node tests/security.cjs; node tests/mobile-modal.cjs --real-charts --real-supabase; node tests/mobile-modal.cjs --screenshots --real-charts --real-supabase --dark. Inclui preferência do sistema, persistência após novo carregamento, sincronização entre abas, armazenamento bloqueado, contraste dos controles selecionados, atualização imediata de gráficos sem mudar os valores financeiros e sete tamanhos de tela em cada tema.
