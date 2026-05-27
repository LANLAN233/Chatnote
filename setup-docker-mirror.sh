#!/bin/bash
# ============================================================
# ChatNote — Configure Docker Alibaba Cloud Mirror
# Run once on the server before docker compose build
# ============================================================
set -e

echo "[*] Configuring Docker daemon with Alibaba Cloud registry mirrors..."

sudo mkdir -p /etc/docker

sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://registry.cn-shanghai.aliyuncs.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

echo "[*] Restarting Docker daemon..."
sudo systemctl daemon-reload
sudo systemctl restart docker

echo "[✓] Docker mirror configured. Pulls will now go through Alibaba Cloud."
echo "    Verify: docker info | grep -A5 'Registry Mirrors'"
