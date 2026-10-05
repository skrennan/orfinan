# Minhas Finanças — V6.8.0

Aplicação estática em HTML, CSS e JavaScript, com visual Fluent/Metro. O Netlify executa `node scripts/build.cjs` e publica somente a pasta `dist/` gerada com os arquivos públicos do app.

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
- `style.css`: tema escuro, superfícies acrílicas, animações e responsividade. Várias camadas de versões anteriores tornam a ordem e a especificidade das regras relevantes para o layout.
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
