# WireGuard + Node.js API

A WireGuard VPN server with a Node.js API for management, running in Docker containers.

## Setup

### Prerequisites
- Docker & Docker Compose installed
- Ports 51820 (UDP) and 3000 (TCP) available

### Start the Services

```powershell
docker-compose up -d
```

### Stop the Services

```powershell
docker-compose down
```

## Services

### WireGuard Server
- **Port**: 51820/UDP
- **Config**: `./config/wg_confs/wg0.conf`
- **Server IP**: 10.13.13.1/24
- **Public Key**: `INmRQAZI6vPcKW3FolLYSb0xOaPCb7TufQp6BdyuizY=`

### Node.js API
- **Port**: 3000
- **Endpoint**: `http://localhost:3000`

## API Endpoints

### GET /peers
Returns the number of configured peers.

```powershell
curl http://localhost:3000/peers
# Response: {"peers":1}
```

## Adding a Client

1. Generate client keys:
```powershell
docker exec wireguard wg genkey | Tee-Object -Variable clientPriv | docker exec -i wireguard wg pubkey
```

2. Add peer to `./config/wg_confs/wg0.conf`:
```ini
[Peer]
PublicKey = CLIENT_PUBLIC_KEY_HERE
AllowedIPs = 10.13.13.2/32
```

3. Restart WireGuard:
```powershell
docker-compose restart wireguard
```

4. Create client config file:
```ini
[Interface]
PrivateKey = CLIENT_PRIVATE_KEY
Address = 10.13.13.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = INmRQAZI6vPcKW3FolLYSb0xOaPCb7TufQp6BdyuizY=
Endpoint = YOUR_SERVER_IP:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

## Container Management

```powershell
# View logs
docker logs wireguard
docker logs wireguard-api

# View running containers
docker ps

# Restart services
docker-compose restart
```

## Project Structure

```
wireguard-lipanet/
├── api/
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
├── config/
│   └── wg_confs/
│       └── wg0.conf
├── docker-compose.yml
└── README.md
```

## Notes

- The WireGuard server uses the `linuxserver/wireguard` Docker image
- Config files are persisted in the `./config` directory
- The API has read access to WireGuard configs via shared volume
- Server private key: `gBSvAOwUCIjrmdV01/uVMl2GIai6lCW3dAQvpVTTcXI=`

## Next Steps

Extend the API with endpoints to:
- Add/remove peers dynamically
- Generate client configs
- View connection status
- Restart WireGuard service
