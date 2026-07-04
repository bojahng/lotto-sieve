import Taro from '@tarojs/taro';

const API_BASE = process.env.TARO_APP_API_BASE || '';

export type WechatUserProfile = {
  nickName?: string;
  avatarUrl?: string;
};

export type AuthSession = {
  token: string;
  openid?: string;
  user?: WechatUserProfile;
  expiresAt?: number;
};

type LoginResponse = {
  token: string;
  openid?: string;
  user?: WechatUserProfile;
  expiresAt?: number;
};

export async function loginWithWechat(profile?: WechatUserProfile): Promise<AuthSession> {
  if (!API_BASE) {
    throw new Error('需要先配置 TARO_APP_API_BASE，指向你的 HTTPS 后端');
  }

  const loginResult = await Taro.login();

  if (!loginResult.code) {
    throw new Error('微信登录失败：未获取到临时 code');
  }

  const response = await Taro.request<LoginResponse>({
    url: `${API_BASE.replace(/\/$/, '')}/api/wechat/login`,
    method: 'POST',
    data: {
      code: loginResult.code,
      profile,
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`登录接口异常：HTTP ${response.statusCode}`);
  }

  if (!response.data?.token) {
    throw new Error('登录接口未返回 token');
  }

  return response.data;
}

export async function getWechatProfile(): Promise<WechatUserProfile | undefined> {
  try {
    const result = await Taro.getUserProfile({
      desc: '用于展示登录头像和昵称',
    });

    return {
      nickName: result.userInfo.nickName,
      avatarUrl: result.userInfo.avatarUrl,
    };
  } catch {
    return undefined;
  }
}
