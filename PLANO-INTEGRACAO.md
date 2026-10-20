# Integrações Smart Remote — estado da versão 1.2

## Implementado
- App web (PWA) com caminhos relativos, publicado pelo GitHub Pages via GitHub Actions e também servido pela ponte.
- **Roku**: ECP direto do navegador (`fetch` no-cors para a porta 8060) e reserva pela ponte. Teclas, apps (Netflix 12, YouTube 837, Prime 13) e digitação (`Lit_`).
- **Samsung**: WebSocket direto do navegador.
  - Em página HTTPS, `wss://` na porta 8002, depois de aceitar o certificado da TV.
  - Em página HTTP (ponte), `ws://` na porta 8001 primeiro.
  - O token da TV é salvo, para não pedir permissão de novo.
  - Abre apps por `ed.apps.launch`, digita texto (`SendInputString`) e liga a TV por Wake-on-LAN através da ponte.
- **Elsys / Android TV**: ADB pela ponte. Usa a porta 5555 ou uma porta configurável, faz o pareamento do Android 11+ (`adb pair`), envia teclas, abre apps e digita texto (com filtro de caracteres).
- **Ponte**:
  - só aceita a rede local e exige o código de pareamento, bloqueando após 5 erros;
  - só aceita teclas e apps de uma lista fixa e só envia para IPs locais;
  - faz busca SSDP e Wake-on-LAN, e serve a interface compilada.
- **Interface**: sem valores falsos de volume ou canal. O estado "conectado" é testado de verdade ao abrir o app, e o aparelho salvo na v1.1 é migrado.

## Limites conhecidos
- O código não foi testado com as TVs reais do usuário. Cada modelo pode se comportar diferente.
- O **Safari / iPhone** bloqueia o acesso de sites HTTPS à rede local. No iPhone, use o app aberto pela ponte (http).
- No **Chrome**, o acesso à rede local depende de o usuário aceitar a permissão "Acesso à rede local".
- **Samsung antiga** (só porta 8001) não funciona direto do GitHub Pages, porque o navegador proíbe `ws://` em página HTTPS. Use a ponte.
- Os IDs dos apps da Samsung variam por ano; para a Netflix, o app tenta dois IDs.
- O texto na Samsung só aparece se o teclado da TV estiver aberto.
- **LG webOS** e outras marcas ainda não têm adaptador.
- Busca por voz não é possível pela rede.

## Próxima validação prática
1. Roku: abrir pelo GitHub Pages no Chrome, permitir a rede local e testar os botões.
2. Samsung: "Autorizar certificado da TV", conectar, aceitar na TV e testar. Se falhar, testar pela ponte.
3. Elsys: ativar a depuração ADB, abrir a ponte com o platform-tools e conectar.
