@echo off
cd /d "%~dp0"
echo Supabase 패키지를 설치합니다...
npm install @supabase/supabase-js
echo.
echo Audiya 서버를 시작합니다...
node server.js
pause
