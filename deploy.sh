#!/bin/bash
# ============================================================
# ChatNote — First-Time Deployment Script
# Usage:  chmod +x deploy.sh && ./deploy.sh
# ============================================================
set -e

echo "============================================"
echo "  ChatNote — Docker Deployment"
echo "============================================"
echo ""

# 1. Check .env exists
if [ ! -f .env ]; then
    echo "[!] .env file not found."
    echo "    Copying .env.production → .env"
    cp .env.production .env
    echo ""
    echo ">>> IMPORTANT: Edit .env and set these values:"
    echo "    - ENCRYPTION_KEY  (generate: python -c \"import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\")"
    echo "    - SECRET_KEY       (generate: python -c \"import secrets; print(secrets.token_hex(32))\")"
    echo "    - POSTGRES_PASSWORD"
    echo "    - OPENAI_API_KEY   (for embeddings)"
    echo "    - MOONSHOT_API_KEY  (optional, for vision fallback)"
    echo ""
    read -p "Press Enter after editing .env to continue..."
fi

# 2. Generate encryption key if not set
if ! grep -q "^ENCRYPTION_KEY=." .env 2>/dev/null; then
    ENC_KEY=$(python -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
    echo "ENCRYPTION_KEY=$ENC_KEY" >> .env
    echo "[✓] Generated ENCRYPTION_KEY"
fi

# 3. Build and start
echo "[*] Building Docker images..."
docker compose build

echo "[*] Starting services..."
docker compose up -d

# 4. Wait for backend health
echo "[*] Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:9001/api/health > /dev/null 2>&1; then
        echo "[✓] Backend is healthy"
        break
    fi
    echo "    waiting... ($i/30)"
    sleep 2
done

# 5. Run database migrations
echo "[*] Running database migrations..."
docker compose exec backend alembic upgrade head
echo "[✓] Migrations complete"

# 6. Done
echo ""
echo "============================================"
echo "  ChatNote is running!"
echo "  Open: http://localhost:${PORT:-9001}"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f          # View logs"
echo "    docker compose exec backend alembic upgrade head  # Run migrations"
echo "    docker compose restart backend  # Restart backend"
echo "    docker compose down             # Stop everything"
echo "============================================"
