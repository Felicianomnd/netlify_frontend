@echo off
cd /d "C:\blaze api\netlify_frontend"
git add .
git commit -m "Adicionar exibição de nome e saldo + atualização em tempo real"
git push origin main
pause

