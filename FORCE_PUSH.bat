@echo off
echo ========================================
echo FORCE PUSH - Forcar Upload para GitHub
echo ========================================
echo.
echo ATENCAO: Isso vai SUBSTITUIR tudo no GitHub!
echo Pressione qualquer tecla para continuar...
pause > nul

cd /d "%~dp0"

echo.
echo Adicionando todos os arquivos...
git add -A

echo.
echo Fazendo commit...
git commit -m "Restaurar backup completo"

echo.
echo Forcando push para GitHub...
git push origin main --force

echo.
echo ========================================
echo CONCLUIDO! Backup enviado para GitHub!
echo ========================================
pause




