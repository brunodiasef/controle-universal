# Smart Remote — como começar

## Só Roku ou Samsung: sem PC
1. Abra o link do app no GitHub Pages no **Chrome** (PC ou Android).
2. Toque em **Conectar**, escolha o aparelho e digite o IP da TV. Ele aparece na TV em Configurações › Rede.
3. Se o Chrome perguntar sobre **acesso à rede local**, permita.
4. **Samsung:** antes de conectar, toque em **Autorizar certificado da TV**. Na aba que abrir, aceite o aviso do navegador ("Avançado › Continuar"), volte e toque em **Conectar e salvar**. Na primeira vez, a TV pede permissão: aceite com o controle original.
5. Para instalar no celular, use o menu do Chrome › **Instalar app** (ou "Adicionar à tela inicial").

## TV Box Elsys, iPhone ou quando o direto não funciona: com a ponte no PC
1. No PC (na mesma rede da TV), dê dois cliques em **`iniciar-windows.bat`**. Na primeira vez ele baixa os arquivos necessários, o que exige internet.
2. Se o Windows perguntar, permita o Node.js em **redes privadas**.
3. A janela mostra o **código de pareamento** e o endereço para o celular, por exemplo `http://192.168.0.10:4317`.
4. No celular, abra esse endereço, ou use o app do GitHub e informe o endereço e o código em **Configurações › Ponte no PC**.
5. Deixe a janela da ponte aberta enquanto usa o controle.

### Só para a TV Box (ADB)
- Instale o **Android SDK Platform-Tools** (site oficial do Android) e extraia a pasta `platform-tools` dentro desta pasta do projeto.
- Na TV Box: ative as **Opções do desenvolvedor** (toque 7 vezes em "Versão" / "Build") e depois a **Depuração USB/ADB** ou a **Depuração sem fio**.
- Na primeira conexão, a TV Box pergunta se confia no computador: marque "Sempre permitir".
- **Android 11 ou mais novo:** em Configurações › Aparelho, abra "Android 11 ou mais novo" e use **Parear TV Box** com a porta e o código que a TV Box mostra.

## Ligar a Samsung pelo app
A Samsung desligada não responde pela rede. Informe o **MAC da TV** em Configurações (ele aparece em Configurações › Rede › Status da rede) e mantenha a ponte aberta. O botão Power manda o sinal para ligar.

## Problemas comuns
- **"O navegador não deixou o site falar com o Roku/Samsung"**: permita "Acesso à rede local" no ícone ao lado do endereço, ou use a ponte.
- **"Código de pareamento incorreto"**: use o código da janela da ponte. Depois de 5 erros, espere 1 minuto.
- **Roku não responde**: no Roku, abra Configurações › Sistema › Configurações avançadas do sistema › Controle por aplicativos móveis › Acesso à rede: **Padrão**.
