# Delivery Desktop

Aplicativo independente para macOS que importa sua lista do Shazam, busca versões no DJ Delivery e gerencia downloads autorizados pela sua conta.

## Instalar no Mac

[**Baixar instalador para macOS Apple Silicon (.dmg)**](https://github.com/bernardo-kra/DJDeliveryDesktop/releases/download/v0.2.0/Delivery.Desktop-0.2.0-arm64.dmg). O checksum está na seção [**Releases**](https://github.com/bernardo-kra/DJDeliveryDesktop/releases/latest). Abra o instalador e arraste **Delivery Desktop** para **Aplicativos**. Esta versão é para Macs com Apple Silicon (M1 ou posterior).

Depois, abra pelo Finder ou pelo Spotlight. Não precisa de VS Code, Terminal ou Node.js para usar o aplicativo instalado. Para fixar no Dock: botão direito no ícone → **Opções → Manter no Dock**.

## Configuração inicial

No primeiro uso, o app abre **Vamos configurar seu app**. Escolha uma pasta de downloads e clique em **Salvar e começar**. A sugestão inicial é a pasta Downloads do próprio usuário; nenhum caminho pessoal do desenvolvedor é incluído no instalador.

Em **Mais preferências**, é possível escolher um banco do Shazam manualmente (o padrão é a detecção automática neste Mac) e ativar ou desativar a abertura do catálogo lado a lado. Depois, altere essas opções em **⋯ → Configurações** ou **Salvar em → Escolher pasta**. As configurações são salvas em `settings.json`, no perfil local do usuário, separado da biblioteca e da sessão.

Quem atualiza de uma versão anterior mantém sua pasta, biblioteca, exclusões e login. A pasta antiga é migrada automaticamente. Se um disco estiver desconectado ou a pasta não permitir escrita, o app interrompe o download e pede que a pasta seja corrigida nas configurações; ele não recria caminhos de discos ausentes.

O diretório de perfil é obtido pelo sistema operacional, e o histórico do Shazam é procurado na pasta pessoal do usuário atual. Endereços do serviço e limites internos de busca são constantes do app, não dados específicos de um computador.

## Usar

1. Abra **Catálogo** e faça login diretamente no DJ Delivery.
2. Clique em **Importar Shazam** para ler o histórico local do Shazam instalado no Mac.
3. Selecione as faixas e clique em **Buscar músicas**.
4. Expanda **Ouvir e comparar** para escutar as versões. Trocar de versão não inicia download: confirme em **Escolher esta versão** quando necessário.
5. Clique em **Baixar**. O app baixa correspondências exatas e versões confirmadas.

As versões já salvas recebem **Já baixada** e ficam fora da fila enquanto o arquivo completo estiver disponível. O histórico também identifica arquivos ausentes ou incompletos. A checagem é atualizada ao retornar ao app e em **⋯ → Verificar arquivos baixados**.

- **⋯** de cada música: abrir a busca no catálogo ou excluir da lista importada.
- **⋯ → Limpar lista do Shazam**: remover a lista inteira; **Restaurar músicas** desfaz a limpeza. Exclusões não alteram o histórico do aplicativo Shazam e são respeitadas nas próximas importações.
- **⋯ → Exportar seleção**: salvar um CSV.
- **Salvar em**, no fim da lista: escolher ou abrir a pasta de destino.
- **Downloads**: consultar arquivos e transferências.

O catálogo abre em uma janela independente, com **Voltar ao app** e **Lado a lado**. O atalho **⌘⇧A** no catálogo retorna ao app.

## Dados e privacidade

A biblioteca, as exclusões, as configurações e a sessão do site ficam apenas no perfil local do usuário, fora deste repositório e do instalador. A versão de desenvolvimento e a instalada compartilham o perfil `~/Library/Application Support/dj-delivery-desktop`.

O código do app não solicita nem armazena sua senha. O login acontece no próprio site, e o navegador mantém a sessão local. O instalador não inclui uma conta, cookies ou histórico de nenhum usuário. Não envie arquivos de perfil, credenciais ou tokens em issues ou commits.

## Desenvolver

Requisitos: Node.js 22 ou superior; macOS para testar a importação direta do Shazam.

```sh
git clone https://github.com/bernardo-kra/DJDeliveryDesktop.git
cd DJDeliveryDesktop
npm ci
npm test
npm start
```

O atalho `Abrir.command` também inicia a versão de desenvolvimento a partir da própria pasta do projeto.

## Gerar o instalador

No Mac, depois de instalar as dependências:

```sh
npm run dist -- --mac --arm64
```

Se o runtime do Electron já estiver em `node_modules`, pode reutilizá-lo:

```sh
npm run dist -- --mac --arm64 --config.electronDist=node_modules/electron/dist
```

Os artefatos são gerados em `dist/`, ignorado pelo Git. Publique o `.dmg` e o arquivo `SHA256SUMS` como anexos de uma **Release**, sem adicionar os binários ao histórico Git. O aplicativo usa assinatura local ad hoc; não está notarizado pela Apple.

A imagem do ícone está em `build/icon.icns`; `build/icon.swift` contém seu desenho original.

## Limitações

- Requer acesso próprio e permissão de download no DJ Delivery; respeita os limites da sua conta.
- A integração usa a busca e as prévias da interface do serviço; mudanças no site podem exigir manutenção.
- A leitura do Shazam depende do formato interno do aplicativo para Mac.
- A busca é limitada a cinco páginas por consulta. Resultados parciais e versões diferentes precisam de revisão.
- A correspondência usa título, artista e versão; não compara a gravação por impressão digital de áudio. Ouça antes de confirmar uma versão duvidosa.
- Os downloads registrados são conferidos por versão, formato e tamanho local. Arquivos externos ao histórico não são identificados automaticamente.
- Downloads interrompidos precisam ser iniciados novamente. Não há conversão de streaming.
- Há configuração de empacotamento para Windows e Linux, mas o instalador validado é o de macOS Apple Silicon.

Este projeto não é afiliado ao DJ Delivery ou ao Shazam.
