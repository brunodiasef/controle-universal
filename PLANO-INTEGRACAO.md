# Integrações Smart Remote — estado da versão 1.3

## Implementado
- **Samsung (Tizen)**:
  - WebSocket direto do navegador: `wss://` na porta 8002 com certificado aceito, ou `ws://` na 8001 quando o app é aberto pela ponte;
  - o token da TV é salvo;
  - abre apps (`ed.apps.launch`), digita texto e liga a TV por Wake-on-LAN através da ponte.
- **LG (webOS)**:
  - protocolo SSAP direto do navegador (`wss://` na 3001 ou `ws://` na 3000) e pela ponte;
  - o pareamento aparece na tela da TV, e a chave da TV é salva;
  - se a TV recusar a assinatura antiga ("blacklisted certificate"), o app registra sem assinatura;
  - botões pelo canal de botões ("pointer socket"), apps, texto e desligar;
  - liga a TV por Wake-on-LAN através da ponte.
- **Roku TV** (Roku, AOC, Philips, TCL): ECP direto do navegador e reserva pela ponte.
- **Google TV / Android TV** (TCL, AOC, Philips, Sony, Xiaomi...): protocolo oficial do controle do Google, só pela ponte.
  - O certificado deste PC é gerado na primeira vez.
  - O pareamento usa o código hexadecimal de 6 caracteres mostrado na TV, conferido localmente antes do envio, na porta 6467.
  - Os comandos usam a porta 6466, com resposta ao "ping" da TV.
  - Envia teclas e abre apps por link.
- **Philips sem Android**: JointSPACE (porta 1925) pela ponte. Detecta Philips com Android e orienta a escolher Google TV.
- **Elsys / Android por ADB**: inalterado.
- **Busca**:
  - usa SSDP/UPnP com a ficha de cada aparelho (fabricante, modelo, nome) e o mDNS do Google TV (`_androidtvremote2._tcp`);
  - identifica marca e sistema e preenche o formulário ao tocar.
- **Interface**: escolha de Marca e depois Sistema da TV, com dica para descobrir o sistema; campo de código do Google TV; os rótulos dos botões mudam conforme o sistema.

## Testes feitos
- Os simuladores de Samsung, LG, Roku, Google TV e Philips seguem os protocolos oficiais.
- Passaram nos simuladores, tanto pela ponte quanto direto do navegador:
  - LG: conexão, plano B sem assinatura, pedido na tela, botões, play/pausa, app, texto e desligar;
  - Google TV: recusa sem pareamento, código errado barrado, pareamento, ping, teclas e app;
  - Philips: teclas e detecção de modelo com Android.
- Busca: leitura da ficha UPnP, de pacotes mDNS e identificação de 7 casos (TCL Google TV, AOC Roku, Philips Saphi e Google, LG, Samsung e roteador).

## Limites conhecidos
- Nada foi testado com TVs reais destas marcas. Firmwares podem variar.
- Google TV: digitar texto pelo app ainda não está implementado.
- Philips sem Android: abrir apps não é suportado. Alguns modelos 2016+ podem exigir pareamento.
- **Safari / iPhone** bloqueia o acesso de sites HTTPS à rede local. No iPhone, use o app aberto pela ponte (http).
- **Chrome**: o acesso à rede local depende da permissão "Acesso à rede local".
- **Samsung e LG antigas** (só portas 8001/3000) não funcionam direto do GitHub Pages, porque o navegador proíbe `ws://` em página HTTPS. Use a ponte.
- Busca por voz não é possível pela rede.
