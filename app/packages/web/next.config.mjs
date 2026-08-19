/** @type {import('next').NextConfig} */
export default {
  // Isolated local Playwright/dev instances must not contend with the user's
  // normal `.next` cache. The default remains unchanged for everyday use.
  distDir: process.env.MA_NEXT_DIST_DIR?.trim() || '.next',
  transpilePackages: ['@ma/shared'],
  // @ma/shared 源码用 ESM `.js` 扩展指向 `.ts`；tsx/Node 可解析，Next webpack 需 alias
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};
