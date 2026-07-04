import { defineConfig, type UserConfigExport } from '@tarojs/cli';

export default defineConfig<'webpack5'>(async () => {
  const config: UserConfigExport<'webpack5'> = {
    projectName: 'lotto-sieve-weapp',
    date: '2026-07-04',
    designWidth: 750,
    deviceRatio: {
      375: 2,
      640: 1.17,
      750: 1,
      828: 0.905,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    env: {
      TARO_APP_API_BASE: JSON.stringify(process.env.TARO_APP_API_BASE || 'https://www.010087.xyz'),
    },
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
    },
    h5: {},
  };

  return config;
});
