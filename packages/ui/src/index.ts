// @galley/ui 공개 API 배럴. 여기서 export된 것만 앱이 소비한다.
// 토큰 CSS는 부수효과로 로드된다(빌드 산출물: dist/index.css → 소비자는 '@galley/ui/styles.css' import).
import './tokens/tokens.css';

export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';
