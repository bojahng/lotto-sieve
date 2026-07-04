# 乐筛微信小程序

这是 `lotto-sieve` 的微信小程序版本，使用 Taro + React + TypeScript。

## 当前能力

- 大乐透规则配置
- 候选号码生成
- 选号篮
- 复制选号
- 微信登录前端流程
- 历史数据规则统计
- 本地保存规则和选号篮
- 预留 HTTPS 后端代理同步历史数据

## 本地开发

```bash
cd miniprogram
npm install
npm run dev:weapp
```

然后用微信开发者工具打开 `miniprogram/dist`。

根目录也提供了快捷命令：

```bash
npm run mp:dev
npm run mp:build
```

## AppID

当前 `project.config.json` 使用的是：

```json
"appid": "touristappid"
```

正式预览、上传和发布前，需要替换成你的微信小程序 AppID。

## 历史数据同步

小程序不能像 Web 开发环境一样使用 Vite proxy，也不能随意请求未配置域名。

当前同步按钮会请求：

```text
${TARO_APP_API_BASE}/api/dlt/history
```

本地可复制 `.env.example` 为 `.env`，并填入实际接口域名：

```bash
TARO_APP_API_BASE=https://www.010087.xyz
```

你需要提供一个已备案/已配置 HTTPS 的后端域名，并在微信公众平台配置为 request 合法域名。

后端接口推荐返回：

```json
{
  "draws": [
    {
      "issue": "25001",
      "date": "2025-01-01",
      "front": [1, 2, 3, 4, 5],
      "back": [1, 2]
    }
  ]
}
```

## 微信登录

小程序端已实现 `Taro.login()` 登录流程，并请求：

```text
${TARO_APP_API_BASE}/api/wechat/login
```

请求体：

```json
{
  "code": "微信临时登录 code",
  "profile": {
    "nickName": "用户昵称",
    "avatarUrl": "头像地址"
  }
}
```

后端需要用 `AppID + AppSecret + code` 请求微信 `jscode2session`，换取 `openid/session_key`，然后返回业务 token。

推荐响应：

```json
{
  "token": "your-session-token",
  "openid": "openid-for-current-user",
  "user": {
    "nickName": "用户昵称",
    "avatarUrl": "头像地址"
  }
}
```

注意：`AppSecret` 只能放在服务器，不能写进小程序代码。

## 云端保存

登录后，小程序会把规则配置和选号篮保存到后端：

```text
GET /api/me/state
PUT /api/me/state
```

请求需要携带登录接口返回的 token：

```text
Authorization: Bearer <token>
```

## 后续需要你提供

1. 微信小程序 AppID。
2. 小程序名称是否仍叫“乐筛”。
3. 小程序图标。
4. 小程序 AppSecret，用于后端换取 openid。
5. 是否云端保存规则和选号篮。
6. 用作接口代理和微信登录的 HTTPS 域名。
