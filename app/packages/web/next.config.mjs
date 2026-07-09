/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@ma/shared'],
  // @ma/shared 源码用 ESM `.js` 扩展指向 `.ts`；tsx/Node 可解析，Next webpack 需 alias
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};
