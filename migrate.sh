#!/bin/bash
# ============================================================
# ChatNote — Run Database Migrations
# Usage:  docker compose exec backend alembic upgrade head
#         OR run this script:  bash migrate.sh
# ============================================================
docker compose exec backend alembic upgrade head
