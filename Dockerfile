# 使用官方 Bun 基础镜像
FROM oven/bun:1-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 bun.lockb
COPY package.json bun.lock* ./

# 安装依赖
RUN bun install --frozen-lockfile --production

# 拷贝源码
COPY src ./src

# 创建非root用户
RUN addgroup -g 1001 -S bunuser && \
    adduser -S bunuser -u 1001

# 更改文件所有权
RUN chown -R bunuser:bunuser /app
USER bunuser

# 设置环境变量
ENV NODE_ENV=production
# 默认端口设置，可被部署环境覆盖
ENV PORT=3000

# 暴露端口（使用ARG允许构建时覆盖）
EXPOSE ${PORT}

# 启动命令
CMD ["bun", "src/index.ts"]
