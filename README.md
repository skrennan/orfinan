# Minhas Finanças — V6.5.0

Aplicação estática em HTML, CSS e JavaScript, com visual Fluent/Metro, publicada diretamente pelo Netlify.

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

## Validação

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

