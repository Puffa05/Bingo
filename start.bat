@echo off
title Minecraft-Bingo
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js ist nicht installiert: https://nodejs.org & pause & exit /b)
node server.js
pause
