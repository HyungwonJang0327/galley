/** @type {import('next').NextConfig} */
const nextConfig = {
  // @galley/pipeline은 src TS를 그대로 export하므로 Next가 트랜스파일한다.
  // @galley/ui는 빌드 산출물(dist)을 소비하므로 여기 포함하지 않는다.
  transpilePackages: ['@galley/pipeline'],
};

export default nextConfig;
