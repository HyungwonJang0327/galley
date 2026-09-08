import { Badge, Button, Card, PageHeader } from '@galley/ui';
import styles from './page.module.css';

// 개발 보조 갤러리(decisions/component-gallery.md). 셸 안에서 @galley/ui 공개 배럴만
// 소비해 컴포넌트를 상태별로 렌더한다. 도메인 무지 — 컴포넌트 추가 시 여기에 얹는다.
export default function DesignPage() {
  return (
    <>
      <PageHeader title="컴포넌트 갤러리" actions={<Button>액션 예시</Button>} />
      <div className={styles.sections}>
        <Card>
          <h2 className={styles.sectionTitle}>Button</h2>
          <div className={styles.group}>
            <span className={styles.groupLabel}>variant</span>
            <div className={styles.row}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>size</span>
            <div className={styles.row}>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
            </div>
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>disabled</span>
            <div className={styles.row}>
              <Button disabled>Primary</Button>
              <Button variant="secondary" disabled>
                Secondary
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Badge</h2>
          <div className={styles.group}>
            <span className={styles.groupLabel}>variant</span>
            <div className={styles.row}>
              <Badge variant="neutral">neutral</Badge>
              <Badge variant="info">info</Badge>
              <Badge variant="warning">warning</Badge>
              <Badge variant="success">success</Badge>
              <Badge variant="danger">danger</Badge>
            </div>
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>pulse</span>
            <div className={styles.row}>
              <Badge variant="info" pulse>
                실행 중
              </Badge>
              <Badge variant="success" pulse>
                진행
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Card</h2>
          <div className={styles.row}>
            <Card className={styles.innerCard}>surface·라운드·그림자로 본문을 감싸는 카드.</Card>
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>PageHeader</h2>
          <PageHeader
            title="제목 예시"
            actions={
              <Button variant="secondary" size="sm">
                액션
              </Button>
            }
          />
        </Card>
      </div>
    </>
  );
}
