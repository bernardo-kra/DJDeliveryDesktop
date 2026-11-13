# Segurança e dados locais

Nunca inclua senhas, tokens, arquivos `.env`, cookies, bancos do navegador ou históricos pessoais em commits, issues ou anexos de releases.

O app autentica no próprio DJ Delivery e utiliza a sessão local do navegador. Não há credenciais compartilhadas ou chaves embutidas. O perfil do usuário fica fora do projeto, em `~/Library/Application Support/dj-delivery-desktop`.

O instalador deve conter somente o código e os recursos declarados em `build.files` no `package.json`. Não empacote o perfil do usuário. Publique apenas o instalador limpo e seu checksum.

Para relatar um problema, descreva o comportamento sem anexar o perfil do app ou links de download que contenham dados de sessão.
