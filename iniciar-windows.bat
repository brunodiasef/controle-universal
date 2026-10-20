@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Smart Remote - Ponte local
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Vou abrir a pagina oficial para voce instalar a versao LTS.
  start "" "https://nodejs.org/"
  echo Depois de instalar, feche esta janela e clique duas vezes neste arquivo novamente.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o npm. Reinstale o Node.js LTS e marque a opcao de adicionar ao PATH.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Primeira execucao: preparando os arquivos necessarios. Aguarde...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar as dependencias. Verifique a internet e tente novamente.
    pause
    exit /b 1
  )
)
echo Preparando a interface...
call npm run build
if errorlevel 1 (
  echo.
  echo Nao foi possivel preparar a interface. Veja a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Se o Windows perguntar, permita o Node.js em "Redes privadas" para o celular conseguir acessar.
echo Para encerrar a ponte, feche esta janela.
node backend\server.mjs --abrir
pause
