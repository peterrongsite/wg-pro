# WireGuard API Documentation

Base URL: `http://localhost:3000`

## Endpoints

### 1. List All Clients
**GET** `/clients`

Returns all configured WireGuard clients.

**Response:**
```json
{
  "total": 3,
  "clients": [
    {
      "id": 1,
      "publicKey": "Fc+RWXlXB+vV+0PAvk21X/8eVvYhQnmMxdlNCUZZbzE=",
      "allowedIPs": "10.13.13.2/32",
      "ip": "10.13.13.2"
    }
  ]
}
```

**PowerShell:**
```powershell
curl http://localhost:3000/clients
```

---

### 2. Get Specific Client
**GET** `/clients/:id`

Returns details for a specific client by ID.

**Response:**
```json
{
  "id": 2,
  "publicKey": "5NkVDJx76YY3F5cZTSaEGtiBMnzp6hkpGmYRtNvCtzU=",
  "allowedIPs": "10.13.13.3/32",
  "ip": "10.13.13.3"
}
```

**PowerShell:**
```powershell
curl http://localhost:3000/clients/2
```

---

### 3. Add New Client
**POST** `/clients`

Automatically generates keys, adds client to server, and returns client config.

**Request Body:**
```json
{
  "name": "Client 3",
  "ip": "10.10.1.50"  // Optional: custom IP address
}
```

**Parameters:**
- `name` (optional): Client name/description
- `ip` (optional): Custom IP address in 10.10.x.x range
  - Must be between 10.10.0.1 and 10.10.255.254
  - Cannot use 10.10.0.1 (reserved for server)
  - Must not be already in use
  - If omitted, next available IP is auto-assigned

**Response:**
```json
{
  "success": true,
  "client": {
    "id": 3,
    "name": "Client 3",
    "ip": "10.10.1.50",
    "publicKey": "s/2R733QAoqPAi5w2QWx5ji2lMZ3Ra5ESWq5mmvS0AY=",
    "config": "[Interface]\nPrivateKey = ...\nAddress = 10.10.1.50/32\n..."
  }
}
```

**PowerShell:**
```powershell
# Auto-assign IP
$body = @{ name = "My Phone" } | ConvertTo-Json
curl -Method POST -Uri http://localhost:3000/clients -Body $body -ContentType "application/json"

# Custom IP
$body = @{ name = "My Laptop"; ip = "10.10.1.100" } | ConvertTo-Json
curl -Method POST -Uri http://localhost:3000/clients -Body $body -ContentType "application/json"
```

**Error Responses:**
- `400` - Invalid IP address or IP already in use
- `500` - Server error

**Notes:**
- Automatically assigns next available IP if not specified
- Generates WireGuard key pair
- Adds peer to server config
- Restarts WireGuard automatically
- Returns ready-to-use client config

---

### 4. Delete Client
**DELETE** `/clients/:id`

Removes a client from the WireGuard configuration.

**Response:**
```json
{
  "success": true,
  "message": "Client 2 removed"
}
```

**PowerShell:**
```powershell
curl -Method DELETE http://localhost:3000/clients/2
```

**Notes:**
- Removes client from server config
- Restarts WireGuard automatically
- Client can no longer connect

---

### 5. Get Peer Count (Legacy)
**GET** `/peers`

Returns total number of configured peers.

**Response:**
```json
{
  "peers": 3
}
```

**PowerShell:**
```powershell
curl http://localhost:3000/peers
```

---

## Examples

### Add multiple clients
```powershell
# Add Phone
$body = @{ name = "iPhone" } | ConvertTo-Json
curl -Method POST -Uri http://localhost:3000/clients -Body $body -ContentType "application/json"

# Add Laptop
$body = @{ name = "Laptop" } | ConvertTo-Json
curl -Method POST -Uri http://localhost:3000/clients -Body $body -ContentType "application/json"

# List all
curl http://localhost:3000/clients
```

### Save client config to file
```powershell
$response = curl -Method POST -Uri http://localhost:3000/clients -Body (@{ name = "New Client" } | ConvertTo-Json) -ContentType "application/json" | ConvertFrom-Json
$response.client.config -replace '\\n',"`n" | Out-File -FilePath "client-new.conf" -Encoding utf8
```

### Delete client
```powershell
curl -Method DELETE http://localhost:3000/clients/3
```

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message here"
}
```

Common status codes:
- `200` - Success
- `404` - Client not found
- `500` - Server error
