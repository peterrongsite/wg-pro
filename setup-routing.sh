#!/bin/bash
# This script sets up routing so the VPS host can access WireGuard client IPs

# Get the WireGuard container's IP address
WG_CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' wireguard)

if [ -z "$WG_CONTAINER_IP" ]; then
    echo "Error: Could not find WireGuard container IP"
    exit 1
fi

echo "WireGuard container IP: $WG_CONTAINER_IP"

# Add route to WireGuard network through the container
if ! ip route show | grep -q "10.10.0.0/16"; then
    echo "Adding route: 10.10.0.0/16 via $WG_CONTAINER_IP"
    ip route add 10.10.0.0/16 via $WG_CONTAINER_IP
    echo "Route added successfully"
else
    echo "Route already exists"
fi

# Enable IP forwarding if not already enabled
if [ $(cat /proc/sys/net/ipv4/ip_forward) -eq 0 ]; then
    echo "Enabling IP forwarding"
    echo 1 > /proc/sys/net/ipv4/ip_forward
fi

echo "Routing setup complete. You can now access WireGuard clients from the VPS host."
