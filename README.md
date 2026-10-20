# Smart Remote

Controle remoto web (PWA) para TVs **Samsung, LG, TCL, AOC, Philips, Roku** e **TV Box Elsys**, usado na mesma rede Wi-Fi da TV. Feito em React + TypeScript + Vite.

Publicado em: https://brunodiasef.github.io/controle-universal/

## Marcas e sistemas

TCL, AOC e Philips não têm um sistema próprio: cada modelo vem com Google TV/Android TV, Roku TV ou (Philips antigas) um sistema da própria Philips. No app você escolhe a **Marca** e, quando há mais de uma opção, o **Sistema da TV**.

| Sistema | Marcas | Direto do navegador | Pela ponte no PC |
|---|---|---|---|
| Tizen | Samsung | Sim (porta 8002 com certificado aceito; 8001 quando aberto pela ponte) | Sim, como reserva |
| webOS | LG | Sim (porta 3001 com certificado aceito; 3000 quando aberto pela ponte) | Sim, como reserva |
| Roku TV | Roku, AOC, Philips, TCL | Sim (HTTP na porta 8060) | Sim, como reserva |
| Google TV / Android TV | TCL, AOC, Philips, Sony, Xiaomi... | Não (o protocolo usa TLS puro) | **Obrigatória**: pareamento com código mostrado na TV |
| Philips sem Android | Philips (Saphi/antigas) | Não | **Obrigatória** (JointSPACE na porta 1925) |
| Android com ADB | Elsys TV Box | Não | **Obrigatória** |

Quando o caminho direto falha e a ponte está configurada, o app passa pela ponte sozinho.

**O que cada sistema faz:**
- Setas, OK, voltar, home, volume, canais, mídia e ligar/desligar: todos.
- Abrir Netflix, YouTube e Prime Video: todos, menos a Philips sem Android.
- Digitar texto: Samsung, LG, Roku e TV Box (ADB).

## Três jeitos de usar

1. **Pelo GitHub Pages** (link acima). Abra no Chrome do PC ou do Android e instale pelo menu "Instalar app". Samsung, LG e Roku funcionam sem PC. Na primeira vez, o Chrome pergunta se o site pode acessar a rede local: permita.
2. **Pela ponte no PC** (`http://IP-DO-PC:4317`). Dê dois cliques em `iniciar-windows.bat` e abra o endereço mostrado na janela, no celular ou em qualquer aparelho do Wi-Fi. Funciona inclusive no iPhone.
3. **Os dois juntos.** Use o app do GitHub e informe a ponte em Configurações › Ponte no PC. É necessário para Google TV, Philips sem Android e TV Box.

**iPhone/Safari:** o Safari não deixa um site HTTPS falar com aparelhos da rede local. No iPhone, use o jeito 2.

## Busca de aparelhos

Com a ponte ativa, o botão "Procurar aparelhos na rede" encontra os aparelhos que respondem a SSDP/UPnP e ao mDNS do Google TV. Para cada um, mostra o nome, o fabricante, o modelo e o sistema detectado. Aparelhos que o app ainda não controla (roteadores, impressoras, outras marcas) aparecem apagados. Tocar num aparelho da lista preenche marca, sistema e IP.

## Publicar no GitHub

1. Envie o conteúdo desta pasta (`smart-remote-pwa`) para a branch `main`.
2. No repositório, abra **Settings › Pages** e, em **Source**, escolha **GitHub Actions**.
3. A cada envio, o fluxo `.github/workflows/deploy-pages.yml` compila e publica o app.

## Ponte local (`backend/`)

- **`server.mjs`**: rotas, segurança e serviço da interface compilada em `http://IP-DO-PC:4317`.
- **`googletv.mjs`, `protobuf.mjs` e `x509.mjs`**: controle do Google TV / Android TV. O pareamento com o código da TV usa a porta 6467, e os comandos usam a 6466. O certificado deste PC é gerado na primeira vez.
- **`philips.mjs`**: Philips sem Android (JointSPACE).
- **`discovery.mjs`**: busca por SSDP/UPnP, ficha do aparelho e mDNS.
- **`shared/lg-protocol.js`**: protocolo da LG, usado pelo navegador e pela ponte.
- **Segurança:**
  - só aceita aparelhos da rede local e exige o **código de pareamento** de 6 dígitos. Cinco erros seguidos bloqueiam por 1 minuto;
  - só envia comandos para IPs locais e só aceita teclas e apps de uma lista fixa;
  - filtra o texto enviado ao ADB.
- O código, os tokens e as chaves das TVs e o certificado do Google TV ficam em `backend/.data/` (fora do Git). Para gerar outro código: `npm run bridge:novo-codigo`.
- **ADB** (só TV Box): Android SDK Platform-Tools no PATH, na pasta `platform-tools` dentro desta pasta, ou indicado em `ADB_PATH`.

## Comandos

```bash
npm install          # dependências
npm run dev          # interface em modo desenvolvimento (porta 5173)
npm run build        # gera dist/
npm run bridge       # inicia a ponte (porta 4317)
npm start            # build + ponte + abre o navegador
```

Não encaminhe a porta 4317 nem o ADB para a internet. Não digite senhas de streaming no app. Avisos de licença de terceiros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
