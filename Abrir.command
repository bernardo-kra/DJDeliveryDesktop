#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  echo 'Instale o Node.js 22 ou superior para abrir o aplicativo.'
  read '?Pressione Enter para fechar.'
  exit 1
fi
if [[ ! -d node_modules/electron ]]; then
  npm install || { read '?A instalação falhou. Pressione Enter para fechar.'; exit 1; }
fi
npm start
