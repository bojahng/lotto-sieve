# Lotto Sieve Server

微信小程序后端，提供微信登录、历史数据代理和用户状态保存。

## 接口

- `GET /health`
- `POST /api/wechat/login`
- `GET /api/dlt/history`
- `GET /api/me/state`
- `PUT /api/me/state`

## 环境变量

参考 `.env.example`：

```bash
PORT=3087
PUBLIC_ORIGIN=https://www.010087.xyz
WECHAT_APP_ID=你的微信小程序 AppID
WECHAT_APP_SECRET=你的微信小程序 AppSecret
SESSION_SECRET=一段足够长的随机字符串
```

`WECHAT_APP_SECRET` 不要提交到 Git。

## 本地运行

```bash
cd server
npm install
PORT=3087 npm start
```

## 推荐 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name www.010087.xyz;

    location /api/ {
        proxy_pass http://127.0.0.1:3087;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3087;
    }
}
```
