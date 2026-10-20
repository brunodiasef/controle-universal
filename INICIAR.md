# Smart Remote — como começar

## 1. Descubra o sistema da sua TV
- **Samsung** e **LG** têm sistema próprio. Basta escolher a marca.
- **TCL, AOC e Philips**: olhe a tela inicial da TV.
  - Aparece "Google TV", "Android TV" ou a Play Store? Então é **Google TV / Android TV**.
  - Aparece o logo **Roku**? Então é **Roku TV**.
  - Philips antiga, sem nenhum dos dois? Então é **Philips sem Android**.
- O IP da TV fica em Configurações › Rede (ou "Sobre" › "Status da rede").

## 2. Samsung, LG ou Roku: sem PC
1. Abra o link do app no **Chrome** (PC ou Android).
2. Toque em **Conectar**, escolha a marca (e o sistema, se perguntar) e digite o IP da TV.
3. Se o Chrome perguntar sobre **acesso à rede local**, permita.
4. **Samsung e LG:** antes de conectar, toque em **Autorizar certificado da TV**. Na aba que abrir, aceite o aviso do navegador ("Avançado › Continuar"), volte e toque em **Conectar e salvar**. Na primeira vez, a TV pede permissão: aceite com o controle original.
5. **LG:** deixe ativado "LG Connect Apps" (Configurações › Geral › Dispositivos, ou Configurações › Conexão).
6. Para instalar no celular, use o menu do Chrome › **Instalar app**.

## 3. Google TV / Android TV (TCL, AOC, Philips), Philips sem Android, TV Box ou iPhone: com a ponte no PC
1. No PC (na mesma rede da TV), dê dois cliques em **`iniciar-windows.bat`**. Na primeira vez ele baixa os arquivos necessários, o que exige internet.
2. Se o Windows perguntar, permita o Node.js em **redes privadas**.
3. A janela mostra o **código de pareamento** e o endereço para o celular, por exemplo `http://192.168.0.10:4317`.
4. No celular, abra esse endereço, ou use o app do GitHub e informe o endereço e o código em **Configurações › Ponte no PC**.
5. **Google TV:** escolha a marca e "Google TV / Android TV" e toque em **Conectar e salvar**. A TV mostra um código de 6 caracteres: digite no app e toque em **Confirmar código**. Isso só é preciso na primeira vez.
6. Deixe a janela da ponte aberta enquanto usa o controle.

### Só para a TV Box (ADB)
- Instale o **Android SDK Platform-Tools** e extraia a pasta `platform-tools` dentro desta pasta do projeto.
- Na TV Box: ative as **Opções do desenvolvedor** (toque 7 vezes em "Versão" / "Build") e depois a **Depuração USB/ADB** ou a **Depuração sem fio**.
- Na primeira conexão, a TV Box pergunta se confia no computador: marque "Sempre permitir".
- Se a sua TV Box tiver Google TV/Android TV certificado, escolha esse sistema; aí não precisa de ADB.

## Ligar a TV pelo app (Samsung e LG)
TV desligada não responde pela rede. Informe o **MAC da TV** em Configurações (ele aparece em Configurações › Rede) e mantenha a ponte aberta. Na LG, ative também "Ligar via Wi-Fi" (ou "Mobile TV On").

## Problemas comuns
- **"O navegador não deixou o site falar com a TV"**: permita "Acesso à rede local" no ícone ao lado do endereço, ou use a ponte.
- **"Código de pareamento incorreto"**: use o código da janela da ponte. Depois de 5 erros, espere 1 minuto.
- **Google TV: "Código incorreto"**: confira as letras e números na tela da TV. São só números e letras de A a F.
- **Roku não responde**: no Roku, abra Configurações › Sistema › Configurações avançadas do sistema › Controle por aplicativos móveis › Acesso à rede: **Padrão**.
