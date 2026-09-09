import {
  Badge,
  Button,
  Card,
  ListRow,
  ListRows,
  ListToolbar,
  ListToolbarTab,
  PageHeader,
} from '@galley/ui';
import styles from './page.module.css';
import {
  DialogDemo,
  SelectAtBottomDemo,
  SelectDemo,
  SelectDisabledDemo,
  SelectFortyDemo,
  SelectLabelOnlyDemo,
  SelectLongValueDemo,
  SelectPathLabelDemo,
  SelectLongDemo,
  SelectWithDescriptionDemo,
  SelectWithDescriptionMetaDemo,
} from './PrimitiveDemos';

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

        <Card>
          <h2 className={styles.sectionTitle}>ListToolbar · ListRow</h2>
          <ListToolbar
            tabs={
              <>
                <ListToolbarTab label="첫째" count={3} isActive />
                <ListToolbarTab label="둘째" count={12} />
                <ListToolbarTab label="셋째" />
              </>
            }
            search={<input type="search" placeholder="검색" aria-label="검색" />}
            filters={
              <select aria-label="필터">
                <option>전체</option>
              </select>
            }
          />
          <ListRows>
            <ListRow
              title="제목 · 보조 · 배지가 있는 행"
              meta="보조 텍스트 · 항목 · 3건"
              trailing={<Badge variant="info">상태</Badge>}
            />
            <ListRow
              leading={<span aria-hidden="true">⋮⋮</span>}
              title="leading·trailing 시간·actions가 있는 행"
              meta="보조 텍스트"
              trailing={
                <>
                  <Badge variant="warning">상태</Badge>
                  <span>3분 전</span>
                </>
              }
              actions={
                <Button variant="ghost" size="sm" aria-label="메뉴">
                  ⋮
                </Button>
              }
            />
            <ListRow title="선택된 행(isActive)" meta="보조 텍스트" isActive />
          </ListRows>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Dialog</h2>
          <div className={styles.row}>
            <DialogDemo />
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Select</h2>
          <div className={styles.group}>
            <span className={styles.groupLabel}>placeholder → 선택</span>
            <div className={styles.row}>
              <div className={styles.selectBox}>
                <SelectDemo />
              </div>
            </div>
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>disabled</span>
            <div className={styles.row}>
              <div className={styles.selectBox}>
                <SelectDisabledDemo />
              </div>
            </div>
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>
              아이템 레이아웃: 라벨만 / 라벨+보조 / 라벨+보조+메타 / 긴 라벨(40자)+긴 보조
            </span>
            <div className={styles.row}>
              <div className={styles.selectBox}>
                <SelectLabelOnlyDemo />
              </div>
              <div className={styles.selectBox}>
                <SelectWithDescriptionDemo />
              </div>
              <div className={styles.selectBox}>
                <SelectWithDescriptionMetaDemo />
              </div>
              <div className={styles.selectBox}>
                <SelectLongDemo />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Select · 긴 내용</h2>
          <div className={styles.group}>
            <span className={styles.groupLabel}>
              공백 없는 80자 경로 라벨 / 항목 40개(35번째 선택) / 트리거에 긴 선택값(부모 200px)
            </span>
            <div className={styles.row}>
              <div className={styles.selectBox}>
                <SelectPathLabelDemo />
              </div>
              <div className={styles.selectBox}>
                <SelectFortyDemo />
              </div>
              <div className={styles.selectBox}>
                <SelectLongValueDemo />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className={styles.sectionTitle}>Select · 화면 하단</h2>
          <div className={styles.group}>
            <span className={styles.groupLabel}>
              페이지 맨 아래에서 열면 팝업이 위로 뒤집힌다(Base UI 충돌 회피)
            </span>
            <div className={styles.row}>
              <div className={styles.selectBox}>
                <SelectAtBottomDemo />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
