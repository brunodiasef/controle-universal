# Smart Remote

Controle remoto web (PWA) para **Samsung Smart TV**, **Roku** e **TV Box Elsys / Android TV**, usado na mesma rede Wi-Fi da TV. Feito em React + TypeScript + Vite.

## Como cada aparelho é controlado

| Aparelho | Direto do navegador | Pela ponte no PC |
|---|---|---|
| Roku / Roku TV | Sim (HTTP na porta 8060) | Sim, como reserva |
| Samsung Smart TV | Sim, na porta 8002 depois de aceitar o certificado da TV; na 8001 só quando o app é aberto pela ponte (http) | Sim, como reserva |
| Elsys TV Box / Android TV | Não: o ADB usa uma conexão que nenhum navegador permite | **Obrigatória** |

Quando o caminho direto falha e a ponte está configurada, o app passa pela ponte sozinho.

## Três jeitos de usar

1. **Pelo GitHub Pages** (`https://SEU-USUARIO.github.io/NOME-DO-REPO/`). Abra no Chrome do PC ou do Android e instale pelo menu "Instalar app". Roku e Samsung funcionam sem PC. Na primeira vez, o Chrome pergunta se o site pode acessar a rede local: permita.
2. **Pela ponte no PC** (`http://IP-DO-PC:4317`). Dê dois cliques em `iniciar-windows.bat` e abra o endereço mostrado na janela, no celular ou em qualquer aparelho do Wi-Fi. Funciona inclusive no iPhone.
3. **Os dois juntos.** Use o app do GitHub e informe a ponte em Configurações › Ponte no PC, para ter a TV Box e a reserva.

**iPhone/Safari:** o Safari não deixa um site HTTPS falar com aparelhos da rede local. No iPhone, use o jeito 2.

## Publicar no GitHub

1. Crie um repositório e envie o conteúdo desta pasta (`smart-remote-pwa`) para a branch `main`.
2. No repositório, abra **Settings › Pages** e, em **Source**, escolha **GitHub Actions**.
3. A cada envio, o fluxo `.github/workflows/deploy-pages.yml` compila e publica o app. O link aparece na aba **Actions** e em Settings › Pages.

O build usa caminhos relativos, então funciona com qualquer nome de repositório.

## Ponte local (`backend/server.mjs`)

- Serve o app compilado em `http://IP-DO-PC:4317`.
- Faz o que o navegador não consegue: ADB (TV Box), busca de aparelhos (SSDP), Wake-on-LAN para ligar a Samsung e reserva para Samsung e Roku.
- **Segurança:**
  - só aceita aparelhos da rede local (IPs privados);
  - exige o **código de pareamento** de 6 dígitos mostrado na janela. Cinco códigos errados seguidos bloqueiam o aparelho por 1 minuto;
  - só envia comandos para IPs locais, só aceita teclas e apps de uma lista fixa e filtra o texto enviado ao ADB.
- O código e os tokens da Samsung ficam em `backend/.data/` (fora do Git). Para gerar outro código: `npm run bridge:novo-codigo`.
- **ADB:** instale o "Android SDK Platform-Tools" no PATH ou extraia a pasta `platform-tools` dentro desta pasta. Também dá para indicar o caminho na variável `ADB_PATH`.

## Comandos

```bash
npm install          # dependências
npm run dev          # interface em modo desenvolvimento (porta 5173)
npm run build        # gera dist/
npm run bridge       # inicia a ponte (porta 4317)
npm start            # build + ponte + abre o navegador
```

Não encaminhe a porta 4317 nem o ADB para a internet. Não digite senhas de streaming no app.
