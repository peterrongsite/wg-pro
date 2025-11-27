#!/bin/bash
# WireGuard Pro VPS Deployment Script

echo "🚀 WireGuard Pro VPS Deployment"
echo "================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl start docker
    systemctl enable docker
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Clone repository
echo "📥 Cloning repository..."
if [ -d "wg-pro" ]; then
    cd wg-pro
    git pull
else
    git clone https://github.com/peterrongsite/wg-pro.git
    cd wg-pro
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file..."
    cp .env.example .env
    
    # Generate random password and secret
    RANDOM_PASSWORD=$(openssl rand -base64 16)
    JWT_SECRET=$(openssl rand -base64 32)
    
    sed -i "s/admin123/$RANDOM_PASSWORD/" .env
    sed -i "s/your-secret-key-change-this-in-production/$JWT_SECRET/" .env
    
    echo ""
    echo "🔐 Your login credentials:"
    echo "   Password: $RANDOM_PASSWORD"
    echo "   (Change in .env file if needed)"
    echo ""
fi

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

# Start services
echo "🐳 Starting Docker containers..."
docker-compose down
docker-compose up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 5

# Generate server keys if config doesn't exist
if [ ! -f "config/wg_confs/wg0.conf" ]; then
    echo "🔑 Generating WireGuard server keys..."
    
    PRIVATE_KEY=$(docker exec wireguard wg genkey)
    PUBLIC_KEY=$(echo "$PRIVATE_KEY" | docker exec -i wireguard wg pubkey)
    
    # Create config directory
    mkdir -p config/wg_confs
    
    # Create server config
    cat > config/wg_confs/wg0.conf <<EOF
[Interface]
Address = 10.10.0.1/16
ListenPort = 51820
PrivateKey = $PRIVATE_KEY
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth+ -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth+ -j MASQUERADE
EOF
    
    # Update .env with server public key
    sed -i "s/YOUR_SERVER_PUBLIC_KEY_HERE/$PUBLIC_KEY/" .env
    
    # Restart to apply config
    docker-compose restart
    
    echo ""
    echo "🔑 Server Keys Generated:"
    echo "   Public Key: $PUBLIC_KEY"
    echo ""
fi

# Configure firewall
echo "🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 51820/udp
    ufw allow 3000/tcp
    ufw --force enable
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=51820/udp
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
fi

echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "🌐 Access your WireGuard Management UI:"
echo "   http://$PUBLIC_IP:3000"
echo ""
echo "📋 WireGuard Server:"
echo "   Endpoint: $PUBLIC_IP:51820"
echo "   Network: 10.10.0.0/16"
echo ""
echo "🔐 Login with password from .env file"
echo ""
echo "📝 To view logs: docker-compose logs -f"
echo "📝 To stop: docker-compose down"
echo "📝 To restart: docker-compose restart"
echo ""
