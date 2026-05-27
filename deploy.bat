@echo off
REM ============================================================
REM ChatNote — First-Time Deployment Script (Windows)
REM Usage:  deploy.bat
REM ============================================================
setlocal enabledelayedexpansion

echo ============================================
echo   ChatNote - Docker Deployment
echo ============================================
echo.

REM 1. Check .env exists
if not exist .env (
    echo [!] .env file not found.
    echo     Copying .env.production -^> .env
    copy .env.production .env
    echo.
    echo ^>^>^> IMPORTANT: Edit .env and set these values:
    echo     - ENCRYPTION_KEY  (generate with: python -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
    echo     - SECRET_KEY       (generate with: python -c "import secrets; print(secrets.token_hex(32))")
    echo     - POSTGRES_PASSWORD
    echo     - OPENAI_API_KEY   (for embeddings)
    echo     - MOONSHOT_API_KEY  (optional, for vision fallback)
    echo.
    pause
)

REM 2. Build and start
echo [*] Building Docker images...
docker compose build
if %errorlevel% neq 0 exit /b %errorlevel%

echo [*] Starting services...
docker compose up -d
if %errorlevel% neq 0 exit /b %errorlevel%

REM 3. Wait and migrate
echo [*] Waiting for backend to be ready (15s)...
timeout /t 15 /nobreak > nul

echo [*] Running database migrations...
docker compose exec backend alembic upgrade head

echo.
echo ============================================
echo   ChatNote is running!
echo   Open: http://localhost:9001
echo ============================================
pause
