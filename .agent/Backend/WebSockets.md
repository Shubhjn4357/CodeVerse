# WebSockets & Real-time Communication

## Logic Standards

1. **Connection Management**: Implement robust auto-reconnect logic with exponential backoff.
2. **Event Naming**: Use a clear `namespace:action` format (e.g., `billing:invoice_updated`).
3. **Security**: Authenticate the socket connection using JWT or session tokens during the handshake.

## Performance

- **Throttling**: Limit the rate of outgoing messages for high-frequency data (e.g., mouse positions, typing).
- **Binary Format**: Use `Protocol Buffers` or `MsgPack` for large binary data to reduce payload size.
- **Heartbeats**: Send regular ping/pong messages to keep the connection alive and detect dead links.
