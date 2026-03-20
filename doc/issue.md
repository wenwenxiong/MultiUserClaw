# 网关认证错误
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...

⏺ Update(~/.openclaw/openclaw.json)
  ⎿  Added 2 lines, removed 1 line
      57      "port": 18789,
      58      "bind": "loopback",
      59      "auth": {
      60 -      "mode": "none"
      60 +      "mode": "none",
      61 +      "token": "local-dev-token-openclaw"
      62      },
      63      "controlUi": {
      64        "allowedOrigins": [

⏺ 设置了 gateway.auth.token。这是 extension-relay 需要的，即使 auth mode 是 none 也要有个 token 用于 relay 内部通信。重启 bridge
  应该就不报这个错了。

