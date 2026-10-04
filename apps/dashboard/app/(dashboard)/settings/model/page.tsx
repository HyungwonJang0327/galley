import { Card, PageHeader } from 'galley-ui';
import { getDefaultModelSetting } from '../../../../lib/default-model-setting';
import { changeDefaultModelAction } from './actions';
import { DefaultModelSelect } from './DefaultModelSelect';

// 설정 > 모델·비용(목록형 A 골격: 제목 → 흰 카드). Phase 1은 기본 모델 Select 하나 —
// 기본 모델을 바꾸는 유일한 곳이다(TopBar 칩 제거, decisions/model-selection.md 2026-10-04).
// 어댑터 목록·월별 비용 표는 Phase 2.
export default async function Page() {
  const setting = await getDefaultModelSetting();
  return (
    <>
      <PageHeader title="모델·비용" />
      <Card>
        <DefaultModelSelect
          options={setting.options}
          currentId={setting.currentId}
          change={changeDefaultModelAction}
        />
      </Card>
    </>
  );
}
