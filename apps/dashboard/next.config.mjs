/** @type {import('next').NextConfig} */
const nextConfig = {
  // @galley/pipeline은 src TS를 그대로 export하므로 Next가 트랜스파일한다.
  // @galley/ui는 빌드 산출물(dist)을 소비하므로 여기 포함하지 않는다.
  transpilePackages: ['@galley/pipeline'],
  // 구 IA 경로 → 새 흐름 IA 경로(308). decisions/navigation.md.
  async redirects() {
    return [
      { source: '/queue/candidates', destination: '/queue', permanent: true },
      { source: '/queue/done', destination: '/queue', permanent: true },
      { source: '/runs/active', destination: '/runs', permanent: true },
      { source: '/publish/zenn', destination: '/publish', permanent: true },
      { source: '/publish/velog', destination: '/publish', permanent: true },
    ];
  },
};

export default nextConfig;
