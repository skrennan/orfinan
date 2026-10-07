# Revisão de segurança e Supabase — 05/10/2026

O código e o comportamento local foram revisados e corrigidos. O banco em produção ainda precisa da auditoria de políticas e do teste com duas contas: não há acesso administrativo ao Supabase nesta sessão e nenhuma migração foi executada remotamente.

## Falhas corrigidas

| Prioridade | Problema encontrado | Correção |
| --- | --- | --- |
| Alta | Service worker armazenava qualquer GET, incluindo respostas autenticadas da API | Cache limitado aos arquivos públicos da própria origem; APIs, outras origens e requests com tokens/autorização ficam fora. Caches antigos do app são removidos. |
| Alta | Respostas atrasadas podiam escrever metadados/dados no cache da conta seguinte | Identidade e geração da conta capturadas antes de cada operação assíncrona, verificadas após os awaits. |
| Alta | Logout ignorava erros e eventos de outra aba não fechavam a interface | Logout local com tratamento de erros; SIGNED_OUT limpa estado da interface e cancela timers. Eventos obsoletos são descartados. |
| Média | Backup/cloud JSON sem validação completa | Validação de estrutura, valores, IDs, datas e duplicidades antes de modificar o armazenamento; limite de 5 MB para importação. |
| Média | Falha da API disparava tentativas a cada 3 segundos indefinidamente | No máximo três tentativas adicionais em 10, 30 e 60 segundos; erros de permissão não são repetidos automaticamente. |
| Média | Dados locais não enviados podiam ser sobrescritos por dados remotos mais novos | Alterações locais preservadas; conflito identificado exige escolher os dados a manter. |
| Média | SDK Supabase carregado de versão flutuante no CDN | Bibliotecas locais com versões fixas, licenças e SHA-384/SRI; Chart.js 4.4.7 e Supabase JS conforme `vendor/versions.json`. |
| Média | Publicação da raiz incluía arquivos de desenvolvimento | Build com lista explícita de arquivos públicos em `dist/`, sem SQL, testes, skills ou arquivos de configuração privados. |
| Média | Ausência de CSP e proteção contra enquadramento | Cabeçalhos CSP, X-Frame-Options, HSTS e Permissions-Policy no Netlify; scripts somente da própria origem. |

Os 3 segundos de agrupamento e o formato por conta foram mantidos. Nesta revisão de segurança, foram alteradas as proteções da sincronização descritas acima.

## O que foi verificado no projeto remoto

Sondagem pública em 05/10/2026, sem login e sem solicitar registros financeiros:

- Endpoints de `profiles` e `financial_data`: HTTP 200 com `limit=0`.
- Autenticação: endpoint público respondeu HTTP 200; confirmação de e-mail habilitada, cadastro habilitado e Google habilitado.
- HTTP 200 com zero registros **não demonstra vazamento nem comprova RLS**. Indica que a consulta é aceita para visitantes; as políticas do banco precisam ser inspecionadas.
- Nenhuma chave secret/service_role ou conexão PostgreSQL com senha foi encontrada nos arquivos do app revisados. A chave `sb_publishable_...` é pública por projeto e não substitui RLS.

## Validação local concluída

```powershell
node tests/security.cjs
node tests/mobile-modal.cjs --real-charts --real-supabase
node scripts/build.cjs
```

Testes cobrem resposta de upload/download/perfil de conta anterior, logout em outra aba, erro de logout, tentativas limitadas, conflito com alterações locais, backups inválidos, cache offline, integridade das bibliotecas, injeção HTML e bloqueio de JavaScript inline pela CSP. O app foi exercitado em sete tamanhos de tela com os dois SDKs reais e sem erros JavaScript não tratados.

## Etapa pendente no Supabase

1. Executar `supabase_security_audit.sql` no SQL Editor e revisar os resultados. Só lê metadados; não retorna dados financeiros, tokens ou senhas.
2. Revisar e aplicar `supabase_security_hardening.sql`. O script cria `profiles` se faltar, habilita RLS, retira permissões de visitantes e DELETE desnecessário, adiciona proteção de proprietário inclusive contra policies permissivas antigas e torna `updated_at` controlado pelo servidor. A migração pressupõe as colunas usadas pelo app; a auditoria deve confirmar a compatibilidade antes da execução. Não exclui registros.
3. Criar/usar duas contas de teste confirmadas, substituir os UUIDs em `supabase_security_test.sql` e executar. As alterações de teste são revertidas por ROLLBACK. O teste verifica visitante sem leitura, leitura/atualização da própria conta e bloqueio de acesso cruzado. **Esse SQL ainda não foi executado nesta sessão.**
4. Verificar Security Advisor, views e funções SECURITY DEFINER expostas, além das duas tabelas do app.
5. Em Authentication, conferir Site URL e Redirect URLs com os domínios reais de produção; evitar curingas amplos em produção. Conferir confirmação de e-mail, política de senhas, rate limits e proteção de cadastro compatível com o público do app. A sondagem pública não permite verificar essas configurações privadas integralmente.

Não enviar chave secret/service_role, senha do banco ou tokens de sessão para realizar essa etapa. Os resultados da auditoria SQL bastam para revisar a configuração das tabelas.

## Limites concretos

- O cache offline e a sessão persistida usam o armazenamento do navegador. O cache por conta não é criptografado; logout conserva alterações locais para permitir sincronização posterior da mesma conta. Em aparelho compartilhado, o armazenamento pode ser lido por quem controla o navegador/dispositivo.
- A CSP permite estilos inline para os controles e gráficos; JavaScript inline e recursos externos são bloqueados. RLS continua obrigatório mesmo com CSP.
- Na versão 6.9, clientes atualizados fazem UPDATE condicionado ao updated_at exato recebido do servidor. A revisão é guardada por conta; divergências preservam dados locais e pedem resolução explícita. Depende do trigger orgfinan_updated_at instalado pelo hardening e de UNIQUE(user_id). O documento continua sendo JSON por usuário, sem merge automático. Clientes antigos ainda fazem upsert incondicional: todos os aparelhos devem atualizar. Os testes concorrentes usam um banco simulado; falta validar dois dispositivos no Supabase publicado.
- Esta revisão não constitui pentest de infraestrutura. A confirmação do isolamento real depende dos testes de RLS e da configuração efetiva do Supabase.

## Referências oficiais

- [Chaves públicas e secretas do Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS, permissões e testes](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls)
- [Segurança de senhas](https://supabase.com/docs/guides/auth/password-security)
