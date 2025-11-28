const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const CONFIG_PATH = '/wireguard-config/wg_confs/wg0.conf';
const PRIVATE_KEYS_PATH = '/wireguard-config/private_keys.json';
const SERVER_PUBLIC_KEY = process.env.SERVER_PUBLIC_KEY || 'INmRQAZI6vPcKW3FolLYSb0xOaPCb7TufQp6BdyuizY=';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Login endpoint
app.post('/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (password === LOGIN_PASSWORD) {
    const token = jwt.sign({ user: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Helper: Parse peers from config
function parsePeers(configData) {
  const peers = [];
  const peerBlocks = configData.split('[Peer]').slice(1);
  
  peerBlocks.forEach((block, index) => {
    const publicKeyMatch = block.match(/PublicKey\s*=\s*(.+)/);
    const allowedIPsMatch = block.match(/AllowedIPs\s*=\s*(.+)/);
    
    if (publicKeyMatch && allowedIPsMatch) {
      peers.push({
        id: index + 1,
        publicKey: publicKeyMatch[1].trim(),
        allowedIPs: allowedIPsMatch[1].trim(),
        ip: allowedIPsMatch[1].trim().split('/')[0]
      });
    }
  });
  
  return peers;
}

// Helper: Get next available IP
function getNextIP(peers) {
  if (peers.length === 0) return '10.10.0.2';
  
  const lastIP = peers[peers.length - 1].ip;
  const parts = lastIP.split('.');
  let lastOctet = parseInt(parts[3]);
  let thirdOctet = parseInt(parts[2]);
  
  lastOctet++;
  if (lastOctet > 254) {
    lastOctet = 1;
    thirdOctet++;
  }
  
  return `10.10.${thirdOctet}.${lastOctet}`;
}

// Helper: Validate IP address
function validateIP(ip) {
  const ipRegex = /^10\.10\.\d{1,3}\.\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  
  const parts = ip.split('.');
  const third = parseInt(parts[2]);
  const fourth = parseInt(parts[3]);
  
  return third >= 0 && third <= 255 && fourth >= 1 && fourth <= 254;
}

// Helper: Check if IP is already in use
function isIPInUse(peers, ip) {
  return peers.some(peer => peer.ip === ip);
}

// Helper: Load private keys from storage
function loadPrivateKeys() {
  try {
    if (fs.existsSync(PRIVATE_KEYS_PATH)) {
      const data = fs.readFileSync(PRIVATE_KEYS_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading private keys:', error);
  }
  return {};
}

// Helper: Save private keys to storage
function savePrivateKey(publicKey, privateKey) {
  const keys = loadPrivateKeys();
  keys[publicKey] = privateKey;
  fs.writeFileSync(PRIVATE_KEYS_PATH, JSON.stringify(keys, null, 2));
}

// Helper: Get private key for a public key
function getPrivateKey(publicKey) {
  const keys = loadPrivateKeys();
  return keys[publicKey] || null;
}

// GET /clients - List all clients
app.get('/clients', authenticateToken, (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error reading config' });
    
    const peers = parsePeers(data);
    res.json({
      total: peers.length,
      clients: peers
    });
  });
});

// GET /clients/:id - Get specific client
app.get('/clients/:id', authenticateToken, (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error reading config' });
    
    const peers = parsePeers(data);
    const client = peers.find(p => p.id === parseInt(req.params.id));
    
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Add private key if available
    const privateKey = getPrivateKey(client.publicKey);
    if (privateKey) {
      client.privateKey = privateKey;
    }
    
    res.json(client);
  });
});

// POST /clients - Add new client
app.post('/clients', authenticateToken, async (req, res) => {
  try {
    const { name, ip } = req.body;
    
    // Read current config
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const peers = parsePeers(configData);
    
    // Determine IP address
    let clientIP;
    if (ip) {
      // Validate custom IP
      if (!validateIP(ip)) {
        return res.status(400).json({ error: 'Invalid IP address. Must be in 10.10.x.x range (x.x between 0.1 and 255.254)' });
      }
      if (ip === '10.10.0.1') {
        return res.status(400).json({ error: 'IP 10.10.0.1 is reserved for the server' });
      }
      if (isIPInUse(peers, ip)) {
        return res.status(400).json({ error: `IP ${ip} is already in use` });
      }
      clientIP = ip;
    } else {
      // Auto-assign next available IP
      clientIP = getNextIP(peers);
    }
    
    // Generate keys
    const { stdout: privateKey } = await execPromise('wg genkey');
    const { stdout: publicKey } = await execPromise(`echo "${privateKey.trim()}" | wg pubkey`);
    
    const clientPrivateKey = privateKey.trim();
    const clientPublicKey = publicKey.trim();
    
    // Save private key for later retrieval
    savePrivateKey(clientPublicKey, clientPrivateKey);
    
    // Add peer to server config
    const peerConfig = `\n# ${name || `Client ${peers.length + 1}`}\n[Peer]\nPublicKey = ${clientPublicKey}\nAllowedIPs = ${clientIP}/32\n`;
    fs.appendFileSync(CONFIG_PATH, peerConfig);
    
    // Restart WireGuard
    await execPromise('docker restart wireguard');
    
    // Generate client config
    const clientConfig = `[Interface]
PrivateKey = ${clientPrivateKey}
Address = ${clientIP}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = YOUR_SERVER_IP:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;
    
    res.json({
      success: true,
      client: {
        id: peers.length + 1,
        name: name || `Client ${peers.length + 1}`,
        ip: clientIP,
        publicKey: clientPublicKey,
        config: clientConfig
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /clients/:id - Remove client
app.delete('/clients/:id', authenticateToken, async (req, res) => {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const peers = parsePeers(configData);
    const clientId = parseInt(req.params.id);
    const client = peers.find(p => p.id === clientId);
    
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Remove peer from config
    const peerRegex = new RegExp(`#[^\\n]*\\n\\[Peer\\]\\nPublicKey = ${client.publicKey.replace(/[+/=]/g, '\\$&')}\\nAllowedIPs = ${client.allowedIPs.replace(/\./g, '\\.')}\\n`, 'g');
    const newConfig = configData.replace(peerRegex, '');
    
    fs.writeFileSync(CONFIG_PATH, newConfig);
    
    // Restart WireGuard
    await execPromise('docker restart wireguard');
    
    res.json({ success: true, message: `Client ${clientId} removed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy endpoint for compatibility
app.get('/peers', (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Error reading config' });
    const peers = parsePeers(data);
    res.json({ peers: peers.length });
  });
});

// Get client with full config details
app.get('/clients/:id/config', authenticateToken, async (req, res) => {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const peers = parsePeers(configData);
    const client = peers.find(p => p.id === parseInt(req.params.id));
    
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Extract private key from peer section (if stored) or generate new config
    const peerSection = configData.split('[Peer]')[client.id];
    
    res.json({
      id: client.id,
      ip: client.ip,
      publicKey: client.publicKey,
      allowedIPs: client.allowedIPs,
      serverPublicKey: SERVER_PUBLIC_KEY
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get connection status
app.get('/status', authenticateToken, async (req, res) => {
  try {
    const { stdout } = await execPromise('docker exec wireguard wg show wg0 dump');
    const lines = stdout.trim().split('\n');
    const connectedPeers = {};
    
    const now = Math.floor(Date.now() / 1000);
    
    // Parse wg show output
    lines.slice(1).forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const publicKey = parts[0];
        const lastHandshakeTimestamp = parseInt(parts[4]);
        const transferRx = parseInt(parts[5]);
        const transferTx = parseInt(parts[6]);
        
        // Calculate handshake age
        const handshakeAge = now - lastHandshakeTimestamp;
        
        // Consider connected if handshake within last 3 minutes (180 seconds)
        const isConnected = lastHandshakeTimestamp > 0 && handshakeAge < 180;
        
        connectedPeers[publicKey] = {
          connected: isConnected,
          lastHandshake: handshakeAge,
          transferRx,
          transferTx
        };
      }
    });
    
    res.json(connectedPeers);
  } catch (error) {
    res.json({});
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection for real-time status
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Send initial status immediately
  sendStatus(ws);
  
  // Send status updates every 2 seconds
  const interval = setInterval(() => sendStatus(ws), 2000);
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clearInterval(interval);
  });
});

async function sendStatus(ws) {
  try {
    const { stdout } = await execPromise('docker exec wireguard wg show wg0 dump');
    const lines = stdout.trim().split('\n');
    const connectedPeers = {};
    
    lines.slice(1).forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const publicKey = parts[0];
        const lastHandshake = parseInt(parts[4]);
        const transferRx = parseInt(parts[5]);
        const transferTx = parseInt(parts[6]);
        
        // Consider connected if handshake within last 3 minutes (180 seconds)
        const now = Math.floor(Date.now() / 1000);
        const handshakeAge = now - lastHandshake;
        const isConnected = lastHandshake > 0 && handshakeAge < 180;
        
        connectedPeers[publicKey] = {
          connected: isConnected,
          lastHandshake: handshakeAge,
          transferRx,
          transferTx
        };
      }
    });
    
    ws.send(JSON.stringify({ type: 'status', data: connectedPeers }));
  } catch (error) {
    // Silently fail
  }
}

server.listen(3000, () => console.log('API running on port 3000 with WebSocket support'));
